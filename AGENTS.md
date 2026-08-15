# AGENTS.md

Guía para cualquier agente de IA que trabaje en este proyecto.

## Proyecto

Juego multijugador estilo GeoGuessr ambientado en Tlaltenango, Zacatecas (México).

- **Frontend:** React 19 + Vite (SPA, carpeta `src/`).
- **Backend:** Node.js, Express + Socket.io (`index.cjs`, `server/`).
- **Mapas:** Leaflet + OpenStreetMap; fondo del menú y modo Street View usan Google Maps API.
- **Datos:** coordenadas válidas en `coordenadas_validas.json` (raíz y `server/`).

## Repositorio GitHub

- **URL:** https://github.com/raidenmaister/geoguessr-de-tlalte
- **Usuario:** raidenmaister
- **Rama:** `main`
- **Convención de commits:** escribir los mensajes de commit en **español**.
- Subir/actualizar el repo con `git add . && git commit -m "..." && git push origin main`.

## Despliegue (InfinityFree + FTP)

El sitio de producción se aloja en InfinityFree. Su directorio web es **`htdocs/`**; **nunca** subir archivos a la raíz de la cuenta FTP ni borrar archivos de sistema (`.cpanel/`, `.softaculous/`, `.htaccess`, `.override`, etc.).

### Cómo desplegar

```bash
npm install          # instala dependencias (incluye basic-ftp)
npm run build        # genera dist/ con index.html + assets/
node deploy.mjs      # conecta por FTP y sube dist/ dentro de htdocs/
```

O directamente: `npm run build:deploy`.

El script `deploy.mjs`:
1. Conecta por FTP con las credenciales de `.env.deploy`.
2. Entra en el web root remoto (variable `DEPLOY_DIR`, por defecto `htdocs`).
3. Vacía SOLO el contenido de `htdocs/`.
4. Sube todo `dist/` dentro de `htdocs/`.

### Credenciales FTP

- Las credenciales reales viven en **`.env.deploy`** (archivo local, **gitignored** — no subir al repo).
- Plantilla en `.env.deploy.example` (sí está versionada).
- Variables usadas: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PASS`, `DEPLOY_DIR`.

### Configuración local

- `.env` local (gitignored) define `VITE_SERVER_URL` (apunta al backend) y `GOOGLE_MAPS_API_KEY`.
- `.env.example` es la plantilla versionada (usa `http://localhost:3000` y key placeholder).
- El frontend lee la URL del backend vía `VITE_SERVER_URL` en `src/services/client.js`.

## Notas

- `dist/` es salida de build (no versionada).
- `descargar_panos.py` no se versiona.
- El endpoint `/panorama-fondo` del backend devuelve un `pano_id` aleatorio de Google Maps Street View para el fondo del menú; no requiere la carpeta de panoramas descargados.
