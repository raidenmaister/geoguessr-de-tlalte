export { haversineDistance, calcularPuntos } from '../../shared/scoring.cjs';

export function formatearDistancia(metros) {
  if (metros < 1) return '< 1 m';
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(2)} km`;
}
