/**
 * El equipo: un director y cuatro especialistas.
 *
 * El director no hace el trabajo, lo reparte. Cada especialista ve solo las
 * herramientas de su oficio y trabaja con un encargo concreto; cuando termina,
 * devuelve su parte al director, que decide lo siguiente.
 *
 * Por qué así y no un solo agente con todo: un agente con quince herramientas y
 * quince reglas se distrae. Uno con cuatro herramientas y una misión no. Y para el
 * negocio importa más: cada especialista lleva escritas las reglas de SU parte —
 * el comercial sabe que no se escribe sin auditar antes, el vigilante sabe que una
 * regresión grave se avisa — y esas reglas no se diluyen en un prompt gigante.
 */
import { config } from '../config.js';
import { ESQUEMAS, ejecutar } from './herramientas.js';
import { obtenerCliente, MODELO_AGENTE } from './ia.js';

const CONTEXTO = `Trabajas para ${config.marca}, una agencia española de cumplimiento digital de
una sola persona (${config.responsable}). Se auditan webs de pymes contra la Ley 11/2023 y WCAG 2.1 AA,
y se venden auditorías (${config.precios.auditoria} €), corrección (opcional, casi nunca) y vigilancia
mensual (${config.precios.vigilanciaMin}-${config.precios.vigilanciaMax} €/mes).

Reglas de la casa, para todos:
- Nunca se dice que un cliente cumple la ley. No existe certificación y nadie puede emitirla.
- Nada de asesoramiento jurídico. La norma y las sanciones se citan como dato, nunca como amenaza.
- Los correos no se envían: se dejan escritos en la bandeja y los manda una persona.
- No se inventan cifras: solo las que devuelven las herramientas.`;

export const ESPECIALISTAS = {
  auditor: {
    nombre: 'Auditor',
    oficio: 'audita webs y saca los informes',
    herramientas: ['ver_estado', 'auditar_web', 'generar_informe', 'anotar'],
    sistema: `${CONTEXTO}

Eres el auditor. Tu trabajo es rastrear webs y convertir lo que encuentras en informes.

- Audita primero lo que más apalanca: agencias web (una agencia son decenas de webs de clientes)
  y clientes de vigilancia con el reescaneo vencido.
- Después de cada auditoría que salga bien, saca su diagnóstico gratuito: un escaneo sin informe
  no sirve de nada.
- El informe completo es el entregable de pago y NO se genera sin revisión manual: esa la hace
  una persona con teclado y lector de pantalla. Si falta, dilo en una nota y sigue.
- Los hallazgos que exigen confirmación humana (contraste, alt vacíos) se marcan como tales; no
  los des por buenos.`,
  },

  comercial: {
    nombre: 'Comercial',
    oficio: 'escribe los correos y mueve el embudo',
    herramientas: ['ver_estado', 'redactar_correo', 'actualizar_lead', 'buscar_leads', 'anotar'],
    sistema: `${CONTEXTO}

Eres el comercial. Escribes los correos y mantienes la lista viva.

- Nunca se escribe a nadie sin haber auditado antes su web: el hallazgo concreto es lo único que
  hace que contesten. Si un lead no tiene escaneo, no le escribas: pide que lo auditen antes.
- Plantilla por segmento: agencia web → "agencia" (marca blanca, repartir); gestoría → "gestoria";
  red directa → "red"; prop firm o fintech → "fintech"; el resto → "directa".
- Un solo recordatorio a los siete días. Si tampoco contesta, se descarta y no se insiste más.
- Marcar a alguien como "respondido", "llamada" o "cliente" NO te corresponde: eso lo sabe quien
  ha leído la respuesta.
- Si quedan menos de cinco leads por contactar, busca más antes que ninguna otra cosa: sin lista,
  el negocio se para.`,
  },

  vigilante: {
    nombre: 'Vigilante',
    oficio: 'cuida a los clientes que ya pagan',
    herramientas: ['ver_estado', 'vigilar_cliente', 'generar_informe', 'anotar'],
    sistema: `${CONTEXTO}

Eres el vigilante. Los clientes de vigilancia mensual ya han pagado: son lo primero, siempre.

- Reescanea a todo cliente cuyo último escaneo pase de 28 días.
- Una regresión grave (crítica o alta) se avisa en una nota, con nombre y apellidos del fallo: es
  exactamente lo que el cliente está pagando por saber.
- Si no hay regresiones, dilo igual: el informe de "todo sigue bien" también es el servicio.`,
  },

  analista: {
    nombre: 'Analista',
    oficio: 'mira los números y dice la verdad',
    herramientas: ['ver_estado', 'anotar'],
    sistema: `${CONTEXTO}

Eres el analista. No ejecutas: miras el estado y dices qué está pasando de verdad.

- Habla de tasas, no de sensaciones: cuántos contactados, cuántos responden, cuánto recurrente.
- Señala el cuello de botella real de esta semana, uno solo, el que más duele.
- El plan tiene un punto de decisión a los 90 días: con dos clientes pagando esto sigue, con cero
  se cierra. Si la fecha se acerca y los números no acompañan, dilo claro. No es tu trabajo animar.`,
  },
};

