import React from 'react';
import { Compass, MapPin, Trophy } from 'lucide-react';

export default function Header({ ronda, puntosAcumulados }) {
  return (
    <header className="header-bar">
      <div className="badge-brand">
        <div className="brand-icon">
          <Compass size={18} />
        </div>
        <div>
          <div className="brand-title">GeoGuessr Explorer</div>
          <div className="brand-subtitle">Bitácora de orientación</div>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat-chip">
          <MapPin size={16} className="icon-orientation" />
          <span>Ronda: <strong>#{ronda}</strong></span>
        </div>

        <div className="stat-chip">
          <Trophy size={16} className="icon-progress" />
          <span>Puntos: <strong>{puntosAcumulados.toLocaleString()}</strong></span>
        </div>
      </div>
    </header>
  );
}
