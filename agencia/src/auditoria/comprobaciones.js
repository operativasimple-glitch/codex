/**
 * Comprobaciones que se ejecutan DENTRO de la página, en el navegador.
 *
 * Es la evolución del script original de consola (fichero 06 del paquete de contexto):
 * mismos criterios, más comprobaciones, y dos diferencias importantes.
 *
 *  1. Solo mide elementos realmente visibles. El script original medía contraste sobre
 *     menús desplegables ocultos y devolvía falsos positivos que había que descartar a mano.
 *  2. Marca cada elemento infractor con un atributo `data-agencia-marca`, para que el
 *     motor pueda capturar la pantalla de ese elemento exacto y meterla en el informe.
 *     Sin captura no hay informe vendible: la captura es lo que convence al gerente.
 *
 * Esta función se serializa y se inyecta con page.evaluate, así que no puede
 * importar nada: todo lo que necesita vive dentro.
 */

export function comprobarPagina() {
  const d = document;
  const marcados = [];
  let contadorMarca = 0;

  /** Marca el elemento para poder capturarlo después y devuelve su referencia. */
  const marcar = (el, tipo) => {
    const id = `${tipo}-${contadorMarca++}`;
    try { el.setAttribute('data-agencia-marca', id); } catch { return null; }
    const r = el.getBoundingClientRect();
    const ref = {
      marca: id,
      etiqueta: el.tagName.toLowerCase(),
      html: el.outerHTML.slice(0, 220),
      texto: (el.innerText || el.value || '').trim().slice(0, 80),
      visible: r.width > 0 && r.height > 0,
    };
    marcados.push(ref);
    return ref;
  };

  const esVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    if (el.closest('[aria-hidden="true"], [hidden]')) return false;
    return true;
  };

  const res = {
    url: location.href,
    titulo: d.title || '',
    fecha: new Date().toISOString(),
    hallazgos: {},   // id de hallazgo -> { incidencias, ejemplos: [ref] }
    datos: {},       // cifras brutas, para el histórico y la vigilancia
  };

  const anotar = (id, ref) => {
    const h = (res.hallazgos[id] ??= { incidencias: 0, ejemplos: [] });
    h.incidencias++;
    if (ref && h.ejemplos.length < 4) h.ejemplos.push(ref);
  };

  // ── WCAG 3.1.1 · idioma declarado
  const lang = d.documentElement.getAttribute('lang');
  res.datos.lang = lang || null;
  if (!lang) anotar('idioma-sin-declarar', null);

  // ── WCAG 2.4.2 · título de página
  if (!d.title || !d.title.trim()) anotar('sin-titulo', null);

  // ── WCAG 1.1.1 · alternativa textual en imágenes
  const imgs = [...d.querySelectorAll('img')];
  res.datos.img = imgs.length;
  res.datos.imgSinAlt = 0;
  res.datos.imgAltVacio = 0;
  for (const i of imgs) {
    if (!i.hasAttribute('alt')) {
      res.datos.imgSinAlt++;
      anotar('imagenes-sin-alt', marcar(i, 'img'));
    } else if (i.getAttribute('alt') === '' && esVisible(i)) {
      // Puede ser correcto (decorativa) o un error: lo decide una persona.
      res.datos.imgAltVacio++;
      anotar('alt-vacio-revisar', marcar(i, 'altvacio'));
    }
  }

  // ── WCAG 2.4.4 · enlaces con texto perceptible
  const enlaces = [...d.querySelectorAll('a[href]')];
  res.datos.links = enlaces.length;
  res.datos.linksVacios = 0;
  for (const a of enlaces) {
    const t = (a.innerText || '').trim();
    const tieneAlt = a.querySelector('img[alt]:not([alt=""])');
    if (!t && !a.getAttribute('aria-label') && !a.getAttribute('aria-labelledby')
        && !a.getAttribute('title') && !tieneAlt) {
      res.datos.linksVacios++;
      anotar('enlaces-sin-texto', marcar(a, 'enlace'));
    }
  }

  // ── WCAG 4.1.2 · nombre accesible en botones
  const botones = [...d.querySelectorAll('button, [role=button], input[type=submit], input[type=button]')];
  res.datos.btns = botones.length;
  res.datos.btnsSinNombre = 0;
  for (const b of botones) {
    const t = (b.innerText || b.value || '').trim();
    if (!t && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.getAttribute('title')) {
      res.datos.btnsSinNombre++;
      anotar('botones-sin-nombre', marcar(b, 'boton'));
    }
  }

  // ── WCAG 3.3.2 · etiquetas en campos de formulario
  const campos = [...d.querySelectorAll('input, select, textarea')]
    .filter((f) => !['hidden', 'submit', 'button', 'image', 'reset'].includes((f.type || '').toLowerCase()));
  res.datos.campos = campos.length;
  res.datos.camposSinLabel = 0;
  for (const f of campos) {
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) continue;
    if (f.id && d.querySelector(`label[for="${CSS.escape(f.id)}"]`)) continue;
    if (f.closest('label')) continue;
    res.datos.camposSinLabel++;
    anotar('campos-sin-etiqueta', marcar(f, 'campo'));
  }

  // ── WCAG 1.3.1 · jerarquía de encabezados
  const niveles = [...d.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(esVisible).map((h) => +h.tagName[1]);
  res.datos.h1 = niveles.filter((n) => n === 1).length;
  if (res.datos.h1 === 0) anotar('sin-h1', null);
  if (res.datos.h1 > 1) anotar('varios-h1', null);
  let saltos = 0;
  for (let i = 1; i < niveles.length; i++) if (niveles[i] - niveles[i - 1] > 1) saltos++;
  res.datos.saltosEncabezado = saltos;
  if (saltos) { res.hallazgos['saltos-encabezado'] = { incidencias: saltos, ejemplos: [] }; }

  // ── WCAG 2.4.1 · regiones y enlace de salto
  const hayMain = !!d.querySelector('main, [role=main]');
  const haySalto = [...d.querySelectorAll('a[href^="#"]')].slice(0, 4)
    .some((a) => /salt|skip|contenido|content/i.test(a.innerText + ' ' + (a.getAttribute('aria-label') || '')));
  res.datos.main = hayMain;
  res.datos.enlaceSalto = haySalto;
  if (!hayMain && !haySalto) anotar('sin-region-principal', null);

  // ── WCAG 4.1.2 · marcos incrustados con título
  const marcos = [...d.querySelectorAll('iframe')];
  res.datos.iframes = marcos.length;
  res.datos.iframesSinTitulo = 0;
  for (const f of marcos) {
    if (!f.getAttribute('title') && !f.getAttribute('aria-label')) {
      res.datos.iframesSinTitulo++;
      anotar('iframes-sin-titulo', marcar(f, 'iframe'));
    }
  }

  // ── WCAG 1.2.2 · vídeo con subtítulos
  const videos = [...d.querySelectorAll('video')];
  res.datos.videos = videos.length;
  for (const v of videos) {
    if (!v.querySelector('track[kind=captions], track[kind=subtitles]')) {
      anotar('video-sin-subtitulos', marcar(v, 'video'));
    }
  }
  // Vídeo incrustado de plataforma: no se puede comprobar desde fuera, va a revisión manual.
  res.datos.videosIncrustados = marcos.filter((f) => /youtube|vimeo|wistia|dailymotion/i.test(f.src || '')).length;

  // ── WCAG 1.3.1 · tablas de datos con cabeceras
  const tablas = [...d.querySelectorAll('table')].filter((t) => t.rows.length > 2 && !t.closest('[role=presentation]'));
  res.datos.tablas = tablas.length;
  for (const t of tablas) {
    if (!t.querySelector('th')) anotar('tablas-sin-cabecera', marcar(t, 'tabla'));
  }

  // ── WCAG 1.4.3 · contraste de texto (solo elementos visibles)
  const lum = (c) => {
    const m = (c || '').match(/[0-9.]+/g);
    if (!m || m.length < 3) return null;
    if (m.length >= 4 && Number(m[3]) === 0) return null; // totalmente transparente
    const v = m.slice(0, 3).map(Number).map((x) => {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const fondoDe = (el) => {
    let n = el;
    while (n && n !== d.documentElement) {
      const b = getComputedStyle(n).backgroundColor;
      if (b && b !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(b)) return b;
      n = n.parentElement;
    }
    const cuerpo = getComputedStyle(d.body).backgroundColor;
    return cuerpo && !/rgba\(0, 0, 0, 0\)/.test(cuerpo) ? cuerpo : 'rgb(255,255,255)';
  };

  let medidos = 0;
  const candidatos = [...d.querySelectorAll('p,span,li,a,h1,h2,h3,h4,small,td,th,label,button,figcaption')]
    .filter((e) => (e.innerText || '').trim().length > 4)
    .filter((e) => ![...e.children].some((c) => (c.innerText || '').trim() === (e.innerText || '').trim()))
    .filter(esVisible)
    .slice(0, 400);

  for (const e of candidatos) {
    const cs = getComputedStyle(e);
    const px = parseFloat(cs.fontSize);
    const lf = lum(cs.color);
    const lb = lum(fondoDe(e));
    if (lf === null || lb === null) continue;
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const grande = px >= 24 || (px >= 18.66 && parseInt(cs.fontWeight) >= 700);
    const minimo = grande ? 3 : 4.5;
    medidos++;
    if (ratio < minimo) {
      const ref = marcar(e, 'contraste');
      if (ref) {
        ref.ratio = +ratio.toFixed(2);
        ref.minimo = minimo;
        ref.color = cs.color;
        ref.fondo = fondoDe(e);
        ref.px = px;
      }
      anotar('contraste-bajo', ref);
    }
  }
  res.datos.textoMedido = medidos;
  res.datos.textoBajoContraste = res.hallazgos['contraste-bajo']?.incidencias || 0;

  // ── WCAG 2.4.7 · foco visible
  // Se enfoca una muestra de elementos interactivos y se compara el estilo antes y después.
  const interactivos = [...d.querySelectorAll('a[href], button, input, select, textarea')]
    .filter(esVisible).slice(0, 12);
  let sinIndicador = 0;
  const activoPrevio = d.activeElement;
  for (const el of interactivos) {
    const antes = getComputedStyle(el);
    const firmaAntes = [antes.outlineStyle, antes.outlineWidth, antes.boxShadow, antes.borderColor, antes.backgroundColor].join('|');
    try { el.focus({ preventScroll: true }); } catch { continue; }
    const dsp = getComputedStyle(el);
    const firmaDespues = [dsp.outlineStyle, dsp.outlineWidth, dsp.boxShadow, dsp.borderColor, dsp.backgroundColor].join('|');
    const anchoContorno = parseFloat(dsp.outlineWidth) || 0;
    const hayContorno = dsp.outlineStyle !== 'none' && anchoContorno >= 1;
    if (firmaAntes === firmaDespues && !hayContorno) sinIndicador++;
  }
  try { activoPrevio?.focus?.({ preventScroll: true }); } catch { /* da igual */ }
  res.datos.focoMuestra = interactivos.length;
  res.datos.focoSinIndicador = sinIndicador;
  // Si más de la mitad de la muestra no cambia al enfocarse, el problema es de la hoja de estilos.
  if (interactivos.length >= 4 && sinIndicador > interactivos.length / 2) {
    anotar('foco-invisible', null);
  }

  // ── Overlay de accesibilidad (dato comercial de primer orden)
  const fuentes = [...d.querySelectorAll('script[src], link[href]')]
    .map((n) => n.src || n.href).join(' ');
  const overlays = ['accessibe', 'userway', 'audioeye', 'equalweb', 'accessiway', 'maxaccess', 'adally'];
  const overlayDetectado = overlays.find((o) => new RegExp(o, 'i').test(fuentes))
    || (d.querySelector('[class*="accessib"], #INDmenu-btn, .userway_p1') ? 'widget de accesibilidad' : null);
  res.datos.overlay = overlayDetectado || null;
  if (overlayDetectado) anotar('overlay-accesibilidad', null);

  // ── Uso de IA (puerta de entrada al paquete del Reglamento de IA)
  const pistasIA = ['intercom', 'drift', 'tidio', 'crisp.chat', 'chatbase', 'landbot', 'zendesk',
    'hubspot-messages', 'tawk.to', 'manychat', 'voiceflow', 'openai', 'watson'];
  const iaDetectada = pistasIA.filter((p) => new RegExp(p.replace('.', '\\.'), 'i').test(fuentes));
  const textoIA = /\b(inteligencia artificial|impulsado por ia|powered by ai|chatbot|asistente virtual)\b/i
    .test(d.body.innerText.slice(0, 20000));
  res.datos.iaIndicios = iaDetectada;
  res.datos.iaEnTexto = textoIA;
  if (iaDetectada.length || textoIA) anotar('usa-ia', null);

  res.marcados = marcados;
  return res;
}

/** El cuerpo de la función como texto, para inyectarlo con page.evaluate. */
export const FUENTE_COMPROBACIONES = `(${comprobarPagina.toString()})()`;
