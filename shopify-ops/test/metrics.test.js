/**
 * Pruebas del motor de decision. Sin red, sin dependencias:
 *   node test/metrics.test.js
 */
import assert from 'node:assert/strict';
import { decide, joinSpendWithOrders, aggregate, blended, ACTIONS } from '../src/lib/metrics.js';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
};

const ECON = {
  variableCostRate: 0.04, refundRate: 0.06,
  targetRoas: 2.2, killRoas: 1.2, breakevenRoas: 1.11,
  minSpendAdset: 102, minSpendAdNoSale: 51,
  learningDays: 3, scaleStepPct: 0.2, maxDailyBudget: 150, frequencyRotate: 2.5,
};

const row = (o = {}) => ({
  spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0,
  frequency: 1, effectiveRoas: 0, attributed: true, realOrders: 0, ...o,
});

console.log('\ndecide()');

t('mata un anuncio que gasta sin vender nada', () => {
  const d = decide(row({ spend: 60, purchases: 0 }), ECON, { daysRunning: 5, level: 'ad' });
  assert.equal(d.action, ACTIONS.KILL);
  assert.match(d.reason, /ninguna venta/);
});

t('no toca nada durante la fase de aprendizaje', () => {
  const d = decide(row({ spend: 40, purchases: 0 }), ECON, { daysRunning: 2, level: 'ad' });
  assert.equal(d.action, ACTIONS.HOLD);
  assert.match(d.reason, /aprendizaje/);
});

t('aprendizaje no protege a un anuncio que ya sangra por encima del umbral', () => {
  // El corte por cero ventas se evalua ANTES que el aprendizaje: si ya gastaste
  // el umbral sin una sola venta, esperar mas dias solo quema presupuesto.
  const d = decide(row({ spend: 80, purchases: 0 }), ECON, { daysRunning: 1, level: 'ad' });
  assert.equal(d.action, ACTIONS.KILL);
});

t('espera si no hay gasto suficiente para concluir', () => {
  const d = decide(row({ spend: 30, purchases: 1, effectiveRoas: 0.9 }), ECON, { daysRunning: 5, level: 'adset' });
  assert.equal(d.action, ACTIONS.HOLD);
  assert.match(d.reason, /insuficientes/);
});

t('mata por ROAS bajo una vez hay datos', () => {
  const d = decide(row({ spend: 150, purchases: 3, effectiveRoas: 0.8 }), ECON, { daysRunning: 5, level: 'adset' });
  assert.equal(d.action, ACTIONS.KILL);
  assert.match(d.reason, /por debajo del corte/);
});

t('escala un ad set ganador un 20%', () => {
  const d = decide(row({ spend: 150, purchases: 12, effectiveRoas: 3.1 }), ECON,
    { daysRunning: 6, level: 'adset', currentBudget: 20 });
  assert.equal(d.action, ACTIONS.SCALE);
  assert.equal(d.newBudget, 24);
});

t('no escala por encima del presupuesto maximo', () => {
  const d = decide(row({ spend: 400, purchases: 30, effectiveRoas: 3.1 }), ECON,
    { daysRunning: 9, level: 'adset', currentBudget: 150 });
  assert.equal(d.action, ACTIONS.HOLD);
  assert.match(d.reason, /tope/);
});

t('no escala a nivel de anuncio, solo de ad set', () => {
  const d = decide(row({ spend: 150, purchases: 12, effectiveRoas: 3.1 }), ECON, { daysRunning: 6, level: 'ad' });
  assert.equal(d.action, ACTIONS.HOLD);
});

t('pide rotar creatividad cuando la frecuencia se dispara', () => {
  const d = decide(row({ spend: 150, purchases: 5, effectiveRoas: 1.6, frequency: 3.1 }), ECON,
    { daysRunning: 8, level: 'adset', currentBudget: 20 });
  assert.equal(d.action, ACTIONS.ROTATE);
});

t('deja correr lo que esta entre el corte y el objetivo', () => {
  const d = decide(row({ spend: 150, purchases: 6, effectiveRoas: 1.7 }), ECON,
    { daysRunning: 8, level: 'adset', currentBudget: 20 });
  assert.equal(d.action, ACTIONS.HOLD);
  assert.match(d.reason, /se deja correr/);
});

console.log('\njoinSpendWithOrders()');

