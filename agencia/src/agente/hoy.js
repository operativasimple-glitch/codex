/**
 * "Qué toca hoy": el agente que dirige la agencia.
 *
 * Mira el estado real (leads, escaneos, clientes, fechas) y decide las próximas
 * acciones, en orden, con el comando exacto para ejecutarlas. Está escrito contra
 * las reglas del plan comercial, no contra una intuición:
 *
 *  · Nunca escribir a nadie sin haber auditado antes su web.
 *  · Un solo recordatorio a los 7 días. Después se deja.
 *  · Responder en menos de una hora durante las dos primeras semanas.
 *  · Las videollamadas, solo de 8:00 a 11:00 de Misuri (15:00-18:00 en España).
 *  · A los 90 días, con dos clientes pagando esto sigue; con cero, se cierra.
 */
import { config } from '../config.js';
import { cargar, listarEscaneos } from '../almacen.js';
import { porContactar, UMBRAL } from '../crm/cantera.js';
import { diasDesde, col, titulo, euros, mismoDominio } from '../util.js';

const MAX_ACCIONES = 6;

/** Corta un texto largo sin dejarlo a medias de una palabra. */
const recortar = (texto, largo) => {
  const t = String(texto || '').trim();
  if (t.length <= largo) return t;
  return t.slice(0, t.lastIndexOf(' ', largo)) + '…';
};

export function calcularAgenda({ limite = MAX_ACCIONES } = {}) {
  const estado = cargar();
  const escaneos = listarEscaneos();
  const acciones = [];
  const empujar = (a) => acciones.push(a);


  // 1 · Respuestas sin atender. Es lo único que rompe cualquier otra prioridad.
  for (const l of estado.leads.filter((x) => x.estado === 'respondido')) {
    empujar({
      prioridad: 0,
      titulo: `Contestar a ${l.empresa} — respondió hace ${diasDesde(l.fechaRespuesta || l.fechaContacto)} días`,
      porque: 'La regla es responder en menos de una hora. Una respuesta que se enfría no vuelve.',
      comando: `agencia lead ${l.id} --estado llamada`,
      herramienta: null, // lo contesta una persona: el agente no escribe a nadie por su cuenta
    });
  }

  // 1.5 · La lista se está quedando sin gente a la que escribir. Es el cuello de
  // botella real del negocio: sin leads no hay auditorías ni correos que mandar.
  const quedan = porContactar(estado).length;
  if (quedan < UMBRAL) {
    empujar({
      prioridad: 0.8,
      titulo: `Quedan ${quedan} leads por contactar`,
      porque: `Por debajo de ${UMBRAL} la máquina se para: sin lista no hay a quién auditar ni a quién escribir.`,
      comando: 'agencia leads --buscar',
      herramienta: { nombre: 'buscar_leads', argumentos: {} },
    });
  }

  // 2 · Leads de prioridad 1 sin auditar: sin hallazgo no hay correo.
  const sinAuditar = estado.leads
    .filter((l) => l.estado === 'sin-auditar' && l.web && !l.empresa.startsWith('['))
    .sort((a, b) => a.prioridad - b.prioridad);
  for (const l of sinAuditar.slice(0, Math.max(3, limite))) {
    empujar({
      prioridad: 1 + (l.prioridad - 1) * 0.1,
      titulo: `Auditar ${l.empresa} (${l.web})`,
      porque: `${l.segmento} · ${recortar(l.porQue, 150)}`,
      comando: `agencia auditar ${l.web} --cliente "${l.empresa}"`,
      herramienta: { nombre: 'auditar_web', argumentos: { lead: l.id } },
      cadena: 'diagnostico-y-correo',
    });
  }

  // 3 · Auditados sin contactar: el correo ya se puede escribir con datos reales.
  for (const l of estado.leads.filter((x) => x.estado === 'auditado')) {
    const plantilla = { 'Agencia web': 'agencia', 'Gestoría': 'gestoria', 'Red directa': 'red' }[l.segmento]
      || (/fintech|trading|prop/i.test(l.segmento) ? 'fintech' : 'directa');
    empujar({
      prioridad: 2,
      titulo: `Escribir a ${l.empresa} con los hallazgos`,
      porque: `Auditada y sin contactar. Plantilla "${plantilla}". Mándalo por su formulario o LinkedIn.`,
      comando: `agencia correo ${l.id} --plantilla ${plantilla}`,
      herramienta: { nombre: 'redactar_correo', argumentos: { lead: l.id, plantilla } },
    });
  }

  // 4 · Recordatorio único a los 7 días.
  for (const l of estado.leads.filter((x) => x.estado === 'contactado' && diasDesde(x.fechaContacto) >= 7)) {
    empujar({
      prioridad: 3,
      titulo: `Recordatorio a ${l.empresa} (${diasDesde(l.fechaContacto)} días sin respuesta)`,
      porque: 'Un solo recordatorio. Si tampoco contesta, se deja y no se insiste más.',
      comando: `agencia correo ${l.id} --plantilla recordatorio`,
      herramienta: { nombre: 'redactar_correo', argumentos: { lead: l.id, plantilla: 'recordatorio' } },
    });
  }

  // 5 · Cerrar los que ya no van a contestar, para no arrastrar lista muerta.
  for (const l of estado.leads.filter((x) => x.estado === 'recordado' && diasDesde(x.fechaRecordatorio) >= 10)) {
    empujar({
      prioridad: 4,
      titulo: `Cerrar ${l.empresa} como descartado`,
      porque: 'Recordatorio enviado hace más de 10 días sin respuesta. La lista limpia se trabaja mejor.',
      comando: `agencia lead ${l.id} --estado descartado`,
      herramienta: { nombre: 'actualizar_lead', argumentos: { lead: l.id, estado: 'descartado', nota: 'Sin respuesta tras el recordatorio.' } },
    });
  }

  // 6 · Vigilancia mensual vencida: es la cuota recurrente, no se descuida.
  for (const c of estado.clientes.filter((x) => x.plan === 'vigilancia')) {
    const dias = diasDesde(c.ultimoEscaneo);
    if (dias >= 28) {
      empujar({
        prioridad: 0.5,
        titulo: `Vigilancia vencida de ${c.nombre} (${dias} días)`,
        porque: `Cliente de ${euros(c.cuota)}/mes. El reescaneo es lo que está pagando.`,
        comando: `agencia vigilar "${c.nombre}"`,
        herramienta: { nombre: 'vigilar_cliente', argumentos: { cliente: c.nombre } },
      });
    }
  }

  // 7 · Escaneos sin revisión manual: la parte que se cobra.
  for (const e of escaneos.filter((x) => !x.manual).slice(0, 2)) {
    const lead = estado.leads.find((l) => l.escaneos?.includes(e.id));
    if (lead && ['cliente', 'llamada'].includes(lead.estado)) {
      empujar({
        prioridad: 1.5,
        titulo: `Revisión manual pendiente de ${e.cliente}`,
        porque: 'Las herramientas cubren el 57 %. El 43 % manual es lo que justifica los 1.200 €.',
        comando: `agencia manual ${e.id}`,
        herramienta: null, // teclado y lector de pantalla: no lo puede hacer una máquina
      });
    }
  }

  return { estado, escaneos, acciones: acciones.sort((a, b) => a.prioridad - b.prioridad).slice(0, limite) };
}

