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
const crypto = require("crypto");


const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
// Clave de firma digital de URL (Google Cloud Console -> Credenciales -> Clave de URL).
// Si se define, el proxy firma cada petición a la Static API (HMAC-SHA1 base64url).
const URL_SIGNING_SECRET = process.env.GOOGLE_MAPS_URL_SIGNING_SECRET || "";
// Token opcional para restringir acceso al proxy. Si se define, el cliente debe
// mandarlo como query param `token=` (StreetViewContainer y MainMenu lo leen de VITE_STREETVIEW_TOKEN).
const STREETVIEW_ACCESS_TOKEN = process.env.STREETVIEW_ACCESS_TOKEN || "";
const STREETVIEW_TIMEOUT_MS = 8000;
const STREETVIEW_MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_PETICIONES_CONCURRENTES = 8;
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
let ultimoErrorTileLog = 0;

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

// ─────────────────────────────────────────────────────────────────────────────
//  Utilidades del proxy Street View
// ─────────────────────────────────────────────────────────────────────────────

// Firma digital de URL para la Static API (HMAC-SHA1 base64url). Se firma la URL
// completa sin la firma; Google la exige para algunos planes. Si no hay secreto
// configurado, se devuelve la URL sin modificar.
function firmarUrl(url) {
  if (!URL_SIGNING_SECRET) return url;
  const clave = Buffer.from(URL_SIGNING_SECRET.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const firma = crypto
    .createHmac("sha1", clave)
    .update(url)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${url}&signature=${firma}`;
}

// Descarga con timeout (AbortSignal.timeout) y tope de tamaño. Limita la memoria
// leyendo la respuesta por tramos y abortando al exceder STREETVIEW_MAX_BYTES.
async function descargarConLimites(url, timeoutMs = STREETVIEW_TIMEOUT_MS, maxBytes = STREETVIEW_MAX_BYTES) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Referer": "https://www.google.com/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!resp.ok) return { error: resp.status };

  const contentLength = Number(resp.headers.get("content-length")) || 0;
  if (contentLength > maxBytes) {
    await resp.body?.cancel();
    return { error: 413 };
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of resp.body) {
    total += chunk.length;
    if (total > maxBytes) {
      await resp.body?.cancel();
      return { error: 413 };
    }
    chunks.push(Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks), contentType: resp.headers.get("content-type") || "image/jpeg" };
}

// Semáforo simple para limitar peticiones concurrentes a Google.
let peticionesActivas = 0;
const colaPeticiones = [];
async function conLimiteConcurrencia(tarea) {
  if (peticionesActivas < MAX_PETICIONES_CONCURRENTES) {
    peticionesActivas++;
    try {
      return await tarea();
    } finally {
      peticionesActivas--;
      despacharCola();
    }
  }
  return new Promise((resolve, reject) => {
    colaPeticiones.push({ tarea, resolve, reject });
  });
}
function despacharCola() {
  while (peticionesActivas < MAX_PETICIONES_CONCURRENTES && colaPeticiones.length > 0) {
    const { tarea, resolve, reject } = colaPeticiones.shift();
    peticionesActivas++;
    tarea().then(resolve, reject).finally(() => {
      peticionesActivas--;
      despacharCola();
    });
  }
}

// Rate limiting en memoria por IP (ventana deslizante).
const rateLimitMap = new Map(); // ip -> { cuenta, resetAt }
function rateLimitMiddleware(limite, ventanaMs) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.socket?.remoteAddress || "unknown";
    const ahora = Date.now();
    const datos = rateLimitMap.get(ip) || { cuenta: 0, resetAt: ahora + ventanaMs };
    if (ahora > datos.resetAt) {
      datos.cuenta = 0;
      datos.resetAt = ahora + ventanaMs;
    }
    datos.cuenta++;
    rateLimitMap.set(ip, datos);
    if (datos.cuenta > limite) {
      return res.status(429).json({ error: "Demasiadas peticiones. Intenta de nuevo en un momento." });
    }
    next();
  };
}
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, datos] of rateLimitMap) {
    if (ahora > datos.resetAt) rateLimitMap.delete(ip);
  }
}, 60 * 1000);

// Valida que la petición al proxy traiga el token de acceso si está configurado.
function middlewareTokenProxy(req, res, next) {
  if (!STREETVIEW_ACCESS_TOKEN) return next();
  if (req.query.token === STREETVIEW_ACCESS_TOKEN) return next();
  return res.status(403).json({ error: "Acceso restringido" });
}

// Cache de panos conocidos como inválidos/caducados (Google puede retirarlos).
const PANOS_CADUCADOS = new Set();
function marcarPanoCaducado(panoId) {
  if (!panoId) return;
  PANOS_CADUCADOS.add(panoId);
  console.warn(`⚠️ Panorama marcado como caducado: ${panoId}`);
}

// Valida que un pano siga existiendo con la Metadata API de Street View.
// No bloquea el juego si la API falla o no hay API key: asume válido.
async function validarPano(panoId) {
  if (PANOS_CADUCADOS.has(panoId)) return false;
  if (!API_KEY) return true;
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?pano=${encodeURIComponent(panoId)}&key=${API_KEY}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return true;
    const data = await resp.json();
    if (data && data.status === "OK") return true;
    marcarPanoCaducado(panoId);
    return false;
  } catch {
    return true; // error de red/API: no castigar al pano
  }
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
  return crypto.randomBytes(32).toString("hex");
}

function asignarColor(sala) {
  const coloresUsados = new Set();
  for (const j of sala.jugadores.values()) coloresUsados.add(j.color.hex);
  const disponible = COLORES_MARCADOR.find((c) => !coloresUsados.has(c.hex));
  return disponible || COLORES_MARCADOR[sala.jugadores.size % COLORES_MARCADOR.length];
}

// Cache de validación: pano_id -> true/false (evita repetir llamadas a la Metadata API).
const cacheValidacion = new Map();

async function seleccionarCoordenada(sala) {
  const candidatas = COORDENADAS.map((c, i) => ({ c, i }))
    .filter(({ c }) => !PANOS_CADUCADOS.has(c.pano_id));
  const pool = candidatas.length > 0 ? candidatas : COORDENADAS.map((c, i) => ({ c, i }));
  if (sala.indicesUsados.size >= pool.length) {
    sala.indicesUsados.clear();
  }

  const desordenado = [...pool].sort(() => Math.random() - 0.5);
  for (let intento = 0; intento < Math.min(desordenado.length, 12); intento++) {
    const { c, i } = desordenado[intento];
    if (sala.indicesUsados.has(i) && intento < desordenado.length - 1) continue;

    let valido = cacheValidacion.get(c.pano_id);
    if (valido === undefined) {
      valido = await validarPano(c.pano_id);
      cacheValidacion.set(c.pano_id, valido);
      if (cacheValidacion.size > 500) cacheValidacion.clear();
    }
    if (valido) {
      sala.indicesUsados.add(i);
      return c;
    }
  }

  // Último recurso: devolver una candidata aunque no esté validada (evita bloquear la partida).
  const fallback = pool[Math.floor(Math.random() * pool.length)];
  sala.indicesUsados.add(fallback.i);
  return fallback.c;
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
  const validas = COORDENADAS.filter((c) => !PANOS_CADUCADOS.has(c.pano_id));
  const pool = validas.length > 0 ? validas : COORDENADAS;
  res.json(pool[Math.floor(Math.random() * pool.length)]);
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
  const validas = COORDENADAS.filter((c) => !PANOS_CADUCADOS.has(c.pano_id));
  const pool = validas.length > 0 ? validas : COORDENADAS;
  if (pool.length === 0) {
    return res.status(404).json({ error: "No hay coordenadas cargadas" });
  }
  const pano_id = pool[Math.floor(Math.random() * pool.length)].pano_id;
  if (!pano_id) {
    return res.status(404).json({ error: "Sin pano_id disponible" });
  }
  res.json({ pano_id });
});

// Proxy de tiles equirectangulares para que el cliente pueda girar un mismo
// panorama localmente sin solicitar una nueva perspectiva en cada frame.
app.get("/streetview-tile",
  middlewareTokenProxy,
  rateLimitMiddleware(180, 10 * 1000),
  async (req, res) => {
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

  const query = `panoid=${encodeURIComponent(pano)}&x=${x}&y=${y}&zoom=${zoom}`;
  const urls = [
    `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=maps_sv.tactile&${query}`,
    `https://geo0.ggpht.com/cbk?cb_client=maps_sv.tactile&authuser=0&hl=en&gl=us&output=tile&${query}`,
    `https://geo1.ggpht.com/cbk?cb_client=maps_sv.tactile&authuser=0&hl=en&gl=us&output=tile&${query}`,
  ];
  try {
    const descargarTile = async () => {
      let lastError = 502;
      for (const url of urls) {
        try {
          const response = await descargarConLimites(url);
          if (response.buffer) return response;
          lastError = response.error || lastError;
        } catch (fetchError) {
          console.warn("⚠️ Fetch de tile falló, reintentando por HTTPS IPv4:", fetchError.message);
        }

        try {
          const fallback = await descargarTileConHttps(url);
          if (fallback.status >= 200 && fallback.status < 300) {
            if (fallback.body.length > STREETVIEW_MAX_BYTES) return { error: 413 };
            return { buffer: fallback.body, contentType: fallback.contentType };
          }
          lastError = fallback.status;
        } catch (fallbackError) {
          console.warn("⚠️ Fallback HTTPS de tile falló:", fallbackError.message);
        }
      }

      return { error: lastError };
    };
    const { buffer, contentType, error } = await conLimiteConcurrencia(descargarTile);
    if (error) {
      if (error === 404 || error === 410) marcarPanoCaducado(pano);
      return res.status(error).json({ error: `Google Street View devolvió ${error}` });
    }
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(buffer);
  } catch (err) {
    console.error("❌ Error al obtener tile de Street View:", err.message);
    res.status(502).json({ error: "Error al obtener tile de Street View" });
  }
});

