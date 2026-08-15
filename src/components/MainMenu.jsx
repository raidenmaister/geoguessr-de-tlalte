import React, { useEffect, useRef, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const PANO_INTERVAL_MS = 20000;
const FADE_OUT_MS = 1300;
const FADE_IN_MS = 700;
const ROTATION_STEP_DEG = 6; // grados que avanza cada refresco del fondo
const ROTATION_REFRESH_MS = 5000;

function buildStreetViewUrl(panoId, heading) {
  const params = new URLSearchParams({
    pano: panoId,
    heading: String(Math.round(((heading % 360) + 360) % 360)),
    pitch: '0',
    fov: '75',
    w: '1280',
    h: '720',
  });
  return `${SERVER_URL}/streetview?${params.toString()}`;
}

export function MenuStreetViewBackground() {
  const imgRef = useRef(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [fading, setFading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let rotationTimer = null;
    let swapTimer = null;
    let fadeTimer = null;
    const panoRef = { id: null, heading: 0 };

    const loadPanoId = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/panorama-fondo`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.pano_id;
      } catch (error) {
        console.warn('No se pudo cargar el pano de fondo:', error);
        return null;
      }
    };

    const applyPanoImage = () => {
      if (!active || !panoRef.id || document.hidden) return;
      setImgUrl(buildStreetViewUrl(panoRef.id, panoRef.heading));
      setReady(true);
    };

    // Avanza el heading y recarga la imagen de fondo suavemente.
    const startTimers = () => {
      if (rotationTimer) return;
      rotationTimer = window.setInterval(() => {
        if (!active || !panoRef.id) return;
        panoRef.heading = (panoRef.heading + ROTATION_STEP_DEG) % 360;
        applyPanoImage();
      }, ROTATION_REFRESH_MS);

      swapTimer = window.setInterval(async () => {
        const panoId = await loadPanoId();
        if (!active || !panoId || document.hidden) return;
        setFading(true);
        fadeTimer = window.setTimeout(() => {
          if (!active) return;
          panoRef.id = panoId;
          panoRef.heading = Math.floor(Math.random() * 360);
          applyPanoImage();
          fadeTimer = window.setTimeout(() => {
            if (active) setFading(false);
          }, FADE_IN_MS);
        }, FADE_OUT_MS);
      }, PANO_INTERVAL_MS);
    };

    const stopTimers = () => {
      if (rotationTimer) {
        window.clearInterval(rotationTimer);
        rotationTimer = null;
      }
      if (swapTimer) {
        window.clearInterval(swapTimer);
        swapTimer = null;
      }
      if (fadeTimer) {
        window.clearTimeout(fadeTimer);
        fadeTimer = null;
      }
      setFading(false);
    };

    const onVisibilityChange = () => {
      if (!active) return;
      if (document.hidden) {
        stopTimers();
      } else if (panoRef.id) {
        startTimers();
      }
    };

    async function init() {
      const panoId = await loadPanoId();
      if (!active || !panoId) return;
      panoRef.id = panoId;
      panoRef.heading = Math.floor(Math.random() * 360);
      applyPanoImage();
      if (!document.hidden) startTimers();
    }

    init();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopTimers();
    };
  }, []);

  return (
    <div className="menu-streetview" aria-hidden="true">
      <img ref={imgRef} className="menu-pano-canvas" src={imgUrl || undefined} alt="" draggable={false} />
      {!ready && <div className="menu-pano-placeholder" />}
      <div className={`menu-streetview-fade ${fading ? 'menu-streetview-black' : ''}`} />
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
