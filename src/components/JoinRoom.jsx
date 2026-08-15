import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Users, Globe, Lock, RefreshCw } from 'lucide-react';
import { unirseSala, SERVER_URL } from '../services/client';
import { MenuStreetViewBackground } from './MainMenu';
import MenuMusic from './MenuMusic';

export default function JoinRoom({ username, onRoomJoined, onBack }) {
  const [tab, setTab] = useState('public'); // 'public' | 'private'
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [salasPublicas, setSalasPublicas] = useState([]);
  const [loadingSalas, setLoadingSalas] = useState(true);

  useEffect(() => {
    fetchSalas();
  }, []);

  const fetchSalas = async () => {
    setLoadingSalas(true);
    try {
      const res = await fetch(`${SERVER_URL}/salas-publicas`);
      if (res.ok) {
        const data = await res.json();
        setSalasPublicas(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error al obtener salas públicas', err);
    } finally {
      setLoadingSalas(false);
    }
  };

  const handleJoin = async (codigoSala) => {
    const salaAUnirse = codigoSala || codigo;
    if (salaAUnirse.length < 4) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await unirseSala(salaAUnirse, username);
      if (response.ok) {
        onRoomJoined(response);
      } else {
        setError(response.error || response.mensaje || 'Error al unirse a la sala');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-join">
      <MenuStreetViewBackground />
      <MenuMusic />
      <div className="screen-card">
        <button onClick={onBack} className="btn-back">
          <ArrowLeft size={20} /> Volver
        </button>

        <h1 className="screen-title">Unirse a una partida</h1>

        {error && <div className="error-message">{error}</div>}

        {/* Tab Selection */}
        <div className="join-tabs">
          <button
            className={`join-tab ${tab === 'public' ? 'active' : ''}`}
            onClick={() => setTab('public')}
          >
            <Globe size={18} />
            <span>Salas Públicas</span>
          </button>
          <button
            className={`join-tab ${tab === 'private' ? 'active' : ''}`}
            onClick={() => setTab('private')}
          >
            <Lock size={18} />
            <span>Sala Privada (Código)</span>
          </button>
        </div>

        {/* TAB 1: SALAS PÚBLICAS */}
        {tab === 'public' && (
          <div className="public-rooms-section">
            <div className="public-header-bar">
              <span className="public-title-text">Partidas disponibles</span>
              <button className="btn-icon-small" onClick={fetchSalas} title="Actualizar lista">
                <RefreshCw size={16} className={loadingSalas ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingSalas ? (
              <div className="loading-container"><Loader2 className="animate-spin" /></div>
            ) : salasPublicas.length === 0 ? (
              <div className="no-rooms-box">
                <p className="no-rooms-msg">No hay salas públicas abiertas en este momento.</p>
                <p className="no-rooms-sub">¡Sé el primero en crear una sala pública!</p>
              </div>
            ) : (
              <div className="public-rooms-list">
                {salasPublicas.map((sala) => (
                  <div key={sala.codigo} className="public-room-item">
                    <div className="room-info">
                      <div className="room-title-line">
                        <span className="room-host">Host: {sala.host || sala.hostNombre || 'Jugador'}</span>
                        <span className="badge-rondas">{sala.totalRondas === 0 ? 'Ilimitadas' : `${sala.totalRondas} rondas`}</span>
                      </div>
                      <div className="room-meta-line">
                        <span className="room-players">
                          <Users size={14} /> {sala.jugadores !== undefined ? sala.jugadores : sala.jugadoresCount} / {sala.maxJugadores || 4}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleJoin(sala.codigo)}
                      disabled={loading}
                      className="btn-primary btn-small"
                    >
                      Unirse
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SALA PRIVADA POR CÓDIGO */}
        {tab === 'private' && (
          <div className="private-room-section">
          <p className="screen-subtitle">Ingresa el código de 4 letras del anfitrión:</p>
          <div className="code-input-container">
            <label className="config-label" htmlFor="room-code">Código de sala</label>
            <input
              id="room-code"
              type="text"
              maxLength={4}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              placeholder="EJ. MAPA"
              className="input-code"
              autoFocus
            />
              <button
                onClick={() => handleJoin()}
                disabled={codigo.length < 4 || loading}
                className="btn-primary"
              >
                {loading ? <Loader2 className="animate-spin" /> : 'Entrar a Sala'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