// Compatibilidad con clientes anteriores.
app.get("/panorama-aleatorio", (req, res) => {
  const validas = COORDENADAS.filter((c) => !PANOS_CADUCADOS.has(c.pano_id));
  const pool = validas.length > 0 ? validas : COORDENADAS;
  res.json({ pano_id: pool[Math.floor(Math.random() * pool.length)].pano_id });
});

// ---------------------------------------------------------------------------
// Proxy de imágenes Street View. El cliente pide la imagen al servidor y el
// servidor la descarga de Google con su API Key (nunca se expone la key al navegador).
// ---------------------------------------------------------------------------
app.get("/streetview",
  middlewareTokenProxy,
  rateLimitMiddleware(120, 10 * 1000),
  async (req, res) => {
  const pano = typeof req.query.pano === "string" ? req.query.pano.trim() : "";
  if (!pano) return res.status(400).json({ error: "Falta pano_id" });
  if (!PANOS_VALIDOS.has(pano)) return res.status(403).json({ error: "pano_id no autorizado" });

  if (!API_KEY) return res.status(500).json({ error: "Servidor sin API Key configurada" });

  const heading = Math.max(0, Math.min(360, Number(req.query.heading) || 0));
  const pitch = Math.max(-90, Math.min(90, Number(req.query.pitch) || 0));
  const fov = Math.max(20, Math.min(120, Number(req.query.fov) || 75));
  const size = `${Math.min(2048, Math.max(320, Number(req.query.w) || 960))}x${Math.min(1152, Math.max(240, Number(req.query.h) || 640))}`;

  const url = firmarUrl(`https://maps.googleapis.com/maps/api/streetview?size=${size}&pano=${encodeURIComponent(pano)}&heading=${heading}&pitch=${pitch}&fov=${fov}&source=outdoor&key=${API_KEY}`);

  try {
    const { buffer, contentType, error } = await conLimiteConcurrencia(() => descargarConLimites(url));
    if (error) {
      if (error === 404 || error === 410) marcarPanoCaducado(pano);
      return res.status(error).json({ error: `Google Street View devolvió ${error}` });
    }
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(buffer);
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
      revanchaSolicitudes: new Set(),
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

    iniciarRonda(sala).catch((err) => console.error("❌ Error al iniciar ronda:", err));
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
      iniciarRonda(sala).catch((err) => console.error("❌ Error al iniciar ronda:", err));
    }
  });

  socket.on("solicitar_revancha", ({ codigo }, callback) => {
    const sala = salas.get(codigo);
    if (!sala) return callback?.({ ok: false, error: "Sala no encontrada." });
    if (sala.estado !== "GAME_OVER") {
      return callback?.({ ok: false, error: "La partida todavía no ha terminado." });
    }

    sala.ultimaActividad = Date.now();
    sala.revanchaSolicitudes.add(socket.id);

    const jugadoresActivos = [...sala.jugadores.entries()]
      .filter(([, jugador]) => !jugador.desconectado);
    const solicitudes = [...sala.revanchaSolicitudes]
      .filter((id) => jugadoresActivos.some(([jugadorId]) => jugadorId === id));
    sala.revanchaSolicitudes = new Set(solicitudes);

    io.to(codigo).emit("revancha_solicitada", {
      solicitantes: solicitudes,
      totalJugadores: jugadoresActivos.length,
    });

    if (jugadoresActivos.length > 0 && solicitudes.length >= jugadoresActivos.length) {
      iniciarRevancha(sala);
      callback?.({ ok: true, iniciada: true });
    } else {
      callback?.({ ok: true, iniciada: false });
    }
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

async function iniciarRonda(sala) {
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

    sala.coordActual = await seleccionarCoordenada(sala);
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

function iniciarRevancha(sala) {
  sala.estado = "LOBBY";
  sala.rondaActual = 0;
  sala.coordActual = null;
  sala.indicesUsados.clear();
  sala.jugadoresListos.clear();
  sala.historiaRondas = [];
  sala.revanchaSolicitudes.clear();
  limpiarTimersRonda(sala);

  for (const j of sala.jugadores.values()) {
    j.puntosTotal = 0;
    j.puntosRonda = 0;
    j.distanciaRonda = 0;
    j.adivinanza = null;
    j.listo = false;
    j.hp = 5000;
  }

  io.to(sala.codigo).emit("revancha_iniciada", {
    jugadores: listaJugadores(sala),
    totalRondas: sala.totalRondas,
    maxJugadores: sala.maxJugadores,
    esPublica: sala.esPublica,
  });
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
