import fs from 'node:fs';
import path from 'node:path';
import { OFFERS_DIR, ensureDir } from '../config.js';
import { log } from '../lib/log.js';

const TEMPLATE = (slug) => ({
  slug,
  name: 'Nombre del producto',
  vendor: 'Tu marca',
  brand: { name: 'Tu marca', accent: '#4338ca', accentDark: '#312e81' },
  currency: process.env.CURRENCY || 'EUR',
  price: 27,
  compareAtPrice: null,

  audience: 'A quien va dirigido, en una frase concreta',
  promise: 'El resultado concreto que consigue el comprador y en cuanto tiempo',

  eyebrow: 'Para [publico]',
  headline: 'Titular con el resultado, no con el producto',
  subheadline: 'Una frase que explica el mecanismo: por que esto funciona.',
  cta: 'Quiero acceso ahora',
  heroImage: null,
  heroBullets: ['Beneficio concreto 1', 'Beneficio concreto 2', 'Beneficio concreto 3'],

  painsTitle: 'Si estas aqui, probablemente te suene esto',
  pains: ['Problema que reconoce el lector', 'Otro problema', 'Un tercero'],
  painsClose: 'La frase que conecta el problema con tu solucion.',

  steps: [
    { title: 'Paso 1', text: 'Que hace el comprador primero.' },
    { title: 'Paso 2', text: 'Que pasa despues.' },
    { title: 'Paso 3', text: 'El resultado.' },
  ],

  deliverables: [
    { name: 'Pieza principal', detail: 'Que es y de que tamano.', value: 47 },
  ],
  bonuses: [],

  // Solo testimonios REALES de clientes reales. Deja el array vacio si aun no
  // tienes ninguno: una landing sin prueba social convierte peor, pero una con
  // testimonios inventados es fraude y motivo de cierre de cuenta publicitaria.
  testimonials: [],

  guarantee: {
    short: '14 dias de garantia',
    title: 'Si no te sirve, te devuelvo el dinero',
    text: 'Tienes 14 dias. Escribes a soporte, te devuelvo el importe integro, sin preguntas.',
  },

  faq: [
    { q: '¿Como lo recibo?', a: 'Por email, inmediatamente despues del pago.' },
    { q: '¿Es un pago unico?', a: 'Si. Un solo pago, acceso permanente.' },
    { q: '¿Y si no me sirve?', a: 'Tienes 14 dias para pedir la devolucion.' },
  ],

  seoTitle: null,
  seoDescription: null,

  ads: {
    landingPath: null,
    meta: {
      dailyBudget: 20,
      countries: ['ES'],
      ageMin: 25,
      ageMax: 55,
      variants: [
        { name: 'angulo-dolor', primaryText: 'Texto del anuncio.', headline: 'Titular corto', description: 'Descripcion', image: null },
      ],
    },
    tiktok: {
      dailyBudget: 20,
      locationIds: ['2724'],
      variants: [],
    },
  },

  economics: {
    targetRoas: 2.0,
    killRoas: 1.1,
    learningDays: 3,
    scaleStepPct: 0.2,
    maxDailyBudget: 200,
  },
});

export function newOffer(slug) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error('Pasa un slug en minusculas con guiones, por ejemplo: ops new-offer pack-notion-freelance');
  }
  ensureDir(OFFERS_DIR);
  const file = path.join(OFFERS_DIR, `${slug}.json`);
  if (fs.existsSync(file)) throw new Error(`Ya existe ${file}`);
  fs.writeFileSync(file, JSON.stringify(TEMPLATE(slug), null, 2) + '\n');
  log.ok(`Oferta creada: offers/${slug}.json`);
  log.dim('  Rellenala y luego: npm run ops -- page-build --offer ' + slug);
  return file;
}