const order = (adId, amount, handle = 'pack-notion-freelance', extra = {}) => ({
  test: false, cancelledAt: null,
  currentTotalPriceSet: { shopMoney: { amount: String(amount) } },
  totalRefundedSet: { shopMoney: { amount: '0' } },
  customerJourneySummary: { firstVisit: { utmParameters: { content: adId, term: 'adset_1' } } },
  lineItems: { nodes: [{ quantity: 1, product: { handle } }] },
  ...extra,
});

t('cruza pedidos de Shopify con el gasto por ad id', () => {
  const insights = [{ adId: 'ad_1', adsetId: 'adset_1', spend: 50, platformRoas: 4, purchases: 3, revenue: 200, frequency: 1 }];
  const [r] = joinSpendWithOrders(insights, [order('ad_1', 34), order('ad_1', 34)], { productHandle: 'pack-notion-freelance' });
  assert.equal(r.realRevenue, 68);
  assert.equal(r.realOrders, 2);
  assert.equal(r.realRoas, 68 / 50);
  assert.equal(r.effectiveRoas, 68 / 50, 'el ROAS real manda sobre el de la plataforma');
});

t('descarta pedidos de prueba y cancelados', () => {
  const insights = [{ adId: 'ad_1', adsetId: 'adset_1', spend: 50, platformRoas: 0, purchases: 0, revenue: 0, frequency: 1 }];
  const orders = [order('ad_1', 34, 'pack-notion-freelance', { test: true }), order('ad_1', 34, 'pack-notion-freelance', { cancelledAt: '2026-01-01' })];
  const [r] = joinSpendWithOrders(insights, orders, { productHandle: 'pack-notion-freelance' });
  assert.equal(r.realRevenue, null);
  assert.equal(r.attributed, false);
});

t('ignora pedidos de otro producto', () => {
  const insights = [{ adId: 'ad_1', adsetId: 'adset_1', spend: 50, platformRoas: 2, purchases: 1, revenue: 100, frequency: 1 }];
  const [r] = joinSpendWithOrders(insights, [order('ad_1', 99, 'otro-producto')], { productHandle: 'pack-notion-freelance' });
  assert.equal(r.attributed, false);
  assert.equal(r.effectiveRoas, 2, 'sin atribucion cae al dato de la plataforma');
});

t('resta los reembolsos de los ingresos', () => {
  const o = order('ad_1', 100);
  o.totalRefundedSet = { shopMoney: { amount: '40' } };
  const insights = [{ adId: 'ad_1', adsetId: 'adset_1', spend: 50, platformRoas: 2, purchases: 1, revenue: 100, frequency: 1 }];
  const [r] = joinSpendWithOrders(insights, [o], { productHandle: 'pack-notion-freelance' });
  assert.equal(r.realRevenue, 60);
});

console.log('\naggregate() y blended()');

t('agrega varios anuncios en su ad set', () => {
  const rows = [
    { adId: 'a1', adsetId: 's1', adsetName: 'S1', spend: 30, impressions: 1000, clicks: 20, purchases: 1, revenue: 34, realRevenue: 34, attributed: true, frequency: 1.2 },
    { adId: 'a2', adsetId: 's1', adsetName: 'S1', spend: 20, impressions: 800, clicks: 10, purchases: 2, revenue: 68, realRevenue: 68, attributed: true, frequency: 1.8 },
  ];
  const [s] = aggregate(rows, (r) => r.adsetId);
  assert.equal(s.spend, 50);
  assert.equal(s.purchases, 3);
  assert.equal(s.realRoas, 102 / 50);
  assert.equal(s.frequency, 1.8, 'la frecuencia agregada es la maxima, no la suma');
});

t('calcula el resultado combinado de la cuenta', () => {
  const rows = [{ spend: 100 }, { spend: 50 }];
  const b = blended(rows, [order('a1', 34), order('a2', 34), order('a3', 34)], { productHandle: 'pack-notion-freelance' });
  assert.equal(b.spend, 150);
  assert.equal(b.revenue, 102);
  assert.equal(b.orders, 3);
  assert.equal(b.profit, -48);
  assert.equal(b.cac, 50);
});

console.log(`\n${pass} pasan, ${fail} fallan\n`);
process.exit(fail ? 1 : 0);
