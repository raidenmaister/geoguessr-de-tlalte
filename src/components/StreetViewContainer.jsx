import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SERVER_URL } from '../services/client';

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
  const [heading, setHeading] = useState(() => Math.floor(Math.random() * 360));
  const [pitch, setPitch] = useState(0);
  const [fov, setFov] = useState(75);
  const [imgUrl, setImgUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState('Iniciando...');
  const [errorMessage, setErrorMessage] = useState(null);
  const dragRef = useRef(null);
  const loadTimerRef = useRef(null);
  const readyRef = useRef(false);
  const initialHeadingRef = useRef(null);

  const panoId = currentCoord?.pano_id;
  const isLocked = viewMode === 'estatico';

  const buildUrl = useCallback(
    (h, p, f) => {
      if (!panoId) return null;
      const params = new URLSearchParams({
        pano: panoId,
        heading: String(Math.round(((h % 360) + 360) % 360)),
        pitch: String(Math.round(p)),
        fov: String(Math.round(f)),
        w: '1280',
        h: '640',
      });
      const token = import.meta.env.VITE_STREETVIEW_TOKEN;
      if (token) params.set('token', token);
      return `${SERVER_URL}/streetview?${params.toString()}`;
    },
    [panoId]
  );

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
    if (!panoId || isDragging) return;
    const url = buildUrl(heading, pitch, fov);
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => setImgUrl(url), 350);
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, [heading, pitch, fov, panoId, buildUrl, isDragging]);

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
      {imgUrl ? (
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
