/**
 * Estado de la cartera de productos. Un fichero JSON que responde a la unica
 * pregunta que importa cuando pruebas productos en serie:
 * que estoy probando, cuanto llevo gastado en cada cosa, y que aprendi de lo
 * que ya mate para no repetirlo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, ensureDir } from '../config.js';

const FILE = () => path.join(ensureDir(STATE_DIR), 'pipeline.json');

export const STATUS = {
  IDEA: 'idea',         // en la lista, sin lanzar
  TESTING: 'testing',   // test en marcha
  WINNER: 'winner',     // supero el test, escalando
  DEAD: 'dead',         // descartado, con su aprendizaje anotado
  PAUSED: 'paused',     // parado a mano
};

export function read() {
  const f = FILE();
  if (!fs.existsSync(f)) return { offers: {}, updatedAt: null };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function write(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(FILE(), JSON.stringify(state, null, 2) + '\n');
  return state;
}

export function get(slug) {
  return read().offers[slug] || null;
}

export function upsert(slug, patch) {
  const state = read();
  state.offers[slug] = { ...(state.offers[slug] || {}), ...patch };
  return write(state).offers[slug];
}

/** Arranca un test. Si ya habia uno, lo archiva en el historial primero. */
export function startTest(slug, { days = 7, budgetCap, maxIterations = 2, note = null }) {
  const state = read();
  const entry = state.offers[slug] || { history: [] };

  const iteration = (entry.test?.iteration || 0) + 1;
  if (iteration > maxIterations) {
    throw new Error(
      `"${slug}" ya ha agotado sus ${maxIterations} intentos. ` +
      `Matalo (ops kill --offer ${slug}) o sube maxIterations a conciencia.`
    );
  }

  entry.status = STATUS.TESTING;
  entry.history = entry.history || [];
  entry.test = {
    startedAt: new Date().toISOString(),
    days,
    budgetCap,
    iteration,
    maxIterations,
    note,
  };
  state.offers[slug] = entry;
  write(state);
  return entry;
}

/** Cierra el test en curso y lo guarda en el historial con su aprendizaje. */
export function closeTest(slug, { verdict, stats, learning }) {
  const state = read();
  const entry = state.offers[slug];
  if (!entry?.test) throw new Error(`"${slug}" no tiene ningun test abierto.`);

  entry.history = entry.history || [];
  entry.history.push({
    iteration: entry.test.iteration,
    startedAt: entry.test.startedAt,
    endedAt: new Date().toISOString(),
    days: entry.test.days,
    budgetCap: entry.test.budgetCap,
    verdict,
    spend: stats.spend,
    revenue: stats.revenue,
    orders: stats.orders,
    roas: stats.roas,
    learning,
  });
  entry.lastVerdict = verdict;
  state.offers[slug] = entry;
  write(state);
  return entry;
}

export function markDead(slug, learning) {
  return upsert(slug, { status: STATUS.DEAD, diedAt: new Date().toISOString(), learning });
}

export function markWinner(slug) {
  return upsert(slug, { status: STATUS.WINNER, wonAt: new Date().toISOString() });
}

export function addIdea(slug, note = null) {
  const state = read();
  if (state.offers[slug]) return state.offers[slug];
  state.offers[slug] = { status: STATUS.IDEA, note, history: [] };
  write(state);
  return state.offers[slug];
}

/** Totales de toda la cartera: lo que llevas gastado probando y lo que recuperaste. */
export function totals() {
  const state = read();
  let spend = 0, revenue = 0, orders = 0, tested = 0, dead = 0, winners = 0;
  for (const entry of Object.values(state.offers)) {
    for (const h of entry.history || []) {
      spend += h.spend || 0;
      revenue += h.revenue || 0;
      orders += h.orders || 0;
    }
    if ((entry.history || []).length) tested++;
    if (entry.status === STATUS.DEAD) dead++;
    if (entry.status === STATUS.WINNER) winners++;
  }
  return {
    spend: r2(spend), revenue: r2(revenue), orders,
    net: r2(revenue - spend),
    tested, dead, winners,
    hitRate: tested > 0 ? winners / tested : null,
    costPerTest: tested > 0 ? r2(spend / tested) : null,
  };
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
