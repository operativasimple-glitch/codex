/**
 * Las herramientas del agente: lo único que el programa se permite hacer solo.
 *
 * Cada herramienta lleva su esquema (lo que ve Claude) y su ejecutor (lo que pasa
 * de verdad). El mismo catálogo lo usan el bucle con IA y el piloto sin IA, así que
 * los límites valen para los dos: no hay una vía rápida que se salte las reglas.
 *
 * Lo que el agente NO puede hacer, a propósito:
 *  · Enviar correos. Los deja firmados en la bandeja y los manda una persona, por el
 *    formulario del cliente o por LinkedIn. En España el correo comercial no solicitado
 *    está regulado, y un agente disparando correos solo es la forma más rápida de
 *    quemar la lista y la marca.
 *  · Dar por buena una respuesta o un cliente. Eso lo marca quien ha leído el correo.
 *  · Auditar nada fuera de la lista de leads y clientes, ni más páginas de la cuenta.
 */
import { writeFileSync, existsSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { asegurarDir, DATOS, slug, hoyISO, euros, diasDesde } from '../util.js';
import { cargar, guardar, buscarLead, anotarEvento, cargarEscaneo } from '../almacen.js';
import { auditar } from '../auditoria/motor.js';
import { generarInforme } from '../informe/generar.js';
import { redactar } from '../crm/correos.js';
import { vigilar, informeVigilancia } from '../vigilancia/monitor.js';
import { generarPanel } from '../panel/panel.js';
import { calcularAgenda, marcador, ventanaLlamadas } from './hoy.js';

/** Estados que el agente puede poner por su cuenta. El resto los pone una persona. */
const ESTADOS_PERMITIDOS = ['auditado', 'recordado', 'descartado'];

export const BITACORA = join(DATOS, 'bitacora.jsonl');

export function anotarBitacora(entrada) {
  asegurarDir(DATOS);
  appendFileSync(BITACORA, `${JSON.stringify({ fecha: new Date().toISOString(), ...entrada })}\n`);
}

export function leerBitacora(n = 20) {
  if (!existsSync(BITACORA)) return [];
  return readFileSync(BITACORA, 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean).slice(-n).reverse();
}

/** Presupuesto de una sesión: lo que el agente puede gastar sin preguntar. */
export function nuevoPresupuesto({ auditorias = 4, informes = 6, correos = 6, pasos = 24 } = {}) {
  return { auditorias, informes, correos, pasos, simulacro: false, gastado: [] };
}

const gastar = (p, clave, cuanto = 1) => {
  if (p[clave] < cuanto) return false;
  p[clave] -= cuanto;
  return true;
};

// ── Esquemas: esto es lo que ve Claude.

export const ESQUEMAS = [
  {
    name: 'ver_estado',
    description: 'Estado completo del negocio: marcador, leads por estado, clientes, últimos escaneos '
      + 'y las acciones que las reglas del plan comercial consideran pendientes. Empieza siempre por aquí.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'auditar_web',
    description: 'Rastrea la web de un lead o cliente y guarda el escaneo con sus capturas. '
      + 'Solo webs que estén en la lista de leads o de clientes. Devuelve el resumen de hallazgos.',
    input_schema: {
      type: 'object',
      properties: {
        lead: { type: 'string', description: 'Identificador o nombre del lead/cliente a auditar.' },
        paginas: { type: 'integer', description: `Páginas máximo (1-${config.rastreo.maxPaginas}).` },
      },
      required: ['lead'],
      additionalProperties: false,
    },
  },
  {
    name: 'generar_informe',
    description: 'Genera el informe de un escaneo. "diagnostico" es el gancho gratuito de dos páginas; '
      + '"completo" es la auditoría de pago, que no debe entregarse sin revisión manual hecha por una persona.',
    input_schema: {
      type: 'object',
      properties: {
        escaneo: { type: 'string', description: 'Identificador del escaneo, o el nombre del cliente.' },
        tipo: { type: 'string', enum: ['diagnostico', 'completo'] },
        pdf: { type: 'boolean' },
      },
      required: ['escaneo'],
      additionalProperties: false,
    },
  },
  {
    name: 'redactar_correo',
    description: 'Redacta el correo de un lead con los hallazgos reales de su escaneo y lo deja en la '
      + 'bandeja de salida para que una persona lo revise y lo envíe. NO envía nada.',
    input_schema: {
      type: 'object',
      properties: {
        lead: { type: 'string' },
        plantilla: { type: 'string', enum: ['agencia', 'directa', 'fintech', 'gestoria', 'red', 'recordatorio'] },
        nombre: { type: 'string', description: 'Nombre de la persona, si se conoce.' },
        cliente_suyo: { type: 'string', description: 'Para agencias web: cliente suyo cuya web se ha auditado.' },
        motivo: { type: 'string', description: 'Por qué este lead y esta plantilla, en una frase.' },
      },
      required: ['lead', 'plantilla'],
      additionalProperties: false,
    },
  },
  {
    name: 'actualizar_lead',
    description: 'Cambia el estado de un lead o le añade una nota. Estados permitidos al agente: '
      + 'auditado, recordado, descartado. "respondido", "llamada" y "cliente" los marca una persona.',
    input_schema: {
      type: 'object',
      properties: {
        lead: { type: 'string' },
        estado: { type: 'string', enum: ESTADOS_PERMITIDOS },
        nota: { type: 'string' },
      },
      required: ['lead'],
      additionalProperties: false,
    },
  },
  {
    name: 'vigilar_cliente',
    description: 'Reescanea a un cliente de vigilancia mensual, lo compara con su escaneo anterior y '
      + 'genera el informe corto con las regresiones. Es lo que sostiene la cuota recurrente.',
    input_schema: {
      type: 'object',
      properties: { cliente: { type: 'string' } },
      required: ['cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'generar_panel',
    description: 'Regenera el panel HTML del negocio. Hazlo al final de la sesión.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'anotar',
    description: 'Deja una nota en la bitácora para la persona que lea el resumen: algo que has visto, '
      + 'una decisión que no te corresponde, o un aviso.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string' } },
      required: ['texto'],
      additionalProperties: false,
    },
  },
];

