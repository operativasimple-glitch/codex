/**
 * El encargo: lo que pasa desde que alguien dice que sí hasta que paga la vigilancia.
 *
 * Es la parte que no automatiza nada — la llamada, el presupuesto, el cobro — y
 * justo por eso es la que se olvida. Aquí vive el guion de la llamada y el checklist
 * de cada cliente, con los pasos que el programa puede dar por hechos él solo
 * (hay escaneo, hay revisión manual, hay informe) y los que marcas tú.
 */
import { config } from '../config.js';
import { euros } from '../util.js';

/** Los pasos, en el orden en que ocurren. `automatico` lo deduce el programa. */
export const PASOS = [
  { id: 'llamada', titulo: 'Videollamada de cierre hecha',
    ayuda: 'Media hora, por la mañana de Misuri. Enseñas sus fallos en su propia web, no tu informe.' },
  { id: 'presupuesto', titulo: 'Presupuesto y alcance por escrito',
    ayuda: 'Qué incluye, qué NO incluye (corrección, asesoría jurídica, certificación), plazo y precio. Esto es tu contrato.' },
  { id: 'cobrado', titulo: 'Cobrado',
    ayuda: 'El primer cliente, 100 % por adelantado. Si insisten, 50 % al empezar y 50 % al entregar.' },
  { id: 'auditoria', titulo: 'Auditoría completa hecha', automatico: 'escaneo',
    ayuda: 'Más páginas que en el diagnóstico. Lo marca el programa cuando existe el escaneo.' },
  { id: 'manual', titulo: 'Revisión manual hecha', automatico: 'manual',
    ayuda: 'Teclado y lector de pantalla. Es lo que de verdad estás cobrando, y sin ella el informe de pago no sale.' },
  { id: 'informe', titulo: 'Informe completo generado', automatico: 'informe',
    ayuda: 'Con la revisión manual dentro. Antes de mandarlo, comprueba dos o tres cifras en pantalla.' },
  { id: 'entregado', titulo: 'Entregado y llamada de entrega hecha',
    ayuda: 'No mandes el PDF y desaparezcas: en esa llamada es donde se vende la vigilancia.' },
  { id: 'vigilancia', titulo: 'Vigilancia mensual contratada', automatico: 'cliente',
    ayuda: 'El segundo cierre. Lo marca el programa cuando das de alta al cliente con plan de vigilancia.' },
];

/**
 * Estado del encargo de un lead: qué pasos están hechos, cuál es el siguiente.
 * Los automáticos se deducen de los datos; los demás, de lo que hayas marcado.
 */
export function calcularEncargo(lead, { escaneos = [], informes = [], clientes = [] } = {}) {
  const marcados = lead.encargo || {};
  const mios = escaneos.filter((e) => (lead.escaneos || []).includes(e.id));
  const cliente = clientes.find((c) => c.nombre === lead.empresa);

  const deducido = {
    escaneo: mios.length > 0,
    manual: mios.some((e) => e.manual),
    informe: informes.some((f) => /^completo-/.test(f.archivo) && f.archivo.includes(lead.id)),
    cliente: !!cliente && cliente.plan === 'vigilancia',
  };

  const pasos = PASOS.map((p) => {
    const auto = p.automatico ? deducido[p.automatico] : false;
    const hecho = auto || !!marcados[p.id];
    return { ...p, hecho, auto, fecha: marcados[p.id] || null };
  });

  const siguiente = pasos.find((p) => !p.hecho) || null;
  return {
    pasos,
    siguiente,
    hechos: pasos.filter((p) => p.hecho).length,
    total: pasos.length,
    completo: !siguiente,
  };
}

/** ¿A quién le estamos llevando un encargo? A quien haya pasado de la llamada. */
export const enMarcha = (lead) =>
  ['llamada', 'cliente'].includes(lead.estado) || !!(lead.encargo && Object.keys(lead.encargo).length);

// ── El guion de la llamada, tal cual se usa: en pantalla, mientras hablas.

