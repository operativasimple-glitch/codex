/**
 * Pruebas del veredicto de test de producto.
 *   node test/verdict.test.js
 */
import assert from 'node:assert/strict';
import { verdict, testPower, diagnose, VERDICT } from '../src/lib/verdict.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
};

const PRICE = 34;
const ECON = {
  variableCostRate: 0.04, refundRate: 0.06, breakevenRoas: 1.11,
  targetRoas: 2.2, killRoas: 1.2, learningDays: 3,
};

// killThreshold = 3*34/1.11 ≈ 91,9   ·   winThreshold = 8*34/2.2 ≈ 123,6
const test = (o = {}) => ({
  startedAt: '2026-09-01T00:00:00.000Z', days: 7, budgetCap: 150,
  iteration: 1, maxIterations: 2, ...o,
});
const DAY = (n) => new Date(Date.parse('2026-09-01T00:00:00.000Z') + n * 86400_000);
const stats = (o = {}) => ({ spend: 0, revenue: 0, orders: 0, clicks: 0, impressions: 0, ...o });

console.log('\ntestPower()');

t('calcula los dos umbrales del test', () => {
  const p = testPower({ budgetCap: 150 }, ECON, PRICE);
  assert.ok(Math.abs(p.killThreshold - 91.89) < 0.5, `killThreshold=${p.killThreshold}`);
  assert.ok(Math.abs(p.winThreshold - 123.64) < 0.5, `winThreshold=${p.winThreshold}`);
  assert.equal(p.canKill, true);
  assert.equal(p.canConfirmWin, true);
});

t('avisa de que un tope pequeno puede matar pero no coronar', () => {
  const p = testPower({ budgetCap: 100 }, ECON, PRICE);
  assert.equal(p.canKill, true, '100 € pasa el umbral de descarte (92 €)');
  assert.equal(p.canConfirmWin, false, '100 € no llega al umbral de ganador (124 €)');
});

t('un tope demasiado bajo no concluye nada', () => {
  const p = testPower({ budgetCap: 50 }, ECON, PRICE);
  assert.equal(p.canKill, false);
  assert.equal(p.canConfirmWin, false);
});

console.log('\nverdict() · test en marcha');

t('sigue corriendo a mitad de ventana sin datos alarmantes', () => {
  const v = verdict(stats({ spend: 60, revenue: 68, orders: 2, clicks: 120, impressions: 9000 }),
    ECON, test(), PRICE, DAY(3));
  assert.equal(v.verdict, VERDICT.RUNNING);
  assert.equal(v.budgetLeft, 90);
});

t('avisa de no tocar nada durante el aprendizaje', () => {
  const v = verdict(stats({ spend: 40, revenue: 34, orders: 1, clicks: 80, impressions: 6000 }),
    ECON, test(), PRICE, DAY(2));
  assert.equal(v.verdict, VERDICT.RUNNING);
  assert.match(v.next, /aprendizaje/);
});

console.log('\nverdict() · muerte temprana');

t('mata antes de acabar la semana si gasta el umbral sin una sola venta', () => {
  const v = verdict(stats({ spend: 95, revenue: 0, orders: 0, clicks: 190, impressions: 14000 }),
    ECON, test(), PRICE, DAY(3));
  assert.equal(v.verdict, VERDICT.KILL);
  assert.equal(v.early, true, 'no espera a que se cumpla la ventana');
  assert.match(v.reason, /cero ventas/);
});

t('no mata por cero ventas si aun no ha gastado el umbral', () => {
  const v = verdict(stats({ spend: 70, revenue: 0, orders: 0, clicks: 140, impressions: 11000 }),
    ECON, test(), PRICE, DAY(3));
  assert.equal(v.verdict, VERDICT.RUNNING, '70 € esta por debajo del umbral de 92 €');
});

console.log('\nverdict() · cierre por tope o por ventana');

t('el tope de gasto cierra el test aunque queden dias', () => {
  const v = verdict(stats({ spend: 150, revenue: 170, orders: 5, clicks: 300, impressions: 20000 }),
    ECON, test(), PRICE, DAY(4));
  assert.equal(v.capHit, true);
  assert.notEqual(v.verdict, VERDICT.RUNNING);
});

t('corona ganador con ROAS alto y pedidos suficientes', () => {
  const v = verdict(stats({ spend: 150, revenue: 408, orders: 12, clicks: 400, impressions: 22000 }),
    ECON, test(), PRICE, DAY(7));
  assert.equal(v.verdict, VERDICT.WINNER);
  assert.ok(v.roas > 2.2);
});

t('no corona ganador con ROAS alto pero pocos pedidos', () => {
  const v = verdict(stats({ spend: 40, revenue: 136, orders: 4, clicks: 120, impressions: 8000 }),
    ECON, test({ budgetCap: 40 }), PRICE, DAY(7));
  assert.equal(v.verdict, VERDICT.EXTEND);
  assert.match(v.reason, /ruido/);
});

t('NO mata una oferta rentable aunque no llegue al objetivo', () => {
  const v = verdict(stats({ spend: 150, revenue: 238, orders: 7, clicks: 350, impressions: 20000 }),
    ECON, test(), PRICE, DAY(7));
  assert.equal(v.roas, 1.59);
  assert.equal(v.verdict, VERDICT.ITERATE);
  assert.match(v.next, /no lo mates/i);
});

t('manda iterar, no matar, en el primer intento fallido', () => {
  const v = verdict(stats({ spend: 150, revenue: 102, orders: 3, clicks: 400, impressions: 22000 }),
    ECON, test({ iteration: 1 }), PRICE, DAY(7));
  assert.equal(v.verdict, VERDICT.ITERATE);
});

t('mata en el ultimo intento si sigue perdiendo dinero', () => {
  const v = verdict(stats({ spend: 150, revenue: 102, orders: 3, clicks: 400, impressions: 22000 }),
    ECON, test({ iteration: 2, maxIterations: 2 }), PRICE, DAY(7));
  assert.equal(v.verdict, VERDICT.KILL);
  assert.match(v.reason, /2 intento/);
});

console.log('\ndiagnose()');

t('senala al anuncio cuando el CTR es bajo', () => {
  const d = diagnose({ spend: 100, clicks: 50, impressions: 20000, orders: 0 }, ECON, PRICE);
  assert.equal(d.where, 'anuncio');
  assert.match(d.fix, /angulos/);
});

t('senala a la landing cuando entra gente y no compra', () => {
  const d = diagnose({ spend: 100, clicks: 400, impressions: 20000, orders: 1 }, ECON, PRICE);
  assert.equal(d.where, 'landing');
});

t('senala al precio cuando convierte pero no cubre el coste', () => {
  const d = diagnose({ spend: 200, clicks: 300, impressions: 15000, orders: 6 }, ECON, PRICE);
  assert.equal(d.where, 'precio');
});

t('no diagnostica con datos insuficientes', () => {
  const d = diagnose({ spend: 5, clicks: 3, impressions: 200, orders: 0 }, ECON, PRICE);
  assert.equal(d.where, 'datos');
});

console.log(`\n${pass} pasan, ${fail} fallan\n`);
process.exit(fail ? 1 : 0);
