# 🌎 GeoGuessr Explorer — Tlaltenango

Juego multijugador inspirado en GeoGuessr ambientado en **Tlaltenango, Zacatecas, México**. Explora panoramas reales de Street View de la región, descubre dónde te encuentras y coloca tu adivinanza en el mapa para sumar puntos.

## ✨ Características

- **Multijugador y solitario** — juega solo o crea/únete a salas con un código de 4 letras.
- **Salas públicas / privadas** — hasta 10 jugadores, rondas configurables, cuenta regresiva de pánico y temporizadores por ronda.
- **Modo duelo** — partidas de 2 jugadores con daño de HP según la diferencia de puntuación y victoria por K.O.
- **Emotes** — reacciones visuales dentro de las partidas multijugador.
- **Modos de visualización en solitario** — exploración libre, imagen estática e imagen rápida, configurables antes de jugar.
- **Reconexión automática** — retoma tu partida tras una desconexión.
- **Fondo de menú en 360°** — panorama giratorio de Street View (renderizado con la API de Google Maps) que cambia de imagen cada 20 s con fundido a negro, y se pausa al ocultar la pestaña.
- **Puntuación justa** — puntos otorgados exponencialmente según la distancia real (Haversine), máximo 5000.
- **Solo escritorio** — los dispositivos móviles se bloquean por diseño.

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Vite, Leaflet, Google Maps JS / Street View API, Socket.io-client |
| Backend | Node.js, Express 5, Socket.io |
| Lógica compartida | Módulo de puntuación CommonJS (`shared/scoring.cjs`) |
| Scripts de datos | Python (`streetview`), Node.js + Turf.js |

## 📁 Estructura del Proyecto

```
├── src/                  # Frontend React
│   ├── components/       # Componentes UI (menú, lobby, juego, HUD, overlays)
│   ├── services/         # Cliente Socket.io y llamadas API
│   ├── utils/            # Puntuación, audio, etc.
│   └── App.jsx           # Máquina de estados y enrutado de pantallas
├── server/
│   ├── server.js         # Servidor multijugador Express + Socket.io
│   └── coordenadas_validas.json  # Ubicaciones jugables de Street View
├── shared/               # Puntuación compartida entre cliente y servidor
├── panos_descargados/    # Panoramas y miniaturas descargados (servidos en /panos)
├── export.geojson        # Red de calles usada para generar ubicaciones
├── index.cjs             # Genera coordenadas válidas desde GeoJSON + API de Street View
└── coordenadas_validas.json
```

## 🚀 Primeros Pasos

### Requisitos previos

- Node.js >= 18
- Una API Key de Google Maps con las APIs **Maps JavaScript** y **Street View Static API** habilitadas (se configura **solo en el servidor**)

### 1. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto (y otro igual en `server/.env`):

```env
# Key usada SOLO por el backend (proxy /streetview y /panorama-fondo).
# El frontend no contiene ninguna API Key (no hay modal ni key en el build).
GOOGLE_MAPS_API_KEY=TU_API_KEY_AQUÍ
VITE_SERVER_URL=http://localhost:3000
```

### 2. Instalar dependencias

```bash
npm install
cd server && npm install
```

### 3. Ejecutar el backend

```bash
cd server
npm start        # o npm run dev (recarga automática)
```

El servidor corre en el puerto `3000` por defecto (se puede cambiar con `PORT`).

### 4. Ejecutar el frontend

```bash
npm run dev
```

Abre la URL que aparece en pantalla (`http://localhost:5173`) para empezar a jugar.

> **Nota:** el servidor mantiene las coordenadas reales del lado del servidor; los clientes solo reciben el `pano_id` hasta que termina la ronda.

## 📦 Build para producción

```bash
npm run build     # genera el contenido en dist/
npm run preview   # previsualiza el build de producción
```

## 🗺️ Generar el conjunto de ubicaciones jugables

El juego necesita un archivo `coordenadas_validas.json` con ubicaciones que tengan cobertura de Street View.

1. Coloca tu red de calles en `export.geojson`.
2. Genera las ubicaciones válidas (hace llamadas a la API, por lo que tomará un tiempo):

   ```bash
   node index.cjs
   ```

   Esto elige puntos aleatorios a lo largo de las calles y los valida contra la API de metadatos de Street View, guardando hasta 600 panoramas únicos en `coordenadas_validas.json`.

3. (Opcional) Descarga panoramas y miniaturas para mosaicos locales y respaldos:

   ```bash
   pip install streetview
   python descargar_panos.py
   ```

## 📡 API del Servidor

| Endpoint | Descripción |
|---|---|
| `GET /` | Health check (estado + salas activas) |
| `GET /health` | Health check de tiempo activo |
| `GET /coordenada-aleatoria` | Ubicación jugable aleatoria |
| `GET /panorama-aleatorio` | `pano_id` aleatorio (legado) |
| `GET /panorama-fondo` | `pano_id` aleatorio para el fondo del menú |
| `GET /mosaic` | 40 miniaturas aleatorias para el mosaico del menú |
| `GET /salas-publicas` | Lista de salas públicas abiertas |
| `GET /panos/*` | Panoramas y miniaturas servidos estáticamente |

Los eventos de Socket.io manejan la creación/uníón de salas, la reconexión, el flujo de rondas, las adivinanzas y los emotes.

## 🧪 Pruebas

El módulo de puntuación compartido tiene pruebas unitarias:

```bash
node shared/scoring.test.cjs
```

## 🚧 Notas

- **Bloqueo de dispositivos:** la app bloquea a propósito los teléfonos/tabletas y muestra un aviso de "solo escritorio".
- **API Key de Google**: se requiere para renderizar Street View; puede guardarse en `localStorage`.
- **Host:** el primer jugador en crear una sala es el anfitrión y controla el inicio / la siguiente ronda.