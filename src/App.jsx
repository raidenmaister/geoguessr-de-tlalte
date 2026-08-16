import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import StreetViewContainer from './components/StreetViewContainer';
import FloatingControls from './components/FloatingControls';
import CompassBar from './components/CompassBar';
import GuessMap from './components/GuessMap';
import ResultOverlay from './components/ResultOverlay';
import DuelResultOverlay from './components/DuelResultOverlay';
import GameOverOverlay from './components/GameOverOverlay';
import UsernameScreen from './components/UsernameScreen';
import MainMenu from './components/MainMenu';
import CreateRoom from './components/CreateRoom';
import JoinRoom from './components/JoinRoom';
import Lobby from './components/Lobby';
import PanicTimer from './components/PanicTimer';
import DuelsHUD from './components/DuelsHUD';
import EmotePicker from './components/EmotePicker';
import EmoteOverlay from './components/EmoteOverlay';
import DesktopOnlyNotice from './components/DesktopOnlyNotice';
import SoloSetup from './components/SoloSetup';
import { MenuStreetViewBackground } from './components/MainMenu';
import * as socket from './services/client';
import { Send, Clock } from 'lucide-react';
import { haversineDistance, calcularPuntos } from './utils/scoring';
import { playKOSFX, warmupAudio } from './utils/audio';
import { fetchRandomCoord } from './services/coordinates';

const SCREEN = {
  USERNAME: 'USERNAME',
  MENU: 'MENU',
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  RESULT: 'RESULT',
  GAME_OVER: 'GAME_OVER',
  SOLO_SETUP: 'SOLO_SETUP',
};

function DeviceGate() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const phoneQuery = window.matchMedia('(max-width: 767px) and (pointer: coarse)');
    const updateDevice = () => {
      const mobileUserAgent = /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent);
      setIsPhone(mobileUserAgent || phoneQuery.matches);
    };
    updateDevice();
    phoneQuery.addEventListener?.('change', updateDevice);
    window.addEventListener('resize', updateDevice);
    return () => {
      phoneQuery.removeEventListener?.('change', updateDevice);
      window.removeEventListener('resize', updateDevice);
    };
  }, []);

  if (isPhone) return <DesktopOnlyNotice />;
  return <GeoGuessrApp />;
}

