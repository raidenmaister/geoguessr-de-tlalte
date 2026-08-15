import React, { useEffect, useRef, useState } from 'react';
import { Plus, Users, Edit2, Wifi, Map } from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { conectar, SERVER_URL } from '../services/client';
import MenuMusic from './MenuMusic';

const PANO_INTERVAL_MS = 20000;
const FADE_OUT_MS = 1300;
const FADE_IN_MS = 700;
const ROTATION_STEP_DEG = 0.08; // ~2°/s → vuelta completa en ~3 min

function getApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || localStorage.getItem('google_maps_api_key') || '';
}

export function MenuStreetViewBackground() {
  const canvasRef = useRef(null);
  const panoramaRef = useRef(null);
  const headingRef = useRef(0);
  const [fading, setFading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const apiKey = getApiKey();
    if (!apiKey || !canvasRef.current) return;

    let active = true;
    let rotationTimer = null;
    let swapTimer = null;
    let fadeTimer = null;

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

    async function init() {
      try {
        let google;
        if (window.google?.maps?.StreetViewPanorama) {
          google = window.google.maps;
        } else {
          setOptions({ apiKey, version: 'weekly' });
          google = await importLibrary('streetView');
          if (!active) return;
        }

        const { StreetViewPanorama } = google;
        const panorama = new StreetViewPanorama(canvasRef.current, {
          disableDefaultUI: true,
          showRoadName: false,
          showRoadLabels: false,
          compassControl: false,
          zoomControl: false,
          panControl: false,
          fullscreenControl: false,
          addressControl: false,
          enableCloseButton: false,
          motionTrackingControl: false,
          linksControl: false,
          clickToGo: false,
          scrollwheel: false,
          pov: { heading: headingRef.current, pitch: 0 },
          zoom: 1,
        });
        panoramaRef.current = panorama;
        if (!active) return;
        setReady(true);

        const firstPanoId = await loadPanoId();
        if (active && firstPanoId) panorama.setPano(firstPanoId);

        // Rotación continua lenta del panorama.
        rotationTimer = window.setInterval(() => {
          if (!active) return;
          headingRef.current = (headingRef.current + ROTATION_STEP_DEG) % 360;
          panoramaRef.current?.setPov({ heading: headingRef.current, pitch: 0 });
        }, 40);

        // Cambio de imagen cada 20s con fundido a negro.
        swapTimer = window.setInterval(async () => {
          const panoId = await loadPanoId();
          if (!active || !panoId) return;
          setFading(true);
          fadeTimer = window.setTimeout(() => {
            if (!active) return;
            panoramaRef.current?.setPano(panoId);
            fadeTimer = window.setTimeout(() => {
              if (active) setFading(false);
            }, FADE_IN_MS);
          }, FADE_OUT_MS);
        }, PANO_INTERVAL_MS);
      } catch (err) {
        console.error('Error al cargar la API de Google Maps para el fondo:', err);
      }
    }

    init();

    return () => {
      active = false;
      window.clearInterval(rotationTimer);
      window.clearInterval(swapTimer);
      window.clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div className="menu-streetview" aria-hidden="true">
      <div ref={canvasRef} className="menu-pano-canvas" />
      {!ready && <div className="menu-pano-placeholder" />}
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
