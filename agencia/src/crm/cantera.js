/**
 * La cantera: de dónde salen los leads nuevos cuando la lista se queda corta.
 *
 * El plan comercial dice que el cuello de botella no es la capacidad de auditar,
 * es tener a quién escribir. Así que cuando quedan menos de cinco por contactar,
 * el programa repone solo.
 *
 * Tres fuentes, por orden:
 *  1. `datos/cantera.json` — candidatos que has ido apuntando tú. Se gastan primero.
 *  2. Claude, si hay clave de API: propone empresas del segmento que falte.
 *  3. Si no hay ninguna de las dos, se avisa y lo rellenas a mano desde la aplicación.
 *
 * Y una regla que hace inofensivo que un modelo se invente una empresa: **ningún
 * candidato entra en la lista sin que su web responda de verdad**. Se comprueba
 * cargándola antes de darla por buena. Lo que no responde, se descarta y no se ve.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS, slug, hostDe } from '../util.js';
import { obtenerCliente, MODELO_AGENTE } from '../agente/ia.js';

export const UMBRAL = 5;          // por debajo de esto, se repone
export const REPOSICION = 8;      // cuántos se intentan traer cada vez

const RUTA_CANTERA = join(DATOS, 'cantera.json');

/** Leads que todavía se pueden trabajar: ni contactados, ni cerrados. */
export function porContactar(estado) {
  return estado.leads.filter((l) => ['sin-auditar', 'auditado'].includes(l.estado)
    && l.web && !l.empresa.startsWith('['));
}

export function necesitaLeads(estado, umbral = UMBRAL) {
  return porContactar(estado).length < umbral;
}

export function leerCantera() {
  if (!existsSync(RUTA_CANTERA)) return [];
  try { return JSON.parse(readFileSync(RUTA_CANTERA, 'utf8')); } catch { return []; }
}

export function guardarCantera(lista) {
  writeFileSync(RUTA_CANTERA, JSON.stringify(lista, null, 2));
}

/**
 * ¿Responde esta web? Es la verificación que separa un lead real de un nombre
 * inventado. Se prueba https y, si no, http: hay pymes que aún no han migrado.
 */
export async function verificarWeb(web) {
  // Se conserva el puerto si lo trae (hace falta para probar en local); hostDe lo quita.
  const destino = String(web).trim().replace(/^https?:\/\//i, '').split('/')[0].split('?')[0];
  if (!hostDe(web).includes('.')) return { ok: false, motivo: 'no parece un dominio' };
  for (const esquema of ['https', 'http']) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 9000);
    try {
      const r = await fetch(`${esquema}://${destino}`, {
        redirect: 'follow',
        signal: control.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuditoriaAccesibilidad/1.0)' },
      });
      clearTimeout(reloj);
      if (r.ok) return { ok: true, url: r.url };
      if (r.status < 500) return { ok: false, motivo: `HTTP ${r.status}` };
    } catch (e) {
      clearTimeout(reloj);
      if (esquema === 'http') return { ok: false, motivo: enCristiano(e) };
    }
  }
  return { ok: false, motivo: 'no responde' };
}

/** El fallo de red, dicho como se lo contarías a alguien. */
function enCristiano(e) {
  const causa = e?.cause?.code || e?.code || '';
  if (e?.name === 'AbortError') return 'tarda demasiado en responder';
  if (causa === 'ENOTFOUND' || causa === 'EAI_AGAIN') return 'ese dominio no existe';
  if (causa === 'ECONNREFUSED') return 'el servidor rechaza la conexión';
  if (String(causa).startsWith('CERT') || String(causa).includes('SSL')) return 'su certificado está roto';
  return 'no responde';
}

