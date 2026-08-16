/**
 * ═══════════════════════════════════════════════════════════════
 *  GeoGuessr Explorer — Cliente Socket.io (Multijugador)
 *  v5 — Soporte resiliente para Nginx / Reverse Proxy / SSL
 * ═══════════════════════════════════════════════════════════════
 */

import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

let socket = null;
let wasConnected = false;
const reconexionListeners = new Set();

export function conectar() {
  if (socket) return socket;

  socket = io(SERVER_URL, {
    transports: ["polling", "websocket"], // Polling primero para asegurar handshake HTTP y auto-upgrading a WSS
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 15000,
  });

  socket.on("connect", () => {
    console.log(`🔌 Conectado al servidor: ${socket.id}`);
    const esReconexion = wasConnected;
    wasConnected = true;
    if (esReconexion) {
      const sessionToken = localStorage.getItem("geoguessr_session_token");
      const codigo = localStorage.getItem("geoguessr_room_code");
      if (sessionToken && codigo) {
        socket.emit("reconectar_sala", { codigo: codigo.toUpperCase(), sessionToken }, (res) => {
          reconexionListeners.forEach((handler) => handler(res));
        });
      }
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Desconectado del servidor: ${reason}`);
  });

  socket.on("connect_error", (err) => {
    console.error(`⚠️ Error de conexión:`, err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function desconectar() {
  if (socket) {
    socket.disconnect();
    socket = null;
    wasConnected = false;
  }
}

export function suscribirReconexion(handler) {
  reconexionListeners.add(handler);
  return () => reconexionListeners.delete(handler);
}

export function crearSala(nombre, totalRondas = 5, duracionPanico = 10, duracionRonda = 0, maxJugadores = 4, esPublica = true, modoVista = 'libre', tiempoVista = 1) {
  return new Promise((resolve) => {
    const s = conectar();
    s.emit("crear_sala", { nombre, totalRondas, duracionPanico, duracionRonda, maxJugadores, esPublica, modoVista, tiempoVista }, (res) => {
      if (res.ok && res.sessionToken) {
        localStorage.setItem("geoguessr_session_token", res.sessionToken);
        localStorage.setItem("geoguessr_room_code", res.codigo);
      }
      resolve(res);
    });
  });
}

export function unirseSala(codigo, nombre) {
  return new Promise((resolve) => {
    const s = conectar();
    s.emit("unirse_sala", { codigo: codigo.toUpperCase(), nombre }, (res) => {
      if (res.ok && res.sessionToken) {
        localStorage.setItem("geoguessr_session_token", res.sessionToken);
        localStorage.setItem("geoguessr_room_code", res.codigo);
      }
      resolve(res);
    });
  });
}

export function reconectarSala(codigo, sessionToken) {
  return new Promise((resolve) => {
    const s = conectar();
    s.emit("reconectar_sala", { codigo: codigo.toUpperCase(), sessionToken }, (res) => {
      resolve(res);
    });
  });
}

export function solicitarRevancha(codigo) {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s) return resolve({ ok: false, error: "No conectado" });
    s.emit("solicitar_revancha", { codigo }, (res) => {
      resolve(res);
    });
  });
}

export function iniciarJuego(codigo) {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s) return resolve({ ok: false, error: "No conectado" });
    s.emit("iniciar_juego", { codigo }, (res) => {
      resolve(res);
    });
  });
}

export function reportarListo(codigo) {
  const s = getSocket();
  if (s) s.emit("jugador_listo", { codigo });
}

export function enviarAdivinanza(codigo, lat, lng) {
  const s = getSocket();
  if (s) s.emit("enviar_adivinanza", { codigo, lat, lng });
}

export function enviarEmote(codigo, emote) {
  const s = getSocket();
  if (s) s.emit("enviar_emote", { codigo, emote });
}

export function siguienteRonda(codigo) {
  const s = getSocket();
  if (s) s.emit("siguiente_ronda", { codigo });
}

export function suscribirEventos(handlers) {
  const s = getSocket();
  if (!s) {
    console.warn("⚠️ Socket no conectado. Llama a conectar() primero.");
    return () => {};
  }

  const eventos = {
    jugador_unido: handlers.onJugadorUnido,
    jugador_salio: handlers.onJugadorSalio,
    preparar_ronda: handlers.onPrepararRonda,
    progreso_carga: handlers.onProgresoCarga,
    iniciar_ronda: handlers.onIniciarRonda,
    jugador_adivino: handlers.onJugadorAdivino,
    cuenta_regresiva_activada: handlers.onCuentaRegresivaActivada,
    resultados_ronda: handlers.onResultadosRonda,
    fin_juego: handlers.onFinJuego,
    revancha_solicitada: handlers.onRevanchaSolicitada,
    revancha_iniciada: handlers.onRevanchaIniciada,
    jugador_emote: handlers.onJugadorEmote,
    duelo_oponente_desconectado: handlers.onDueloOponenteDesconectado,
  };

  for (const [evento, handler] of Object.entries(eventos)) {
    if (handler) s.on(evento, handler);
  }

  return () => {
    for (const [evento, handler] of Object.entries(eventos)) {
      if (handler) s.off(evento, handler);
    }
  };
}

export function esHost(hostId) {
  return socket?.id === hostId;
}

export function getSocketId() {
  return socket?.id || null;
}

export { SERVER_URL };
