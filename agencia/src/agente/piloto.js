/**
 * Piloto automático sin IA.
 *
 * Ejecuta por su cuenta las acciones que las reglas del plan comercial consideran
 * pendientes: audita la siguiente web, saca el diagnóstico y deja el correo escrito
 * en la bandeja. Es determinista y no cuesta nada; es lo que corre a diario.
 *
 * Cuando hay clave de API, el mismo trabajo lo dirige Claude (autonomo.js), que
 * decide el orden y redacta mejor. Las dos vías usan las mismas herramientas y los
 * mismos límites: ninguna envía correos ni marca clientes.
 */
import { config } from '../config.js';
import { col } from '../util.js';
import { calcularAgenda } from './hoy.js';
import { cargar } from '../almacen.js';
import { necesitaLeads, porContactar } from '../crm/cantera.js';
import { ejecutar, anotarBitacora } from './herramientas.js';

/** Plantilla de correo que le toca a un lead por su segmento. */
export function plantillaPara(segmento = '') {
  if (/agencia/i.test(segmento)) return 'agencia';
  if (/gestor|despacho|asesor/i.test(segmento)) return 'gestoria';
  if (/red directa/i.test(segmento)) return 'red';
  if (/fintech|trading|prop/i.test(segmento)) return 'fintech';
  return 'directa';
}

export async function correrPiloto(presupuesto, { registrar = console.log, limite } = {}) {
  const hechas = [];

  // Antes de nada: si la lista se ha quedado corta, se repone. Es lo primero
  // porque todo lo demás depende de tener a quién escribir.
  const estadoPrevio = cargar();
  if (necesitaLeads(estadoPrevio)) {
    registrar(`${col.azul('→')} Quedan ${porContactar(estadoPrevio).length} leads por contactar: buscando más`);
    const salidaLeads = await ejecutar('buscar_leads', {}, presupuesto);
    registrar(col.gris(sangrar(salidaLeads)));
  }

  const { estado, acciones } = calcularAgenda(limite ? { limite } : {});

  const ejecutables = acciones.filter((a) => a.herramienta);
  const humanas = acciones.filter((a) => !a.herramienta);

  const fallidas = [];
  for (const accion of ejecutables) {
    if (presupuesto.pasos <= 1) break;
    registrar(`${col.azul('→')} ${accion.titulo}`);
    const salida = await ejecutar(accion.herramienta.nombre, accion.herramienta.argumentos, presupuesto);
    registrar(col.gris(sangrar(salida)));

    // Sin presupuesto no tiene sentido seguir recorriendo la lista: se corta aquí
    // y lo que quede se hará en la siguiente sesión.
    if (sinPresupuesto(salida)) { registrar(col.ambar('   (presupuesto agotado: se corta la sesión)')); break; }
    if (fracaso(salida)) { fallidas.push({ accion: accion.titulo, salida }); continue; }
    hechas.push({ accion: accion.titulo, salida });

    // Auditar por auditar no sirve de nada: la cadena completa es
    // auditar → diagnóstico → correo escrito y esperando en la bandeja.
    // Solo se encadena sobre una auditoría que de verdad ha salido bien.
    if (accion.cadena === 'diagnostico-y-correo' && /^Escaneo /.test(salida)) {
      const lead = estado.leads.find((l) => l.id === accion.herramienta.argumentos.lead);
      const informe = await ejecutar('generar_informe',
        { escaneo: lead.empresa, tipo: 'diagnostico', pdf: true }, presupuesto);
      registrar(col.gris(sangrar(informe)));
      hechas.push({ accion: `Diagnóstico de ${lead.empresa}`, salida: informe });

      const correo = await ejecutar('redactar_correo', {
        lead: lead.id,
        plantilla: plantillaPara(lead.segmento),
        motivo: 'Cadena automática: auditada la web, diagnóstico generado y correo preparado.',
      }, presupuesto);
      registrar(col.gris(sangrar(correo)));
      hechas.push({ accion: `Correo para ${lead.empresa}`, salida: correo });
    }
  }

  if (!presupuesto.simulacro) await ejecutar('generar_panel', {}, presupuesto);

  const resumen = redactarResumen(hechas, fallidas, humanas, presupuesto);
  anotarBitacora({ tipo: 'sesion', modo: 'piloto', hechas: hechas.length, fallidas: fallidas.length, resumen });
  return { hechas, fallidas, humanas, resumen };
}

const sangrar = (t) => String(t).split('\n').map((l) => `   ${l}`).join('\n');
const sinPresupuesto = (s) => /agotad[oa] (el presupuesto|los pasos)/i.test(s);
const fracaso = (s) => /^(Error|No hay|No se|El agente no puede|El escaneo)/.test(s);

function redactarResumen(hechas, fallidas, humanas, presupuesto) {
  const lineas = [];
  lineas.push(hechas.length
    ? `Sesión automática: ${hechas.length} acción(es) ejecutada(s).`
    : 'Sesión automática: no había nada pendiente que el programa pueda hacer solo.');
  if (presupuesto.gastado.length) lineas.push(`Hecho: ${presupuesto.gastado.join(', ')}.`);
  if (fallidas.length) {
    lineas.push('No ha salido:');
    for (const f of fallidas) lineas.push(`  · ${f.accion} — ${f.salida.split('\n')[0]}`);
  }
  if (humanas.length) {
    lineas.push('Pendiente de una persona:');
    for (const h of humanas) lineas.push(`  · ${h.titulo} — ${h.porque}`);
  }
  lineas.push(`Marca ${config.marca}: los correos quedan en la bandeja; nada se ha enviado.`);
  return lineas.join('\n');
}
