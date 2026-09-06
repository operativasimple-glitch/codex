/**
 * Carga de Playwright tolerante al entorno: primero el node_modules del proyecto,
 * y si no está, la instalación global. Así el programa arranca en el portátil de
 * Oscar y en cualquier máquina donde Playwright ya venga puesto.
 */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

let cache = null;

export async function cargarPlaywright() {
  if (cache) return cache;
  // Playwright se publica como CommonJS: al importarlo desde ESM, lo que interesa
  // puede venir en la raíz del módulo o dentro de `default`.
  const desenvolver = (mod) => (mod?.chromium ? mod : mod?.default);
  try {
    cache = desenvolver(await import('playwright'));
    if (cache?.chromium) return cache;
  } catch { /* se prueba en global */ }
  try {
    const raizGlobal = execSync('npm root -g', { encoding: 'utf8' }).trim();
    cache = desenvolver(await import(pathToFileURL(join(raizGlobal, 'playwright', 'index.js')).href));
    if (!cache?.chromium) throw new Error('el módulo no expone chromium');
    return cache;
  } catch (e) {
    throw new Error(
      'No se encuentra Playwright. Instálalo con:  npm install  (dentro de agencia/)\n'
      + 'y, si hace falta el navegador:  npx playwright install chromium\n'
      + `Detalle: ${e.message}`,
    );
  }
}

export async function abrirNavegador({ visible = false } = {}) {
  const { chromium } = await cargarPlaywright();
  const opciones = { headless: !visible };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) opciones.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return chromium.launch(opciones);
}