/** Marcador del negocio: dónde está respecto al objetivo y al plazo de 90 días. */
export function marcador(estado, escaneos) {
  const cuenta = (e) => estado.leads.filter((l) => l.estado === e).length;
  const contactados = estado.leads.filter((l) => ['contactado', 'recordado', 'respondido', 'llamada', 'cliente'].includes(l.estado)).length;
  const respuestas = estado.leads.filter((l) => ['respondido', 'llamada', 'cliente'].includes(l.estado)).length;
  const clientes = estado.clientes.length;
  const mrr = estado.clientes.reduce((s, c) => s + (c.plan === 'vigilancia' ? c.cuota || 0 : 0), 0);
  const dias = diasDesde(estado.creado);
  return {
    dias, restantes: Math.max(0, 90 - dias),
    leads: estado.leads.length,
    auditados: escaneos.length,
    contactados, respuestas, clientes, mrr,
    tasaRespuesta: contactados ? Math.round((respuestas / contactados) * 100) : 0,
    sinAuditar: cuenta('sin-auditar'),
    objetivoCumplido: clientes >= 2,
  };
}

/** ¿Estamos dentro de la ventana en la que se puede llamar a España? */
export function ventanaLlamadas() {
  const ahoraEspana = new Date(new Date().toLocaleString('en-US', { timeZone: config.zonaCliente }));
  const h = ahoraEspana.getHours();
  const { desde, hasta } = config.ventanaLlamadasEspana;
  const finde = [0, 6].includes(ahoraEspana.getDay());
  return {
    horaEspana: ahoraEspana.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    abierta: !finde && h >= desde && h < hasta,
    finde,
  };
}

export function imprimirHoy() {
  const { estado, escaneos, acciones } = calcularAgenda();
  const m = marcador(estado, escaneos);
  const v = ventanaLlamadas();

  titulo(`${config.marca} · qué toca hoy`);
  console.log(`${col.gris('Día')} ${m.dias} ${col.gris(`de 90 · quedan ${m.restantes}`)}   `
    + `${col.gris('En España son las')} ${v.horaEspana} ${v.abierta ? col.verde('· ventana de llamadas ABIERTA') : col.gris('· fuera de la ventana de llamadas')}`);
  console.log(`${col.gris('Leads')} ${m.leads}  ${col.gris('Auditados')} ${m.auditados}  `
    + `${col.gris('Contactados')} ${m.contactados}  ${col.gris('Respuestas')} ${m.respuestas} (${m.tasaRespuesta} %)  `
    + `${col.gris('Clientes')} ${m.clientes}  ${col.gris('Recurrente')} ${euros(m.mrr)}/mes`);

  if (!acciones.length) {
    console.log(`\n${col.ambar('No hay ninguna acción pendiente.')}`);
    console.log(col.gris('Si la lista está vacía y no hay clientes, el cuello de botella son los leads:'));
    console.log(col.gris('  agencia leads --sembrar     carga los 20 del paquete de contexto'));
    return;
  }

  console.log('');
  acciones.forEach((a, i) => {
    console.log(`${col.neg(`${i + 1}. ${a.titulo}`)}`);
    console.log(`   ${col.gris(a.porque)}`);
    console.log(`   ${col.azul(a.comando)}\n`);
  });

  // El aviso de los 90 días. Estaba en el plan y es la parte que nadie se dice solo.
  if (m.dias >= 90) {
    console.log(m.objetivoCumplido
      ? col.verde('Han pasado 90 días y hay dos clientes o más: esto es un negocio. Toca enseñarlo.')
      : col.rojo('Han pasado 90 días sin dos clientes pagando. El plan decía cerrar sin drama.'));
  } else if (m.dias >= 75 && !m.objetivoCumplido) {
    console.log(col.ambar(`Quedan ${m.restantes} días para el punto de decisión y hay ${m.clientes} cliente(s) pagando.`));
  }
}
