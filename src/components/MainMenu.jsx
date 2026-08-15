import React, { useEffect, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const MOSAIC_REFRESH_MS = 30000;
const MOSAIC_CARDS_PER_GRID = 20;
const MOSAIC_EAGER_COUNT = 10;

function fillToCount(items, count) {
  if (items.length >= count) return items.slice(0, count);
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(items[i % items.length]);
  }
  return result;
}

function MosaicGrid({ photos, gridId }) {
  return (
    <div className="menu-mosaic-grid">
      {photos.map((source, index) => (
        <div className={`menu-mosaic-card mosaic-card-${index % 7}`} key={`${gridId}-${index}-${source}`}>
          <img src={source} alt="" draggable="false" loading={index < MOSAIC_EAGER_COUNT ? 'eager' : 'lazy'} />
        </div>
      ))}
    </div>
  );
}

export function MenuStreetViewBackground() {
  const [primaryPhotos, setPrimaryPhotos] = useState([]);
  const [duplicatePhotos, setDuplicatePhotos] = useState([]);

  useEffect(() => {
    let mounted = true;

    const fetchMosaic = async () => {
      try {
        const response = await fetch(`${SERVER_URL}/mosaic`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const nextPhotos = Array.isArray(data) ? data : data.photos;
        if (!mounted || !Array.isArray(nextPhotos) || nextPhotos.length === 0) return;
        const resolved = nextPhotos.map((photo) => new URL(photo, SERVER_URL).href);
        const half = Math.ceil(resolved.length / 2);
        setPrimaryPhotos(fillToCount(resolved.slice(0, half), MOSAIC_CARDS_PER_GRID));
        setDuplicatePhotos(fillToCount(resolved.slice(half), MOSAIC_CARDS_PER_GRID));
      } catch (error) {
        console.warn('No se pudo cargar el mosaico del menú:', error);
      }
    };

    fetchMosaic();
    const refreshTimer = window.setInterval(fetchMosaic, MOSAIC_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  return (
    <div className="menu-streetview" aria-hidden="true">
      {primaryPhotos.length > 0 && (
        <div className="menu-mosaic-viewport">
          <div className="menu-mosaic-plane">
            <div className="menu-mosaic-track">
              <MosaicGrid photos={primaryPhotos} gridId="primary" />
              <MosaicGrid photos={duplicatePhotos.length > 0 ? duplicatePhotos : primaryPhotos} gridId="duplicate" />
            </div>
          </div>
        </div>
      )}
      <div className={`menu-streetview-fade ${primaryPhotos.length > 0 ? '' : 'menu-streetview-black'}`} />
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
