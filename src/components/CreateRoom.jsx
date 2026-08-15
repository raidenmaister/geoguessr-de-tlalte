import React, { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { crearSala } from '../services/client';
import { MenuStreetViewBackground } from './MainMenu';
import MenuMusic from './MenuMusic';

export default function CreateRoom({ username, apiKey, onRoomCreated, onBack }) {
  const [rondas, setRondas] = useState(5);
  const [panico, setPanico] = useState(10);
  const [duracionRonda, setDuracionRonda] = useState(0);
  const [maxJugadores, setMaxJugadores] = useState(4);
  const [esPublica, setEsPublica] = useState(true); // Default Pública como pidió el usuario
  const [modoVista, setModoVista] = useState('libre');
  const [tiempoVista, setTiempoVista] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const rondasOptions = [3, 5, 7, 10, 0];
  const panicoOptions = [10, 15, 20, 30];
  const maxJugadoresOptions = [2, 4, 6, 8];
  const duracionRondaOptions = [
    { value: 0, label: 'Sin límite' },
    { value: 30, label: '30s' },
    { value: 60, label: '60s' },
    { value: 120, label: '120s' },
  ];

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await crearSala(username, rondas, panico, duracionRonda, maxJugadores, esPublica, modoVista, tiempoVista);
      if (response.ok) {
        onRoomCreated(response);
      } else {
        setError(response.error || response.mensaje || 'Error al crear la sala');
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-create">
      <MenuStreetViewBackground />
      <MenuMusic />
      <div className="screen-card">
        <button onClick={onBack} className="btn-back">
          <ArrowLeft size={20} /> Volver
        </button>

        <h1 className="screen-title">Crear partida</h1>

        {error && <div className="error-message">{error}</div>}

        <div className="config-group">
          <label className="config-label">Visibilidad de Sala:</label>
          <div className="config-options">
            <button
              className={`config-pill ${esPublica ? 'active' : ''}`}
              onClick={() => setEsPublica(true)}
            >
              🌐 Pública
            </button>
            <button
              className={`config-pill ${!esPublica ? 'active' : ''}`}
              onClick={() => setEsPublica(false)}
            >
              🔒 Privada (por Código)
            </button>
          </div>
        </div>

        {maxJugadores === 2 && (
          <>
            <div className="config-group">
              <label className="config-label">Modo de visualización 1vs1:</label>
              <div className="config-options config-options-wrap">
                {[
                  { value: 'libre', label: 'Exploración libre' },
                  { value: 'estatico', label: 'Modo estático' },
                  { value: 'temporal', label: 'Modo temporal' },
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`config-pill ${modoVista === option.value ? 'active' : ''}`}
                    onClick={() => setModoVista(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
          </>
        )}

        <div className="config-group">
          <label className="config-label">Máximo de Jugadores:</label>
          <div className="config-options">
            {maxJugadoresOptions.map((opt) => (
              <button
                key={opt}
                className={`config-pill ${maxJugadores === opt ? 'active' : ''}`}
                onClick={() => setMaxJugadores(opt)}
              >
                {opt} Jugadores {opt === 2 ? '(Duelo 1v1)' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="config-group">
          <label className="config-label">Rondas:</label>
          <div className="config-options">
            {rondasOptions.map((opt) => (
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

        <div className="config-group">
          <label className="config-label">Duración por ronda:</label>
          <div className="config-options">
            {duracionRondaOptions.map((opt) => (
              <button
                key={opt.value}
                className={`config-pill ${duracionRonda === opt.value ? 'active' : ''}`}
                onClick={() => setDuracionRonda(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="config-group">
          <label className="config-label">Tiempo de pánico (segundos):</label>
          <div className="config-options">
            {panicoOptions.map((opt) => (
              <button
                key={opt}
                className={`config-pill ${panico === opt ? 'active' : ''}`}
                onClick={() => setPanico(opt)}
              >
                {opt}s
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Crear Sala'}
        </button>
      </div>
    </div>
  );
}
