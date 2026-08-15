import React from 'react';
import { LogOut, Play, Users, Globe, Lock, Loader2 } from 'lucide-react';
import { MenuStreetViewBackground } from './MainMenu';
import MenuMusic from './MenuMusic';

export default function Lobby({ roomCode, players = [], isHost, totalRondas, maxJugadores, esPublica = false, apiKey, onStartGame, onLeave }) {
  const codeChars = roomCode ? roomCode.split('') : [];
  const maxJ = maxJugadores ?? players.length;
  const isFull = players.length >= maxJ;

  return (
    <div className="screen-lobby">
      <MenuStreetViewBackground />
      <MenuMusic />
      <div className="screen-card">
        <div className="lobby-header">
          <div className="lobby-type-badge">
            {esPublica ? (
              <span className="badge-public"><Globe size={16} /> Sala Pública</span>
            ) : (
              <span className="badge-private"><Lock size={16} /> Sala Privada</span>
            )}
          </div>
          <h1 className="screen-title">
            {esPublica ? 'Esperando Jugadores' : 'Sala de Espera'}
          </h1>
          <div className="room-info-badges">
            <span className="badge">Rondas: {totalRondas === 0 ? 'Ilimitadas' : totalRondas}</span>
            <span className="badge">
              <Users size={14} /> {players.length} / {maxJ} Jugadores
            </span>
          </div>
        </div>

        {/* SI ES PRIVADA: MOSTRAR CÓDIGO GIGANTE PARA COMPARTIR */}
        {!esPublica ? (
          <div className="code-container">
            <div className="room-code-display">
              {codeChars.map((char, index) => (
                <div key={index} className="room-code-char">
                  {char}
                </div>
              ))}
            </div>
            <p className="screen-subtitle">Comparte este código con tus amigos para ingresar</p>
          </div>
        ) : (
          /* SI ES PÚBLICA: MOSTRAR BANNER DE BÚSQUEDA PÚBLICA */
          <div className="public-matchmaking-banner">
            <div className="matchmaking-status">
              {isFull ? (
                <div className="status-full">
                  <span className="full-dot" />
                  <span>¡Sala Llena! Listos para iniciar.</span>
                </div>
              ) : (
                <div className="status-searching">
                  <Loader2 className="animate-spin icon-orientation" size={20} />
                  <span>Buscando jugadores públicos ({players.length}/{maxJ})...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="players-section">
          <h2 className="section-title">Jugadores Unidos</h2>
          <div className="player-list">
            {players.map((player) => (
              <div key={player.id} className="player-card">
                <div 
                  className="player-color-dot" 
                  style={{ backgroundColor: typeof player.color === 'object' ? player.color?.hex : player.color || '#fff' }}
                />
                <span className="player-name">{player.nombre}</span>
                {player.esHost && <span className="player-host-badge">(Host)</span>}
                {player.desconectado && <span className="player-disconnected-badge">(Desconectado)</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <button 
              onClick={onStartGame} 
              disabled={players.length < 2}
              className={`btn-primary btn-large ${isFull ? 'pulse-btn' : ''}`}
            >
              <Play size={20} /> Iniciar Juego
            </button>
          ) : (
            <div className="waiting-host">
              <span className="loading-dots">Esperando a que el host inicie...</span>
            </div>
          )}
          
          <button onClick={onLeave} className="btn-secondary btn-leave">
            <LogOut size={16} /> Salir
          </button>
        </div>
      </div>
    </div>
  );
}
