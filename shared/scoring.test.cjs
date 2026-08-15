const assert = require('node:assert');
const { haversineDistance, calcularPuntos } = require('./scoring.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log('\n📐 HaversineDistance');
test('misma coordenada da 0 metros', () => {
  assert.strictEqual(haversineDistance(0, 0, 0, 0), 0);
});

test('distancia aproximada CDMX-Tlaltenango (~550km)', () => {
  const d = haversineDistance(19.4326, -99.1332, 21.782, -103.300);
  assert.ok(d > 500000 && d < 600000, `esperado ~550km, recibido ${d}m`);
});

test('distância NY-LA (~3944km)', () => {
  const d = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
  assert.ok(d > 3900000 && d < 4000000, `esperado ~3944km, recibido ${d}m`);
});

test('simétrica (A→B = B→A)', () => {
  const d1 = haversineDistance(10, -10, -10, 10);
  const d2 = haversineDistance(-10, 10, 10, -10);
  assert.strictEqual(d1, d2);
});

console.log('\n⭐ CalcularPuntos');
test('distancia 0 da 5000 puntos', () => {
  assert.strictEqual(calcularPuntos(0), 5000);
});

test('distancia <= 10 da 5000 puntos', () => {
  assert.strictEqual(calcularPuntos(5), 5000);
  assert.strictEqual(calcularPuntos(10), 5000);
});

test('distancia 5000 da ~1840 puntos (factor exp(-1))', () => {
  const pts = calcularPuntos(5000);
  assert.ok(pts > 1800 && pts < 1900, `esperado ~1840, recibido ${pts}`);
});

test('distancia enorme da 0 puntos', () => {
  assert.strictEqual(calcularPuntos(1_000_000), 0);
});

test('nunca retorna negativo', () => {
  for (let d = 0; d < 100000; d += 1000) {
    const pts = calcularPuntos(d);
    assert.ok(pts >= 0, `negativo en distancia ${d}: ${pts}`);
  }
});

console.log(`\n📊 Resultados: ${passed} pasaron, ${failed} fallaron\n`);
process.exit(failed > 0 ? 1 : 0);