const esquemasDe = (nombres) => ESQUEMAS.filter((e) => nombres.includes(e.name));

/**
 * Pone a trabajar a un especialista con un encargo. Bucle de herramientas acotado:
 * cuando deja de pedir herramientas, devuelve su parte.
 */
export async function trabajaEspecialista(clave, encargo, presupuesto, { registrar = console.log, vueltas = 8 } = {}) {
  const esp = ESPECIALISTAS[clave];
  if (!esp) return `No existe ningún especialista llamado "${clave}".`;
  const cliente = await obtenerCliente();
  if (!cliente) return 'Sin clave de API no hay especialistas.';

  registrar(`\n[${esp.nombre}] ${encargo}`);
  const mensajes = [{ role: 'user', content: encargo }];
  let ultimo = '';

  for (let v = 0; v < vueltas; v++) {
    const r = await cliente.messages.create({
      model: MODELO_AGENTE,
      max_tokens: 8000,
      system: esp.sistema,
      output_config: { effort: 'medium' },
      tools: esquemasDe(esp.herramientas),
      messages: mensajes,
    });

    for (const b of r.content) {
      if (b.type === 'text' && b.text.trim()) { ultimo = b.text.trim(); registrar(`[${esp.nombre}] ${ultimo}`); }
    }
    if (r.stop_reason === 'pause_turn') { mensajes.push({ role: 'assistant', content: r.content }); continue; }
    if (r.stop_reason !== 'tool_use') break;

    mensajes.push({ role: 'assistant', content: r.content });
    const resultados = [];
    for (const uso of r.content.filter((b) => b.type === 'tool_use')) {
      registrar(`  → ${uso.name} ${JSON.stringify(uso.input)}`);
      const salida = await ejecutar(uso.name, uso.input, presupuesto);
      registrar(salida.split('\n').map((l) => `     ${l}`).join('\n'));
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: salida });
    }
    mensajes.push({ role: 'user', content: resultados });
    if (presupuesto.pasos <= 0) {
      mensajes.push({ role: 'user', content: 'Se acabó el presupuesto. Cierra con tu parte en dos líneas.' });
    }
  }

  return ultimo || `${esp.nombre}: sin nada que contar.`;
}

/** La herramienta con la que el director reparte el trabajo. */
export const ESQUEMA_DELEGAR = {
  name: 'delegar',
  description: 'Encarga una tarea a un especialista del equipo. Cada uno ve solo las herramientas '
    + 'de su oficio y devuelve su parte cuando termina. '
    + Object.entries(ESPECIALISTAS).map(([k, e]) => `"${k}": ${e.oficio}`).join('; ') + '.',
  input_schema: {
    type: 'object',
    properties: {
      especialista: { type: 'string', enum: Object.keys(ESPECIALISTAS) },
      encargo: { type: 'string', description: 'Qué tiene que hacer, en una o dos frases, con lo que necesite saber.' },
    },
    required: ['especialista', 'encargo'],
    additionalProperties: false,
  },
};
