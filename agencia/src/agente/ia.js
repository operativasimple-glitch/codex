/**
 * Capa de IA opcional (Claude).
 *
 * Todo el programa funciona sin esto: los informes y los correos se generan con
 * plantillas deterministas. Cuando hay clave de API, Claude reescribe el resumen
 * para dirección y adapta el correo al lead concreto. Si falla o no está, se sigue
 * con el texto de plantilla y no se rompe nada.
 *
 * Requisitos: `npm install @anthropic-ai/sdk` y la variable ANTHROPIC_API_KEY.
 *
 * Regla dura del negocio, escrita en el prompt: la IA no puede afirmar que el
 * cliente cumple la ley, no da asesoramiento jurídico y no se inventa cifras.
 * Solo reescribe lo que le pasamos.
 */
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const MODELO = 'claude-opus-5';

const SISTEMA = `Escribes para una agencia española de cumplimiento digital que audita
la accesibilidad de webs de pymes (Ley 11/2023, WCAG 2.1 AA).

Reglas que no puedes saltarte:
- No afirmes nunca que una web "cumple", "es conforme" o "está certificada". No existe certificación.
- No des asesoramiento jurídico. Puedes citar la norma y las sanciones que se te faciliten, nada más.
- No inventes cifras, criterios WCAG, plazos ni sanciones: usa exclusivamente los datos del mensaje.
- Escribe en español de España, claro y sin jerga técnica, para un gerente que no es informático.
- Frases cortas. Sin adjetivos de venta, sin alarmismo y sin usar la multa como amenaza.
- No uses viñetas si te piden un párrafo. Devuelve solo el texto pedido, sin preámbulos.`;

let cliente = null;

async function cargarCliente() {
  if (cliente) return cliente;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const cargar = async (ruta) => (await import(ruta)).default;
  try {
    const Anthropic = await cargar('@anthropic-ai/sdk');
    cliente = new Anthropic();
    return cliente;
  } catch { /* se prueba en la instalación global */ }
  try {
    const raizGlobal = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const Anthropic = await cargar(pathToFileURL(join(raizGlobal, '@anthropic-ai/sdk', 'index.mjs')).href);
    cliente = new Anthropic();
    return cliente;
  } catch {
    return null;
  }
}

export async function hayIA() {
  return !!(await cargarCliente());
}

/** El cliente ya construido, para el bucle autónomo. Devuelve null si no hay clave. */
export const obtenerCliente = cargarCliente;

export const MODELO_AGENTE = MODELO;

/** Una llamada, con tope de tokens y sin streaming: son textos cortos. */
async function pedir(prompt, { maxTokens = 1200 } = {}) {
  const c = await cargarCliente();
  if (!c) return null;
  try {
    const r = await c.messages.create({
      model: MODELO,
      max_tokens: maxTokens,
      system: SISTEMA,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
    });
    return r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || null;
  } catch (e) {
    console.error(`  (IA no disponible: ${e.message.split('\n')[0]} · se usa el texto de plantilla)`);
    return null;
  }
}

/** Ficha de datos que se le pasa a Claude. Solo hechos del escaneo. */
function ficha(escaneo) {
  return [
    `Cliente: ${escaneo.cliente} (${escaneo.dominio})`,
    `Páginas analizadas: ${escaneo.totales.paginas}`,
    `Incidencias: ${escaneo.totales.incidencias} de ${escaneo.totales.tiposDeFallo} tipos`,
    `Esfuerzo de corrección estimado: ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} horas`,
    'Hallazgos:',
    ...escaneo.hallazgos.map((h) => `- ${h.titulo} · WCAG ${h.criterio} · gravedad ${h.gravedad} · ${h.incidencias} casos · ${h.gerente}`),
    escaneo.manual
      ? `Revisión manual: ${escaneo.manual.respuestas.filter((r) => r.resultado === 'falla').map((r) => `${r.titulo} (${r.nota || 'falla'})`).join('; ') || 'sin fallos'}`
      : 'Revisión manual: pendiente',
  ].join('\n');
}

/** Resumen para dirección: dos párrafos, en el idioma del cliente. */
export async function resumirParaDireccion(escaneo) {
  return pedir(`Escribe el resumen para dirección de esta auditoría de accesibilidad.
Dos párrafos como máximo. El primero, qué se ha encontrado y qué significa para sus clientes
y su negocio. El segundo, qué hay que hacer primero y con qué esfuerzo. Nada más.

${ficha(escaneo)}`);
}

/** Adapta un correo de plantilla al lead concreto sin cambiar los hechos. */
export async function personalizarCorreo({ asunto, cuerpo }, lead, escaneo) {
  const texto = await pedir(`Adapta este correo al destinatario concreto. Mantén intactos
los hechos, las cifras, los criterios WCAG y la línea de baja del final. Puedes cambiar el tono
y el primer párrafo para que encaje con quién es. No lo alargues: como mucho, la misma longitud.
Devuelve el asunto en la primera línea con el prefijo "Asunto:" y después el cuerpo.

Destinatario: ${lead?.empresa || escaneo.cliente} · ${lead?.segmento || 'empresa'} · ${lead?.sede || ''}
Por qué es buen lead: ${lead?.porQue || '—'}
Vía de contacto: ${lead?.via || '—'}

Correo actual:
Asunto: ${asunto}

${cuerpo}`, { maxTokens: 1600 });

  if (!texto) return null;
  const [primera, ...resto] = texto.split('\n');
  if (/^asunto:/i.test(primera)) {
    return { asunto: primera.replace(/^asunto:\s*/i, '').trim(), cuerpo: resto.join('\n').trim() };
  }
  return { asunto, cuerpo: texto };
}
