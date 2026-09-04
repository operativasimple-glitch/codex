/**
 * Los cinco correos del plan comercial, rellenados con los hallazgos reales del escaneo.
 *
 * La regla del negocio es que ningún correo sale sin haber auditado antes su web: el
 * hallazgo concreto es lo único que hace que contesten. Por eso esta función exige un
 * escaneo y se niega a generar nada sin él.
 */
import { config } from '../config.js';
import { euros } from '../util.js';

export const PLANTILLAS = ['agencia', 'directa', 'fintech', 'gestoria', 'red', 'recordatorio'];

/** Convierte un hallazgo en una línea de correo, en lenguaje de persona. */
function linea(h) {
  const n = h.incidencias;
  switch (h.id) {
    case 'campos-sin-etiqueta':
      return `${n} campos de vuestro formulario no tienen etiqueta asociada: un lector de pantalla dice "campo de texto, en blanco" y no se sabe cuál es el nombre y cuál el correo (WCAG 3.3.2)`;
    case 'botones-sin-nombre':
      return `${n} botones sin nombre accesible; se anuncian solo como "botón" (WCAG 4.1.2)`;
    case 'enlaces-sin-texto':
      return `${n} enlaces sin texto perceptible: el lector de pantalla no dice a dónde llevan (WCAG 2.4.4)`;
    case 'imagenes-sin-alt':
      return `${n} imágenes sin alternativa textual (WCAG 1.1.1)`;
    case 'contraste-bajo':
      return `${n} textos por debajo del contraste mínimo de 4,5:1 (WCAG 1.4.3)`;
    case 'idioma-sin-declarar':
      return 'la página no declara idioma, así que el lector de pantalla lee el español con fonética inglesa (WCAG 3.1.1)';
    case 'foco-invisible':
      return 'al navegar con el tabulador no se ve dónde está el foco, así que la web no se puede usar sin ratón (WCAG 2.4.7)';
    case 'overlay-accesibilidad':
      return 'tenéis instalado un overlay de accesibilidad que no corrige el código y que en Estados Unidos acumula demandas contra las webs que lo usan';
    case 'video-sin-subtitulos':
      return `${n} vídeos sin subtítulos (WCAG 1.2.2)`;
    default:
      return `${h.titulo.toLowerCase()} — ${n} ${n === 1 ? 'caso' : 'casos'} (WCAG ${h.criterio})`;
  }
}

function tresHallazgos(escaneo) {
  const top = escaneo.hallazgos.filter((h) => h.gravedad !== 'informativa').slice(0, 3);
  if (!top.length) throw new Error('El escaneo no tiene hallazgos utilizables: no hay correo que mandar.');
  return top;
}