// ── Ejecutores: lo que pasa de verdad.

const BANDEJA = join(DATOS, 'bandeja');

/** Localiza un lead o un cliente por nombre aproximado, y devuelve su web. */
function objetivo(clave) {
  const estado = cargar();
  const lead = buscarLead(estado, clave);
  if (lead) return { estado, lead, nombre: lead.empresa, web: lead.web };
  const cliente = estado.clientes.find((c) => slug(c.nombre).includes(slug(clave)));
  if (cliente) return { estado, cliente, nombre: cliente.nombre, web: cliente.web };
  return { estado };
}

const EJECUTORES = {
  async ver_estado() {
    const { estado, escaneos, acciones } = calcularAgenda();
    const m = marcador(estado, escaneos);
    const v = ventanaLlamadas();
    const porEstado = {};
    for (const l of estado.leads) (porEstado[l.estado] ??= []).push(l.empresa);

    return [
      `Día ${m.dias} de los 90. Quedan ${m.restantes}.`,
      `Hora en España: ${v.horaEspana}. Ventana de llamadas ${v.abierta ? 'ABIERTA' : 'cerrada'}.`,
      `Marcador: ${m.leads} leads · ${m.auditados} auditados · ${m.contactados} contactados · `
        + `${m.respuestas} respuestas (${m.tasaRespuesta} %) · ${m.clientes} clientes · ${euros(m.mrr)}/mes recurrente.`,
      '',
      'Leads por estado:',
      ...Object.entries(porEstado).map(([e, empresas]) => `  ${e} (${empresas.length}): ${empresas.slice(0, 8).join(', ')}`),
      '',
      'Clientes:',
      ...(estado.clientes.length
        ? estado.clientes.map((c) => `  ${c.nombre} · ${c.plan} · ${euros(c.cuota)}/mes · último escaneo hace ${diasDesde(c.ultimoEscaneo)} días`)
        : ['  (ninguno)']),
      '',
      'Escaneos recientes:',
      ...(escaneos.length
        ? escaneos.slice(0, 6).map((e) => `  ${e.id} · ${e.cliente} · ${e.totales.incidencias} incidencias · ${e.manual ? 'con revisión manual' : 'SIN revisión manual'}`)
        : ['  (ninguno)']),
      '',
      'Acciones que las reglas del plan consideran pendientes, por orden:',
      ...(acciones.length ? acciones.map((a, i) => `  ${i + 1}. ${a.titulo} — ${a.porque}`) : ['  (ninguna)']),
    ].join('\n');
  },

  async auditar_web({ lead: clave, paginas }, presupuesto) {
    const { lead, cliente, nombre, web } = objetivo(clave);
    if (!nombre) return `No hay ningún lead ni cliente que se llame "${clave}". Mira ver_estado.`;
    if (!web || web.startsWith('[')) {
      return `${nombre} no tiene web anotada (o es un hueco por rellenar). No se puede auditar: `
        + 'déjalo en una nota para que lo complete una persona.';
    }
    if (!gastar(presupuesto, 'auditorias')) return 'Se ha agotado el presupuesto de auditorías de esta sesión.';
    if (presupuesto.simulacro) return `SIMULACRO: auditaría ${nombre} (${web}).`;

    const escaneo = await auditar(web, {
      paginas: Math.min(paginas || config.rastreo.maxPaginas, config.rastreo.maxPaginas),
      cliente: nombre,
    });

    const estado = cargar();
    const l = lead && buscarLead(estado, lead.id);
    if (l) {
      l.escaneos = [...new Set([...(l.escaneos || []), escaneo.id])];
      if (l.estado === 'sin-auditar') l.estado = 'auditado';
    }
    const c = cliente && estado.clientes.find((x) => slug(x.nombre) === slug(cliente.nombre));
    if (c) c.ultimoEscaneo = escaneo.fecha;
    anotarEvento(estado, 'auditoria', `Auditada ${nombre}: ${escaneo.totales.incidencias} incidencias`, escaneo.id);
    guardar(estado);
    presupuesto.gastado.push(`auditoría de ${nombre}`);

    return [
      `Escaneo ${escaneo.id} de ${nombre} (${escaneo.dominio}).`,
      `${escaneo.totales.paginas} páginas · ${escaneo.totales.incidencias} incidencias · semáforo ${escaneo.semaforo}.`,
      `Corrección estimada: ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h (${euros(escaneo.totales.costeCorreccion)}).`,
      'Hallazgos por gravedad:',
      ...escaneo.hallazgos.map((h) => `  ${h.gravedad}: ${h.titulo} · ${h.incidencias} casos · WCAG ${h.criterio}${h.aMano ? ' · exige confirmación humana' : ''}`),
    ].join('\n');
  },

  async generar_informe({ escaneo: clave, tipo = 'diagnostico', pdf = true }, presupuesto) {
    let escaneo;
    try { escaneo = cargarEscaneo(clave); } catch (e) { return e.message; }
    if (tipo === 'completo' && !escaneo.manual) {
      return `El escaneo ${escaneo.id} no tiene revisión manual. El informe completo es el entregable de pago `
        + 'y no puede salir sin ella: genera el diagnóstico y deja anotado que falta la revisión manual.';
    }
    if (!gastar(presupuesto, 'informes')) return 'Se ha agotado el presupuesto de informes de esta sesión.';
    if (presupuesto.simulacro) return `SIMULACRO: generaría el informe ${tipo} de ${escaneo.cliente}.`;

    const r = await generarInforme(escaneo, { tipo, pdf });
    presupuesto.gastado.push(`informe ${tipo} de ${escaneo.cliente}`);
    return `Informe ${tipo} de ${escaneo.cliente} generado: ${r.html}${r.pdf ? ` y ${r.pdf}` : ''}.`;
  },

  async redactar_correo({ lead: clave, plantilla, nombre, cliente_suyo, motivo }, presupuesto) {
    const { estado, lead } = objetivo(clave);
    if (!lead) return `No hay ningún lead que se llame "${clave}".`;
    const idEscaneo = lead.escaneos?.at(-1);
    if (!idEscaneo) return `${lead.empresa} no tiene escaneo. La regla es no escribir a nadie sin haber auditado antes su web: audítala primero.`;
    if (!gastar(presupuesto, 'correos')) return 'Se ha agotado el presupuesto de correos de esta sesión.';

    const escaneo = cargarEscaneo(idEscaneo);
    let correo;
    try {
      correo = redactar(plantilla, { lead, escaneo, nombre: nombre || '[nombre]', clienteSuyo: cliente_suyo || null });
    } catch (e) { return e.message; }
    if (presupuesto.simulacro) return `SIMULACRO: dejaría en la bandeja el correo "${plantilla}" para ${lead.empresa}.`;

    const id = `${slug(lead.empresa)}-${plantilla}-${hoyISO()}`;
    const ruta = join(asegurarDir(BANDEJA), `${id}.json`);
    writeFileSync(ruta, JSON.stringify({
      id,
      lead: lead.id,
      empresa: lead.empresa,
      via: lead.via,
      plantilla,
      motivo: motivo || '',
      escaneo: escaneo.id,
      asunto: correo.asunto,
      cuerpo: correo.cuerpo,
      creado: new Date().toISOString(),
      enviado: null,
    }, null, 2));

    anotarEvento(estado, 'bandeja', `Correo "${plantilla}" preparado para ${lead.empresa}`, id);
    guardar(estado);
    presupuesto.gastado.push(`correo para ${lead.empresa}`);
    return `Correo "${plantilla}" para ${lead.empresa} guardado en la bandeja como ${id}. `
      + `Lo revisa y lo envía una persona (vía: ${lead.via || 'formulario de su web'}). El lead sigue en estado "${lead.estado}".`;
  },

  async actualizar_lead({ lead: clave, estado: nuevo, nota }, presupuesto) {
    const { estado, lead } = objetivo(clave);
    if (!lead) return `No hay ningún lead que se llame "${clave}".`;
    if (nuevo && !ESTADOS_PERMITIDOS.includes(nuevo)) {
      return `El agente no puede poner el estado "${nuevo}". Solo: ${ESTADOS_PERMITIDOS.join(', ')}. `
        + 'Los demás los marca una persona.';
    }
    if (presupuesto.simulacro) return `SIMULACRO: pondría ${lead.empresa} en "${nuevo || lead.estado}".`;
    if (nuevo) {
      lead.estado = nuevo;
      if (nuevo === 'recordado') lead.fechaRecordatorio = new Date().toISOString();
      anotarEvento(estado, 'lead', `${lead.empresa} → ${nuevo} (agente)`, lead.id);
    }
    if (nota) lead.notas = [lead.notas, nota].filter(Boolean).join(' · ');
    guardar(estado);
    return `${lead.empresa}: estado "${lead.estado}"${nota ? `, nota añadida` : ''}.`;
  },

  async vigilar_cliente({ cliente: clave }, presupuesto) {
    const { estado, cliente } = objetivo(clave);
    if (!cliente) return `"${clave}" no es un cliente. Los clientes salen en ver_estado.`;
    if (!gastar(presupuesto, 'auditorias')) return 'Se ha agotado el presupuesto de escaneos de esta sesión.';
    if (presupuesto.simulacro) return `SIMULACRO: reescanearía a ${cliente.nombre}.`;

    const { actual, anterior, comparacion } = await vigilar(cliente.nombre, {});
    const c = estado.clientes.find((x) => slug(x.nombre) === slug(cliente.nombre));
    if (c) c.ultimoEscaneo = actual.fecha;
    guardar(estado);
    presupuesto.gastado.push(`vigilancia de ${cliente.nombre}`);

    if (!comparacion) return `Primer escaneo de ${cliente.nombre} (${actual.id}): no hay con qué comparar todavía.`;
    const ruta = informeVigilancia(actual, anterior, comparacion);
    return [
      `Vigilancia de ${cliente.nombre}: ${comparacion.regresiones.length} regresión(es), `
        + `saldo ${comparacion.saldoIncidencias >= 0 ? '+' : ''}${comparacion.saldoIncidencias} incidencias.`,
      ...comparacion.nuevos.map((h) => `  NUEVO ${h.titulo} (${h.incidencias})`),
      ...comparacion.empeorados.map((h) => `  MÁS CASOS ${h.titulo}: ${h.antes} → ${h.incidencias}`),
      ...comparacion.resueltos.map((h) => `  RESUELTO ${h.titulo}`),
      `Informe: ${ruta}`,
      comparacion.hayRegresionGrave ? 'Hay regresión grave: avisa en la bitácora, esto es lo que paga el cliente.' : '',
    ].filter(Boolean).join('\n');
  },

  async generar_panel(_args, presupuesto) {
    if (presupuesto.simulacro) return 'SIMULACRO: regeneraría el panel.';
    return `Panel regenerado: ${generarPanel()}`;
  },

  async anotar({ texto }) {
    anotarBitacora({ tipo: 'nota', texto });
    return 'Nota guardada en la bitácora.';
  },
};

