/**
 * El director: el agente que lleva la agencia y reparte el trabajo entre el equipo.
 *
 * Dos maneras de usarlo:
 *  · `correrAutonomo` — la sesión de trabajo, sin nadie mirando.
 *  · `conversar` — hablar con él desde la aplicación y que haga lo que le pidas.
 *
 * En los dos casos ejecuta de verdad, con las herramientas del programa, dentro de
 * un presupuesto por sesión. Lo que no puede hacer no está escrito en el prompt sino
 * en los ejecutores (herramientas.js): ni una instrucción, ni el texto de una web
 * auditada, ni un mensaje del chat pueden saltárselo.
 */
import { config } from '../config.js';
import { col } from '../util.js';
import { obtenerCliente, MODELO_AGENTE } from './ia.js';
import { ESQUEMAS, ejecutar, anotarBitacora } from './herramientas.js';
import { ESPECIALISTAS, ESQUEMA_DELEGAR, trabajaEspecialista } from './equipo.js';
import { calcularAgenda, marcador, ventanaLlamadas } from './hoy.js';

// El director no audita ni escribe correos: reparte, mira el conjunto y cierra.
const HERRAMIENTAS_DIRECTOR = ['ver_estado', 'generar_panel', 'anotar'];

const SISTEMA = `Diriges ${config.marca}, una agencia española de cumplimiento digital de una sola
persona (${config.responsable}), que audita la accesibilidad de webs de pymes contra la Ley 11/2023
y WCAG 2.1 AA.

Tienes un equipo y tu trabajo es repartir, no ejecutar:
${Object.entries(ESPECIALISTAS).map(([k, e]) => `· ${e.nombre} (${k}): ${e.oficio}`).join('\n')}

Cómo trabajas:
- Empieza por ver_estado. Sin mirar, no decides.
- Delega con encargos concretos ("audita las tres agencias web sin auditar, empezando por las de
  Madrid"), no con órdenes vagas ("haz cosas de auditoría").
- Un especialista por asunto. No repartas la misma tarea a dos.
- Prioridad fija: clientes que ya pagan → lista de leads si está por debajo de cinco →
  auditar lo que más apalanca → correos de lo ya auditado.
- Cierra siempre regenerando el panel y escribiendo un resumen corto en español: qué se ha hecho,
  qué merece atención y qué le queda a ${config.responsable}. Sin florituras ni ánimos.

Lo que no te corresponde y va a una nota, no a una acción: contestar a quien ha respondido, marcar
clientes, hacer la revisión manual con lector de pantalla y cualquier cosa jurídica.

Nunca digas que un cliente cumple la ley: no existe certificación. La multa se cita una vez como
dato y nunca como amenaza. Los correos no se envían solos: se quedan en la bandeja.`;

const esquemasDirector = () => [...ESQUEMAS.filter((e) => HERRAMIENTAS_DIRECTOR.includes(e.name)), ESQUEMA_DELEGAR];

/**
 * El bucle de herramientas del director. Devuelve el último texto y los mensajes,
 * para poder seguir la conversación donde se quedó.
 */
async function bucle(mensajes, presupuesto, { registrar, vueltas = 14 }) {
  const cliente = await obtenerCliente();
  if (!cliente) throw new Error('No hay ANTHROPIC_API_KEY ni @anthropic-ai/sdk: usa el piloto sin IA (agencia auto --sin-ia).');

  let ultimo = '';
  for (let v = 0; v < vueltas; v++) {
    const r = await cliente.messages.create({
      model: MODELO_AGENTE,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium' },
      tools: esquemasDirector(),
      messages: mensajes,
    });

    for (const b of r.content) {
      if (b.type === 'text' && b.text.trim()) { ultimo = b.text.trim(); registrar(`\n${ultimo}\n`); }
    }
    if (r.stop_reason === 'refusal') { registrar(col.ambar('El modelo se ha negado a seguir.')); break; }
    if (r.stop_reason === 'pause_turn') { mensajes.push({ role: 'assistant', content: r.content }); continue; }
    if (r.stop_reason !== 'tool_use') break;

    mensajes.push({ role: 'assistant', content: r.content });

    const resultados = [];
    for (const uso of r.content.filter((b) => b.type === 'tool_use')) {
      let salida;
      if (uso.name === 'delegar') {
        registrar(`${col.azul('→')} ${uso.input.especialista}: ${uso.input.encargo}`);
        salida = await trabajaEspecialista(uso.input.especialista, uso.input.encargo, presupuesto, { registrar });
      } else {
        registrar(`${col.azul('→')} ${uso.name} ${col.gris(JSON.stringify(uso.input))}`);
        salida = await ejecutar(uso.name, uso.input, presupuesto);
        registrar(col.gris(salida.split('\n').map((l) => `   ${l}`).join('\n')));
      }
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: salida });
    }
    // Todos los resultados en un solo mensaje: si se parten, el modelo deja de pedir
    // herramientas en paralelo.
    mensajes.push({ role: 'user', content: resultados });

    if (presupuesto.pasos <= 0) {
      mensajes.push({ role: 'user', content: 'Se ha agotado el presupuesto de la sesión. Cierra con el resumen.' });
    }
  }
  return { ultimo, mensajes };
}

/** La sesión de trabajo automática. */
export async function correrAutonomo(presupuesto, { registrar = console.log, mision } = {}) {
  const { estado, escaneos } = calcularAgenda();
  const m = marcador(estado, escaneos);
  const v = ventanaLlamadas();

  const encargo = mision || [
    `Es ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    `En España son las ${v.horaEspana} (${v.abierta ? 'ventana de llamadas abierta' : 'fuera de la ventana de llamadas'}).`,
    `Día ${m.dias} de los 90 del plan. ${m.clientes} cliente(s) pagando, ${m.tasaRespuesta} % de respuesta.`,
    '',
    'Haz la sesión de trabajo de hoy. Empieza por ver_estado y reparte.',
    `Presupuesto: ${presupuesto.auditorias} auditorías, ${presupuesto.informes} informes, `
      + `${presupuesto.correos} correos. Gástalo en lo que más mueva el negocio.`,
    presupuesto.simulacro ? 'ESTO ES UN SIMULACRO: las herramientas no cambian nada, pero razona igual.' : '',
  ].filter(Boolean).join('\n');

  const { ultimo } = await bucle([{ role: 'user', content: encargo }], presupuesto, { registrar });
  anotarBitacora({ tipo: 'sesion', modo: 'director', resumen: ultimo, gastado: presupuesto.gastado });
  return { resumen: ultimo, gastado: presupuesto.gastado };
}

/**
 * Hablar con el director desde la aplicación. Recibe el historial y devuelve la
 * respuesta más el historial actualizado, para poder seguir la conversación.
 */
export async function conversar(mensajes, presupuesto, { registrar = console.log } = {}) {
  const { ultimo, mensajes: actualizados } = await bucle(mensajes, presupuesto, { registrar, vueltas: 10 });
  anotarBitacora({ tipo: 'chat', resumen: ultimo?.slice(0, 300) });
  return { respuesta: ultimo, mensajes: actualizados };
}
