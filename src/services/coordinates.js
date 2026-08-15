import { SERVER_URL } from './client';

const FALLBACK_COORD = { lat: 21.782, lng: -103.300 };

export async function fetchRandomCoord() {
  try {
    const res = await fetch(`${SERVER_URL}/coordenada-aleatoria`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Fallback a coordenada por defecto', e);
  }
  return FALLBACK_COORD;
}
