import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Trophy, RefreshCw, Home, Crown, Target } from 'lucide-react';
import { formatearDistancia } from '../utils/scoring';

const realIcon = L.divIcon({
  className: 'guess-marker-icon',
  html: `
    <svg width="28" height="36" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="#8fae72"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
      <text x="16" y="20" text-anchor="middle" font-size="12" fill="#8fae72">★</text>
    </svg>
  `,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
});

function crearIconoJugador(hex) {
  return L.divIcon({
    className: 'guess-marker-icon',
    html: `
      <svg width="24" height="32" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="${hex}"/>
        <circle cx="16" cy="16" r="5" fill="white" opacity="0.9"/>
      </svg>
    `,
    iconSize: [24, 32],
    iconAnchor: [12, 32],
  });
}

export default function GameOverOverlay({
  ranking = [],
  historiaRondas = [],
  totalRondas = 5,
  isMultiplayer = false,
  isHost = true,
  revanchaSolicitada = false,
  revanchaSolicitudes = 0,
  revanchaTotalJugadores = 0,
  onRematch,
  onMainMenu,
}) {
  const mapContainerRef = useRef(null);

  const sortedRanking = [...ranking].sort((a, b) => (b.puntosTotal || 0) - (a.puntosTotal || 0));
  const winner = sortedRanking[0];

  useEffect(() => {
    if (!mapContainerRef.current || historiaRondas.length === 0) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const allPoints = [];

    historiaRondas.forEach((round, rIdx) => {
      const real = round.coordenadaReal;
      if (!real) return;

      const realPos = [Number(real.lat), Number(real.lng)];
      allPoints.push(realPos);

      L.marker(realPos, { icon: realIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(`📍 Ronda ${rIdx + 1} - Ubicación Real`);

      (round.resultados || []).forEach((res) => {
        if (!res.adivinanza || (res.adivinanza.lat === 0 && res.adivinanza.lng === 0)) return;

        const guessPos = [Number(res.adivinanza.lat), Number(res.adivinanza.lng)];
        allPoints.push(guessPos);

        const icon = crearIconoJugador(res.color?.hex || '#c56b49');
        L.marker(guessPos, { icon })
          .addTo(map)
          .bindPopup(`🎯 R${rIdx + 1} ${res.nombre}: ${formatearDistancia(res.distancia)} — ${res.puntosRonda} pts`);

        L.polyline([guessPos, realPos], {
          color: res.color?.hex || '#ffffff',
          weight: 2,
          opacity: 0.6,
          dashArray: '6, 4',
        }).addTo(map);
      });
    });

    if (allPoints.length > 1) {
      map.fitBounds(allPoints, { padding: [50, 50], maxZoom: 16 });
    } else if (allPoints.length === 1) {
      map.setView(allPoints[0], 14);
    }

    return () => {
      map.remove();
    };
  }, [historiaRondas]);

  return (
    <div className="game-over-overlay">
      {/* Global summary Leaflet map */}
      <div ref={mapContainerRef} className="game-over-map" />

      {/* Summary control panel */}
      <div className="game-over-panel">
        <div className="game-over-header">
          <Trophy size={40} color="#fbbf24" className="trophy-bounce" />
          <h1 className="game-over-title">¡Fin del Juego!</h1>
          <p className="game-over-subtitle">Resumen final — {totalRondas === 0 ? 'Partida ilimitada' : `${totalRondas} Rondas`}</p>
        </div>

        {winner && (
          <div className="winner-banner" style={{ borderColor: winner.color?.hex || '#fbbf24' }}>
            <Crown size={24} color="#fbbf24" />
            <div>
              <span className="winner-label">Ganador</span>
              <div className="winner-name">{winner.nombre}</div>
            </div>
            <div className="winner-score">{(winner.puntosTotal || 0).toLocaleString()} pts</div>
          </div>
        )}

        {/* Final Ranking Table */}
        <div className="final-ranking-list">
          <div className="ranking-header-row">
            <span>#</span>
            <span>Jugador</span>
            <span>Puntos Totales</span>
          </div>
          {sortedRanking.map((p, idx) => (
            <div key={p.id || idx} className={`ranking-row ${idx === 0 ? 'top-1' : ''}`}>
              <span className="rank-num">{idx + 1}</span>
              <div className="player-meta">
                <span className="player-dot" style={{ backgroundColor: p.color?.hex || '#c56b49' }} />
                <span className="player-name-text">{p.nombre}</span>
              </div>
              <span className="player-score-text">{(p.puntosTotal || 0).toLocaleString()} pts</span>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="game-over-actions">
          {isMultiplayer ? (
            <>
              <button className="btn-primary btn-large" onClick={onRematch} disabled={revanchaSolicitada}>
                <RefreshCw size={20} /> {revanchaSolicitada ? 'Revancha solicitada' : 'Solicitar revancha'}
              </button>
              <div className="waiting-host-rematch">
                {revanchaSolicitudes} / {revanchaTotalJugadores} jugadores aceptaron la revancha
              </div>
            </>
          ) : (
            <button className="btn-primary btn-large" onClick={onRematch}>
              <RefreshCw size={20} /> Jugar de Nuevo
            </button>
          )}

          <button className="btn-secondary" onClick={onMainMenu}>
            <Home size={20} /> Menú Principal
          </button>
        </div>
      </div>
    </div>
  );
}