export const GUION = [
  {
    id: 'antes',
    titulo: 'Antes de descolgar',
    puntos: [
      'Ya le mandaste el diagnóstico con SUS capturas. Viene a saber el precio, no a que le expliques qué es la accesibilidad.',
      'Ten su web abierta en una pestaña, no tu informe.',
      'Por la mañana de Misuri: 8:00–11:00 son las 15:00–18:00 en España.',
      'Media hora. Si se alarga, es que estás explicando de más.',
    ],
  },
  {
    id: 'apertura',
    titulo: 'Minutos 0–2 · Apertura',
    guion: 'Hola [nombre]. Te mandé el informe el [día], ¿lo pudiste ver? Te propongo una cosa: comparto '
      + 'pantalla, te enseño los tres fallos en vuestra propia web, y en veinte minutos sabes qué cuesta '
      + 'dejarlo en regla. ¿Te va bien?',
  },
  {
    id: 'demo',
    titulo: 'Minutos 2–10 · Enseña, no cuentes',
    puntos: [
      'Comparte pantalla con SU web y pulsa Tab varias veces: "estoy navegando con el teclado, como quien no puede usar el ratón. ¿Ves que no se ve dónde estoy? Así no se puede comprar."',
      'Abre VoiceOver en su formulario de contacto y que se oiga el "campo de texto, en blanco" nueve veces.',
      'Esos treinta segundos venden más que el informe entero. Nadie que lo oiga lo olvida.',
    ],
  },
  {
    id: 'ley',
    titulo: 'Minutos 10–13 · La ley, una vez',
    guion: 'Esto entra dentro de la Ley 11/2023, que aplica desde junio del año pasado. En España las '
      + 'sanciones llegan al millón, pero te digo la verdad: aquí todavía no hay oleada de inspecciones. '
      + 'En Alemania y Países Bajos ya se está multando. Yo no te vendo miedo, te vendo que esto se '
      + 'arregla en unas horas de trabajo.',
    nota: 'La multa se dice UNA vez y se pasa. Si la repites, te conviertes en el vendedor de extintores.',
  },
  {
    id: 'propuesta',
    titulo: 'Minutos 13–20 · El precio, en voz alta',
    guion: `Lo que te propongo: auditoría completa, ${config.precios.auditoria} euros. Reviso la web entera, `
      + 'no solo la portada, con herramientas y a mano — la parte manual es la que importa, porque las '
      + 'máquinas solo detectan la mitad. Te entrego el informe con cada fallo, su captura y cuánto cuesta '
      + 'arreglarlo, más el borrador de vuestra declaración de accesibilidad. Dos semanas. La corrección la '
      + 'puede hacer tu equipo con ese documento, o te la hago yo aparte.',
    nota: 'Y te callas. El silencio después del precio es suyo, no tuyo.',
  },
  {
    id: 'objeciones',
    titulo: 'Minutos 20–28 · Objeciones',
    pares: [
      ['Es caro',
        'Lo entiendo. La corrección de lo que ya he visto son unas horas de tu programador. Lo que cuesta es encontrarlo: ocho o diez horas mías, la mitad probando con lector de pantalla, que no lo hace ninguna herramienta.'],
      ['Tenemos un plugin que lo arregla',
        'Los overlays. Te lo digo claro: no tocan el código, superponen parches. En Estados Unidos hay cientos de demandas contra webs que los tenían instalados, y las asociaciones de ciegos piden que no se usen. Estás pagando una cuota por algo que no te protege.'],
      ['Ya lo mira nuestra agencia',
        'Perfecto, entonces esto les va a servir. Yo no toco vuestro WordPress ni pido accesos: entrego el informe y lo arreglan ellos. Vendo el ojo, no las manos.'],
      ['Me lo tengo que pensar',
        '¿Te mando el presupuesto por escrito hoy y te llamo el jueves? — y le pones fecha. Un "me lo pienso" sin fecha es un no.'],
      ['¿Y si hago solo la vigilancia?',
        'No sirve: la vigilancia compara con un punto de partida. Primero hay que saber de dónde partes.'],
    ],
  },
  {
    id: 'cierre',
    titulo: 'Minutos 28–30 · Cierre con fecha',
    guion: 'Te mando hoy el presupuesto y los datos de facturación. En cuanto me confirmes por correo, '
      + 'empiezo, y tienes el informe el [día concreto].',
    nota: 'Nunca cuelgues sin una fecha concreta puesta.',
  },
  {
    id: 'nunca',
    titulo: 'Lo que no dices nunca',
    puntos: [
      'Que van a "quedar certificados" o "conformes". No existe.',
      'Nada jurídico: "eso es de abogado, y si quieres te presento a uno".',
      'Que garantizas que no les multen.',
      'Cifras que no hayas verificado a mano en pantalla.',
    ],
  },
  {
    id: 'agencias',
    titulo: 'Con agencias web es otra conversación',
    puntos: [
      'No vendes una auditoría: vendes marca blanca. Tú auditas, ellos lo revenden a su cartera con su marca, y repartís.',
      '"Tú no tienes que aprender accesibilidad, y le sumas un servicio recurrente al mantenimiento que ya les cobras."',
      'Ahí no arreglas nada nunca: lo arreglan sus programadores.',
    ],
  },
];

