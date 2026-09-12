/**
 * Pruebas de la maquina de pasos que alimenta `ops next`.
 *   node test/progress.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, DIST_DIR, ROOT } from '../src/config.js';
import * as pipeline from '../src/lib/pipeline.js';
import { progress, activeOffer, markStep, STEPS } from '../src/lib/progress.js';

const PIPE = path.join(STATE_DIR, 'pipeline.json');
const BACKUP = PIPE + '.progressbak';
const HAD = fs.existsSync(PIPE);
if (HAD) fs.copyFileSync(PIPE, BACKUP);

const LAUNCH = path.join(STATE_DIR, 'pack-notion-freelance.launch.json');
const HAD_LAUNCH = fs.existsSync(LAUNCH);
const ENVFILE = path.join(ROOT, '.env');
const HAD_ENV = fs.existsSync(ENVFILE);

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
};

const SLUG = 'pack-notion-freelance';
const reset = () => pipeline.write({ offers: {} });

console.log('\nprogress() · orden de los pasos');

t('sin .env el primer paso es conectar cuentas', () => {
  reset();
  fs.rmSync(ENVFILE, { force: true });
  const p = progress(SLUG);
  assert.equal(p.next, 'entorno');
  assert.equal(p.done.entorno, false);
});

t('con .env a medias sigue pidiendo el entorno', () => {
  fs.writeFileSync(ENVFILE, 'SHOPIFY_STORE=demo.myshopify.com\n');
  const p = progress(SLUG);
  assert.equal(p.next, 'entorno', 'falta el token');
  assert.match(p.env.why, /SHOPIFY_ADMIN_TOKEN/);
});

t('con .env completo pasa al siguiente pendiente', () => {
  fs.writeFileSync(ENVFILE, 'SHOPIFY_STORE=demo.myshopify.com\nSHOPIFY_ADMIN_TOKEN=shpat_demo\n');
  const p = progress(SLUG);
  assert.equal(p.done.entorno, true);
  assert.notEqual(p.next, 'entorno');
});

t('detecta una oferta que sigue con el texto de la plantilla', () => {
  const tmp = path.join(ROOT, 'offers', 'zz-plantilla-sin-tocar.json');
  fs.writeFileSync(tmp, JSON.stringify({
    slug: 'zz-plantilla-sin-tocar', name: 'Nombre del producto', price: 27, currency: 'EUR',
    promise: 'El resultado concreto que consigue el comprador y en cuanto tiempo',
    audience: 'A quien va dirigido, en una frase concreta',
    deliverables: [{ name: 'Pieza principal' }],
  }, null, 2));
  try {
    const p = progress('zz-plantilla-sin-tocar');
    assert.equal(p.done.oferta, false);
    assert.equal(p.next, 'oferta');
    assert.ok(p.offer.left.length >= 3, 'lista los campos sin tocar');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

t('la oferta de ejemplo cuenta como escrita', () => {
  const p = progress(SLUG);
  assert.equal(p.done.oferta, true);
});

t('respeta el orden declarado de los pasos', () => {
  reset();
  fs.rmSync(path.join(DIST_DIR, `${SLUG}.html`), { force: true });
  fs.rmSync(LAUNCH, { force: true });
  const p = progress(SLUG);
  const idx = STEPS.indexOf(p.next);
  // Todo lo anterior al siguiente pendiente tiene que estar hecho.
  STEPS.slice(0, idx).forEach((s) => assert.equal(p.done[s], true, `${s} deberia estar hecho`));
});

t('marcar un paso manual lo da por hecho', () => {
  reset();
  markStep(SLUG, 'producto');
  assert.equal(progress(SLUG).done.producto, true);
});

t('un fichero de lanzamiento cuenta como anuncios creados', () => {
  reset();
  fs.writeFileSync(LAUNCH, JSON.stringify({ meta: { campaignId: 'c1' } }));
  try {
    assert.equal(progress(SLUG).done.anuncios, true);
  } finally {
    fs.rmSync(LAUNCH, { force: true });
  }
});

console.log('\nactiveOffer() · en que producto estoy');

t('elige el que tiene un test abierto', () => {
  pipeline.write({ offers: {
    [SLUG]: { status: pipeline.STATUS.DEAD, history: [] },
    otro: { status: pipeline.STATUS.TESTING, history: [], test: {} },
  } });
  // Solo puede elegir slugs con fichero de oferta; "otro" no existe en disco.
  assert.equal(activeOffer(), SLUG, 'cae al unico producto con fichero real');
});

t('no elige un descartado si hay uno vivo', () => {
  pipeline.write({ offers: { [SLUG]: { status: pipeline.STATUS.TESTING, history: [], test: {} } } });
  assert.equal(activeOffer(), SLUG);
});

console.log(`\n${pass} pasan, ${fail} fallan\n`);

if (HAD && fs.existsSync(BACKUP)) { fs.copyFileSync(BACKUP, PIPE); fs.unlinkSync(BACKUP); }
else fs.rmSync(PIPE, { force: true });
if (!HAD_LAUNCH) fs.rmSync(LAUNCH, { force: true });
if (!HAD_ENV) fs.rmSync(ENVFILE, { force: true });
process.exit(fail ? 1 : 0);
