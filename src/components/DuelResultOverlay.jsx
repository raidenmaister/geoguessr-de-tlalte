import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { Trophy, Crown, ArrowRight, Zap } from 'lucide-react';
import { formatearDistancia } from '../utils/scoring';
import { getSocketId } from '../services/client';
import { playVictorySFX, playDamageSFX, playKOSFX } from '../utils/audio';

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

function crearIconoColor(hex, nombre) {
  return L.divIcon({
    className: 'guess-marker-icon',
    html: `
      <div class="marker-label" style="background:${hex};color:#fff">${nombre}</div>
      <svg width="28" height="38" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="${hex}"/>
        <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
        <text x="16" y="20" text-anchor="middle" font-size="12" fill="${hex}">★</text>
      </svg>
    `,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
}

export default function DuelResultOverlay({
  resultados,
  coordenadaReal,
  rondaActual,
  totalRondas,
  esUltimaRonda,
  resDuelo,
  onNextRound,
  isHost,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [phase, setPhase] = useState('init');
  const [displayHpLeft, setDisplayHpLeft] = useState(null);
  const [displayHpRight, setDisplayHpRight] = useState(null);
  const [shake, setShake] = useState(false);
  const [flashLeft, setFlashLeft] = useState(false);
  const [flashRight, setFlashRight] = useState(false);
  const [projectilePos, setProjectilePos] = useState(null);
  const animTimers = useRef([]);

  const myId = getSocketId();

  // Determine left / right players (local player on left)
  const { leftP, rightP, winnerSide } = useMemo(() => {
    if (!resultados || resultados.length < 2) return {};
    const p1 = resultados[0];
    const p2 = resultados[1];
    const isP1Local = p1.id === myId;

    const left = isP1Local ? p1 : p2;
    const right = isP1Local ? p2 : p1;

    const winnerId = resDuelo?.ganadorId;
    const winnerSide = winnerId === left.id ? 'left' : winnerId === right.id ? 'right' : null;

    return { leftP: left, rightP: right, winnerSide };
  }, [resultados, myId, resDuelo]);

  // Map setup
  useEffect(() => {
    if (!mapContainerRef.current || !coordenadaReal || !resultados) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const realPos = [Number(coordenadaReal.lat), Number(coordenadaReal.lng)];
    const allPoints = [realPos];

    L.marker(realPos, { icon: realIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup('Ubicacion real');

    resultados.forEach((r) => {
      if (!r.adivinanza || (r.adivinanza.lat === 0 && r.adivinanza.lng === 0)) return;
      const pos = [r.adivinanza.lat, r.adivinanza.lng];
      allPoints.push(pos);

      const icon = crearIconoColor(r.color?.hex || '#c56b49', r.nombre);
      L.marker(pos, { icon })
        .addTo(map)
        .bindPopup(`${r.nombre}: ${formatearDistancia(r.distancia)} — ${r.puntosRonda} pts`);

      L.polyline(
        [pos, realPos],
        { color: r.color?.hex || '#ffffff', weight: 3, opacity: 0.85, lineCap: 'round' }
      ).addTo(map);
    });

    if (allPoints.length > 1) {
      map.fitBounds(allPoints, { padding: [80, 80], maxZoom: 17 });
    } else {
      map.setView(allPoints[0], 15);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [resultados, coordenadaReal]);

  // Initial HP
  useEffect(() => {
    if (leftP && rightP) {
      setDisplayHpLeft(leftP.hp + (resDuelo?.perdedorId === leftP.id ? resDuelo.damage : 0));
      setDisplayHpRight(rightP.hp + (resDuelo?.perdedorId === rightP.id ? resDuelo.damage : 0));
    }
  }, [leftP, rightP, resDuelo]);

  // Animation sequence
  useEffect(() => {
    if (!leftP || !rightP || !resDuelo) return;

    const timers = [];
    const addTimer = (fn, delay) => {
      const t = setTimeout(fn, delay);
      timers.push(t);
      return t;
    };

    // Phase 1: Scores appear
    addTimer(() => setPhase('scores'), 600);

    // Phase 2: Multiplier reveal (if > 1)
    if (resDuelo.multiplicador > 1.0) {
      addTimer(() => setPhase('multiplier'), 1800);
      addTimer(() => playVictorySFX(), 1900);
    }

    // Phase 3: Projectile + damage
    const projectileStart = resDuelo.multiplicador > 1.0 ? 3600 : 2200;
    addTimer(() => {
      setPhase('projectile');
      playVictorySFX();
    }, projectileStart);

    // Phase 4: Impact
    const impactStart = projectileStart + 1200;
    addTimer(() => {
      setPhase('impact');
      setShake(true);
      if (winnerSide === 'left') setFlashRight(true);
      else if (winnerSide === 'right') setFlashLeft(true);

      playDamageSFX();
      if (esUltimaRonda) {
        addTimer(() => playKOSFX(), 400);
      }

      addTimer(() => {
        setShake(false);
        setFlashLeft(false);
        setFlashRight(false);
      }, 500);
    }, impactStart);

    // Phase 5: HP reduction
    const hpReduceStart = impactStart + 200;
    addTimer(() => {
      setPhase('hp-reduce');
      if (winnerSide === 'left') setDisplayHpRight(rightP.hp);
      else if (winnerSide === 'right') setDisplayHpLeft(leftP.hp);
      else {
        setDisplayHpLeft(leftP.hp);
        setDisplayHpRight(rightP.hp);
      }
    }, hpReduceStart);

    // Phase 6: Done
    addTimer(() => setPhase('done'), hpReduceStart + 800);

    animTimers.current = timers;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [leftP, rightP, resDuelo, winnerSide, esUltimaRonda]);

  if (!leftP || !rightP) return null;

  const hpLeftCur = displayHpLeft ?? leftP.hp;
  const hpRightCur = displayHpRight ?? rightP.hp;
  const maxHp = 5000;

  const damageAmount = resDuelo?.damage || 0;
  const multiplicador = resDuelo?.multiplicador || 1.0;
  const isMultiplierActive = multiplicador > 1.0;

  return (
    <div className={`duel-result-overlay ${shake ? 'shake' : ''}`}>
      <div ref={mapContainerRef} className="duel-result-map" />

      {/* HUD Superior */}
      <div className="duel-result-hud">
        {/* Left player */}
        <div className="duel-result-player left">
          <span className="duel-result-name" style={{ color: leftP.color?.hex || '#c56b49' }}>
            {leftP.nombre}
          </span>
          <div className={`duel-result-bar-outer ${flashLeft ? 'flash-damage' : ''}`}>
            <div
              className="duel-result-bar-inner left-bar"
              style={{ width: `${Math.max(0, (hpLeftCur / maxHp) * 100)}%` }}
            />
          </div>
          <span className="duel-result-hp">{Math.round(hpLeftCur).toLocaleString()} HP</span>
        </div>

        {/* Multiplier center */}
        <div className={`duel-multiplier ${isMultiplierActive ? 'active' : ''}`}>
          <Zap size={18} />
          <span>x{multiplicador.toFixed(1)}</span>
        </div>

        {/* Right player */}
        <div className="duel-result-player right">
          <span className="duel-result-name" style={{ color: rightP.color?.hex || '#3b82f6' }}>
            {rightP.nombre}
          </span>
          <div className={`duel-result-bar-outer ${flashRight ? 'flash-damage' : ''}`}>
            <div
              className="duel-result-bar-inner right-bar"
              style={{ width: `${Math.max(0, (hpRightCur / maxHp) * 100)}%` }}
            />
          </div>
          <span className="duel-result-hp">{Math.round(hpRightCur).toLocaleString()} HP</span>
        </div>
      </div>

      {/* Score cards */}
      <div className={`duel-score-cards ${phase !== 'init' ? 'visible' : ''}`}>
        <div className={`duel-score-card ${phase === 'scores' || phase === 'multiplier' || phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done' ? 'show' : ''} ${phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done' ? 'active' : ''}`}>
          <div className="duel-score-card-header">{leftP.nombre}</div>
          <div className="duel-score-dist">{formatearDistancia(leftP.distancia)}</div>
          <div className="duel-score-pts">{leftP.puntosRonda.toLocaleString()} pts</div>
          {isMultiplierActive && (phase === 'multiplier' || phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done') && (
            <div className="duel-score-calc">{leftP.puntosRonda.toLocaleString()} × {multiplicador.toFixed(1)} = {(leftP.puntosRonda * multiplicador).toLocaleString()}</div>
          )}
        </div>

        <div className="duel-score-vs">VS</div>

        <div className={`duel-score-card ${phase === 'scores' || phase === 'multiplier' || phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done' ? 'show' : ''} ${phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done' ? 'active' : ''}`}>
          <div className="duel-score-card-header">{rightP.nombre}</div>
          <div className="duel-score-dist">{formatearDistancia(rightP.distancia)}</div>
          <div className="duel-score-pts">{rightP.puntosRonda.toLocaleString()} pts</div>
          {isMultiplierActive && (phase === 'multiplier' || phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done') && (
            <div className="duel-score-calc">{rightP.puntosRonda.toLocaleString()} × {multiplicador.toFixed(1)} = {(rightP.puntosRonda * multiplicador).toLocaleString()}</div>
          )}
        </div>
      </div>

      {/* Damage projectile */}
      {(phase === 'projectile' || phase === 'impact') && (
        <div className={`duel-projectile ${winnerSide === 'left' ? 'left-to-right' : 'right-to-left'}`}>
          <div className="duel-projectile-damage">-{damageAmount.toLocaleString()}</div>
        </div>
      )}

      {/* Crown on winner */}
      {(phase === 'projectile' || phase === 'impact' || phase === 'hp-reduce' || phase === 'done') && winnerSide && (
        <div className={`duel-crown ${winnerSide}`}>
          <Crown size={48} color="#fbbf24" />
        </div>
      )}

      {/* Round info */}
      <div className="duel-round-info">
        Ronda {rondaActual} / {totalRondas === 0 ? '∞' : totalRondas}
      </div>

      {/* Next round button */}
      {phase === 'done' && (
        <div className="duel-next-btn-wrapper">
          {isHost !== false ? (
            <button className="duel-next-btn" onClick={onNextRound}>
              <span>{esUltimaRonda ? 'Ver Resultados Finales' : 'Siguiente Ronda'}</span>
              <ArrowRight size={20} />
            </button>
          ) : (
            <div className="duel-waiting-host">Esperando al host...</div>
          )}
        </div>
      )}
    </div>
  );
}