/** Ejecuta una herramienta con su presupuesto y la deja registrada en la bitácora. */
export async function ejecutar(nombre, argumentos, presupuesto) {
  const fn = EJECUTORES[nombre];
  if (!fn) return `Herramienta desconocida: ${nombre}`;
  if (presupuesto.pasos-- <= 0) return 'Se han agotado los pasos de esta sesión. Cierra con un resumen.';
  try {
    const salida = await fn(argumentos || {}, presupuesto);
    if (nombre !== 'anotar') anotarBitacora({ tipo: 'herramienta', nombre, argumentos, resultado: salida.slice(0, 400) });
    return salida;
  } catch (e) {
    const fallo = `Error ejecutando ${nombre}: ${e.message.split('\n')[0]}`;
    anotarBitacora({ tipo: 'error', nombre, argumentos, resultado: fallo });
    return fallo;
  }
}

/** Correos preparados y pendientes de que una persona los envíe. */
export function bandeja({ soloPendientes = true } = {}) {
  if (!existsSync(BANDEJA)) return [];
  return readdirSync(BANDEJA).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(BANDEJA, f), 'utf8')))
    .filter((c) => !soloPendientes || !c.enviado)
    .sort((a, b) => b.creado.localeCompare(a.creado));
}

export function marcarEnviado(id) {
  const ruta = join(BANDEJA, `${id}.json`);
  if (!existsSync(ruta)) throw new Error(`No hay ningún correo "${id}" en la bandeja.`);
  const correo = JSON.parse(readFileSync(ruta, 'utf8'));
  correo.enviado = new Date().toISOString();
  writeFileSync(ruta, JSON.stringify(correo, null, 2));

  const estado = cargar();
  const lead = buscarLead(estado, correo.lead);
  if (lead) {
    lead.estado = correo.plantilla === 'recordatorio' ? 'recordado' : 'contactado';
    if (lead.estado === 'contactado') lead.fechaContacto = new Date().toISOString();
    else lead.fechaRecordatorio = new Date().toISOString();
    anotarEvento(estado, 'correo', `Enviado a ${lead.empresa} (${correo.plantilla})`, correo.id);
    guardar(estado);
  }
  anotarBitacora({ tipo: 'envio', texto: `Enviado el correo ${id}` });
  return { correo, lead };
}
