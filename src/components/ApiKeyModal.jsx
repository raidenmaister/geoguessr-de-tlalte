import React, { useState } from 'react';
import { Key, ShieldAlert, Check } from 'lucide-react';

export default function ApiKeyModal({ apiKey, onSave, onClose, isRequired }) {
  const [inputKey, setInputKey] = useState(apiKey || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputKey.trim()) {
      onSave(inputKey.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-key-heading">
            <Key size={28} />
            <h2>Google Maps API Key</h2>
          </div>
          <p>
            {isRequired 
              ? "Para cargar Google Street View es necesario ingresar una Google Maps JavaScript API Key con la API Street View habilitada."
              : "Puedes actualizar tu clave de Google Maps API en cualquier momento."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label className="config-label" htmlFor="google-maps-key">Clave de Google Maps</label>
          <input
            id="google-maps-key"
            type="text"
            className="input-field"
            placeholder="AIzaSy..."
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            required
            autoFocus
          />
        </div>

          <div className="modal-actions">
            {!isRequired && (
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={onClose}
                style={{ borderRadius: '12px', width: 'auto', padding: '0 16px' }}
              >
                Cancelar
              </button>
            )}
            <button type="submit" className="btn-primary" style={{ borderRadius: '12px', padding: '12px 20px' }}>
              <Check size={18} />
              <span>Guardar Clave</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
