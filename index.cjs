const fs = require('fs');
const axios = require('axios');
const turf = require('@turf/turf');
require('dotenv').config();

// -------------------------------------------------------------
// CONFIGURACIÓN
// -------------------------------------------------------------
const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error('❌ No se encontró la API Key de Google Maps. Define GOOGLE_MAPS_API_KEY en el archivo .env');
  process.exit(1);
}
const INPUT_GEOJSON = './export.geojson';
const OUTPUT_JSON = './coordenadas_validas.json';
const TOTAL_PUNTOS_DESEADOS = 600; // Cuántas ubicaciones jugables quieres obtener
// -------------------------------------------------------------

// Cargar el GeoJSON
console.log("Cargando archivo GeoJSON...");
const geojsonData = JSON.parse(fs.readFileSync(INPUT_GEOJSON, 'utf8'));

const coordenadasGuardadas = fs.existsSync(OUTPUT_JSON)
  ? JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf8'))
  : [];

// Filtrar solo los elementos de tipo LineString (calles)
const lineFeatures = geojsonData.features.filter(
  feature => feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString'
);

const ubicacionesValidas = [...coordenadasGuardadas];
const coordenadasValidasSet = new Set(
  coordenadasGuardadas.map(({ lat, lng }) => `${lat},${lng}`)
);
const panoIdsValidos = new Set(
  coordenadasGuardadas
    .filter(({ pano_id }) => pano_id)
    .map(({ pano_id }) => pano_id)
);

function guardarCoordenadasValidas() {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(ubicacionesValidas, null, 2));
}

/**
 * Función que consulta a la API de Metadatos de Street View si existe panorama cercano
 */
async function validarStreetView(lat, lng) {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50&source=outdoor&key=${API_KEY}`;
  
  try {
    const response = await axios.get(url);
    if (response.data.status === 'OK') {
      // Devuelve la coordenada EXACTA de la toma del coche de Street View
      return {
        lat: response.data.location.lat,
        lng: response.data.location.lng,
        pano_id: response.data.pano_id, // Identificador único de la toma
        date: response.data.date
      };
    }
  } catch (error) {
    console.error("Error al consultar la API:", error.message);
  }
  return null;
}

/**
 * Proceso principal
 */
async function procesar() {
  console.log(`Iniciando búsqueda. Objetivo: ${TOTAL_PUNTOS_DESEADOS} puntos válidos...\n`);

  while (ubicacionesValidas.length < TOTAL_PUNTOS_DESEADOS) {
    // 1. Seleccionar una calle al azar del GeoJSON
    const calleAleatoria = lineFeatures[Math.floor(Math.random() * lineFeatures.length)];
    
    // 2. Extraer un punto aleatorio a lo largo de esa calle usando Turf.js
    const largoCalle = turf.length(calleAleatoria, { units: 'kilometers' });
    if (largoCalle === 0) continue;
    
    const distanciaAleatoria = Math.random() * largoCalle;
    const puntoEnCalle = turf.along(calleAleatoria, distanciaAleatoria, { units: 'kilometers' });
    
    const [lng, lat] = puntoEnCalle.geometry.coordinates;
    const coordenadaClave = `${lat},${lng}`;

    if (coordenadasValidasSet.has(coordenadaClave)) {
      continue;
    }

    // 3. Consultar la API de Street View
    const resultado = await validarStreetView(lat, lng);

    if (resultado) {
      // Evitar duplicados revisando si la ID del panorama ya la tenemos
      const yaExiste = panoIdsValidos.has(resultado.pano_id);
      
      if (!yaExiste) {
        ubicacionesValidas.push(resultado);
        panoIdsValidos.add(resultado.pano_id);
        coordenadasValidasSet.add(`${resultado.lat},${resultado.lng}`);
        guardarCoordenadasValidas();
        console.log(`[${ubicacionesValidas.length}/${TOTAL_PUNTOS_DESEADOS}] Encontrado: Lat ${resultado.lat}, Lng ${resultado.lng}`);
      }
    } else {
      process.stdout.write("."); // Un punto por cada descarte en consola
    }
    
    const min = 2000;
    const max = 10000;

    // Pequeña pausa de 50ms para no saturar las peticiones HTTP
    await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
  }

  // 4. Guardar los resultados válidos en un archivo JSON final
  guardarCoordenadasValidas();
  console.log(`\n¡Proceso completado! Se guardaron ${ubicacionesValidas.length} coordenadas en ${OUTPUT_JSON}`);
}

procesar();