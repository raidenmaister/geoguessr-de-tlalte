# 🌎 GeoGuessr Explorer — Tlaltenango

Multiplayer GeoGuessr-style game set in **Tlaltenango, Zacatecas, México**. Explore real Street View panoramas from the region, figure out where you are, and place your guess on the map to score points.

## ✨ Features

- **Singleplayer & Multiplayer** — play solo or create/join rooms with a 4-letter code.
- **Public / Private rooms** — up to 10 players, configurable rounds, panic countdown and round timers.
- **Duel mode** — 2-player matches with HP damage based on scoring difference and K.O. victory.
- **Emotes** — in-game visual reactions during multiplayer rounds.
- **Automatic reconnection** — pick up where you left off after a disconnect.
- **3D photo mosaic menu** — animated, perspective photo-wall background rendered from downloaded Street View thumbnails.
- **Fair scoring** — points awarded exponentially by real distance (Haversine), max 5000.
- **Desktop-first** — mobile devices are blocked by design.

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite, Leaflet, Google Maps JS / Street View API, Socket.io-client |
| Backend | Node.js, Express 5, Socket.io |
| Shared logic | CommonJS scoring module (`shared/scoring.cjs`) |
| Data scripts | Python (`streetview`), Node.js + Turf.js |

## 📁 Project Structure

```
├── src/                  # React frontend
│   ├── components/       # UI components (menu, lobby, game, HUD, overlays)
│   ├── services/         # Socket.io client & API calls
│   ├── utils/            # Scoring, audio, etc.
│   └── App.jsx           # App state machine & screen routing
├── server/
│   ├── server.js         # Express + Socket.io multiplayer server
│   └── coordenadas_validas.json  # Playable Street View locations
├── shared/               # Scoring shared by client & server
├── panos_descargados/    # Downloaded panoramas + thumbnails (served via /panos)
├── export.geojson        # Street network used to generate locations
├── index.cjs             # Generates valid coordinates from GeoJSON + Street View API
├── descargar_panos.py    # Downloads panoramas/thumbnails for the menu mosaic
└── coordenadas_validas.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- A Google Maps API Key with the **Maps JavaScript API** and **Street View** APIs enabled

### 1. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_GOOGLE_MAPS_API_KEY=YOUR_KEY_HERE
VITE_SERVER_URL=http://localhost:3000
```

### 2. Install dependencies

```bash
npm install
cd server && npm install
```

### 3. Run the backend

```bash
cd server
npm start        # or npm run dev (auto-reload)
```

The server runs on port `3000` by default (override with `PORT`).

### 4. Run the frontend

```bash
npm run dev
```

Open the printed URL (`http://localhost:5173`) to start playing.

> **Note:** the multiplayer server keeps real coordinates server-side; clients only receive `pano_id` until a round ends.

## 📦 Building for production

```bash
npm run build     # outputs to dist/
npm run preview   # preview the production build
```

## 🗺️ Generating the playable location pool

The game needs a `coordenadas_validas.json` file with locations that have Street View coverage.

1. Put your street network in `export.geojson`.
2. Generate the valid locations (this makes API calls, so it will take a while):

   ```bash
   node index.cjs
   ```

   This picks random points along streets and validates them against the Street View metadata API, saving up to 600 unique panoramas to `coordenadas_validas.json`.

3. (Optional) Download panoramas & thumbnails for the menu mosaic and local fallbacks:

   ```bash
   pip install streetview
   python descargar_panos.py
   ```

## 📡 Server API

| Endpoint | Description |
|---|---|
| `GET /` | Health check (status + active rooms) |
| `GET /health` | Uptime health check |
| `GET /coordenada-aleatoria` | Random playable location |
| `GET /panorama-aleatorio` | Legacy random `pano_id` |
| `GET /mosaic` | Random 40 thumbnails for the menu mosaic |
| `GET /salas-publicas` | List of open public rooms |
| `GET /panos/*` | Static served panoramas & thumbnails |

Socket.io events handle room creation/joining, reconnection, round flow, guesses and emotes.

## 🧪 Testing

The shared scoring module has unit tests:

```bash
node shared/scoring.test.cjs
```

## 🚧 Notes

- **Device gate:** the app intentionally blocks phones/tablets and shows a "desktop only" notice.
- **Google API Key** is required to render Street View; it can be stored in `localStorage`.
- Host connection: first player to create a room is the host and controls start / next round.