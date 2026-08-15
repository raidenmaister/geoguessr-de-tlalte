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

module.exports = { haversineDistance, calcularPuntos };
