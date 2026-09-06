/**
 * Almacén del negocio: un JSON en datos/estado.json.
 *
 * No hay base de datos a propósito. Un fichero se lee, se corrige a mano, se copia
 * y se guarda en Drive. Para una agencia de una persona con veinte leads, cualquier
 * cosa más grande es trabajo que no factura.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS, asegurarDir, hoyISO, slug } from './util.js';

const RUTA = join(DATOS, 'estado.json');
const SEMILLA = join(DATOS, 'leads-semilla.json');

export const ESTADOS_LEAD = [
  'sin-auditar',   // está en la lista, nadie ha mirado su web
  'auditado',      // hay escaneo: ya se puede escribir con hallazgos concretos
  'contactado',    // primer correo enviado
  'recordado',     // recordatorio único a los 7 días
  'respondido',    // ha contestado
  'llamada',       // videollamada agendada
  'cliente',       // ha pagado algo
  'descartado',    // no sigue
];

const VACIO = { version: 1, creado: hoyISO(), leads: [], clientes: [], eventos: [] };

export function cargar() {
  asegurarDir(DATOS);
  if (!existsSync(RUTA)) return estructurar(VACIO);
  try {
    return estructurar(JSON.parse(readFileSync(RUTA, 'utf8')));
  } catch (e) {
    throw new Error(`datos/estado.json no se puede leer (${e.message}). Hay copia en estado.json.bak si existe.`);
  }
}

function estructurar(e) {
  return { ...VACIO, ...e, leads: e.leads ?? [], clientes: e.clientes ?? [], eventos: e.eventos ?? [] };
}

export function guardar(estado) {
  asegurarDir(DATOS);
  if (existsSync(RUTA)) copyFileSync(RUTA, `${RUTA}.bak`); // una copia siempre, es gratis
  writeFileSync(RUTA, JSON.stringify(estado, null, 2));
  return estado;
}

/** Carga la lista de 20 leads del paquete de contexto. No duplica los que ya están. */
export function sembrarLeads(estado) {
  if (!existsSync(SEMILLA)) return 0;
  const semilla = JSON.parse(readFileSync(SEMILLA, 'utf8'));
  let nuevos = 0;
  for (const l of semilla) {
    const id = slug(l.empresa);
    if (estado.leads.some((x) => x.id === id)) continue;
    estado.leads.push({
      id,
      empresa: l.empresa,
      web: l.web || '',
      segmento: l.segmento,
      prioridad: l.prioridad,
      sede: l.sede,
      porQue: l.porQue,
      via: l.via,
      estado: 'sin-auditar',
      fechaContacto: null,
      respuesta: null,
      notas: '',
      escaneos: [],
    });
    nuevos++;
  }
  return nuevos;
}

export function buscarLead(estado, texto) {
  const t = slug(texto);
  return estado.leads.find((l) => l.id === t)
    || estado.leads.find((l) => slug(l.empresa).includes(t) || (l.web && slug(l.web).includes(t)));
}

export function anotarEvento(estado, tipo, texto, ref = null) {
  estado.eventos.unshift({ fecha: new Date().toISOString(), tipo, texto, ref });
  estado.eventos = estado.eventos.slice(0, 500);
}

/** Escaneos guardados en disco, del más reciente al más antiguo. */
export function listarEscaneos(filtroDominio = null) {
  const dir = join(DATOS, 'escaneos');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .filter((e) => !filtroDominio || e.dominio.includes(filtroDominio) || slug(e.cliente).includes(slug(filtroDominio)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export function cargarEscaneo(id) {
  const dir = join(DATOS, 'escaneos');
  const exacto = join(dir, `${id}.json`);
  if (existsSync(exacto)) return JSON.parse(readFileSync(exacto, 'utf8'));
  const candidatos = listarEscaneos().filter((e) => e.id.startsWith(id) || e.dominio.includes(id) || slug(e.cliente).includes(slug(id)));
  if (!candidatos.length) throw new Error(`No hay ningún escaneo que corresponda a "${id}". Míralos con: agencia escaneos`);
  return candidatos[0];
}
