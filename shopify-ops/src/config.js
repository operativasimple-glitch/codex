import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
export const OFFERS_DIR = path.join(ROOT, 'offers');
export const STATE_DIR = path.join(ROOT, 'state');
export const DIST_DIR = path.join(ROOT, 'dist');

/** Lector de .env minimo: KEY=valor, ignora comentarios y lineas vacias. */
export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

export function env(key, { required = false, fallback = undefined } = {}) {
  const v = process.env[key] ?? fallback;
  if (required && (!v || String(v).trim() === '')) {
    throw new Error(
      `Falta la variable de entorno ${key}. Copia .env.example a .env y rellenala. ` +
      `Consulta playbooks/01-cuentas-y-accesos.md para saber de donde sale.`
    );
  }
  return v;
}

// ── Validacion de ofertas ───────────────────────────────────────────────────

const REQUIRED = [
  ['slug', 'string'],
  ['name', 'string'],
  ['price', 'number'],
  ['currency', 'string'],
  ['promise', 'string'],
  ['audience', 'string'],
];

export function listOffers() {
  if (!fs.existsSync(OFFERS_DIR)) return [];
  return fs.readdirSync(OFFERS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

export function loadOffer(slug) {
  if (!slug) {
    const all = listOffers();
    throw new Error(
      `Indica una oferta con --offer <slug>. Disponibles: ${all.length ? all.join(', ') : '(ninguna todavia, crea una con: ops new-offer <slug>)'}`
    );
  }
  const file = path.join(OFFERS_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No existe la oferta "${slug}" (${file}). Disponibles: ${listOffers().join(', ') || 'ninguna'}`);
  }
  let offer;
  try {
    offer = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`La oferta "${slug}" no es JSON valido: ${e.message}`);
  }
  validateOffer(offer, slug);
  return applyDefaults(offer);
}

export function validateOffer(offer, slug) {
  const problems = [];
  for (const [key, type] of REQUIRED) {
    const v = offer[key];
    if (v === undefined || v === null || v === '') problems.push(`falta "${key}"`);
    else if (typeof v !== type) problems.push(`"${key}" deberia ser ${type} y es ${typeof v}`);
  }
  if (offer.slug && offer.slug !== slug) {
    problems.push(`"slug" dice "${offer.slug}" pero el fichero se llama "${slug}.json"`);
  }
  if (offer.price != null && offer.price <= 0) problems.push('"price" tiene que ser mayor que 0');
  if (offer.compareAtPrice != null && offer.compareAtPrice <= offer.price) {
    problems.push('"compareAtPrice" debe ser mayor que "price" o quitalo (si no, es un descuento falso)');
  }
  if (!Array.isArray(offer.deliverables) || offer.deliverables.length === 0) {
    problems.push('"deliverables" tiene que ser una lista con al menos un elemento');
  }
  const e = offer.economics || {};
  if (e.targetRoas != null && e.killRoas != null && e.killRoas >= e.targetRoas) {
    problems.push('"economics.killRoas" debe ser menor que "economics.targetRoas"');
  }
  if (problems.length) {
    throw new Error(`La oferta "${slug}" tiene errores:\n  - ${problems.join('\n  - ')}`);
  }
}

function applyDefaults(offer) {
  const price = offer.price;
  const economics = {
    // Coste variable por venta: pasarela de pago + fees. 4% es una estimacion prudente
    // para Shopify Payments en EU; ajustalo con tus numeros reales.
    variableCostRate: 0.04,
    refundRate: 0.05,
    // ROAS objetivo: por encima de esto, escalamos.
    targetRoas: 2.0,
    // ROAS por debajo del cual matamos, una vez pasado el aprendizaje.
    killRoas: 1.1,
    // Gasto minimo antes de tomar cualquier decision sobre un ad set.
    minSpendAdset: price * 3,
    // Gasto minimo sin ninguna venta antes de matar un anuncio concreto.
    minSpendAdNoSale: price * 1.5,
    learningDays: 3,
    // Subida maxima de presupuesto por dia. Por encima del 20-30% Meta reinicia
    // la fase de aprendizaje del ad set y pierdes el rendimiento acumulado.
    scaleStepPct: 0.20,
    maxDailyBudget: 200,
    // Frecuencia a partir de la cual la creatividad esta quemada.
    frequencyRotate: 2.5,
    ...(offer.economics || {}),
  };
  economics.breakevenRoas = Number(
    (1 / (1 - economics.variableCostRate - economics.refundRate)).toFixed(2)
  );
  return {
    compareAtPrice: null,
    tags: [],
    faq: [],
    testimonials: [],
    bonuses: [],
    guarantee: null,
    ads: {},
    ...offer,
    economics,
  };
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}
