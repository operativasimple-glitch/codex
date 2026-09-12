/**
 * Donde esta cada producto dentro del ciclo. Responde a una sola pregunta:
 * "¿que tengo que hacer ahora?". Todo se deduce de ficheros en disco, sin red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, DIST_DIR, STATE_DIR, OFFERS_DIR, listOffers } from '../config.js';
import * as pipeline from './pipeline.js';

/** Frases que vienen en la plantilla: si siguen ahi, la oferta no esta escrita. */
const PLACEHOLDERS = [
  'Nombre del producto',
  'A quien va dirigido, en una frase concreta',
  'El resultado concreto que consigue el comprador',
  'Titular con el resultado, no con el producto',
  'Beneficio concreto 1',
  'Problema que reconoce el lector',
  'Pieza principal',
  'Que hace el comprador primero',
];

export const STEPS = [
  'entorno',    // .env con credenciales
  'oferta',     // offers/<slug>.json escrito de verdad
  'landing',    // dist/<slug>.html generado y revisado
  'producto',   // el fichero que compra el cliente, hecho
  'tienda',     // store-setup ejecutado
  'anuncios',   // ads-launch ejecutado
  'test',       // test-start ejecutado
  'ciclo',      // cycle corriendo cada dia
];

export function envReady() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return { ok: false, why: 'no existe el fichero .env' };
  const txt = fs.readFileSync(f, 'utf8');
  const has = (k) => new RegExp(`^${k}=\\s*\\S+`, 'm').test(txt) && !txt.includes(`${k}=shpat_xxxx`);
  const missing = ['SHOPIFY_STORE', 'SHOPIFY_ADMIN_TOKEN'].filter((k) => !has(k));
  if (missing.length) return { ok: false, why: `faltan por rellenar: ${missing.join(', ')}` };
  const ads = has('META_ACCESS_TOKEN') || has('TIKTOK_ACCESS_TOKEN');
  return { ok: true, ads, why: ads ? null : 'Shopify listo, pero sin credenciales de Meta ni de TikTok' };
}

export function offerWritten(slug) {
  const f = path.join(OFFERS_DIR, `${slug}.json`);
  if (!fs.existsSync(f)) return { ok: false, why: 'la oferta no existe' };
  const txt = fs.readFileSync(f, 'utf8');
  const left = PLACEHOLDERS.filter((p) => txt.includes(p));
  if (left.length) {
    return { ok: false, why: `quedan ${left.length} campo(s) con el texto de la plantilla`, left };
  }
  return { ok: true };
}

export const landingBuilt = (slug) => fs.existsSync(path.join(DIST_DIR, `${slug}.html`));
export const adsLaunched = (slug) => fs.existsSync(path.join(STATE_DIR, `${slug}.launch.json`));

/** Estado completo de un producto: que pasos estan hechos y cual es el siguiente. */
export function progress(slug) {
  const entry = pipeline.get(slug) || {};
  const env = envReady();
  const offer = offerWritten(slug);

  const done = {
    entorno: env.ok,
    oferta: offer.ok,
    landing: landingBuilt(slug),
    producto: entry.steps?.producto === true,
    tienda: entry.steps?.tienda === true,
    anuncios: adsLaunched(slug),
    test: !!entry.test && entry.status === pipeline.STATUS.TESTING,
    ciclo: (entry.history || []).length > 0 || entry.lastVerdict != null,
  };

  const status = entry.status || 'idea';
  const firstPending = STEPS.find((s) => !done[s]) || null;

  return { slug, entry, status, done, next: firstPending, env, offer };
}

/** Marca un paso manual como hecho (los automaticos se deducen solos). */
export function markStep(slug, step, value = true) {
  const entry = pipeline.get(slug) || { status: pipeline.STATUS.IDEA, history: [] };
  const steps = { ...(entry.steps || {}), [step]: value };
  return pipeline.upsert(slug, { steps, status: entry.status || pipeline.STATUS.IDEA, history: entry.history || [] });
}

/** El producto en el que estas trabajando ahora mismo. */
export function activeOffer() {
  const state = pipeline.read();
  const slugs = listOffers();
  // Prioridad: el que tiene un test abierto, luego el pausado a medias, luego
  // el ultimo que se toco, luego el unico que hay.
  const testing = Object.entries(state.offers).find(([, e]) => e.status === pipeline.STATUS.TESTING);
  if (testing && slugs.includes(testing[0])) return testing[0];
  const paused = Object.entries(state.offers).find(([, e]) => e.status === pipeline.STATUS.PAUSED);
  if (paused && slugs.includes(paused[0])) return paused[0];
  const live = slugs.filter((s) => {
    const st = state.offers[s]?.status;
    return st !== pipeline.STATUS.DEAD;
  });
  return live.length === 1 ? live[0] : live[live.length - 1] || slugs[slugs.length - 1] || null;
}
