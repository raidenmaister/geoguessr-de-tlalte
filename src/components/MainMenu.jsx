import React, { useEffect, useRef, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const PANO_INTERVAL_MS = 20000;
// Cambia este valor para acelerar o ralentizar el giro suave del mismo panorama.
const BACKGROUND_ROTATION_DEGREES_PER_SECOND = 6;
// Zoom 3 is 32 tiles instead of 128 at zoom 4, with enough detail for the menu.
const PANO_TILE_ZOOM_LARGE = 3;
const PANO_TILE_ZOOM_SMALL = 2;
const PANO_TILE_SIZE = 512;
const PANO_FOV_DEG = 100;
const BACKGROUND_CROSSFADE_DURATION_MS = 900;
const TOKEN_PARAM = import.meta.env.VITE_STREETVIEW_TOKEN
  ? `&token=${encodeURIComponent(import.meta.env.VITE_STREETVIEW_TOKEN)}`
  : '';

function getCanvasResolution() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  return {
    width: Math.max(1, Math.ceil(window.innerWidth * pixelRatio)),
    height: Math.max(1, Math.ceil(window.innerHeight * pixelRatio)),
  };
}

export function MenuStreetViewBackground() {
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);
  const [front, setFront] = useState('a');
  const [ready, setReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let active = true;
    let swapTimer = null;
    let panoController = null;
    let tileController = null;
    const stateRef = {
      front: 'a',
      panoId: null,
      panorama: null,
      heading: Math.random() * 360,
      // El fondo debe cargar aunque la pestaña todavía no haya reportado foco.
      // Los eventos blur/visibilitychange se encargan de pausarlo después.
      paused: document.hidden,
      loadingPano: false,
      frameId: null,
      lastFrameTime: 0,
    };

    const loadPanoId = async () => {
      panoController?.abort();
      panoController = new AbortController();
      try {
        const response = await fetch(`${SERVER_URL}/panorama-fondo`, {
          cache: 'no-store',
          signal: panoController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.pano_id;
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('No se pudo cargar el pano de fondo:', error);
        return null;
      }
    };

    const loadTile = async (url, signal) => {
      const response = await fetch(url, { cache: 'force-cache', signal });
      if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = 'async';
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = imageUrl;
        });
        return image;
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };

    const loadPanorama = async (panoId, zoom, signal) => {
      const columns = 2 ** zoom;
      const rows = 2 ** (zoom - 1);
      const canvas = document.createElement('canvas');
      canvas.width = columns * PANO_TILE_SIZE;
      canvas.height = rows * PANO_TILE_SIZE;
      const context = canvas.getContext('2d');
      const tiles = [];

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          tiles.push({
            x,
            y,
            url: `${SERVER_URL}/streetview-tile?pano=${encodeURIComponent(panoId)}&x=${x}&y=${y}&zoom=${zoom}${TOKEN_PARAM}`,
          });
        }
      }

      const loadedTiles = await Promise.all(tiles.map(async (tile) => ({
        ...tile,
        image: await loadTile(tile.url, signal),
      })));

      for (const tile of loadedTiles) {
        context.drawImage(tile.image, tile.x * PANO_TILE_SIZE, tile.y * PANO_TILE_SIZE);
      }

      return { canvas, width: canvas.width, height: canvas.height };
    };

    const loadFallbackPanorama = async (panoId, signal) => {
      const resolution = getCanvasResolution();
      const width = Math.min(2048, Math.max(1280, resolution.width));
      const height = Math.min(1152, Math.max(720, Math.ceil(width * resolution.height / resolution.width)));
      const image = await loadTile(
        `${SERVER_URL}/streetview?pano=${encodeURIComponent(panoId)}&heading=0&pitch=0&fov=${PANO_FOV_DEG}&w=${width}&h=${height}${TOKEN_PARAM}`,
        signal,
      );
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || width;
      canvas.height = image.naturalHeight || height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { canvas, width: canvas.width, height: canvas.height };
    };

    const drawPanorama = (target, panorama, heading) => {
      if (!target || !panorama) return;
      const context = target.getContext('2d');
      const { width, height } = target;
      const aspectRatio = width / Math.max(height, 1);
      const sourceWidth = panorama.width * (PANO_FOV_DEG / 360);
      const sourceHeight = Math.min(panorama.height, sourceWidth / aspectRatio);
      const sourceY = (panorama.height - sourceHeight) / 2;
      let sourceX = ((heading / 360) * panorama.width - sourceWidth / 2 + panorama.width) % panorama.width;
      let remainingWidth = sourceWidth;
      let destinationX = 0;

      context.clearRect(0, 0, width, height);
      while (remainingWidth > 0.01) {
        const chunkWidth = Math.min(remainingWidth, panorama.width - sourceX);
        const destinationWidth = (chunkWidth / sourceWidth) * width;
        context.drawImage(
          panorama.canvas,
          sourceX,
          sourceY,
          chunkWidth,
          sourceHeight,
          destinationX,
          0,
          destinationWidth,
          height,
        );
        remainingWidth -= chunkWidth;
        destinationX += destinationWidth;
        sourceX = 0;
      }
    };

    const resizeCanvases = () => {
      const resolution = getCanvasResolution();
      for (const canvas of [canvasARef.current, canvasBRef.current]) {
        if (!canvas) continue;
        canvas.width = resolution.width;
        canvas.height = resolution.height;
      }
      if (stateRef.panorama) {
        drawPanorama(
          stateRef.front === 'a' ? canvasARef.current : canvasBRef.current,
          stateRef.panorama,
          stateRef.heading,
        );
      }
    };

    const showPanorama = (panorama, initial = false) => {
      if (!active || stateRef.paused) return;
      const next = stateRef.front === 'a' ? 'b' : 'a';
      const nextCanvas = next === 'a' ? canvasARef.current : canvasBRef.current;
      drawPanorama(nextCanvas, panorama, stateRef.heading);
      stateRef.panorama = panorama;
      stateRef.front = next;
      setFront(next);
      if (initial) setReady(true);
    };

    const loadNextPano = async (initial = false) => {
      if (!active || stateRef.paused || stateRef.loadingPano) return;
      stateRef.loadingPano = true;
      tileController?.abort();
      tileController = new AbortController();
      try {
        const panoId = await loadPanoId();
        if (!active || stateRef.paused || !panoId) return;
        const physicalWidth = window.innerWidth * (window.devicePixelRatio || 1);
        const preferredZoom = physicalWidth >= 1920 ? PANO_TILE_ZOOM_LARGE : PANO_TILE_ZOOM_SMALL;
        let panorama;
        try {
          try {
            panorama = await loadPanorama(panoId, preferredZoom, tileController.signal);
          } catch (error) {
            if (error.name === 'AbortError') return;
            if (preferredZoom !== PANO_TILE_ZOOM_LARGE) throw error;
            panorama = await loadPanorama(panoId, PANO_TILE_ZOOM_SMALL, tileController.signal);
          }
        } catch (error) {
          if (error.name === 'AbortError') return;
          panorama = await loadFallbackPanorama(panoId, tileController.signal);
        }
        if (!active || stateRef.paused) return;
        stateRef.panoId = panoId;
        showPanorama(panorama, initial);
      } catch (error) {
        if (error.name !== 'AbortError') console.warn('No se pudo cargar el panorama 360:', error);
      } finally {
        stateRef.loadingPano = false;
      }
    };

    const startTimer = () => {
      if (stateRef.frameId || stateRef.paused) return;
      stateRef.lastFrameTime = performance.now();
      const renderFrame = (timestamp) => {
        if (!active || stateRef.paused) return;
        const elapsed = Math.min(timestamp - stateRef.lastFrameTime, 100);
        stateRef.lastFrameTime = timestamp;
        stateRef.heading = (stateRef.heading + (elapsed / 1000) * BACKGROUND_ROTATION_DEGREES_PER_SECOND) % 360;
        const frontCanvas = stateRef.front === 'a' ? canvasARef.current : canvasBRef.current;
        drawPanorama(frontCanvas, stateRef.panorama, stateRef.heading);
        stateRef.frameId = window.requestAnimationFrame(renderFrame);
      };
      stateRef.frameId = window.requestAnimationFrame(renderFrame);
      swapTimer = window.setInterval(loadNextPano, PANO_INTERVAL_MS);
    };

    const stopTimer = () => {
      if (stateRef.frameId) {
        window.cancelAnimationFrame(stateRef.frameId);
        stateRef.frameId = null;
      }
      if (swapTimer) {
        window.clearInterval(swapTimer);
        swapTimer = null;
      }
    };

    const updatePausedState = () => {
      if (!active) return;
      stateRef.paused = document.hidden || !document.hasFocus();
      setIsPaused(stateRef.paused);
      if (stateRef.paused) {
        stopTimer();
        panoController?.abort();
        tileController?.abort();
      } else if (stateRef.panorama) {
        startTimer();
      } else {
        loadNextPano(true);
      }
    };

    resizeCanvases();
    if (!stateRef.paused) {
      loadNextPano(true).then(() => {
        if (active && !stateRef.paused && stateRef.panorama) startTimer();
      });
    }
    window.addEventListener('resize', resizeCanvases);
    document.addEventListener('visibilitychange', updatePausedState);
    window.addEventListener('focus', updatePausedState);
    window.addEventListener('blur', updatePausedState);
    document.addEventListener('fullscreenchange', updatePausedState);

    return () => {
      active = false;
      window.removeEventListener('resize', resizeCanvases);
      document.removeEventListener('visibilitychange', updatePausedState);
      window.removeEventListener('focus', updatePausedState);
      window.removeEventListener('blur', updatePausedState);
      document.removeEventListener('fullscreenchange', updatePausedState);
      stopTimer();
      panoController?.abort();
      tileController?.abort();
    };
  }, []);

  return (
    <div
      className={`menu-streetview ${isPaused ? 'is-paused' : ''}`}
      style={{ '--menu-pano-crossfade-duration': `${BACKGROUND_CROSSFADE_DURATION_MS}ms` }}
      aria-hidden="true"
    >
      <div className="menu-pano-layers">
        <canvas ref={canvasARef} className={`menu-pano-canvas ${front === 'a' ? 'is-front' : ''}`} />
        <canvas ref={canvasBRef} className={`menu-pano-canvas ${front === 'b' ? 'is-front' : ''}`} />
      </div>
      {!ready && <div className="menu-pano-placeholder" />}
      <div className="menu-streetview-shade" />
    </div>
  );
}

