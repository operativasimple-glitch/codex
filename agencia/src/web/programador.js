/**
 * El programador: la sesión diaria a una hora fija, sin cron ni terminal.
 *
 * Mientras la aplicación esté abierta, comprueba cada minuto si toca. Guarda la
 * última fecha en que se ejecutó, así que si el ordenador estaba apagado a la hora
 * señalada, la sesión salta en cuanto se abre — que es lo que quiere alguien que
 * usa esto por las tardes y no todos los días a la misma hora.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS, asegurarDir, hoyISO } from '../util.js';

const RUTA = join(DATOS, 'programacion.json');
const POR_DEFECTO = { activo: false, hora: '08:00', ultimaEjecucion: null, alAbrirSiSePaso: true };

export function leerProgramacion() {
  if (!existsSync(RUTA)) return { ...POR_DEFECTO };
  try { return { ...POR_DEFECTO, ...JSON.parse(readFileSync(RUTA, 'utf8')) }; } catch { return { ...POR_DEFECTO }; }
}

export function guardarProgramacion(cambios) {
  asegurarDir(DATOS);
  const nueva = { ...leerProgramacion(), ...cambios };
  writeFileSync(RUTA, JSON.stringify(nueva, null, 2));
  return nueva;
}

const minutosDe = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** ¿Toca ahora? Sí si ya ha pasado la hora de hoy y hoy no se ha ejecutado. */
export function tocaAhora(prog, ahora = new Date()) {
  if (!prog.activo) return false;
  if (prog.ultimaEjecucion === hoyISO()) return false;
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  return minutosAhora >= minutosDe(prog.hora);
}

export function proximaEjecucion(prog, ahora = new Date()) {
  if (!prog.activo) return null;
  const proxima = new Date(ahora);
  const [h, m] = String(prog.hora).split(':').map(Number);
  proxima.setHours(h || 0, m || 0, 0, 0);
  if (prog.ultimaEjecucion === hoyISO() || proxima <= ahora) proxima.setDate(proxima.getDate() + 1);
  return proxima.toISOString();
}

/**
 * Deja el programador en marcha. `lanzarSesion` es lo que se ejecuta cuando toca;
 * devuelve una función para pararlo.
 */
export function arrancarProgramador(lanzarSesion) {
  const tic = setInterval(() => {
    const prog = leerProgramacion();
    if (!tocaAhora(prog)) return;
    guardarProgramacion({ ultimaEjecucion: hoyISO() });
    try { lanzarSesion(); } catch { /* si ya hay algo en marcha, mañana será */ }
  }, 60000);
  tic.unref?.();
  return () => clearInterval(tic);
}
