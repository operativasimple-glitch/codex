/**
 * Catálogo de hallazgos: la traducción de un fallo técnico a algo que entiende
 * un gerente no técnico. Es la pieza que convierte datos en informe vendible.
 *
 * Cada entrada dice: qué criterio WCAG incumple, qué significa para su negocio,
 * cómo se arregla, cuánto cuesta arreglarlo y si hace falta confirmarlo a mano.
 *
 * `minutosBase` + `minutosPorCaso` × incidencias = esfuerzo estimado de corrección.
 * Esa cifra es la que permite decir "esto son 30 minutos de tu programador" en la
 * llamada, que es lo que desactiva la objeción del precio.
 */

export const CATALOGO = {
  'idioma-sin-declarar': {
    criterio: '3.1.1', nivel: 'A', gravedad: 'alta',
    titulo: 'La página no declara en qué idioma está',
    gerente: 'El lector de pantalla no sabe que la web está en español y la lee con fonética inglesa: '
      + 'el contenido se vuelve ininteligible para una persona ciega. Es el fallo más barato de arreglar de toda la lista.',
    arreglo: 'Añadir el atributo lang a la etiqueta <html> en la plantilla base del tema.',
    codigo: { mal: '<html>', bien: '<html lang="es">' },
    minutosBase: 5, minutosPorCaso: 0, aMano: false, bloqueaCompra: false,
  },
  'imagenes-sin-alt': {
    criterio: '1.1.1', nivel: 'A', gravedad: 'alta',
    titulo: 'Imágenes sin alternativa textual',
    gerente: 'Quien navega con lector de pantalla no sabe qué muestra la imagen. En una tienda, '
      + 'significa no saber qué producto está mirando ni qué dice el banner de la oferta.',
    arreglo: 'Escribir un alt que describa la función de la imagen. Si es puramente decorativa, alt="" vacío es lo correcto.',
    codigo: { mal: '<img src="zapato-rojo.jpg">', bien: '<img src="zapato-rojo.jpg" alt="Zapato de piel rojo, modelo Vega">' },
    minutosBase: 10, minutosPorCaso: 2, aMano: false, bloqueaCompra: true,
  },
  'alt-vacio-revisar': {
    criterio: '1.1.1', nivel: 'A', gravedad: 'informativa',
    titulo: 'Imágenes con alternativa vacía (revisión manual)',
    gerente: 'Un alt vacío es correcto si la imagen es decorativa, y un error si transmite información. '
      + 'Una máquina no puede distinguirlo: se comprueba a mano.',
    arreglo: 'Revisar cada caso: si la imagen aporta información, describirla; si solo decora, dejar alt="".',
    codigo: null,
    minutosBase: 0, minutosPorCaso: 1, aMano: true, bloqueaCompra: false,
  },
  'enlaces-sin-texto': {
    criterio: '2.4.4', nivel: 'A', gravedad: 'alta',
    titulo: 'Enlaces sin texto perceptible',
    gerente: 'El lector de pantalla los anuncia solo como "enlace", sin decir a dónde llevan. '
      + 'Suele pasar con los iconos de redes sociales y las flechas de los carruseles.',
    arreglo: 'Dar texto al enlace, o un aria-label si el diseño solo admite un icono.',
    codigo: { mal: '<a href="/instagram"><i class="icon-ig"></i></a>', bien: '<a href="/instagram" aria-label="Síguenos en Instagram"><i class="icon-ig"></i></a>' },
    minutosBase: 10, minutosPorCaso: 3, aMano: false, bloqueaCompra: false,
  },
  'botones-sin-nombre': {
    criterio: '4.1.2', nivel: 'A', gravedad: 'alta',
    titulo: 'Botones sin nombre accesible',
    gerente: 'Botones que solo llevan un icono (buscar, menú, cerrar, añadir al carrito) y que el lector '
      + 'de pantalla anuncia como "botón" a secas. La persona no sabe qué pasa si lo pulsa.',
    arreglo: 'Añadir aria-label al botón, o texto visible oculto visualmente pero disponible para el lector.',
    codigo: { mal: '<button><svg …/></button>', bien: '<button aria-label="Añadir al carrito"><svg aria-hidden="true" …/></button>' },
    minutosBase: 10, minutosPorCaso: 3, aMano: false, bloqueaCompra: true,
  },
  'campos-sin-etiqueta': {
    criterio: '3.3.2', nivel: 'A', gravedad: 'critica',
    titulo: 'Campos de formulario sin etiqueta asociada',
    gerente: 'Una persona ciega llega al formulario y el lector le dice varias veces "campo de texto, en blanco". '
      + 'No sabe cuál es el nombre, cuál el correo ni cuál el teléfono: no puede contactar ni comprar. '
      + 'Es el fallo que más directamente se traduce en negocio perdido.',
    arreglo: 'Asociar un <label for="id"> a cada campo, o aria-label si el diseño no admite etiqueta visible.',
    codigo: { mal: '<input type="email" placeholder="Email">', bien: '<label for="email">Correo electrónico</label>\n<input id="email" type="email">' },
    minutosBase: 15, minutosPorCaso: 3, aMano: false, bloqueaCompra: true,
  },
  'sin-h1': {
    criterio: '1.3.1', nivel: 'A', gravedad: 'media',
    titulo: 'Página sin encabezado principal',
    gerente: 'Los encabezados son el índice por el que navega un lector de pantalla. Sin h1, '
      + 'no hay punto de entrada: hay que recorrer la página entera de arriba abajo.',
    arreglo: 'Un único <h1> por página, con el título real del contenido.',
    codigo: { mal: '<div class="titulo-grande">Nuestros servicios</div>', bien: '<h1>Nuestros servicios</h1>' },
    minutosBase: 10, minutosPorCaso: 5, aMano: false, bloqueaCompra: false,
  },
  'varios-h1': {
    criterio: '1.3.1', nivel: 'A', gravedad: 'baja',
    titulo: 'Más de un encabezado principal por página',
    gerente: 'Con varios h1 el índice de la página deja de tener jerarquía y la navegación por encabezados se vuelve confusa.',
    arreglo: 'Dejar un solo h1 y bajar el resto a h2.',
    codigo: null,
    minutosBase: 10, minutosPorCaso: 3, aMano: false, bloqueaCompra: false,
  },
  'saltos-encabezado': {
    criterio: '1.3.1', nivel: 'A', gravedad: 'media',
    titulo: 'Jerarquía de encabezados con saltos',
    gerente: 'Se pasa de un h2 a un h4 sin pasar por h3. Quien navega por encabezados percibe que falta contenido en medio.',
    arreglo: 'Ordenar los niveles por jerarquía real, no por el tamaño de letra que se quería.',
    codigo: { mal: '<h2>Servicios</h2> … <h4>Auditoría</h4>', bien: '<h2>Servicios</h2> … <h3>Auditoría</h3>' },
    minutosBase: 15, minutosPorCaso: 5, aMano: false, bloqueaCompra: false,
  },
  'contraste-bajo': {
    criterio: '1.4.3', nivel: 'AA', gravedad: 'alta',
    titulo: 'Texto por debajo del contraste mínimo',
    gerente: 'El gris claro sobre blanco no llega a la relación 4,5:1 que exige la norma. Afecta a cualquiera '
      + 'con la vista cansada, a quien mira el móvil al sol y a un porcentaje alto de sus clientes mayores de 50.',
    arreglo: 'Oscurecer el color de texto en la hoja de estilos hasta alcanzar 4,5:1 (3:1 en texto grande).',
    codigo: { mal: 'color: #999 sobre #fff → 2,85:1', bien: 'color: #595959 sobre #fff → 7,0:1' },
    minutosBase: 20, minutosPorCaso: 1, aMano: true, bloqueaCompra: false,
  },
  'foco-invisible': {
    criterio: '2.4.7', nivel: 'AA', gravedad: 'critica',
    titulo: 'El foco del teclado no se ve',
    gerente: 'Quien no puede usar el ratón navega con el tabulador. Si al tabular no se ve dónde está, '
      + 'la web es literalmente inutilizable: se avanza a ciegas. Suele venir de un "outline: none" en la hoja de estilos.',
    arreglo: 'Retirar el outline:none y definir un indicador de foco visible con buen contraste.',
    codigo: { mal: '*:focus { outline: none; }', bien: ':focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }' },
    minutosBase: 20, minutosPorCaso: 0, aMano: true, bloqueaCompra: true,
  },
  'sin-titulo': {
    criterio: '2.4.2', nivel: 'A', gravedad: 'media',
    titulo: 'Página sin título',
    gerente: 'El título es lo primero que lee el lector de pantalla al abrir la página y lo que distingue una pestaña de otra. Sin él, todas las páginas son iguales.',
    arreglo: 'Rellenar la etiqueta <title> con el nombre de la página y el de la empresa.',
    codigo: { mal: '<title></title>', bien: '<title>Contacto | Nombre de la empresa</title>' },
    minutosBase: 10, minutosPorCaso: 3, aMano: false, bloqueaCompra: false,
  },
  'iframes-sin-titulo': {
    criterio: '4.1.2', nivel: 'A', gravedad: 'media',
    titulo: 'Marcos incrustados sin título',
    gerente: 'Los vídeos y mapas incrustados se anuncian como "marco" sin más. La persona no sabe si merece la pena entrar.',
    arreglo: 'Añadir title al iframe describiendo su contenido.',
    codigo: { mal: '<iframe src="…mapa…">', bien: '<iframe src="…mapa…" title="Mapa con la ubicación de la tienda">' },
    minutosBase: 5, minutosPorCaso: 2, aMano: false, bloqueaCompra: false,
  },
  'video-sin-subtitulos': {
    criterio: '1.2.2', nivel: 'A', gravedad: 'alta',
    titulo: 'Vídeo sin subtítulos',
    gerente: 'El vídeo de portada no tiene subtítulos. Además de la norma, es lo que más se nota en una reunión: '
      + 'se enseña en pantalla y se entiende en dos segundos. Y el 80 % del vídeo en móvil se ve sin sonido.',
    arreglo: 'Subir una pista de subtítulos (.vtt) al vídeo, o activarlos en la plataforma si está incrustado.',
    codigo: { mal: '<video src="promo.mp4" controls>', bien: '<video src="promo.mp4" controls>\n  <track kind="captions" src="promo-es.vtt" srclang="es" label="Español" default>\n</video>' },
    minutosBase: 45, minutosPorCaso: 30, aMano: true, bloqueaCompra: false,
  },
  'sin-region-principal': {
    criterio: '2.4.1', nivel: 'A', gravedad: 'media',
    titulo: 'Sin regiones de navegación ni enlace para saltar al contenido',
    gerente: 'En cada página hay que pasar por el menú entero antes de llegar al contenido. Con 40 enlaces de menú, '
      + 'son 40 tabulaciones en cada página.',
    arreglo: 'Marcar el contenido con <main>, la navegación con <nav>, y añadir un enlace "Saltar al contenido" como primer elemento.',
    codigo: { mal: '<div id="content">', bien: '<a class="saltar" href="#principal">Saltar al contenido</a>\n<main id="principal">' },
    minutosBase: 30, minutosPorCaso: 0, aMano: false, bloqueaCompra: false,
  },
  'tablas-sin-cabecera': {
    criterio: '1.3.1', nivel: 'A', gravedad: 'media',
    titulo: 'Tablas de datos sin celdas de cabecera',
    gerente: 'En una tabla de precios o de tallas, el lector de pantalla no puede decir a qué columna pertenece cada dato.',
    arreglo: 'Usar <th> con scope en la fila de cabecera.',
    codigo: { mal: '<tr><td>Talla</td><td>Precio</td></tr>', bien: '<tr><th scope="col">Talla</th><th scope="col">Precio</th></tr>' },
    minutosBase: 15, minutosPorCaso: 5, aMano: false, bloqueaCompra: false,
  },
  'overlay-accesibilidad': {
    criterio: '—', nivel: '—', gravedad: 'alta',
    titulo: 'Overlay de accesibilidad instalado',
    gerente: 'Tienen contratado un widget que promete "accesibilidad en una línea de código". No corrige el código '
      + 'fuente: superpone parches en el navegador. En Estados Unidos estos productos acumulan cientos de demandas '
      + 'contra las webs que los instalaron, y las asociaciones de usuarios ciegos piden expresamente que no se usen. '
      + 'Están pagando una cuota mensual por algo que no les protege.',
    arreglo: 'Corregir el código real y retirar el widget. El ahorro de la cuota suele cubrir buena parte de la corrección.',
    codigo: null,
    minutosBase: 0, minutosPorCaso: 0, aMano: false, bloqueaCompra: false,
  },
  'usa-ia': {
    criterio: 'RIA art. 4', nivel: '—', gravedad: 'informativa',
    titulo: 'Uso de inteligencia artificial detectado',
    gerente: 'Hay un chatbot o herramienta de IA en la web. Quien USA IA también tiene obligaciones bajo el '
      + 'Reglamento Europeo de IA: inventario de sistemas, clasificación de riesgo, política de uso y formación '
      + 'del personal. Las obligaciones plenas son del 2 de agosto de 2026.',
    arreglo: 'Inventario de sistemas de IA, clasificación de riesgo, política de uso y registro de formación.',
    codigo: null,
    minutosBase: 0, minutosPorCaso: 0, aMano: false, bloqueaCompra: false,
  },
};

export const ORDEN_GRAVEDAD = { critica: 0, alta: 1, media: 2, baja: 3, informativa: 4 };

export const ETIQUETA_GRAVEDAD = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja', informativa: 'Informativa',
};

/** Minutos de corrección estimados para un hallazgo con N incidencias. */
export function esfuerzoMinutos(idHallazgo, incidencias) {
  const h = CATALOGO[idHallazgo];
  if (!h) return 0;
  return h.minutosBase + h.minutosPorCaso * Math.max(0, incidencias - 1);
}