function GeoGuessrApp() {

  // ═══ USERNAME ═══
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('geoguessr_username') || '';
  });

  // ═══ PANTALLA ACTUAL ═══
  const [screen, setScreen] = useState(() => {
    const saved = localStorage.getItem('geoguessr_username');
    return saved ? SCREEN.MENU : SCREEN.USERNAME;
  });

  // ═══ SALA MULTIJUGADOR ═══
  const [roomCode, setRoomCode] = useState(null);
  const [roomPlayers, setRoomPlayers] = useState([]);
  const [roomHostId, setRoomHostId] = useState(null);
  const [maxJugadores, setMaxJugadores] = useState(null);
  const [esPublica, setEsPublica] = useState(false);
  const [modoVista, setModoVista] = useState('libre');
  const [tiempoVista, setTiempoVista] = useState(1);
  const [povHeading, setPovHeading] = useState(null);
  const [soloPovHeading, setSoloPovHeading] = useState(() => Math.floor(Math.random() * 360));
  const [temporalVisible, setTemporalVisible] = useState(true);
  const temporalTimerRef = useRef(null);

  // ═══ JUEGO ═══
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [ronda, setRonda] = useState(1);
  const [totalRondas, setTotalRondas] = useState(5);
  const [puntosAcumulados, setPuntosAcumulados] = useState(0);
  const [currentCoord, setCurrentCoord] = useState(null);

  // ═══ DUELOS & EMOTES ═══
  const [esDuelo, setEsDuelo] = useState(false);
  const [duelPlayers, setDuelPlayers] = useState([]);
  const [activeEmotes, setActiveEmotes] = useState([]);

  // ═══ RONDA & TIMER ═══
  const [guessCoords, setGuessCoords] = useState(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapHovered, setMapHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [yaAdivine, setYaAdivine] = useState(false);
  const [duracionRondaSec, setDuracionRondaSec] = useState(0);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const roundTimerRef = useRef(null);

  // Anti-stale closure refs
  const guessCoordsRef = useRef(null);
  const yaAdivineRef = useRef(false);
  useEffect(() => { guessCoordsRef.current = guessCoords; }, [guessCoords]);
  useEffect(() => { yaAdivineRef.current = yaAdivine; }, [yaAdivine]);

  // ═══ PÁNICO ═══
  const [panicActive, setPanicActive] = useState(false);
  const [panicSeconds, setPanicSeconds] = useState(0);
  const [panicTrigger, setPanicTrigger] = useState('');
  const panicTimerRef = useRef(null);

  // ═══ RESULTADOS Y FIN DE JUEGO ═══
  const [roundResult, setRoundResult] = useState(null);
  const [esUltimaRonda, setEsUltimaRonda] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [singleplayerHistory, setSingleplayerHistory] = useState([]);

  // ═══ ADIVINARON (multijugador) ═══
  const [adivinaronList, setAdivinaronList] = useState([]);

  // ═══ CARGA SINCRONIZADA ═══
  const [showPreparing, setShowPreparing] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ listos: 0, total: 0 });

  // REFS
  const guessMapRef = useRef(null);

  // ═══════════════════════════════════════
  //  RECONEXIÓN AUTOMÁTICA
  // ═══════════════════════════════════════
  useEffect(() => {
    const token = localStorage.getItem('geoguessr_session_token');
    const code = localStorage.getItem('geoguessr_room_code');
    let mounted = true;

    if (token && code && username) {
      socket.reconectarSala(code, token).then((res) => {
        if (!mounted) return;
        if (res.ok) {
          setRoomCode(res.codigo);
          setRoomPlayers(res.jugadores);
          setRoomHostId(res.hostId);
          setTotalRondas(res.totalRondas);
           if (res.maxJugadores != null) setMaxJugadores(res.maxJugadores);
           setEsPublica(res.esPublica || false);
           setModoVista(res.modoVista || 'libre');
           setTiempoVista(res.tiempoVista || 1);
           if (res.povHeading != null) setPovHeading(res.povHeading);
          setIsMultiplayer(true);

          if (res.estado === 'LOBBY') {
            setScreen(SCREEN.LOBBY);
          } else {
            setRonda(res.rondaActual);
            setPuntosAcumulados(res.puntosActuales || 0);
            if (res.coordActual) setCurrentCoord(res.coordActual);
            if (res.esDuelo) setEsDuelo(true);
            setShowPreparing(false);
            setScreen(SCREEN.PLAYING);
            socket.reportarListo(res.codigo);
          }
        } else {
          localStorage.removeItem('geoguessr_session_token');
          localStorage.removeItem('geoguessr_room_code');
        }
      });
    }
    return () => { mounted = false; };
  }, []);

  // ═══════════════════════════════════════
  //  USERNAME
  // ═══════════════════════════════════════
  const handleUsernameSet = useCallback((name) => {
    localStorage.setItem('geoguessr_username', name);
    setUsername(name);
    setScreen(SCREEN.MENU);
  }, []);

  // ═══════════════════════════════════════
  //  SALAS MULTIJUGADOR
  // ═══════════════════════════════════════
  const handleRoomCreated = useCallback((data) => {
    setRoomCode(data.codigo);
    setRoomPlayers(data.jugadores);
    setRoomHostId(data.hostId || socket.getSocketId());
    setTotalRondas(data.totalRondas);
    if (data.maxJugadores != null) setMaxJugadores(data.maxJugadores);
    setEsPublica(data.esPublica || false);
    setModoVista(data.modoVista || 'libre');
    setTiempoVista(data.tiempoVista || 1);
    setIsMultiplayer(true);
    setScreen(SCREEN.LOBBY);
  }, [socket]);

  const handleRoomJoined = useCallback((data) => {
    setRoomCode(data.codigo);
    setRoomPlayers(data.jugadores);
    setRoomHostId(data.hostId);
    setTotalRondas(data.totalRondas);
    if (data.maxJugadores != null) setMaxJugadores(data.maxJugadores);
    setEsPublica(data.esPublica || false);
    setModoVista(data.modoVista || 'libre');
    setTiempoVista(data.tiempoVista || 1);
    setIsMultiplayer(true);
    setScreen(SCREEN.LOBBY);
  }, []);

  const handleStartGame = useCallback(async () => {
    if (!roomCode) return;
    const res = await socket.iniciarJuego(roomCode);
    if (!res.ok) alert(res.error || 'Error al iniciar');
  }, [roomCode, socket]);

  const handleLeaveLobby = useCallback(() => {
    socket.desconectar();
    localStorage.removeItem('geoguessr_session_token');
    localStorage.removeItem('geoguessr_room_code');
    setRoomCode(null);
    setRoomPlayers([]);
    setMaxJugadores(null);
    setIsMultiplayer(false);
    setScreen(SCREEN.MENU);
  }, [socket]);

  // ═══════════════════════════════════════
  //  SOCKET.IO EVENT HANDLERS
  // ═══════════════════════════════════════
  useEffect(() => {
    if (!isMultiplayer || !roomCode) return;

    const cleanup = socket.suscribirEventos({
      onJugadorUnido: ({ jugadores, maxJugadores: mj, esPublica: ep }) => {
        setRoomPlayers(jugadores);
        if (mj) setMaxJugadores(mj);
        if (ep !== undefined) setEsPublica(ep);
      },
      onJugadorSalio: ({ jugadores, nuevoHostId }) => {
        setRoomPlayers(jugadores);
        if (nuevoHostId) setRoomHostId(nuevoHostId);
      },

      onJugadorAdivino: ({ id, nombre }) => {
        setAdivinaronList(prev => prev.includes(nombre) ? prev : [...prev, nombre]);
      },

       onPrepararRonda: ({ ronda: r, totalRondas: tr, duracionRonda: dr, coordenada, esDuelo: duelo, jugadores, modoVista: mv, tiempoVista: tv, povHeading: heading }) => {
        setRonda(r);
        setTotalRondas(tr);
        setDuracionRondaSec(dr || 0);
        setCurrentCoord(coordenada);
         setEsDuelo(duelo || false);
         setModoVista(mv || 'libre');
         setTiempoVista(tv || 1);
         setPovHeading(heading ?? null);
         setTemporalVisible(mv !== 'temporal');
         if (temporalTimerRef.current) clearTimeout(temporalTimerRef.current);
        if (duelo && jugadores) setDuelPlayers(jugadores);
        setGuessCoords(null);
        setYaAdivine(false);
        setMapExpanded(false);
        setPanicActive(false);
        setPanicSeconds(0);
        setRoundResult(null);
        setShowPreparing(true);
        setLoadProgress({ listos: 0, total: 0 });
        setAdivinaronList([]);
        setActiveEmotes([]);

        if (guessMapRef.current) guessMapRef.current.clearMarker();
        setScreen(SCREEN.PLAYING);
      },

      onProgresoCarga: ({ listos, total }) => setLoadProgress({ listos, total }),

       onIniciarRonda: ({ timestampInicio, countdown, duracionRonda }) => {
        setShowPreparing(false);
        const delay = Math.max(0, timestampInicio - Date.now());

         setTimeout(() => {
           if (modoVista === 'temporal') {
             setTemporalVisible(true);
             temporalTimerRef.current = setTimeout(() => setTemporalVisible(false), tiempoVista * 1000);
           }
           setIsLoading(false);
          const sec = duracionRonda || duracionRondaSec;
          if (sec > 0) {
            setRoundTimeLeft(sec);
            if (roundTimerRef.current) clearInterval(roundTimerRef.current);

            let remaining = sec;
            roundTimerRef.current = setInterval(() => {
              remaining--;
              setRoundTimeLeft(remaining);
              if (remaining <= 0) {
                clearInterval(roundTimerRef.current);
                roundTimerRef.current = null;
              }
            }, 1000);
          }
        }, delay);
      },

      onCuentaRegresivaActivada: ({ segundosRestantes, primerJugador }) => {
        setPanicActive(true);
        setPanicSeconds(segundosRestantes);
        setPanicTrigger(primerJugador);

        if (panicTimerRef.current) clearInterval(panicTimerRef.current);
        let remaining = segundosRestantes;
        panicTimerRef.current = setInterval(() => {
          remaining--;
          setPanicSeconds(remaining);
          if (remaining <= 0) {
            clearInterval(panicTimerRef.current);
            panicTimerRef.current = null;

            if (!yaAdivineRef.current && guessCoordsRef.current) {
              socket.enviarAdivinanza(roomCode, guessCoordsRef.current.lat, guessCoordsRef.current.lng);
              setYaAdivine(true);
            }
          }
        }, 1000);
      },

       onResultadosRonda: ({ ronda: r, totalRondas: tr, coordenadaReal, resultados, esUltimaRonda: eur, esDuelo: duelo, resDuelo }) => {
         setTemporalVisible(false);
         if (temporalTimerRef.current) { clearTimeout(temporalTimerRef.current); temporalTimerRef.current = null; }
        setPanicActive(false);
        setActiveEmotes([]);
        if (panicTimerRef.current) { clearInterval(panicTimerRef.current); panicTimerRef.current = null; }
        if (roundTimerRef.current) { clearInterval(roundTimerRef.current); roundTimerRef.current = null; }

        const myId = socket.getSocketId();
        const miResultado = resultados.find((res) => res.id === myId);
        if (miResultado) setPuntosAcumulados(miResultado.puntosTotal);

        if (duelo) {
          setEsDuelo(true);
          setDuelPlayers(resultados);
        }

        setRoundResult({
          resultados,
          coordenadaReal,
          rondaActual: r,
          totalRondas: tr,
          esUltimaRonda: eur,
          esDuelo: duelo,
          resDuelo,
        });
        setEsUltimaRonda(eur);
        setScreen(SCREEN.RESULT);
      },

      onFinJuego: ({ ranking, totalRondas: tr, historiaRondas }) => {
        setPanicActive(false);
        setActiveEmotes([]);
        if (panicTimerRef.current) clearInterval(panicTimerRef.current);
        if (roundTimerRef.current) clearInterval(roundTimerRef.current);
        playKOSFX();

        setGameOverData({
          ranking,
          totalRondas: tr || totalRondas,
          historiaRondas: historiaRondas || [],
        });
        setScreen(SCREEN.GAME_OVER);
      },

       onRevanchaIniciada: ({ jugadores, totalRondas: tr, maxJugadores: mj, esPublica: ep }) => {
        setPuntosAcumulados(0);
        setRonda(1);
        setTotalRondas(tr || 5);
        if (mj) setMaxJugadores(mj);
         if (ep !== undefined) setEsPublica(ep);
         setTemporalVisible(true);
        setRoomPlayers(jugadores);
        setRoundResult(null);
        setGameOverData(null);
        setEsDuelo(jugadores.length === 2);
        setScreen(SCREEN.LOBBY);
      },

      onJugadorEmote: ({ id, nombre, color, emote }) => {
        const emoteObj = {
          id: Date.now() + Math.random(),
          nombre,
          color,
          emote,
          x: Math.floor(Math.random() * 60) + 20,
        };

        setActiveEmotes((prev) => [...prev, emoteObj]);
        setTimeout(() => {
          setActiveEmotes((prev) => prev.filter((e) => e.id !== emoteObj.id));
        }, 3000);
      },

      onDueloOponenteDesconectado: ({ nombre }) => {
        setPanicActive(false);
        setActiveEmotes([]);
        if (panicTimerRef.current) clearInterval(panicTimerRef.current);
        if (roundTimerRef.current) clearInterval(roundTimerRef.current);
        setRoundResult(null);
        setGameOverData(null);
        setEsDuelo(false);
        setDuelPlayers([]);
        setYaAdivine(false);
        setGuessCoords(null);
        setCurrentCoord(null);
        setIsMultiplayer(false);
        setRoomCode('');
        setRoomHostId(null);
        localStorage.removeItem('geoguesser_session_token');
        localStorage.removeItem('geoguesser_room_code');
        alert(nombre + ' se ha desconectado. Victoria por abandono.');
        setScreen(SCREEN.MENU);
      },
    });

    return () => {
      cleanup();
      if (temporalTimerRef.current) clearTimeout(temporalTimerRef.current);
      if (panicTimerRef.current) clearInterval(panicTimerRef.current);
      if (roundTimerRef.current) clearInterval(roundTimerRef.current);
    };
  }, [isMultiplayer, roomCode, duracionRondaSec, modoVista, tiempoVista, socket]);

  // ═══════════════════════════════════════
  //  PANORAMA & GUESS CALLBACKS
  // ═══════════════════════════════════════
  const [compassHeading, setCompassHeading] = useState(0);
  const [resetPovSignal, setResetPovSignal] = useState(0);

  const handlePanoramaLoaded = useCallback(() => {
    setIsLoading(false);
    if (isMultiplayer && roomCode) socket.reportarListo(roomCode);
  }, [isMultiplayer, roomCode, socket]);

  const handleResetPov = useCallback(() => {
    setResetPovSignal((s) => s + 1);
  }, []);

  const handleGuessPlaced = useCallback((coords) => {
    warmupAudio();
    setGuessCoords(coords);
  }, []);
  const handleGuessCleared = useCallback(() => setGuessCoords(null), []);

  const handleGuessSubmit = useCallback(() => {
    if (!guessCoords || yaAdivine) return;

    if (isMultiplayer && roomCode) {
      socket.enviarAdivinanza(roomCode, guessCoords.lat, guessCoords.lng);
      setYaAdivine(true);
    } else {
      const latReal = Number(currentCoord.lat);
      const lngReal = Number(currentCoord.lng);
      const dist = haversineDistance(latReal, lngReal, guessCoords.lat, guessCoords.lng);
      const pts = calcularPuntos(dist);
      const nuevoTotal = puntosAcumulados + pts;
      setPuntosAcumulados(nuevoTotal);

      const roundRecord = {
        ronda,
        coordenadaReal: { lat: latReal, lng: lngReal },
        resultados: [{
          id: 'local',
          nombre: username || 'Tú',
          color: { hex: '#c56b49' },
          adivinanza: guessCoords,
          distancia: dist,
          puntosRonda: pts,
          puntosTotal: nuevoTotal,
        }]
      };

      setSingleplayerHistory(prev => [...prev, roundRecord]);

      const eur = ronda >= totalRondas;
      setEsUltimaRonda(eur);

      setRoundResult({
        guessCoords,
        realCoords: { lat: latReal, lng: lngReal },
        distancia: dist,
        puntos: pts,
        puntosAcumulados: nuevoTotal,
        rondaActual: ronda,
        totalRondas,
        esUltimaRonda: eur,
      });
      setScreen(SCREEN.RESULT);
    }
  }, [guessCoords, yaAdivine, isMultiplayer, roomCode, currentCoord, puntosAcumulados, ronda, totalRondas, username, socket]);

  const handleNextRound = useCallback(async () => {
    if (isMultiplayer && roomCode) {
      socket.siguienteRonda(roomCode);
    } else {
      if (isLoading) return;
      if (ronda >= totalRondas) {
        playKOSFX();
        setGameOverData({
          ranking: [{ id: 'local', nombre: username || 'Tú', color: { hex: '#c56b49' }, puntosTotal: puntosAcumulados }],
          totalRondas,
          historiaRondas: singleplayerHistory,
        });
        setScreen(SCREEN.GAME_OVER);
        return;
      }

      setIsLoading(true);
      const nextCoord = await fetchRandomCoord();
      setCurrentCoord(nextCoord);
      setRonda((prev) => prev + 1);
      setRoundResult(null);
      setGuessCoords(null);
      setMapExpanded(false);
      setYaAdivine(false);
      setSoloPovHeading(Math.floor(Math.random() * 360));
      if (guessMapRef.current) guessMapRef.current.clearMarker();
      setScreen(SCREEN.PLAYING);
      setTimeout(() => setIsLoading(false), 400);

      // Imagen rápida: reiniciar el contador de visibilidad en cada ronda.
      setTemporalVisible(true);
      if (temporalTimerRef.current) {
        clearTimeout(temporalTimerRef.current);
        temporalTimerRef.current = null;
      }
      if (modoVista === 'temporal') {
        temporalTimerRef.current = setTimeout(
          () => setTemporalVisible(false),
          tiempoVista * 1000
        );
      }
    }
  }, [isMultiplayer, roomCode, ronda, totalRondas, username, puntosAcumulados, singleplayerHistory, socket, modoVista, tiempoVista]);

  const handleStartSinglePlayer = useCallback(async (config = {}) => {
    if (isLoading) return;
    setIsMultiplayer(false);
    setRonda(1);
    setTotalRondas(config.totalRondas || 5);
    setPuntosAcumulados(0);
    setSingleplayerHistory([]);
    setModoVista(config.modoVista || 'libre');
    setTiempoVista(config.tiempoVista ?? 1);
    setSoloPovHeading(Math.floor(Math.random() * 360));
    setGuessCoords(null);
    setYaAdivine(false);
    setRoundResult(null);
    setIsLoading(true);

    const coord = await fetchRandomCoord();
    setCurrentCoord(coord);
    setScreen(SCREEN.PLAYING);
    setIsLoading(false);

    // Imagen rápida: visible solo durante el tiempo configurado.
    setTemporalVisible(true);
    if (temporalTimerRef.current) {
      clearTimeout(temporalTimerRef.current);
      temporalTimerRef.current = null;
    }
    if ((config.modoVista || 'libre') === 'temporal') {
      temporalTimerRef.current = setTimeout(
        () => setTemporalVisible(false),
        (config.tiempoVista ?? 1) * 1000
      );
    }
  }, [isLoading]);

  const handleRematch = useCallback(async () => {
    if (isMultiplayer && roomCode) {
      await socket.solicitarRevancha(roomCode);
    } else {
      handleStartSinglePlayer();
    }
  }, [isMultiplayer, roomCode, handleStartSinglePlayer, socket]);

  // ═══════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════
  const showMenuBackground = [
    SCREEN.USERNAME,
    SCREEN.MENU,
    SCREEN.SOLO_SETUP,
    SCREEN.CREATE_ROOM,
    SCREEN.JOIN_ROOM,
    SCREEN.LOBBY,
  ].includes(screen);
  const menuBackground = showMenuBackground ? <MenuStreetViewBackground /> : null;

  if (screen === SCREEN.USERNAME) {
    return <>{menuBackground}<UsernameScreen onUsernameSet={handleUsernameSet} /></>;
  }

  if (screen === SCREEN.MENU) {
    return (<>
      {menuBackground}
      <MainMenu
        username={username}
        onCreateRoom={() => { socket.conectar(); setScreen(SCREEN.CREATE_ROOM); }}
        onJoinRoom={() => { socket.conectar(); setScreen(SCREEN.JOIN_ROOM); }}
        onEditUsername={() => setScreen(SCREEN.USERNAME)}
        onSinglePlayer={() => setScreen(SCREEN.SOLO_SETUP)}
      />
    </>);
  }

  if (screen === SCREEN.SOLO_SETUP) {
    return (<>
      {menuBackground}
      <SoloSetup
        onStart={handleStartSinglePlayer}
        onBack={() => setScreen(SCREEN.MENU)}
      />
    </>);
  }

  if (screen === SCREEN.CREATE_ROOM) {
    return (<>
      {menuBackground}
      <CreateRoom
        username={username}
        onRoomCreated={handleRoomCreated}
        onBack={() => setScreen(SCREEN.MENU)}
      />
    </>);
  }

  if (screen === SCREEN.JOIN_ROOM) {
    return (<>
      {menuBackground}
      <JoinRoom
        username={username}
        onRoomJoined={handleRoomJoined}
        onBack={() => setScreen(SCREEN.MENU)}
      />
    </>);
  }

  if (screen === SCREEN.LOBBY) {
    return (<>
      {menuBackground}
      <Lobby
        roomCode={roomCode}
        players={roomPlayers}
        isHost={socket.getSocketId() === roomHostId}
         totalRondas={totalRondas}
        maxJugadores={maxJugadores}
        esPublica={esPublica}
        onStartGame={handleStartGame}
        onLeave={handleLeaveLobby}
      />
    </>);
  }

  if (screen === SCREEN.GAME_OVER && gameOverData) {
    return (
      <GameOverOverlay
        ranking={gameOverData.ranking}
        historiaRondas={gameOverData.historiaRondas}
        totalRondas={gameOverData.totalRondas}
        isMultiplayer={isMultiplayer}
        isHost={socket.getSocketId() === roomHostId}
        onRematch={handleRematch}
        onMainMenu={() => {
          socket.desconectar();
          localStorage.removeItem('geoguessr_session_token');
          localStorage.removeItem('geoguessr_room_code');
          setScreen(SCREEN.MENU);
        }}
      />
    );
  }

  const isHostNow = isMultiplayer ? socket.getSocketId() === roomHostId : true;

  return (
    <div className="app-container">
      <EmoteOverlay activeEmotes={activeEmotes} />

      {esDuelo && screen === SCREEN.PLAYING ? (
        <DuelsHUD players={duelPlayers} />
      ) : (
        <Header
          ronda={ronda}
          puntosAcumulados={puntosAcumulados}
        />
      )}

      {screen === SCREEN.PLAYING && roundTimeLeft > 0 && (
        <div className="round-timer-chip">
          <Clock size={16} color="#fbbf24" />
          <span>Tiempo: <strong>{roundTimeLeft}s</strong></span>
        </div>
      )}

      <CompassBar heading={compassHeading} />

      {showPreparing && isMultiplayer && (
        <div className="preparing-overlay">
          <div className="preparing-card">
            <div className="preparing-spinner" />
            <h2>Preparando Ronda {ronda}</h2>
            <p>Cargando Street View...</p>
            <div className="preparing-progress">
              {loadProgress.listos} / {loadProgress.total} jugadores listos
            </div>
          </div>
        </div>
      )}

      {currentCoord ? (
        <StreetViewContainer
          currentCoord={currentCoord}
          viewMode={modoVista}
          panoHeading={isMultiplayer ? povHeading : soloPovHeading}
          isHidden={modoVista === 'temporal' && !temporalVisible}
          onReady={handlePanoramaLoaded}
          onHeadingChange={setCompassHeading}
          resetSignal={resetPovSignal}
        />
      ) : (
        <div style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: '1.2rem', flexDirection: 'column',
          gap: '16px', padding: '20px', textAlign: 'center'
        }}>
          <p>Cargando ubicación...</p>
        </div>
      )}

      {screen === SCREEN.PLAYING && (
        <>
          <GuessMap
            ref={guessMapRef}
            onGuessPlaced={handleGuessPlaced}
            onGuessCleared={handleGuessCleared}
            isExpanded={mapExpanded}
            onToggleExpand={() => setMapExpanded((prev) => !prev)}
            onHoverChange={setMapHovered}
          />

          <div className={`action-buttons-group ${mapExpanded ? 'map-expanded' : ''} ${mapHovered ? 'map-hovered' : ''}`}>
            {isMultiplayer && <EmotePicker roomCode={roomCode} />}

            <button
              className={`btn-guess ${guessCoords && !yaAdivine ? 'ready' : ''}`}
              disabled={!guessCoords || yaAdivine}
              onClick={handleGuessSubmit}
              title={yaAdivine ? 'Ya enviaste tu adivinanza' : guessCoords ? 'Enviar tu adivinanza' : 'Coloca un pin en el mapa'}
            >
              <Send size={20} />
              <span>{yaAdivine ? '¡Enviado!' : 'Adivinar'}</span>
            </button>
          </div>

          {!isMultiplayer && (
            <FloatingControls
              onNextLocation={handleNextRound}
              onResetPov={handleResetPov}
              isLoading={isLoading}
            />
          )}

          {adivinaronList.length > 0 && !panicActive && (
            <div className="adivinaron-badge">
              {adivinaronList.join(', ')} ya adivinó{adivinaronList.length > 1 ? 'ron' : ''}
            </div>
          )}

          {panicActive && panicSeconds > 0 && !yaAdivine && (
            <PanicTimer secondsLeft={panicSeconds} triggerPlayer={panicTrigger} />
          )}
        </>
      )}

      {screen === SCREEN.RESULT && roundResult && (
        roundResult.esDuelo ? (
          <DuelResultOverlay
            resultados={roundResult.resultados}
            coordenadaReal={roundResult.coordenadaReal}
            rondaActual={roundResult.rondaActual || ronda}
            totalRondas={roundResult.totalRondas || totalRondas}
            esUltimaRonda={esUltimaRonda}
            isHost={isHostNow}
            onNextRound={handleNextRound}
            resDuelo={roundResult.resDuelo}
          />
        ) : (
          <ResultOverlay
            resultados={roundResult.resultados}
            coordenadaReal={roundResult.coordenadaReal}
            rondaActual={roundResult.rondaActual || ronda}
            totalRondas={roundResult.totalRondas || totalRondas}
            esUltimaRonda={esUltimaRonda}
            isHost={isHostNow}
            onNextRound={handleNextRound}
            esDuelo={roundResult.esDuelo}
            resDuelo={roundResult.resDuelo}
            guessCoords={roundResult.guessCoords}
            realCoords={roundResult.realCoords}
            distancia={roundResult.distancia}
            puntos={roundResult.puntos}
            puntosAcumulados={roundResult.puntosAcumulados}
          />
        )
      )}
    </div>
  );
}

export default function App() {
  return <DeviceGate />;
}
