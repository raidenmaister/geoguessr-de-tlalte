import React, { useEffect, useRef, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const PANO_INTERVAL_MS = 20000;
// Se puede cambiar este intervalo para acelerar o ralentizar el giro real.
const BACKGROUND_ROTATION_INTERVAL_MS = 1000;
const BACKGROUND_ROTATION_STEP_DEG = 30;
const BACKGROUND_CROSSFADE_DURATION_MS = 900;

function getBackgroundResolution() {
  const aspectRatio = window.innerWidth / Math.max(window.innerHeight, 1);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  let width = Math.max(1280, Math.ceil(window.innerWidth * pixelRatio));
  width = Math.min(width, 2048);
  let height = Math.ceil(width / aspectRatio);

  if (height > 1152) {
    height = 1152;
    width = Math.ceil(height * aspectRatio);
  }

  return { width, height };
}

function buildStreetViewUrl(panoId, heading) {
  const { width, height } = getBackgroundResolution();
  const params = new URLSearchParams({
    pano: panoId,
    heading: String(Math.round(((heading % 360) + 360) % 360)),
    pitch: '0',
    fov: '100',
    w: String(width),
    h: String(height),
  });
  return `${SERVER_URL}/streetview?${params.toString()}`;
}

export function MenuStreetViewBackground() {
  const [urlA, setUrlA] = useState(null);
  const [urlB, setUrlB] = useState(null);
  const [front, setFront] = useState('a');
  const [ready, setReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    let active = true;
    let rotationTimer = null;
    let swapTimer = null;
    let controller = null;
    const stateRef = {
      front: 'a',
      panoId: null,
      heading: 0,
      paused: document.hidden || !document.hasFocus(),
      loadingImage: false,
    };

    const loadPanoId = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`${SERVER_URL}/panorama-fondo`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.pano_id;
      } catch (error) {
        if (error.name === 'AbortError') return null;
        console.warn('No se pudo cargar el pano de fondo:', error);
        return null;
      }
    };

    const preloadImage = (url) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(url);
      image.onerror = reject;
      image.src = url;
    });

    const showImage = (url) => {
      if (!active || stateRef.paused) return;
      const next = stateRef.front === 'a' ? 'b' : 'a';
      stateRef.front = next;
      if (next === 'a') {
        setUrlA(url);
      } else {
        setUrlB(url);
      }
      setFront(next);
    };

    const loadHeadingImage = async (panoId, heading) => {
      if (!active || stateRef.paused || stateRef.loadingImage) return;
      stateRef.loadingImage = true;
      try {
        const url = buildStreetViewUrl(panoId, heading);
        await preloadImage(url);
        if (!active || stateRef.paused || stateRef.panoId !== panoId) return;
        showImage(url);
      } catch {
        // Se conserva la vista actual si Google no entrega el siguiente heading.
      } finally {
        stateRef.loadingImage = false;
      }
    };

    const rotateBackground = () => {
      if (!active || stateRef.paused || !stateRef.panoId || stateRef.loadingImage) return;
      stateRef.heading = (stateRef.heading + BACKGROUND_ROTATION_STEP_DEG) % 360;
      loadHeadingImage(stateRef.panoId, stateRef.heading);
    };

    const loadNextPano = async () => {
      if (!active || stateRef.paused || stateRef.loadingImage) return;
      const panoId = await loadPanoId();
      if (!active || stateRef.paused || !panoId) return;
      stateRef.panoId = panoId;
      stateRef.heading = Math.floor(Math.random() * 360);
      loadHeadingImage(panoId, stateRef.heading);
    };

    const startTimer = () => {
      if (rotationTimer || stateRef.paused) return;
      rotationTimer = window.setInterval(rotateBackground, BACKGROUND_ROTATION_INTERVAL_MS);
      swapTimer = window.setInterval(loadNextPano, PANO_INTERVAL_MS);
    };

    const stopTimer = () => {
      if (rotationTimer) {
        window.clearInterval(rotationTimer);
        rotationTimer = null;
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
        controller?.abort();
      } else {
        if (stateRef.panoId) startTimer();
        else init();
      }
    };

    async function init() {
      const panoId = await loadPanoId();
      if (!active || stateRef.paused || !panoId) return;
      stateRef.panoId = panoId;
      stateRef.heading = Math.floor(Math.random() * 360);
      try {
        const url = buildStreetViewUrl(panoId, stateRef.heading);
        await preloadImage(url);
        if (!active || stateRef.paused || stateRef.panoId !== panoId) return;
        showImage(url);
        startTimer();
      } catch {
        // El placeholder permanece visible si la primera imagen falla.
      }
    }

    init();
    document.addEventListener('visibilitychange', updatePausedState);
    window.addEventListener('focus', updatePausedState);
    window.addEventListener('blur', updatePausedState);
    document.addEventListener('fullscreenchange', updatePausedState);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', updatePausedState);
      window.removeEventListener('focus', updatePausedState);
      window.removeEventListener('blur', updatePausedState);
      document.removeEventListener('fullscreenchange', updatePausedState);
      stopTimer();
      controller?.abort();
    };
  }, []);

  const onLoad = () => setReady(true);

  return (
    <div
      className={`menu-streetview ${isPaused ? 'is-paused' : ''}`}
      style={{
        '--menu-pano-crossfade-duration': `${BACKGROUND_CROSSFADE_DURATION_MS}ms`,
      }}
      aria-hidden="true"
    >
      <div className="menu-pano-layers">
        <img
          src={urlA || undefined}
          alt=""
          draggable={false}
          onLoad={onLoad}
          className={`menu-pano-canvas ${front === 'a' ? 'is-front' : ''}`}
        />
        <img
          src={urlB || undefined}
          alt=""
          draggable={false}
          onLoad={onLoad}
          className={`menu-pano-canvas ${front === 'b' ? 'is-front' : ''}`}
        />
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
      <MenuStreetViewBackground />
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
          <Wifi size={14} className={isConnected ? "text-success" : "text-error"} />
          <span>{isConnected ? 'En línea' : 'Sin conexión'}</span>
        </div>
      </div>
    </div>
  );
}
