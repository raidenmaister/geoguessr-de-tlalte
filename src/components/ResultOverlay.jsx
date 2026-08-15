import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { Trophy, Navigation, ArrowRight, Star, Crown, Target } from 'lucide-react';
import { formatearDistancia } from '../utils/scoring';
import { playDamageSFX, playKOSFX } from '../utils/audio';

function crearIconoColor(hex, nombre) {
  return L.divIcon({
    className: 'guess-marker-icon',
    html: `
      <div class="marker-label" style="background:${hex};color:#fff">${nombre}</div>
      <svg width="28" height="38" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="${hex}"/>
        <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
      </svg>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
}

const realIcon = L.divIcon({
  className: 'guess-marker-icon',
  html: `
    <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="#8fae72"/>
      <circle cx="16" cy="16" r="7" fill="white"/>
      <text x="16" y="20" text-anchor="middle" font-size="14" fill="#8fae72">★</text>
    </svg>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

export default function ResultOverlay({
  resultados,
  coordenadaReal,
  rondaActual,
  totalRondas,
  esUltimaRonda,
  onNextRound,
  isHost,
  esDuelo,
  resDuelo,
  guessCoords,
  realCoords,
  distancia,
  puntos,
  puntosAcumulados,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const esMultiplayer = resultados && resultados.length > 0;

  const datosResultados = useMemo(() => {
    if (esMultiplayer) return resultados;
    return [{
      id: 'local',
      nombre: 'Tú',
      color: { hex: '#c56b49' },
      adivinanza: guessCoords,
      distancia: distancia,
      puntosRonda: puntos,
      puntosTotal: puntosAcumulados,
    }];
  }, [esMultiplayer, resultados, guessCoords, distancia, puntos, puntosAcumulados]);

  const coordReal = esMultiplayer ? coordenadaReal : realCoords;
  const ronda = rondaActual;

  const ganador = useMemo(() => {
    if (datosResultados.length === 0) return null;
    return [...datosResultados].sort((a, b) => b.puntosRonda - a.puntosRonda)[0];
  }, [datosResultados]);

  // SFX en combate de Duelos
  useEffect(() => {
    if (esDuelo && resDuelo) {
      if (resDuelo.damage > 0) {
        playDamageSFX();
      }
      if (esUltimaRonda) {
        setTimeout(() => playKOSFX(), 400);
      }
    }
  }, [esDuelo, resDuelo, esUltimaRonda]);

  useEffect(() => {
    if (!mapContainerRef.current || !coordReal) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.marker(
      [Number(coordReal.lat), Number(coordReal.lng)],
      { icon: realIcon, zIndexOffset: 1000 }
    ).addTo(map).bindPopup('📍 Ubicación real');

    const allPoints = [[Number(coordReal.lat), Number(coordReal.lng)]];

    datosResultados.forEach((r) => {
      if (!r.adivinanza || (r.adivinanza.lat === 0 && r.adivinanza.lng === 0)) return;

      const pos = [r.adivinanza.lat, r.adivinanza.lng];
      allPoints.push(pos);

      const icon = crearIconoColor(r.color?.hex || '#c56b49', r.nombre);
      L.marker(pos, { icon })
        .addTo(map)
        .bindPopup(`🎯 ${r.nombre}: ${formatearDistancia(r.distancia)} — ${r.puntosRonda} pts`);

      L.polyline(
        [pos, [Number(coordReal.lat), Number(coordReal.lng)]],
        {
          color: r.color?.hex || '#ffffff',
          weight: 2.5,
          opacity: 0.7,
          dashArray: '8, 6',
          lineCap: 'round',
        }
      ).addTo(map);
    });

    if (allPoints.length > 1) {
      map.fitBounds(allPoints, { padding: [60, 60], maxZoom: 17 });
    } else {
      map.setView(allPoints[0], 15);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [datosResultados, coordReal]);

  return (
    <div className="result-overlay">
      <div ref={mapContainerRef} className="result-map" />

      <div className="result-panel">
        {esMultiplayer && ganador ? (
          <div className="result-score-header">
            <div className="result-score-icon" style={{ background: ganador.color?.hex || '#c56b49' }}>
              <Crown size={24} />
            </div>
            <div>
              <div className="result-winner-name">{ganador.nombre}</div>
              <div className="result-score-value">
                <span className="result-points-number">{ganador.puntosRonda.toLocaleString()}</span>
                <span className="result-points-label"> pts esta ronda</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="result-score-header">
            <div className="result-score-icon" style={{ background: '#c56b49' }}>
              <Trophy size={24} />
            </div>
            <div className="result-score-value">
              <span className="result-points-number">{(puntos || 0).toLocaleString()}</span>
              <span className="result-points-label"> / 5,000 pts</span>
            </div>
          </div>
        )}

        <div className="result-progress-track">
          <div
            className="result-progress-fill"
            style={{
              width: `${Math.min(100, ((ganador?.puntosRonda || puntos || 0) / 5000) * 100)}%`,
              background: ganador?.color?.hex || '#8fae72',
            }}
          />
        </div>

        {/* Duel Battle Report */}
        {esDuelo && resDuelo && (
          <div className="duels-battle-report">
            <div className="battle-header">Reporte de Combate — Ronda {ronda}/{totalRondas === 0 ? '∞' : totalRondas}</div>
            
            <div className="battle-stats">
              <div className="battle-multiplier">Multiplicador: {resDuelo.multiplicador.toFixed(1)}x</div>
              <div className="battle-damage">Daño infligido: <span>{resDuelo.damage.toLocaleString()} HP</span></div>
            </div>

            <div className="battle-players">
              {datosResultados.map(r => {
                const isLoser = r.id === resDuelo.perdedorId;
                return (
                  <div key={r.id} className={`battle-player-row ${isLoser ? 'took-damage' : ''}`}>
                    <span className="battle-color" style={{ background: r.color?.hex }} />
                    <span className="battle-name">{r.nombre}</span>
                    <span className="battle-pts">+{r.puntosRonda} pts</span>
                    {isLoser && <span className="battle-dmg-text">-{resDuelo.damage.toLocaleString()}</span>}
                    <span className="battle-hp">{r.hp} HP</span>
                  </div>
                );
              })}
            </div>
            {esUltimaRonda && (
              <div className="battle-ko">
                ¡K.O.!
              </div>
            )}
          </div>
        )}

        {/* Leaderboard (multiplayer, non-duel) */}
        {esMultiplayer && !esDuelo && (
          <div className="leaderboard">
            <div className="leaderboard-header">
              <span>Clasificación</span>
              <span>Ronda {ronda}/{totalRondas === 0 ? '∞' : totalRondas}</span>
            </div>
            {[...datosResultados]
              .sort((a, b) => b.puntosRonda - a.puntosRonda)
              .map((r, idx) => (
                <div key={r.id} className={`leaderboard-row ${idx === 0 ? 'winner' : ''}`}>
                  <span className="leaderboard-rank">#{idx + 1}</span>
                  <span className="leaderboard-color" style={{ background: r.color?.hex }} />
                  <span className="leaderboard-name">{r.nombre}</span>
                  <span className="leaderboard-dist">{r.distancia === Infinity ? '—' : formatearDistancia(r.distancia)}</span>
                  <span className="leaderboard-round-pts">+{r.puntosRonda}</span>
                  <span className="leaderboard-total-pts">{r.puntosTotal.toLocaleString()}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Stats singleplayer */}
        {!esMultiplayer && (
          <div className="result-stats">
            <div className="result-stat-row">
              <Navigation size={16} color="#94a3b8" />
              <span className="result-stat-label">Distancia</span>
              <span className="result-stat-value">{formatearDistancia(distancia)}</span>
            </div>
            <div className="result-stat-row">
              <Star size={16} className="icon-progress" />
              <span className="result-stat-label">Total acumulado</span>
              <span className="result-stat-value result-stat-highlight">
                {(puntosAcumulados || 0).toLocaleString()} pts
              </span>
            </div>
          </div>
        )}

        {/* Leyenda */}
        <div className="result-legend">
          <div className="result-legend-item">
            <span className="result-legend-dot" style={{ background: '#8fae72' }} />
            <span>Ubicación real</span>
          </div>
          {esMultiplayer ? (
            <div className="result-legend-item">
              <Target size={12} />
              <span>Marcadores de jugadores</span>
            </div>
          ) : (
            <div className="result-legend-item">
              <span className="result-legend-dot" style={{ background: '#c56b49' }} />
              <span>Tu adivinanza</span>
            </div>
          )}
        </div>

        {/* Botón Siguiente Ronda */}
        {(isHost !== false) && (
          <button className="btn-next-round" onClick={onNextRound}>
            <span>{esUltimaRonda ? 'Ver Resultados Finales' : 'Siguiente Ronda'}</span>
            <ArrowRight size={20} />
          </button>
        )}
        {isHost === false && (
          <div className="result-waiting-host">
            Esperando al host...
          </div>
        )}
      </div>
    </div>
  );
}