/** El correo del mismo día: lo que convierte un "sí" de palabra en un encargo. */
export function correoConfirmacion(lead, { precio = config.precios.auditoria, plazo = 'dos semanas' } = {}) {
  return {
    asunto: `Presupuesto y alcance · auditoría de accesibilidad de ${lead.empresa}`,
    cuerpo: `Hola [nombre],

Como hemos hablado, te confirmo por escrito lo que vamos a hacer.

QUÉ INCLUYE
· Auditoría de accesibilidad de ${lead.web || 'vuestra web'} contra WCAG 2.1 AA, que es el estándar que exige la Ley 11/2023.
· Revisión automática de la web entera y revisión manual con teclado y lector de pantalla.
· Informe con cada fallo, su captura, el criterio que incumple, su gravedad y el esfuerzo de corrección.
· Plan de corrección por fases, para que tu equipo sepa qué tocar y en qué orden.
· Borrador de la declaración de accesibilidad, para que la publiquéis vosotros.
· Media hora de videollamada para resolver dudas al entregar.

QUÉ NO INCLUYE
· La corrección del código. La puede hacer vuestro equipo con este informe, o la presupuesto aparte.
· Asesoramiento jurídico. Para la interpretación de la norma, un abogado especializado.
· Ninguna certificación de cumplimiento: no existe certificación oficial y nadie puede emitirla.

PRECIO Y PLAZO
${euros(precio)}. Entrega en ${plazo} desde la confirmación.

Para arrancar solo necesito que me confirmes este correo y me digas qué páginas consideráis importantes (contacto, compra, área de cliente). No necesito accesos a vuestra web.

Un saludo,
${config.responsable}
${config.marca} · ${config.correo}`,
  };
}

/** El correo de entrega. Es donde se vende la vigilancia. */
export function correoEntrega(lead, escaneo) {
  const horas = escaneo ? Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10 : null;
  return {
    asunto: `Informe de accesibilidad de ${lead.empresa}`,
    cuerpo: `Hola [nombre],

Te adjunto el informe completo. Resumen de lo que hay:

· ${escaneo ? escaneo.totales.incidencias : '[n]'} incidencias en ${escaneo ? escaneo.totales.paginas : '[n]'} páginas revisadas.
${horas ? `· Corrección estimada: ${horas} horas de desarrollo.` : ''}
· En el informe va el orden en el que conviene atacarlas: primero lo que impide comprar o contactar.

Dentro tienes también el borrador de la declaración de accesibilidad, para que lo publiquéis en vuestra web.

Una cosa que te recomiendo pensar ahora y no dentro de seis meses: esto se vuelve a romper. En cuanto alguien suba una plantilla nueva o cambie el tema, la mitad de lo corregido se cae. Por ${euros(config.precios.vigilanciaMin)}-${euros(config.precios.vigilanciaMax)} al mes reescaneo la web cada mes, te aviso de lo que se rompa y te mando el informe corto. El primer mes va incluido para que veas cómo es.

¿Hablamos media hora y te lo enseño?

${config.responsable}
${config.marca} · ${config.correo}`,
  };
}
