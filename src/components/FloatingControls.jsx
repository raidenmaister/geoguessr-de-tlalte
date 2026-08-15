import React from 'react';
import { Shuffle, RotateCcw, EyeOff } from 'lucide-react';

export default function FloatingControls({ onNextLocation, onResetPov, isLoading }) {
  return (
    <div className="floating-controls">
      <button 
        className="btn-secondary"
        onClick={onResetPov}
        title="Restablecer ángulo de visión"
        disabled={isLoading}
      >
        <RotateCcw size={18} />
      </button>

      <button 
        className="btn-primary" 
        onClick={onNextLocation}
        disabled={isLoading}
      >
        <Shuffle size={20} className={isLoading ? "animate-spin" : ""} />
        <span>{isLoading ? "Cargando..." : "Siguiente Ubicación"}</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', color: 'var(--text-subtle)' }} title="Pistas geográficas desactivadas">
        <EyeOff size={18} />
      </div>
    </div>
  );
}
