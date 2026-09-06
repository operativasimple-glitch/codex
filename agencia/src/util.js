/** Utilidades compartidas: rutas, fechas, slugs y formato de salida en terminal. */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATOS = join(RAIZ, 'datos');

export function asegurarDir(ruta) {
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

export function slug(texto) {
  return String(texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Dominio limpio de una web escrita como sea: con protocolo, con www, con puerto o con ruta. */
export function hostDe(web) {
  if (!web) return '';
  let t = String(web).trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0];
  t = t.split(':')[0];
  return t.replace(/^www\./i, '').toLowerCase();
}

/** ¿Son la misma web? Compara solo el dominio, tolerando www, puertos y rutas. */
export const mismoDominio = (a, b) => {
  const x = hostDe(a), y = hostDe(b);
  return !!x && !!y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`));
};

export const hoyISO = () => new Date().toISOString().slice(0, 10);

export function fechaLegible(iso) {
  if (!iso) return '—';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = new Date(iso);
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function diasDesde(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export const euros = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(n);

// Colores ANSI. Se apagan solos si la salida no es un terminal.
const tty = process.stdout.isTTY;
const c = (cod) => (t) => (tty ? `\x1b[${cod}m${t}\x1b[0m` : String(t));
export const col = {
  neg: c('1'), gris: c('90'), rojo: c('31'), verde: c('32'),
  ambar: c('33'), azul: c('36'), inv: c('7'),
};

export function titulo(t) {
  console.log('\n' + col.neg(t));
  console.log(col.gris('─'.repeat(Math.min(t.length + 8, 72))));
}

export function escaparHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