export function redactar(plantilla, { lead, escaneo, nombre = '[nombre]', clienteSuyo = null }) {
  const top = tresHallazgos(escaneo);
  const bullets = top.map((h) => `· ${linea(h)}`).join('\n');
  const enLinea = top.map((h) => linea(h)).join('; ');
  const web = escaneo.dominio;
  const firma = config.responsable;
  const usaIA = escaneo.hallazgos.some((h) => h.id === 'usa-ia');

  const cierre = '\n\nSi prefieres que no te vuelva a escribir, dímelo y no insisto.';

  switch (plantilla) {
    case 'agencia':
      return {
        asunto: `${escaneo.totales.incidencias} fallos de accesibilidad en ${clienteSuyo || web}`,
        cuerpo: `Hola ${nombre},

Soy ${firma}. He revisado ${clienteSuyo ? `la web de ${clienteSuyo}` : web} con herramientas de accesibilidad y he encontrado fallos que la dejan fuera de la Ley 11/2023, en vigor desde junio de 2025. Los tres más claros:

${bullets}

Te dejo captura de cada uno en el informe adjunto.

Te escribo a ti y no a ellos porque esto os afecta a las agencias antes que a nadie: vuestros clientes os van a preguntar, y en Alemania ya se están poniendo multas de hasta 100.000 € por infracción.

Lo que propongo: audito las webs de tu cartera, tú se lo vendes con tu marca y repartimos. Tú no tienes que aprender accesibilidad y sumas un servicio recurrente al mantenimiento que ya cobras.

Si te encaja, te hago la primera auditoría gratis para que veas el entregable. Si no, ignórame sin problema.

${firma}${cierre}`,
      };

    case 'directa':
      return {
        asunto: 'Tres cosas de vuestra web que incumplen la ley de accesibilidad',
        cuerpo: `Hola ${nombre},

Soy ${firma}. He mirado ${web} con las herramientas estándar de accesibilidad y he visto tres cosas que os dejan fuera de la Ley 11/2023, aplicable desde junio de 2025:

${bullets}

No te pido nada. Te adjunto el diagnóstico con las capturas. Arreglarlo son unas ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} horas de trabajo de quien os lleva la web (${euros(escaneo.totales.costeCorreccion)} aproximadamente a precio de mercado), y podéis hacerlo vosotros con este documento.

Si queréis la revisión completa, incluida la parte manual que ninguna herramienta detecta, os digo qué costaría.

${firma}${cierre}`,
      };

    case 'fintech':
      return {
        asunto: `Accessibility gaps on ${web} — EU law, in force since June 2025`,
        cuerpo: `Hi ${nombre},

I'm ${firma} — I trade futures and build tools for traders, and I also run accessibility audits.

I checked ${web} against WCAG 2.1 AA. Because you serve EU customers, the European Accessibility Act applies regardless of where you're incorporated. Three clear issues: ${enLinea}.

Screenshots are in the attached report.

Regulators in Germany, France and the Netherlands have already issued fines — up to €100,000 per violation.

No ask. Happy to send the full report for free if it's useful.

${firma}`,
      };

    case 'gestoria':
      return {
        asunto: 'Un servicio que podéis ofrecer a vuestros clientes antes de agosto',
        cuerpo: `Hola ${nombre},

Soy ${firma}. Vosotros ya asesoráis a pymes en protección de datos. Hay dos normas que les afectan ahora y que casi ninguna conoce: la ley de accesibilidad digital, aplicable desde junio de 2025 con sanciones de hasta un millón de euros, y el Reglamento de IA, cuyas obligaciones plenas entran el 2 de agosto de 2026 con multas de hasta 35 millones.

Como muestra, he auditado ${web}: ${enLinea}.

Yo hago la parte técnica: auditoría de la web, informe, corrección, inventario de sistemas de IA y política de uso. Vosotros ponéis la relación con el cliente y la parte jurídica. Repartimos.

Si os interesa, os preparo una auditoría de muestra sobre el cliente que queráis, sin coste.

${firma}${cierre}`,
      };

    case 'red':
      return {
        asunto: `Le he echado un vistazo a la web de ${lead?.empresa || web}`,
        cuerpo: `Hola ${nombre},

Te cuento en qué ando: he montado un servicio de cumplimiento digital para empresas — auditamos si una web cumple la ley de accesibilidad, que es obligatoria desde junio del año pasado y casi nadie lo sabe, y preparamos la documentación del Reglamento de IA que entra en agosto.

Ya que estaba, le he echado un vistazo a ${web} y he encontrado esto: ${enLinea}. Te lo mando en un PDF por si le sirve a quien os lleva la web; no te cobro nada.

Y si conoces a alguien a quien le pueda servir, me haces un favor enorme presentándomelo.

Un abrazo,
${firma}`,
      };

    case 'recordatorio':
      return {
        asunto: `Re: ${top[0].titulo.toLowerCase()} en ${web}`,
        cuerpo: `Hola ${nombre},

Te escribí hace unos días con los fallos de accesibilidad que encontré en ${web}. Te dejo el más importante por si se perdió el correo: ${linea(top[0])}.

Si no es el momento, sin problema: no vuelvo a escribirte.

${firma}`,
      };

    default:
      throw new Error(`Plantilla desconocida: ${plantilla}. Disponibles: ${PLANTILLAS.join(', ')}`);
  }
}

/** Aviso que se imprime siempre: en España el correo comercial no solicitado está regulado. */
export const AVISO_ENVIO = [
  'Manda esto por el formulario de contacto de su web o por LinkedIn, no a correos personales rastreados.',
  'Incluye siempre una línea de baja (ya va al final del texto).',
  'Un solo recordatorio a los 7 días. Si no contesta, se deja.',
  'Nunca uses la multa como amenaza: es un dato que se menciona una vez y se pasa.',
];
