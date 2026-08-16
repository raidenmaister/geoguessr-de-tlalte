import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SERVER_URL } from '../services/client';

const TILE_SIZE = 512;
const TILE_ZOOM_LARGE = 4;
const TILE_ZOOM_SMALL = 3;
const TILE_ZOOM_PREVIEW = 2;
const PANORAMA_FOV_DEG = 75;
const STREETVIEW_TOKEN = import.meta.env.VITE_STREETVIEW_TOKEN
  ? `&token=${encodeURIComponent(import.meta.env.VITE_STREETVIEW_TOKEN)}`
  : '';

function getStreetViewResolution() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const aspectRatio = window.innerWidth / Math.max(window.innerHeight, 1);
  let width = Math.max(1280, Math.ceil(window.innerWidth * pixelRatio));
  width = Math.min(width, 2048);
  let height = Math.ceil(width / aspectRatio);

  if (height > 1152) {
    height = 1152;
    width = Math.ceil(height * aspectRatio);
  }

  return { width, height };
}

function getTileZoom() {
  return window.innerWidth * (window.devicePixelRatio || 1) >= 1920
    ? TILE_ZOOM_LARGE
    : TILE_ZOOM_SMALL;
}

async function loadTile(url, signal) {
  const response = await fetch(url, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadPanoramaTiles(panoId, signal, zoom = getTileZoom()) {
  const columns = 2 ** zoom;
  const rows = 2 ** (zoom - 1);
  const panorama = document.createElement('canvas');
  panorama.width = columns * TILE_SIZE;
  panorama.height = rows * TILE_SIZE;
  const tiles = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      tiles.push({
        x,
        y,
        url: `${SERVER_URL}/streetview-tile?pano=${encodeURIComponent(panoId)}&x=${x}&y=${y}&zoom=${zoom}${STREETVIEW_TOKEN}`,
      });
    }
  }

  const loadedTiles = await Promise.all(tiles.map(async (tile) => ({
    ...tile,
    image: await loadTile(tile.url, signal),
  })));
  const context = panorama.getContext('2d');
  for (const tile of loadedTiles) {
    context.drawImage(tile.image, tile.x * TILE_SIZE, tile.y * TILE_SIZE);
  }
  return panorama;
}

