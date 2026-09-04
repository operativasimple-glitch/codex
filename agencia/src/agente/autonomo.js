/**
 * El agente autónomo: Claude dirigiendo la agencia con las herramientas del programa.
 *
 * Bucle clásico de uso de herramientas: se le da el estado real del negocio y las
 * reglas del plan comercial, y decide qué hacer, en qué orden y con qué argumentos.
 * Ejecuta de verdad — audita webs, genera informes, prepara correos — dentro de un
 * presupuesto por sesión y sin poder salirse de las herramientas que tiene.
 *
 * Lo que no puede, por diseño y no por prompt: enviar correos, dar por buena una
 * respuesta, marcar clientes o auditar algo que no esté en la lista. Eso vive en los
 * ejecutores (herramientas.js), así que ni una instrucción ni un texto de una web
 * auditada pueden saltárselo.
 */
import { config } from '../config.js';
import { col } from '../util.js';
import { obtenerCliente, MODELO_AGENTE } from './ia.js';
import { ESQUEMAS, ejecutar, anotarBitacora } from './herramientas.js';
import { calcularAgenda, marcador, ventanaLlamadas } from './hoy.js';

const SISTEMA = `Diriges la operación diaria de ${config.marca}, una agencia española de
cumplimiento digital de una sola persona (${config.responsable}) que audita la accesibilidad
de webs de pymes contra la Ley 11/2023 y WCAG 2.1 AA, y vende auditorías, corrección y
vigilancia mensual.

Trabajas solo, sin nadie mirando. Actúa: usa las herramientas, no propongas.

Las reglas del negocio, que no se negocian:
- Nunca se escribe a nadie sin haber auditado antes su web. El hallazgo concreto es lo único
  que hace que contesten. Si un lead no tiene escaneo, audítalo primero.
- La cadena completa de un lead nuevo es: auditar → diagnóstico gratuito en PDF → correo
  preparado en la bandeja. Un escaneo sin correo escrito no sirve de nada.
- El informe completo es el entregable de pago y no sale sin la revisión manual, que hace
  una persona con teclado y lector de pantalla. Tú solo generas diagnósticos.
- Un solo recordatorio a los siete días. Después, el lead se descarta y no se insiste más.
- Nunca digas que un cliente cumple la ley ni des asesoramiento jurídico. No existe certificación.
- La multa se menciona como dato una vez, nunca como amenaza.
- Los clientes de vigilancia mensual son prioritarios: es la cuota que ya está pagada.
- Prioriza por apalancamiento: una agencia web equivale a decenas de webs de sus clientes.

Sobre lo que no te corresponde: contestar a quien ha respondido, marcar a alguien como cliente
y hacer la revisión manual son cosas de una persona. Cuando toque una de esas, déjalo en una
nota con la herramienta anotar y sigue con lo tuyo.

Termina siempre regenerando el panel y escribiendo un resumen corto en español: qué has hecho,
qué has visto que merezca atención y qué le queda por hacer a ${config.responsable}. Sin florituras.`;

export async function correrAutonomo(presupuesto, { registrar = console.log, mision, cliente: clienteDado } = {}) {
  // `cliente` se puede inyectar: es lo que permite probar el bucle sin gastar API.
  const cliente = clienteDado || await obtenerCliente();
  if (!cliente) throw new Error('No hay ANTHROPIC_API_KEY ni @anthropic-ai/sdk: usa el piloto sin IA (agencia auto --sin-ia).');

  const { estado, escaneos } = calcularAgenda();
  const m = marcador(estado, escaneos);
  const v = ventanaLlamadas();

  const encargo = mision || [
    `Es ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
    `En España son las ${v.horaEspana} (${v.abierta ? 'ventana de llamadas abierta' : 'fuera de la ventana de llamadas'}).`,
    `Día ${m.dias} de los 90 del plan. ${m.clientes} cliente(s) pagando, ${m.tasaRespuesta} % de respuesta.`,
    '',
    'Haz la sesión de trabajo de hoy. Empieza por ver_estado.',
    `Presupuesto de la sesión: ${presupuesto.auditorias} auditorías, ${presupuesto.informes} informes, `
      + `${presupuesto.correos} correos. Gástalo en lo que más mueva el negocio, no en lo primero de la lista.`,
    presupuesto.simulacro ? 'ESTO ES UN SIMULACRO: las herramientas no van a cambiar nada, pero razona igual.' : '',
  ].filter(Boolean).join('\n');

  const mensajes = [{ role: 'user', content: encargo }];
  const maxVueltas = Math.max(4, Math.min(presupuesto.pasos, 30));
  let ultimoTexto = '';

  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    const respuesta = await cliente.messages.create({
      model: MODELO_AGENTE,
      max_tokens: 16000,
      system: SISTEMA,
      output_config: { effort: 'medium' },
      tools: ESQUEMAS,
      messages: mensajes,
    });

    for (const bloque of respuesta.content) {
      if (bloque.type === 'text' && bloque.text.trim()) {
        ultimoTexto = bloque.text.trim();
        registrar(`\n${ultimoTexto}\n`);
      }
    }

    if (respuesta.stop_reason === 'refusal') {
      registrar(col.ambar('La sesión se ha detenido por una negativa del modelo.'));
      break;
    }
    if (respuesta.stop_reason === 'pause_turn') {
      mensajes.push({ role: 'assistant', content: respuesta.content });
      continue;
    }
    if (respuesta.stop_reason !== 'tool_use') break;

    mensajes.push({ role: 'assistant', content: respuesta.content });

    const usos = respuesta.content.filter((b) => b.type === 'tool_use');
    const resultados = [];
    for (const uso of usos) {
      registrar(`${col.azul('→')} ${uso.name} ${col.gris(JSON.stringify(uso.input))}`);
      const salida = await ejecutar(uso.name, uso.input, presupuesto);
      registrar(col.gris(salida.split('\n').map((l) => `   ${l}`).join('\n')));
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: salida });
    }
    // Todos los resultados van en un solo mensaje: si se parten, el modelo deja de
    // pedir herramientas en paralelo.
    mensajes.push({ role: 'user', content: resultados });

    if (presupuesto.pasos <= 0) {
      mensajes.push({ role: 'user', content: 'Se ha agotado el presupuesto de la sesión. Cierra con el resumen.' });
    }
  }

  anotarBitacora({ tipo: 'sesion', modo: 'autonomo', resumen: ultimoTexto, gastado: presupuesto.gastado });
  return { resumen: ultimoTexto, gastado: presupuesto.gastado };
}