/** Pide candidatos a Claude. Devuelve [] si no hay clave o si contesta cualquier cosa. */
export async function proponerConIA(estado, cuantos = REPOSICION) {
  const cliente = await obtenerCliente();
  if (!cliente) return [];

  // Se le dice qué hay ya, para que no repita, y qué segmento está funcionando.
  const yaEstan = estado.leads.map((l) => `${l.empresa} (${l.web})`).join(', ');
  const porSegmento = {};
  for (const l of estado.leads) {
    if (['contactado', 'recordado', 'respondido', 'llamada', 'cliente'].includes(l.estado)) {
      porSegmento[l.segmento] = (porSegmento[l.segmento] || 0) + 1;
    }
  }

  const prompt = `Necesito ${cuantos} empresas españolas nuevas para una lista de posibles clientes
de auditoría de accesibilidad web (Ley 11/2023).

Perfiles que valen, por orden de interés:
1. Agencias web y de comercio electrónico españolas con cartera de clientes (WordPress, PrestaShop,
   Shopify, Magento). Son las que más rinden: una agencia son decenas de webs.
2. Gestorías y despachos que ya asesoran a pymes en protección de datos.
3. Prop firms, brókers y herramientas de trading que venden a consumidores europeos.
4. Pymes españolas con tienda online de más de 10 empleados (las micro están exentas).

Ya están en la lista, no los repitas: ${yaEstan}

Devuelve SOLO un array JSON, sin texto alrededor, con este formato exacto:
[{"empresa":"Nombre real","web":"dominio.es","segmento":"Agencia web","sede":"Ciudad","porQue":"una frase de por qué es buen lead"}]

Reglas: empresas que existan de verdad y cuyo dominio conozcas. Si dudas de un dominio, no lo
incluyas: es mejor devolver cuatro seguros que ocho inventados. Nada de grandes multinacionales
ni de administraciones públicas.`;

  try {
    const r = await cliente.messages.create({
      model: MODELO_AGENTE,
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    });
    const texto = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const bruto = texto.slice(texto.indexOf('['), texto.lastIndexOf(']') + 1);
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((c) => c?.empresa && c?.web) : [];
  } catch {
    return [];
  }
}

/**
 * Repone la lista: coge candidatos, comprueba que sus webs responden y añade los
 * que pasan. Devuelve el parte de lo que ha entrado y lo que se ha caído.
 */
export async function reponer(estado, { cuantos = REPOSICION, registrar = () => {} } = {}) {
  const candidatos = [];
  const cantera = leerCantera();

  if (cantera.length) {
    registrar(`Cantera propia: ${cantera.length} candidatos apuntados.`);
    candidatos.push(...cantera.splice(0, cuantos));
    guardarCantera(cantera);
  }

  if (candidatos.length < cuantos) {
    const conIA = await proponerConIA(estado, cuantos - candidatos.length);
    if (conIA.length) registrar(`Claude propone ${conIA.length} empresas. Se comprueba una a una.`);
    candidatos.push(...conIA);
  }

  if (!candidatos.length) {
    registrar('No hay de dónde sacar leads: ni cantera propia ni clave de API.');
    return { anadidos: [], descartados: [], sinFuente: true };
  }

  const anadidos = [];
  const descartados = [];
  for (const c of candidatos) {
    const id = slug(c.empresa);
    if (estado.leads.some((l) => l.id === id || (l.web && hostDe(l.web) === hostDe(c.web)))) {
      descartados.push({ ...c, motivo: 'ya estaba en la lista' });
      continue;
    }
    const v = await verificarWeb(c.web);
    if (!v.ok) {
      registrar(`  ✗ ${c.empresa} (${c.web}) — ${v.motivo}`);
      descartados.push({ ...c, motivo: v.motivo });
      continue;
    }
    registrar(`  ✓ ${c.empresa} (${c.web})`);
    const lead = {
      id,
      empresa: c.empresa,
      web: hostDe(c.web),
      segmento: c.segmento || 'Empresa',
      prioridad: /agencia/i.test(c.segmento || '') ? 1 : 2,
      sede: c.sede || '',
      porQue: c.porQue || '',
      via: c.via || 'Formulario de contacto de su web',
      estado: 'sin-auditar',
      fechaContacto: null,
      respuesta: null,
      notas: '',
      escaneos: [],
      origen: c.origen || 'cantera',
      verificado: new Date().toISOString(),
    };
    estado.leads.push(lead);
    anadidos.push(lead);
  }

  return { anadidos, descartados, sinFuente: false };
}

/**
 * Añade leads escritos a mano. Acepta "Empresa, web.es, Segmento, Ciudad" por línea,
 * o solo el dominio. Verifica igual que los demás: nada entra sin responder.
 */
export async function anadirManual(estado, texto, { registrar = () => {} } = {}) {
  const candidatos = String(texto).split('\n').map((l) => l.trim()).filter(Boolean).map((linea) => {
    const partes = linea.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
    const web = partes.find((p) => /\.[a-z]{2,}/i.test(p) && !p.includes(' ')) || '';
    const empresa = partes.find((p) => p !== web) || hostDe(web).split('.')[0];
    const resto = partes.filter((p) => p !== web && p !== empresa);
    return { empresa, web, segmento: resto[0] || 'Empresa', sede: resto[1] || '', origen: 'a mano' };
  }).filter((c) => c.web);

  if (!candidatos.length) return { anadidos: [], descartados: [], sinFuente: true };
  guardarCantera([...leerCantera(), ...candidatos]);
  return reponer(estado, { cuantos: candidatos.length, registrar });
}