function drawPanoramaView(target, panorama, heading, fov) {
  if (!target || !panorama) return;
  const context = target.getContext('2d');
  const { width, height } = target;
  const aspectRatio = width / Math.max(height, 1);
  const sourceWidth = panorama.width * (fov / 360);
  const sourceHeight = Math.min(panorama.height, sourceWidth / aspectRatio);
  const sourceY = (panorama.height - sourceHeight) / 2;
  let sourceX = ((heading / 360) * panorama.width - sourceWidth / 2 + panorama.width) % panorama.width;
  let remainingWidth = sourceWidth;
  let destinationX = 0;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  while (remainingWidth > 0.01) {
    const chunkWidth = Math.min(remainingWidth, panorama.width - sourceX);
    const destinationWidth = (chunkWidth / sourceWidth) * width;
    context.drawImage(
      panorama,
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
}

export default function StreetViewContainer({
  currentCoord,
  viewMode = 'libre',
  panoHeading = null,
  isHidden = false,
  onReady,
  onHeadingChange,
  resetSignal = 0,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const tileControllerRef = useRef(null);
  const [heading, setHeading] = useState(() => Math.floor(Math.random() * 360));
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(75);
  const [imgUrl, setImgUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('Iniciando...');
  const [errorMessage, setErrorMessage] = useState(null);
  const [panorama, setPanorama] = useState(null);
  const dragRef = useRef(null);
  const loadTimerRef = useRef(null);
  const readyRef = useRef(false);
  const initialHeadingRef = useRef(null);

  const panoId = currentCoord?.pano_id;
  const isLocked = viewMode === 'estatico';
  const usesHighQualityTiles = viewMode === 'estatico' || viewMode === 'temporal';

  const buildUrl = useCallback(
    (h, p, f) => {
      if (!panoId) return null;
      const { width, height } = getStreetViewResolution();
      const params = new URLSearchParams({
        pano: panoId,
        heading: String(Math.round(((h % 360) + 360) % 360)),
        pitch: String(Math.round(p)),
        fov: String(Math.round(f)),
        w: String(width),
        h: String(height),
      });
      const token = import.meta.env.VITE_STREETVIEW_TOKEN;
      if (token) params.set('token', token);
      return `${SERVER_URL}/streetview?${params.toString()}`;
    },
    [panoId]
  );

  // Los modos de imagen fija usan el panorama equirectangular completo para
  // evitar ampliar una perspectiva pequeña y perder detalle en 2K.
  useEffect(() => {
    if (!usesHighQualityTiles || !panoId) {
      tileControllerRef.current?.abort();
      setPanorama(null);
      return undefined;
    }

    const controller = new AbortController();
    tileControllerRef.current?.abort();
    tileControllerRef.current = controller;
    setPanorama(null);
    setImgUrl(null);
    setErrorMessage(null);
    setStatus('Cargando imagen en alta calidad...');
    readyRef.current = false;

    const preferredZoom = getTileZoom();
    const quickZoom = Math.min(preferredZoom, TILE_ZOOM_PREVIEW);

    const publishReadyPanorama = (loadedPanorama) => {
      if (controller.signal.aborted) return;
      setPanorama(loadedPanorama);
      setStatus('Ubicación lista');
      if (!readyRef.current) {
        readyRef.current = true;
        onReady?.();
      }
    };

    if (viewMode === 'temporal') {
      const loadTemporalPanorama = async () => {
        try {
          return await loadPanoramaTiles(panoId, controller.signal, preferredZoom);
        } catch (error) {
          if (error.name === 'AbortError' || preferredZoom === TILE_ZOOM_SMALL) throw error;
          return loadPanoramaTiles(panoId, controller.signal, TILE_ZOOM_SMALL);
        }
      };

      loadTemporalPanorama()
        .then(publishReadyPanorama)
        .catch((error) => {
          if (error.name === 'AbortError') return;
          setStatus('Error: Imagen no disponible');
          setErrorMessage('No se pudo cargar la imagen de Street View en alta calidad.');
        });
      return () => controller.abort();
    }

    loadPanoramaTiles(panoId, controller.signal, quickZoom)
      .then((quickPanorama) => {
        if (controller.signal.aborted) return;
        setPanorama(quickPanorama);
        setStatus('Ubicación lista');
        if (!readyRef.current) {
          readyRef.current = true;
          onReady?.();
        }

        if (preferredZoom > quickZoom) {
          setStatus('Mejorando calidad...');
          loadPanoramaTiles(panoId, controller.signal, preferredZoom)
            .then((highQualityPanorama) => {
              if (!controller.signal.aborted) {
                setPanorama(highQualityPanorama);
                setStatus('Ubicación lista');
              }
            })
            .catch((error) => {
              if (error.name !== 'AbortError') {
                console.warn('No se pudo mejorar la calidad del panorama:', error);
              }
            });
        }
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setStatus('Error: Imagen no disponible');
        setErrorMessage('No se pudo cargar la imagen de Street View en alta calidad.');
      });

    return () => controller.abort();
  }, [panoId, usesHighQualityTiles, onReady]);

  useEffect(() => {
    if (!usesHighQualityTiles || !panorama || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const resize = () => {
      const resolution = getStreetViewResolution();
      canvas.width = resolution.width;
      canvas.height = resolution.height;
      drawPanoramaView(canvas, panorama, heading, PANORAMA_FOV_DEG);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [heading, panorama, usesHighQualityTiles]);

  // Al cambiar de ronda/pano: fijar heading inicial (estático/temporal usan el del servidor).
  useEffect(() => {
    const inicial =
      (viewMode === 'estatico' || viewMode === 'temporal') && panoHeading != null
        ? Number(panoHeading)
        : Math.floor(Math.random() * 360);
    initialHeadingRef.current = inicial;
    setHeading(inicial);
    setPitch(0);
    setFov(75);
    setErrorMessage(null);
    setStatus('Cargando panorama...');
    readyRef.current = false;
  }, [panoId, viewMode, panoHeading]);

  // Señal de reset (botón "restablecer vista").
  useEffect(() => {
    if (resetSignal === 0) return;
    setHeading(initialHeadingRef.current ?? Math.floor(Math.random() * 360));
    setPitch(0);
    setFov(75);
  }, [resetSignal]);

  // No solicitar imágenes intermedias mientras el usuario arrastra la vista.
  useEffect(() => {
    if (!panoId || isDragging || usesHighQualityTiles) return;
    const url = buildUrl(heading, pitch, fov);
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => setImgUrl(url), 350);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [heading, pitch, fov, panoId, buildUrl, isDragging, usesHighQualityTiles]);

  // Reportar heading para la brújula.
  useEffect(() => {
    onHeadingChange?.(((heading % 360) + 360) % 360);
  }, [heading, onHeadingChange]);

  const onImgLoad = useCallback(() => {
    setStatus('Ubicación lista');
    setErrorMessage(null);
    if (!readyRef.current) {
      readyRef.current = true;
      onReady?.();
    }
  }, [onReady]);

  const onImgError = useCallback(() => {
    setStatus('Error: Imagen no disponible');
    setErrorMessage('No se pudo cargar la imagen de Street View desde el servidor.');
  }, []);

  const onPointerDown = (e) => {
    if (isLocked) return;
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e) => {
    if (isLocked || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setHeading((h) => (h - dx * 0.3 + 360) % 360);
    setPitch((p) => Math.max(-80, Math.min(80, p - dy * 0.3)));
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const onWheel = (e) => {
    if (isLocked) return;
    e.preventDefault();
    setFov((f) => Math.max(20, Math.min(120, f + (e.deltaY > 0 ? 6 : -6))));
  };

  return (
    <div
      className={`street-view-container ${isHidden ? 'street-view-hidden' : ''}`}
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      style={{ touchAction: isLocked ? 'auto' : 'none', cursor: isLocked ? 'default' : 'grab' }}
    >
      {usesHighQualityTiles && panorama ? (
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
        />
      ) : imgUrl ? (
        <img
          src={imgUrl}
          onLoad={onImgLoad}
          onError={onImgError}
          alt=""
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          {status}
        </div>
      )}

      {errorMessage && (
        <div className="api-error-banner">
          <AlertTriangle size={36} className="icon-danger" />
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px', color: '#fff' }}>
              Problema con Street View
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
