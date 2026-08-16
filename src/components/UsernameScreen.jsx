import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import MenuMusic from './MenuMusic';
import { MenuStreetViewBackground } from './MainMenu';

export default function UsernameScreen({ onUsernameSet }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onUsernameSet(name.trim());
    }
  };

  return (
    <div className="screen-username">
      <MenuStreetViewBackground />
      <MenuMusic />
      <div className="screen-card">
        <Globe size={48} className="globe-icon" />
        <h1 className="screen-title">GeoGuessr Explorer</h1>
        <h2 className="screen-subtitle">Elige tu nombre de jugador</h2>
          
        <form onSubmit={handleSubmit}>
          <label className="config-label" htmlFor="player-name">Nombre de jugador</label>
          <input
            id="player-name"
            type="text"
            maxLength={15}
            placeholder="Ej. Explorador"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
          />
          <button 
            type="submit" 
            disabled={!name.trim()}
            className="btn-primary"
          >
            Comenzar
          </button>
        </form>
      </div>
    </div>
  );
}
