import React, { useState } from 'react';
import { ArrowLeft, Map, Loader2 } from 'lucide-react';
import MenuMusic from './MenuMusic';

const SOLO_MODES = [
  { value: 'libre', label: 'Exploración libre', emoji: '🧭', desc: 'Muévete y rota libremente por el panorama' },
  { value: 'estatico', label: 'Imagen estática', emoji: '📷', desc: 'Una sola vista fija: no puedes ni rotar ni alejarte' },
  { value: 'temporal', label: 'Imagen rápida', emoji: '⚡', desc: 'La imagen se oculta tras unos segundos: adivina de memoria' },
];

const RONDAS_OPTIONS = [3, 5, 7, 10, 0];

export default function SoloSetup({ onStart, onBack }) {
  const [modoVista, setModoVista] = useState('libre');
  const [tiempoVista, setTiempoVista] = useState(1);
  const [rondas, setRondas] = useState(5);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await onStart({ modoVista, tiempoVista, totalRondas: rondas });
    } catch (err) {
      setLoading(false);
    }
  };

  return (
    <div className="screen-create">
      <MenuMusic />
      <div className="screen-card">
        <button onClick={onBack} className="btn-back">
          <ArrowLeft size={20} /> Volver
        </button>

        <div className="menu-kicker">
          <span className="menu-flag" aria-hidden="true">🇲🇽</span> Tlaltenango, Zacatecas
        </div>
        <h1 className="screen-title">Jugar en solitario</h1>
        <p className="screen-subtitle">Elige el modo de juego y comienza.</p>

        <div className="config-group">
          <label className="config-label">Modo de visualización:</label>
          <div className="config-options config-options-wrap">
            {SOLO_MODES.map((option) => (
              <button
                key={option.value}
                className={`config-pill ${modoVista === option.value ? 'active' : ''}`}
                onClick={() => setModoVista(option.value)}
                title={option.desc}
              >
                {option.emoji} {option.label}
              </button>
            ))}
          </div>
          <p className="config-hint">
            {SOLO_MODES.find((m) => m.value === modoVista)?.desc}
          </p>
        </div>

        {modoVista === 'temporal' && (
          <div className="config-group">
            <label className="config-label">Tiempo visible:</label>
            <div className="config-options">
              {[0.5, 1, 3, 5].map((seconds) => (
                <button
                  key={seconds}
                  className={`config-pill ${tiempoVista === seconds ? 'active' : ''}`}
                  onClick={() => setTiempoVista(seconds)}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="config-group">
          <label className="config-label">Rondas:</label>
          <div className="config-options">
            {RONDAS_OPTIONS.map((opt) => (
              <button
                key={opt}
                className={`config-pill ${rondas === opt ? 'active' : ''}`}
                onClick={() => setRondas(opt)}
              >
                {opt === 0 ? 'Ilimitadas' : opt}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleStart} disabled={loading} className="btn-primary">
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              <Map size={20} /> Comenzar exploración
            </>
          )}
        </button>
      </div>
    </div>
  );
}