export default function MainMenu({ username, onCreateRoom, onJoinRoom, onEditUsername, onSinglePlayer }) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = conectar();
    setIsConnected(socket.connected);
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return (
    <div className="screen-menu">
      <MenuMusic />
      <div className="screen-card">
        <div className="user-profile">
          <span className="player-name">{username}</span>
          <button onClick={onEditUsername} className="btn-icon" title="Editar nombre">
            <Edit2 size={16} />
          </button>
        </div>

        <div className="menu-logo" aria-hidden="true">🌎</div>
        <div className="menu-kicker">
          <span className="menu-flag" aria-hidden="true">🇲🇽</span> Tlaltenango, Zacatecas
        </div>
        <p className="screen-subtitle">Explora lugares reales y adivina dónde estás.</p>

        <div className="menu-options">
          <button onClick={onCreateRoom} className="btn-menu-card">
            <Plus size={32} />
            <div className="menu-card-content">
              <h3>Crear sala</h3>
              <p>Modo multijugador</p>
            </div>
          </button>

          <button onClick={onJoinRoom} className="btn-menu-card">
            <Users size={32} />
            <div className="menu-card-content">
              <h3>Unirse a una partida</h3>
              <p>Multijugador</p>
            </div>
          </button>

          <button onClick={onSinglePlayer} className="btn-menu-card solo">
            <Map size={32} />
            <div className="menu-card-content">
              <h3>Jugar en solitario</h3>
              <p>Modo un jugador</p>
            </div>
          </button>
        </div>

        <div className="connection-status">
          <Wifi size={14} className={isConnected ? 'text-success' : 'text-error'} />
          <span>{isConnected ? 'En línea' : 'Sin conexión'}</span>
        </div>
      </div>
    </div>
  );
}
