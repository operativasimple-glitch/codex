/**
 * Prueba de integracion del ciclo diario, con los datos de plataforma
 * inyectados. Cubre el reparto de veredictos y las transiciones de estado
 * de la cartera sin llamar a ninguna API.
 *   node test/cycle.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, loadOffer, loadEnv } from '../src/config.js';
import * as pipeline from '../src/lib/pipeline.js';
import { cycle } from '../src/commands/cycle.js';
import { VERDICT } from '../src/lib/verdict.js';

loadEnv();

const PIPE = path.join(STATE_DIR, 'pipeline.json');
const BACKUP = PIPE + '.testbak';
// Si habia cartera real, se guarda y se restaura. Si no habia, al terminar no
// debe quedar ninguna: estas pruebas no pueden inventarle productos al usuario.
const HAD_PIPELINE = fs.existsSync(PIPE);
if (HAD_PIPELINE) fs.copyFileSync(PIPE, BACKUP);

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
};

const offer = loadOffer('pack-notion-freelance');
const SLUG = offer.slug;

/** Genera filas de anuncios y pedidos coherentes entre si. */
function fakeData({ spend, orders, clicks = 300, impressions = 20000 }) {
  return async () => ({
    since: '2026-09-01', until: '2026-09-08',
    rows: [{
      platform: 'meta', adId: 'ad_1', adsetId: 'adset_1', campaignId: 'c1',
      campaignName: `${SLUG} | test`, adName: 'a', adsetName: 's',
      spend, impressions, clicks, ctr: clicks / impressions, cpc: spend / clicks,
      cpm: 0, frequency: 1.2, purchases: orders, revenue: orders * offer.price,
      platformRoas: spend ? (orders * offer.price) / spend : 0, cpa: null,
    }],
    orders: Array.from({ length: orders }, (_, i) => ({
      id: `o${i}`, test: false, cancelledAt: null,
      currentTotalPriceSet: { shopMoney: { amount: String(offer.price) } },
      totalRefundedSet: { shopMoney: { amount: '0' } },
      customerJourneySummary: { firstVisit: { utmParameters: { content: 'ad_1', term: 'adset_1' } } },
      lineItems: { nodes: [{ quantity: 1, product: { handle: SLUG } }] },
    })),
  });
}

function resetPipeline({ startedDaysAgo = 8, budgetCap = 150, iteration = 1, maxIterations = 2 }) {
  pipeline.write({ offers: {
    [SLUG]: {
      status: pipeline.STATUS.TESTING,
      history: [],
      test: {
        startedAt: new Date(Date.now() - startedDaysAgo * 86400_000).toISOString(),
        days: 7, budgetCap, iteration, maxIterations,
      },
    },
  } });
}

// Silenciamos la salida: aqui solo interesan el veredicto y el estado.
const realLog = console.log, realErr = console.error;
const quiet = async (fn) => {
  console.log = () => {}; console.error = () => {};
  try { return await fn(); } finally { console.log = realLog; console.error = realErr; }
};

console.log('\ncycle() · veredictos');

await t('sin test abierto no hace nada', async () => {
  pipeline.write({ offers: {} });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 50, orders: 2 }) }));
  assert.equal(r.verdict, null);
});

await t('a mitad de ventana devuelve RUNNING', async () => {
  resetPipeline({ startedDaysAgo: 3 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 60, orders: 2 }) }));
  assert.equal(r.verdict.verdict, VERDICT.RUNNING);
});

await t('cero ventas con gasto suficiente da KILL aunque queden dias', async () => {
  resetPipeline({ startedDaysAgo: 3 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 95, orders: 0 }) }));
  assert.equal(r.verdict.verdict, VERDICT.KILL);
  assert.equal(r.verdict.early, true);
});

await t('ROAS alto con pedidos suficientes da WINNER', async () => {
  resetPipeline({ startedDaysAgo: 8 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 150, orders: 13 }) }));
  assert.equal(r.verdict.verdict, VERDICT.WINNER);
});

await t('rentable pero flojo da ITERATE, nunca KILL', async () => {
  resetPipeline({ startedDaysAgo: 8 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 150, orders: 7 }) }));
  assert.equal(r.verdict.verdict, VERDICT.ITERATE);
});

await t('perder dinero en el ultimo intento da KILL', async () => {
  resetPipeline({ startedDaysAgo: 8, iteration: 2 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 150, orders: 3 }) }));
  assert.equal(r.verdict.verdict, VERDICT.KILL);
});

console.log('\ncycle() · tope de gasto');

await t('marca capHit cuando el gasto alcanza el tope', async () => {
  resetPipeline({ startedDaysAgo: 2, budgetCap: 100 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 104, orders: 4 }) }));
  assert.equal(r.verdict.capHit, true);
  assert.notEqual(r.verdict.verdict, VERDICT.RUNNING, 'el tope cierra el test aunque queden dias');
});

await t('no sigue gastando por encima del tope', async () => {
  resetPipeline({ startedDaysAgo: 2, budgetCap: 100 });
  const r = await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 150, orders: 1 }) }));
  assert.equal(r.verdict.budgetLeft, 0);
});

console.log('\ncycle() · estado de la cartera');

await t('en simulacion no cambia el estado', async () => {
  resetPipeline({ startedDaysAgo: 8, iteration: 2 });
  await quiet(() => cycle(offer, { fetchData: fakeData({ spend: 150, orders: 3 }), apply: false }));
  assert.equal(pipeline.get(SLUG).status, pipeline.STATUS.TESTING);
  assert.equal(pipeline.get(SLUG).history.length, 0);
});

console.log(`\n${pass} pasan, ${fail} fallan\n`);

if (HAD_PIPELINE && fs.existsSync(BACKUP)) {
  fs.copyFileSync(BACKUP, PIPE);
  fs.unlinkSync(BACKUP);
} else {
  fs.rmSync(PIPE, { force: true });
}
process.exit(fail ? 1 : 0);
