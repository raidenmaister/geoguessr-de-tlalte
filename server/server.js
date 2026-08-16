/**
 * ═══════════════════════════════════════════════════════════════
 *  GeoGuessr Explorer — Servidor Multijugador Optimizado
 *  v5 — Gestión de Salas Públicas vs Privadas con maxJugadores,
 *       anti-orphan timers, emotes y reconexión eficiente.
 * ═══════════════════════════════════════════════════════════════
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });


const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
function resolverDirectorioPanos() {
  const layoutConSubcarpeta = path.join(__dirname, "..", "panos_descargados");
  if (fs.existsSync(layoutConSubcarpeta)) return layoutConSubcarpeta;
  return path.join(__dirname, "panos_descargados");
}

const PANOS_DIR = process.env.PANOS_DIR || resolverDirectorioPanos();
const THUMBS_DIR = path.join(PANOS_DIR, "thumbs");
const TOTAL_RONDAS_DEFAULT = 5;
const COUNTDOWN_SECONDS = 3;
const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const COLORES_MARCADOR = [
  { nombre: "Rojo",     hex: "#ef4444" },
  { nombre: "Azul",     hex: "#3b82f6" },
  { nombre: "Verde",    hex: "#10b981" },
  { nombre: "Amarillo", hex: "#f59e0b" },
  { nombre: "Morado",   hex: "#8b5cf6" },
  { nombre: "Naranja",  hex: "#f97316" },
  { nombre: "Cian",     hex: "#06b6d4" },
  { nombre: "Rosa",     hex: "#ec4899" },
  { nombre: "Lima",     hex: "#84cc16" },
  { nombre: "Índigo",   hex: "#6366f1" },
];

try { fs.mkdirSync(THUMBS_DIR, { recursive: true }); } catch {}

const coordenadasPath = path.join(__dirname, "coordenadas_validas.json");
let COORDENADAS = [];

try {
  const raw = fs.readFileSync(coordenadasPath, "utf-8");
  COORDENADAS = JSON.parse(raw);
  console.log(`✅ Coordenadas cargadas: ${COORDENADAS.length} ubicaciones`);
} catch (err) {
  console.error("❌ Error al cargar coordenadas_validas.json:", err.message);
  process.exit(1);
}

const PANOS_VALIDOS = new Set(COORDENADAS.map((c) => c.pano_id).filter(Boolean));

function descargarTileConHttps(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      family: 4,
      timeout: 15000,
      headers: {
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.google.com/",
        "User-Agent": "Mozilla/5.0",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode || 502,
        contentType: response.headers["content-type"] || "image/jpeg",
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("Timeout al descargar tile")));
    request.on("error", reject);
  });
}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/panos", express.static(PANOS_DIR, { maxAge: "1d" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 20000,
  pingInterval: 10000,
});

const salas = new Map();

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcularPuntos(distanciaMetros, maxDist = 15000) {
  if (distanciaMetros <= 10) return 5000;
  const factor = maxDist / 3;
  return Math.max(0, Math.round(5000 * Math.exp(-distanciaMetros / factor)));
}

function sanitizarNombre(nombre) {
  if (typeof nombre !== "string") return "Jugador";
  const s = nombre.replace(/<[^>]*>?/gm, "").trim();
  if (!s) return "Jugador";
  return s.substring(0, 20);
}

function sanitizarNumero(val, min, max, defaultVal) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return defaultVal;
  return Math.min(Math.max(n, min), max);
}

function generarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo;
  let intentos = 0;
  do {
    codigo = "";
    for (let i = 0; i < 4; i++) {
      codigo += chars[Math.floor(Math.random() * chars.length)];
    }
    intentos++;
    if (intentos > 1000) break;
  } while (salas.has(codigo));
  return codigo;
}

function generarToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function asignarColor(sala) {
  const coloresUsados = new Set();
  for (const j of sala.jugadores.values()) coloresUsados.add(j.color.hex);
  const disponible = COLORES_MARCADOR.find((c) => !coloresUsados.has(c.hex));
  return disponible || COLORES_MARCADOR[sala.jugadores.size % COLORES_MARCADOR.length];
}

function seleccionarCoordenada(sala) {
  if (sala.indicesUsados.size >= COORDENADAS.length) {
    sala.indicesUsados.clear();
  }
  let idx;
  do {
    idx = Math.floor(Math.random() * COORDENADAS.length);
  } while (sala.indicesUsados.has(idx));
  sala.indicesUsados.add(idx);
  return COORDENADAS[idx];
}

// Street View necesita el pano_id en el navegador, pero las coordenadas reales
// permanecen exclusivamente en el servidor hasta que termina la ronda.
function coordenadaParaCliente(coordenada) {
  if (!coordenada || typeof coordenada.pano_id !== "string") return null;
  return { pano_id: coordenada.pano_id };
}

function listaJugadores(sala) {
  const lista = [];
  for (const [id, j] of sala.jugadores) {
    lista.push({
      id,
      nombre: j.nombre,
      color: j.color,
      puntosTotal: j.puntosTotal,
      esHost: id === sala.hostId,
      hp: j.hp,
      desconectado: j.desconectado || false,
    });
  }
  return lista;
}

function getPublicRoomsData() {
  const publicRooms = [];
  for (const sala of salas.values()) {
    if (sala.esPublica && sala.estado === "LOBBY" && sala.jugadores.size < sala.maxJugadores) {
      const host = sala.jugadores.get(sala.hostId);
      const hostName = host ? host.nombre : "Desconocido";
      publicRooms.push({
        codigo: sala.codigo,
        jugadores: sala.jugadores.size,
        jugadoresCount: sala.jugadores.size,
        maxJugadores: sala.maxJugadores,
        host: hostName,
        hostNombre: hostName,
        totalRondas: sala.totalRondas,
      });
    }
  }
  return publicRooms;
}

app.get("/", (req, res) => {
  res.json({ status: "ok", salas_activas: salas.size });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/coordenada-aleatoria", (req, res) => {
  const idx = Math.floor(Math.random() * COORDENADAS.length);
  res.json(COORDENADAS[idx]);
});

// El menú recibe un paquete pequeño de miniaturas locales para construir su mosaico.
app.get("/mosaic", (req, res) => {
  let fotos = [];
  try {
    fotos = fs.readdirSync(THUMBS_DIR)
      .filter((filename) => /\.(jpe?g|png|webp)$/i.test(filename))
      .sort(() => Math.random() - 0.5)
      .slice(0, 40)
      .map((filename) => `/panos/thumbs/${encodeURIComponent(filename)}`);
  } catch (err) {
    console.error("❌ Error al cargar miniaturas del mosaico:", err.message);
  }
  res.json({ photos: fotos });
});

// El menú recibe un pano_id al azar; el cliente lo renderiza con la Street View API de Google Maps.
app.get("/panorama-fondo", (req, res) => {
  if (COORDENADAS.length === 0) {
    return res.status(404).json({ error: "No hay coordenadas cargadas" });
  }
  const pano_id = COORDENADAS[Math.floor(Math.random() * COORDENADAS.length)].pano_id;
  if (!pano_id) {
    return res.status(404).json({ error: "Sin pano_id disponible" });
  }
  res.json({ pano_id });
});

// Proxy de tiles equirectangulares para que el cliente pueda girar un mismo
// panorama localmente sin solicitar una nueva perspectiva en cada frame.
app.get("/streetview-tile", async (req, res) => {
  const pano = typeof req.query.pano === "string" ? req.query.pano.trim() : "";
  const zoom = Number(req.query.zoom);
  const x = Number(req.query.x);
  const y = Number(req.query.y);
  const columns = 2 ** zoom;
  const rows = 2 ** Math.max(zoom - 1, 0);

  if (!pano || !PANOS_VALIDOS.has(pano)) {
    return res.status(403).json({ error: "pano_id no autorizado" });
  }
  if (!Number.isInteger(zoom) || zoom < 1 || zoom > 4 || !Number.isInteger(x) || !Number.isInteger(y)
    || x < 0 || x >= columns || y < 0 || y >= rows) {
    return res.status(400).json({ error: "Tile fuera de rango" });
  }

  const url = `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&panoid=${encodeURIComponent(pano)}&x=${x}&y=${y}&zoom=${zoom}`;
  try {
    let status;
    let contentType;
    let buf;
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://www.google.com/",
          "User-Agent": "Mozilla/5.0",
        },
      });
      status = response.status;
      contentType = response.headers.get("content-type") || "image/jpeg";
      buf = Buffer.from(await response.arrayBuffer());
    } catch (fetchError) {
      console.warn("⚠️ Fetch de tile falló, reintentando por HTTPS IPv4:", fetchError.message);
      const fallback = await descargarTileConHttps(url);
      status = fallback.status;
      contentType = fallback.contentType;
      buf = fallback.body;
    }
    if (status < 200 || status >= 300) return res.status(status).json({ error: `Google Street View devolvió ${status}` });
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(buf);
  } catch (err) {
    console.error("❌ Error al obtener tile de Street View:", err.message);
    res.status(502).json({ error: "Error al obtener tile de Street View" });
  }
});

// Compatibilidad con clientes anteriores.
app.get("/panorama-aleatorio", (req, res) => {
  const idx = Math.floor(Math.random() * COORDENADAS.length);
  res.json({ pano_id: COORDENADAS[idx].pano_id });
});

// ---------------------------------------------------------------------------
// Proxy de imágenes Street View. El cliente pide la imagen al servidor y el
// servidor la descarga de Google con su API Key (nunca se expone la key al navegador).
// ---------------------------------------------------------------------------
app.get("/streetview", async (req, res) => {
  const pano = typeof req.query.pano === "string" ? req.query.pano.trim() : "";
  if (!pano) return res.status(400).json({ error: "Falta pano_id" });
  if (!PANOS_VALIDOS.has(pano)) return res.status(403).json({ error: "pano_id no autorizado" });

  if (!API_KEY) return res.status(500).json({ error: "Servidor sin API Key configurada" });

  const heading = Math.max(0, Math.min(360, Number(req.query.heading) || 0));
  const pitch = Math.max(-90, Math.min(90, Number(req.query.pitch) || 0));
  const fov = Math.max(20, Math.min(120, Number(req.query.fov) || 75));
  const size = `${Math.min(2048, Math.max(320, Number(req.query.w) || 960))}x${Math.min(1152, Math.max(240, Number(req.query.h) || 640))}`;

  const url = `https://maps.googleapis.com/maps/api/streetview?size=${size}&pano=${encodeURIComponent(pano)}&heading=${heading}&pitch=${pitch}&fov=${fov}&source=outdoor&key=${API_KEY}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Google Street View devolvió ${resp.status}` });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    res.set("Content-Type", resp.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(buf);
  } catch (err) {
    console.error("❌ Error al obtener Street View:", err.message);
    res.status(502).json({ error: "Error al obtener Street View" });
  }
});

app.get("/salas-publicas", (req, res) => {
  res.json(getPublicRoomsData());
});

setInterval(() => {
  const ahora = Date.now();
  for (const [codigo, sala] of salas) {
    if (sala.jugadores.size === 0 || (ahora - sala.ultimaActividad > ROOM_IDLE_TIMEOUT_MS)) {
      limpiarTimersRonda(sala);
      salas.delete(codigo);
      console.log(`🗑️ Limpieza RAM: Sala ${codigo} eliminada por inactividad.`);
    }
  }
}, 5 * 60 * 1000);

io.on("connection", (socket) => {
  socket.on("listar_salas_publicas", (callback) => {
    if (typeof callback === "function") callback(getPublicRoomsData());
  });

  socket.on("crear_sala", ({ nombre, totalRondas, duracionPanico, duracionRonda, maxJugadores, esPublica, modoVista, tiempoVista }, callback) => {
    const nombreSanitizado = sanitizarNombre(nombre);
    const rondasSanitizadas = Number(totalRondas) === 0 && Number(maxJugadores) === 2
      ? 0
      : sanitizarNumero(totalRondas, 3, 20, 5);
    const panicoSanitizado = sanitizarNumero(duracionPanico, 5, 60, 10);
    const duracionRondaSanitizada = sanitizarNumero(duracionRonda, 0, 120, 0);
    const maxJugadoresSanitizado = sanitizarNumero(maxJugadores, 2, 10, 4);
    const modoVistaSanitizado = maxJugadoresSanitizado === 2 && ["libre", "estatico", "temporal"].includes(modoVista) ? modoVista : "libre";
    const tiempoVistaSanitizado = [0.5, 1, 3, 5].includes(Number(tiempoVista)) ? Number(tiempoVista) : 1;

    const codigo = generarCodigo();
    const sessionToken = generarToken();

    const sala = {
      codigo,
      estado: "LOBBY",
      hostId: socket.id,
      jugadores: new Map(),
      rondaActual: 0,
      totalRondas: rondasSanitizadas,
      duracionPanico: panicoSanitizado,
      duracionRonda: duracionRondaSanitizada,
      maxJugadores: maxJugadoresSanitizado,
      esPublica: Boolean(esPublica),
      modoVista: modoVistaSanitizado,
      tiempoVista: tiempoVistaSanitizado,
      coordActual: null,
      povHeading: 0,
      indicesUsados: new Set(),
      jugadoresListos: new Set(),
      timerRonda: null,
      roundDurationTimer: null,
      panicTimerActivo: false,
      panicTimerId: null,
      esDuelo: false,
      historiaRondas: [],
      ultimaActividad: Date.now(),
    };

    const color = asignarColor(sala);
    sala.jugadores.set(socket.id, {
      nombre: nombreSanitizado,
      color,
      sessionToken,
      listo: false,
      adivinanza: null,
      puntosRonda: 0,
      puntosTotal: 0,
      distanciaRonda: 0,
      hp: 5000,
      desconectado: false,
    });

    salas.set(codigo, sala);
    socket.join(codigo);

    if (typeof callback === "function") {
      callback({
        ok: true,
        codigo,
        color,
        jugadores: listaJugadores(sala),
        totalRondas: sala.totalRondas,
        maxJugadores: sala.maxJugadores,
        esPublica: sala.esPublica,
        modoVista: sala.modoVista,
        tiempoVista: sala.tiempoVista,
        sessionToken,
        hostId: socket.id,
      });
    }
  });

  socket.on("unirse_sala", ({ codigo, nombre }, callback) => {
    const salaCode = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
    const sala = salas.get(salaCode);

    if (!sala) {
      return callback?.({ ok: false, error: "Sala no encontrada." });
    }
    if (sala.estado !== "LOBBY") {
      return callback?.({ ok: false, error: "La partida ya comenzó." });
    }
    if (sala.jugadores.size >= sala.maxJugadores) {
      return callback?.({ ok: false, error: "La sala está llena." });
    }

    sala.ultimaActividad = Date.now();
    const nombreSanitizado = sanitizarNombre(nombre);
    const sessionToken = generarToken();
    const color = asignarColor(sala);

    sala.jugadores.set(socket.id, {
      nombre: nombreSanitizado,
      color,
      sessionToken,
      listo: false,
      adivinanza: null,
      puntosRonda: 0,
      puntosTotal: 0,
      distanciaRonda: 0,
      hp: 5000,
      desconectado: false,
    });

    socket.join(salaCode);

    io.to(salaCode).emit("jugador_unido", {
      jugadores: listaJugadores(sala),
      nuevoJugador: { id: socket.id, nombre: nombreSanitizado, color },
      esPublica: sala.esPublica,
      maxJugadores: sala.maxJugadores,
    });

    if (typeof callback === "function") {
      callback({
        ok: true,
        codigo: salaCode,
        color,
        jugadores: listaJugadores(sala),
        totalRondas: sala.totalRondas,
        maxJugadores: sala.maxJugadores,
        esPublica: sala.esPublica,
        modoVista: sala.modoVista,
        tiempoVista: sala.tiempoVista,
        hostId: sala.hostId,
        sessionToken,
      });
    }
  });

  socket.on("reconectar_sala", ({ codigo, sessionToken }, callback) => {
    const salaCode = typeof codigo === "string" ? codigo.trim().toUpperCase() : "";
    const sala = salas.get(salaCode);

    if (!sala || !sessionToken) {
      return callback?.({ ok: false, error: "No se encontró la sala o sesión inválida." });
    }

    let foundPlayerId = null;
    let foundPlayerObj = null;

    for (const [pId, pObj] of sala.jugadores) {
      if (pObj.sessionToken === sessionToken) {
        foundPlayerId = pId;
        foundPlayerObj = pObj;
      }
    }

    if (!foundPlayerObj) {
      return callback?.({ ok: false, error: "Sesión no encontrada en esta sala." });
    }

    sala.ultimaActividad = Date.now();
    sala.jugadores.delete(foundPlayerId);
    foundPlayerObj.desconectado = false;

    if (foundPlayerObj.timerDesconexion) {
      clearTimeout(foundPlayerObj.timerDesconexion);
      foundPlayerObj.timerDesconexion = null;
    }

    if (sala.hostId === foundPlayerId) {
      sala.hostId = socket.id;
    }

    sala.jugadores.set(socket.id, foundPlayerObj);
    sala.jugadoresListos.delete(foundPlayerId);
    sala.jugadoresListos.add(socket.id);
    socket.join(salaCode);

    io.to(salaCode).emit("jugador_unido", {
      jugadores: listaJugadores(sala),
      nuevoJugador: { id: socket.id, nombre: foundPlayerObj.nombre, color: foundPlayerObj.color },
      esPublica: sala.esPublica,
      maxJugadores: sala.maxJugadores,
    });

    callback?.({
      ok: true,
      codigo: salaCode,
      estado: sala.estado,
      rondaActual: sala.rondaActual,
      totalRondas: sala.totalRondas,
      maxJugadores: sala.maxJugadores,
      esPublica: sala.esPublica,
      color: foundPlayerObj.color,
      jugadores: listaJugadores(sala),
      esHost: socket.id === sala.hostId,
      hostId: sala.hostId,
      coordActual: coordenadaParaCliente(sala.coordActual),
      esDuelo: sala.esDuelo,
      modoVista: sala.modoVista,
      tiempoVista: sala.tiempoVista,
      povHeading: sala.povHeading,
      puntosActuales: foundPlayerObj.puntosTotal,
    });
  });

  socket.on("iniciar_juego", ({ codigo }, callback) => {
    const sala = salas.get(codigo);
    if (!sala) return callback?.({ ok: false, error: "Sala no encontrada." });
    if (socket.id !== sala.hostId) return callback?.({ ok: false, error: "Solo el host puede iniciar." });
    if (sala.estado !== "LOBBY") return callback?.({ ok: false, error: "El juego ya está en curso." });
    if (sala.jugadores.size < 2) return callback?.({ ok: false, error: "Se necesitan al menos 2 jugadores para iniciar." });

    sala.ultimaActividad = Date.now();
    sala.esDuelo = sala.jugadores.size === 2;
    for (const j of sala.jugadores.values()) j.hp = 5000;
    sala.historiaRondas = [];

    iniciarRonda(sala);
    callback?.({ ok: true });
  });

  socket.on("jugador_listo", ({ codigo }) => {
    const sala = salas.get(codigo);
    if (!sala || sala.estado !== "JUGANDO") return;

    sala.jugadoresListos.add(socket.id);

    io.to(codigo).emit("progreso_carga", {
      listos: sala.jugadoresListos.size,
      total: sala.jugadores.size,
    });

    if (sala.jugadoresListos.size >= sala.jugadores.size) {
      iniciarCuentaRegresiva(sala);
    }
  });

  socket.on("enviar_adivinanza", ({ codigo, lat, lng }) => {
    const sala = salas.get(codigo);
    if (!sala || sala.estado !== "JUGANDO") return;

    const jugador = sala.jugadores.get(socket.id);
    if (!jugador || jugador.adivinanza) return;

    const numLat = Number(lat);
    const numLng = Number(lng);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) return;
    if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) return;

    sala.ultimaActividad = Date.now();
    jugador.adivinanza = { lat: numLat, lng: numLng };

    const distancia = haversineDistance(
      Number(sala.coordActual.lat),
      Number(sala.coordActual.lng),
      numLat,
      numLng
    );
    jugador.distanciaRonda = distancia;
    jugador.puntosRonda = calcularPuntos(distancia);
    jugador.puntosTotal += jugador.puntosRonda;

    io.to(codigo).emit("jugador_adivino", { id: socket.id, nombre: jugador.nombre });

    let todosAdivinaron = true;
    for (const j of sala.jugadores.values()) {
      if (!j.adivinanza) { todosAdivinaron = false; break; }
    }

    if (todosAdivinaron) {
      limpiarTimersRonda(sala);
      mostrarResultados(sala);
    } else if (!sala.panicTimerActivo) {
      sala.panicTimerActivo = true;
      io.to(codigo).emit("cuenta_regresiva_activada", {
        segundosRestantes: sala.duracionPanico,
        primerJugador: jugador.nombre,
      });

      const currentRoundId = sala.rondaActual;
      sala.panicTimerId = setTimeout(() => {
        if (!salas.has(codigo) || sala.estado !== "JUGANDO" || sala.rondaActual !== currentRoundId) return;

        for (const j of sala.jugadores.values()) {
          if (!j.adivinanza) {
            j.adivinanza = null;
            j.distanciaRonda = Infinity;
            j.puntosRonda = 0;
          }
        }
        sala.panicTimerActivo = false;
        sala.panicTimerId = null;
        mostrarResultados(sala);
      }, sala.duracionPanico * 1000);
    }
  });

  socket.on("enviar_emote", ({ codigo, emote }) => {
    const sala = salas.get(codigo);
    if (!sala) return;

    const jugador = sala.jugadores.get(socket.id);
    if (!jugador) return;

    io.to(codigo).emit("jugador_emote", {
      id: socket.id,
      nombre: jugador.nombre,
      color: jugador.color,
      emote,
    });
  });

  socket.on("siguiente_ronda", ({ codigo }) => {
    const sala = salas.get(codigo);
    if (!sala || socket.id !== sala.hostId) return;
    if (sala.estado !== "RESULTADOS") return;

    if (sala.totalRondas > 0 && sala.rondaActual >= sala.totalRondas) {
      finalizarJuego(sala);
    } else {
      iniciarRonda(sala);
    }
  });

  socket.on("solicitar_revancha", ({ codigo }, callback) => {
    const sala = salas.get(codigo);
    if (!sala) return callback?.({ ok: false, error: "Sala no encontrada." });

    sala.estado = "LOBBY";
    sala.rondaActual = 0;
    sala.coordActual = null;
    sala.indicesUsados.clear();
    sala.jugadoresListos.clear();
    sala.historiaRondas = [];
    sala.ultimaActividad = Date.now();
    limpiarTimersRonda(sala);

    for (const j of sala.jugadores.values()) {
      j.puntosTotal = 0;
      j.puntosRonda = 0;
      j.distanciaRonda = 0;
      j.adivinanza = null;
      j.listo = false;
      j.hp = 5000;
    }

    io.to(codigo).emit("revancha_iniciada", {
      jugadores: listaJugadores(sala),
      totalRondas: sala.totalRondas,
      maxJugadores: sala.maxJugadores,
      esPublica: sala.esPublica,
    });

    callback?.({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const [codigo, sala] of salas) {
      if (!sala.jugadores.has(socket.id)) continue;

      const jugador = sala.jugadores.get(socket.id);
      jugador.desconectado = true;

      const timeoutMs = sala.esDuelo ? 30000 : 45000;

      jugador.timerDesconexion = setTimeout(() => {
        sala.jugadores.delete(socket.id);
        sala.jugadoresListos.delete(socket.id);

        if (sala.jugadores.size === 0) {
          limpiarTimersRonda(sala);
          salas.delete(codigo);
          return;
        }

        if (sala.esDuelo) {
          io.to(codigo).emit("duelo_oponente_desconectado", {
            nombre: jugador.nombre,
            mensaje: jugador.nombre + " se ha desconectado. Victoria por abandono."
          });
          setTimeout(() => {
            limpiarTimersRonda(sala);
            salas.delete(codigo);
          }, 500);
          return;
        }

        if (socket.id === sala.hostId) {
          const nuevoHostId = sala.jugadores.keys().next().value;
          sala.hostId = nuevoHostId;
        }

        io.to(codigo).emit("jugador_salio", {
          id: socket.id,
          nombre: jugador.nombre,
          jugadores: listaJugadores(sala),
          nuevoHostId: sala.hostId,
        });

        if (sala.estado === "JUGANDO" && sala.jugadoresListos.size >= sala.jugadores.size) {
          iniciarCuentaRegresiva(sala);
        }
      }, timeoutMs);

      io.to(codigo).emit("jugador_salio", {
        id: socket.id,
        nombre: jugador.nombre,
        jugadores: listaJugadores(sala),
        nuevoHostId: sala.hostId,
      });
    }
  });
});

function limpiarTimersRonda(sala) {
  if (sala.timerRonda) { clearTimeout(sala.timerRonda); sala.timerRonda = null; }
  if (sala.roundDurationTimer) { clearTimeout(sala.roundDurationTimer); sala.roundDurationTimer = null; }
  if (sala.panicTimerId) { clearTimeout(sala.panicTimerId); sala.panicTimerId = null; sala.panicTimerActivo = false; }
}

function iniciarRonda(sala) {
  sala.rondaActual++;
  sala.estado = "JUGANDO";
  sala.jugadoresListos.clear();
  limpiarTimersRonda(sala);

  for (const j of sala.jugadores.values()) {
    j.adivinanza = null;
    j.puntosRonda = 0;
    j.distanciaRonda = 0;
    j.listo = false;
  }

    sala.coordActual = seleccionarCoordenada(sala);
    sala.povHeading = Math.floor(Math.random() * 360);
  const currentRoundId = sala.rondaActual;

  io.to(sala.codigo).emit("preparar_ronda", {
    ronda: sala.rondaActual,
    totalRondas: sala.totalRondas,
    duracionRonda: sala.duracionRonda,
    modoVista: sala.modoVista,
    tiempoVista: sala.tiempoVista,
    povHeading: sala.povHeading,
    coordenada: coordenadaParaCliente(sala.coordActual),
    esDuelo: sala.esDuelo,
    jugadores: listaJugadores(sala),
  });

  sala.timerRonda = setTimeout(() => {
    if (!salas.has(sala.codigo) || sala.estado !== "JUGANDO" || sala.rondaActual !== currentRoundId) return;
    if (sala.jugadoresListos.size < sala.jugadores.size) {
      iniciarCuentaRegresiva(sala);
    }
  }, 15000);
}

function iniciarCuentaRegresiva(sala) {
  if (sala.timerRonda) { clearTimeout(sala.timerRonda); sala.timerRonda = null; }

  const timestampInicio = Date.now() + (COUNTDOWN_SECONDS * 1000);
  const currentRoundId = sala.rondaActual;
  const codigo = sala.codigo;

  io.to(codigo).emit("iniciar_ronda", {
    ronda: sala.rondaActual,
    totalRondas: sala.totalRondas,
    duracionRonda: sala.duracionRonda,
    timestampInicio,
    countdown: COUNTDOWN_SECONDS,
  });

  if (sala.duracionRonda > 0) {
    const totalTimeMs = (COUNTDOWN_SECONDS + sala.duracionRonda) * 1000;
    sala.roundDurationTimer = setTimeout(() => {
      if (!salas.has(codigo) || sala.estado !== "JUGANDO" || sala.rondaActual !== currentRoundId) return;

      for (const j of sala.jugadores.values()) {
        if (!j.adivinanza) {
          j.adivinanza = null;
          j.distanciaRonda = Infinity;
          j.puntosRonda = 0;
        }
      }
      mostrarResultados(sala);
    }, totalTimeMs);
  } else {
    sala.timerRonda = setTimeout(() => {
      if (!salas.has(codigo) || sala.estado !== "JUGANDO" || sala.rondaActual !== currentRoundId) return;

      for (const j of sala.jugadores.values()) {
        if (!j.adivinanza) {
          j.adivinanza = null;
          j.distanciaRonda = Infinity;
          j.puntosRonda = 0;
        }
      }
      mostrarResultados(sala);
    }, (COUNTDOWN_SECONDS + 120) * 1000);
  }
}

function mostrarResultados(sala) {
  sala.estado = "RESULTADOS";
  limpiarTimersRonda(sala);

  let multiplicador = 1.0;
  let resDuelo = null;
  if (sala.esDuelo) {
    if (sala.rondaActual === 5) {
      multiplicador = 1.5;
    } else if (sala.rondaActual >= 6) {
      multiplicador = 2.0 + (sala.rondaActual - 6) * 0.5;
    }

    const jugArray = Array.from(sala.jugadores.entries());
    if (jugArray.length >= 2) {
      const [id1, j1] = jugArray[0];
      const [id2, j2] = jugArray[1];
      const diff = Math.abs(j1.puntosRonda - j2.puntosRonda);
      const damage = Math.round(diff * multiplicador / 5);

      let perdedorId = null;
      let ganadorId = null;

      if (j1.puntosRonda > j2.puntosRonda) {
        j2.hp = Math.max(0, j2.hp - damage);
        perdedorId = id2;
        ganadorId = id1;
      } else if (j2.puntosRonda > j1.puntosRonda) {
        j1.hp = Math.max(0, j1.hp - damage);
        perdedorId = id1;
        ganadorId = id2;
      }

      resDuelo = { multiplicador, damage, perdedorId, ganadorId };
    }
  }

  const resultados = [];
  let muertos = 0;
  for (const [id, j] of sala.jugadores) {
    if (j.hp <= 0) muertos++;
    resultados.push({
      id,
      nombre: j.nombre,
      color: j.color,
      adivinanza: j.adivinanza,
      distancia: j.distanciaRonda,
      puntosRonda: j.puntosRonda,
      puntosTotal: j.puntosTotal,
      hp: j.hp,
    });
  }

  resultados.sort((a, b) => b.puntosRonda - a.puntosRonda);

  sala.historiaRondas.push({
    ronda: sala.rondaActual,
    coordenadaReal: sala.coordActual,
    resultados,
  });

  const esVictoriaPorKO = sala.esDuelo && muertos > 0;
  const esUltimaRonda = esVictoriaPorKO || (sala.totalRondas > 0 && sala.rondaActual >= sala.totalRondas);

  io.to(sala.codigo).emit("resultados_ronda", {
    ronda: sala.rondaActual,
    totalRondas: sala.totalRondas,
    coordenadaReal: sala.coordActual,
    resultados,
    esUltimaRonda,
    esDuelo: sala.esDuelo,
    resDuelo,
  });
}

function finalizarJuego(sala) {
  const ranking = [];
  for (const [id, j] of sala.jugadores) {
    ranking.push({
      id,
      nombre: j.nombre,
      color: j.color,
      puntosTotal: j.puntosTotal,
    });
  }

  ranking.sort((a, b) => b.puntosTotal - a.puntosTotal);

  io.to(sala.codigo).emit("fin_juego", {
    ranking,
    totalRondas: sala.totalRondas,
    historiaRondas: sala.historiaRondas,
  });

  sala.estado = "GAME_OVER";
  limpiarTimersRonda(sala);
}

server.listen(PORT, () => {
  console.log(`
  ═══════════════════════════════════════════════════
   🌎 GeoGuessr Explorer — Servidor Multijugador v5
   🚀 Puerto: ${PORT}
   📍 Coordenadas: ${COORDENADAS.length} ubicaciones
  ═══════════════════════════════════════════════════
  `);
});
