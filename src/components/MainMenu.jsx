import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const PANO_INTERVAL_MS = 20000;
const FADE_OUT_MS = 1300;
const FADE_HOLD_MS = 400;

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function MenuStreetViewBackground() {
  const [src, setSrc] = useState('');
  const [fading, setFading] = useState(false);

  const loadPanorama = useCallback(async () => {
    try {
      const response = await fetch(`${SERVER_URL}/panorama-fondo`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return new URL(data.photo, SERVER_URL).href;
    } catch (error) {
      console.warn('No se pudo cargar el panorama de fondo:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    let swapTimer = null;
    let blackTimer = null;

    const cycle = async () => {
      const url = await loadPanorama();
      if (!active || !url) return;
      const loaded = await preloadImage(url);
      if (!active || !loaded) return;

      // Fundido a negro, intercambio de imagen y aparición desde el negro.
      setFading(true);
      blackTimer = setTimeout(() => {
        if (!active) return;
        setSrc(url);
        blackTimer = setTimeout(() => {
          if (active) setFading(false);
        }, FADE_HOLD_MS);
      }, FADE_OUT_MS);
    };

    cycle();
    swapTimer = window.setInterval(cycle, PANO_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(swapTimer);
      window.clearTimeout(blackTimer);
    };
  }, [loadPanorama]);

  return (
    <div className="menu-streetview" aria-hidden="true">
      {src ? (
        <div className="menu-pano-track">
          <img className="menu-pano-slide" src={src} alt="" draggable="false" />
          <img className="menu-pano-slide" src={src} alt="" draggable="false" />
        </div>
      ) : (
        <div className="menu-pano-placeholder" />
      )}
      <div className={`menu-streetview-fade ${fading ? 'menu-streetview-black' : ''}`} />
      <div className="menu-streetview-shade" />
    </div>
  );
}

export default function MainMenu({ username, apiKey, onCreateRoom, onJoinRoom, onEditUsername, onSinglePlayer }) {
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

        <div className="menu-kicker">CUADERNO DE CAMPO · TLALTENANGO</div>
        <h1 className="screen-title">Elige tu ruta</h1>
        <p className="screen-subtitle">Explora, ubica y demuestra tu orientación.</p>
        
        <div className="menu-options">
          <button onClick={onCreateRoom} className="btn-menu-card">
            <Plus size={32} />
            <div className="menu-card-content">
              <h3>Marcar territorio</h3>
              <p>Prepara una expedición multijugador</p>
            </div>
          </button>

          <button onClick={onJoinRoom} className="btn-menu-card">
            <Users size={32} />
            <div className="menu-card-content">
              <h3>Seguir una ruta</h3>
              <p>Únete a la expedición de un amigo</p>
            </div>
          </button>

          <button onClick={onSinglePlayer} className="btn-menu-card solo">
            <Map size={32} />
            <div className="menu-card-content">
              <h3>Explorar por cuenta propia</h3>
              <p>Practica tu orientación sin compañía</p>
            </div>
          </button>
        </div>

        <div className="connection-status">
          <Wifi size={14} className={isConnected ? "text-success" : "text-error"} />
          <span>{isConnected ? 'Conectado al servidor' : 'Sin conexión — modo solo disponible'}</span>
        </div>
      </div>
    </div>
  );
}
