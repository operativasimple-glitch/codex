/**
 * El motor de auditoría: recorre la web entera, ejecuta las comprobaciones en cada
 * página, captura la pantalla de cada elemento infractor y guarda el escaneo.
 *
 * Es el paso que faltaba respecto al script de consola: aquel solo miraba la portada
 * y no dejaba rastro. Aquí queda un JSON por escaneo, con capturas, que alimenta el
 * informe, la vigilancia mensual y la comparación con el mes anterior.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { asegurarDir, slug, hoyISO, DATOS, col } from '../util.js';
import { abrirNavegador } from './navegador.js';
import { FUENTE_COMPROBACIONES } from './comprobaciones.js';
import { CATALOGO, esfuerzoMinutos, ORDEN_GRAVEDAD } from './catalogo.js';

const EXT_IGNORADAS = /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|rar|mp4|mp3|doc|docx|xls|xlsx|ppt|pptx|css|js|xml|ico)(\?|$)/i;

/** Normaliza una URL para no visitar dos veces lo mismo. */
function normalizar(url, base) {
  try {
    const u = new URL(url, base);
    u.hash = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.href;
  } catch { return null; }
}

/** Ordena la cola: primero las páginas donde se compra y se contacta. */
function puntuar(url) {
  const p = new URL(url).pathname.toLowerCase();
  if (p === '' || p === '/') return 100;
  const i = config.rastreo.prioritarias.findIndex((t) => p.includes(t));
  return i >= 0 ? 90 - i : 10 - p.split('/').length;
}

export async function auditar(urlInicial, opciones = {}) {
  const maxPaginas = opciones.paginas ?? config.rastreo.maxPaginas;
  const inicio = normalizar(urlInicial.startsWith('http') ? urlInicial : `https://${urlInicial}`);
  if (!inicio) throw new Error(`URL no válida: ${urlInicial}`);
  const origen = new URL(inicio).origin;

  const idEscaneo = `${slug(new URL(inicio).hostname)}-${hoyISO()}-${Date.now().toString(36).slice(-4)}`;
  const dirCapturas = asegurarDir(join(DATOS, 'capturas', idEscaneo));

  const navegador = await abrirNavegador({ visible: opciones.visible });
  const contexto = await navegador.newContext({
    userAgent: config.rastreo.agenteUsuario,
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  });

  const pendientes = [inicio];
  const vistas = new Set();
  const paginas = [];
  const errores = [];

  try {
    while (pendientes.length && paginas.length < maxPaginas) {
      pendientes.sort((a, b) => puntuar(b) - puntuar(a));
      const url = pendientes.shift();
      if (vistas.has(url)) continue;
      vistas.add(url);

      const pagina = await contexto.newPage();
      try {
        const resp = await pagina.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: config.rastreo.tiempoLimiteMs,
        });
        if (resp && !resp.ok() && resp.status() >= 400) {
          errores.push({ url, motivo: `HTTP ${resp.status()}` });
          await pagina.close();
          continue;
        }
        await pagina.waitForTimeout(config.rastreo.esperaMs);

        const bruto = await pagina.evaluate(FUENTE_COMPROBACIONES);
        bruto.capturas = await capturarInfracciones(pagina, bruto, dirCapturas, paginas.length);
        delete bruto.marcados;
        paginas.push(bruto);
        console.log(`  ${col.verde('✓')} ${url} ${col.gris(`(${Object.keys(bruto.hallazgos).length} tipos de fallo)`)}`);

        // Enlaces internos para seguir rastreando.
        if (paginas.length < maxPaginas) {
          const enlaces = await pagina.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
          for (const href of enlaces) {
            if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
            const abs = normalizar(href, url);
            if (!abs || !abs.startsWith(origen) || vistas.has(abs) || EXT_IGNORADAS.test(abs)) continue;
            if (!pendientes.includes(abs)) pendientes.push(abs);
          }
        }
      } catch (e) {
        errores.push({ url, motivo: e.message.split('\n')[0] });
        console.log(`  ${col.rojo('✗')} ${url} ${col.gris(e.message.split('\n')[0])}`);
      } finally {
        await pagina.close().catch(() => {});
      }
    }
  } finally {
    await contexto.close().catch(() => {});
    await navegador.close().catch(() => {});
  }

  if (!paginas.length) throw new Error(`No se pudo auditar ninguna página de ${inicio}. ${errores[0]?.motivo || ''}`);

  const escaneo = consolidar({ idEscaneo, inicio, origen, paginas, errores, opciones });
  const ruta = join(asegurarDir(join(DATOS, 'escaneos')), `${idEscaneo}.json`);
  writeFileSync(ruta, JSON.stringify(escaneo, null, 2));
  escaneo.ruta = ruta;
  return escaneo;
}

/** Captura la pantalla de los elementos marcados, priorizando los fallos graves. */
async function capturarInfracciones(pagina, bruto, dirCapturas, indicePagina) {
  const capturas = {};
  const porGravedad = Object.keys(bruto.hallazgos).sort(
    (a, b) => (ORDEN_GRAVEDAD[CATALOGO[a]?.gravedad] ?? 9) - (ORDEN_GRAVEDAD[CATALOGO[b]?.gravedad] ?? 9),
  );
  for (const idHallazgo of porGravedad.slice(0, 6)) {
    for (const ej of (bruto.hallazgos[idHallazgo].ejemplos || []).slice(0, 2)) {
      if (!ej?.marca || !ej.visible) continue;
      // El prefijo de página evita que dos páginas distintas pisen la misma captura.
      const nombre = `p${indicePagina}-${ej.marca}.png`;
      try {
        const loc = pagina.locator(`[data-agencia-marca="${ej.marca}"]`).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 2500 });
        // Se resalta el elemento para que en la captura se vea de qué se está hablando.
        await loc.evaluate((el) => { el.style.outline = '3px solid #d92d20'; el.style.outlineOffset = '2px'; });
        // Un campo o un icono suelto no se entiende fuera de contexto: se recorta la
        // zona de alrededor en vez del elemento pelado.
        const caja = await loc.boundingBox({ timeout: 2000 });
        const vista = pagina.viewportSize();
        const recorte = caja && vista ? margen(caja, vista) : null;
        await pagina.screenshot({ path: join(dirCapturas, nombre), clip: recorte || undefined, timeout: 4000 });
        await loc.evaluate((el) => { el.style.outline = ''; el.style.outlineOffset = ''; });
        ej.captura = nombre;
        (capturas[idHallazgo] ??= []).push(nombre);
      } catch { /* un elemento que no se deja capturar no bloquea la auditoría */ }
    }
  }
  return capturas;
}

/** Recorta alrededor del elemento, con aire suficiente para que se entienda. */
function margen(caja, vista) {
  const aire = 56;
  const x = Math.max(0, caja.x - aire);
  const y = Math.max(0, caja.y - aire);
  return {
    x,
    y,
    width: Math.min(vista.width - x, caja.width + aire * 2),
    height: Math.min(vista.height - y, Math.max(caja.height + aire * 2, 90)),
  };
}

/** Junta las páginas en un solo escaneo con totales, esfuerzo y coste estimado. */
function consolidar({ idEscaneo, inicio, origen, paginas, errores, opciones }) {
  const hallazgos = {};
  for (const p of paginas) {
    for (const [id, h] of Object.entries(p.hallazgos)) {
      const acc = (hallazgos[id] ??= {
        id,
        incidencias: 0,
        paginas: [],
        ejemplos: [],
        ...CATALOGO[id],
      });
      acc.incidencias += h.incidencias;
      acc.paginas.push({ url: p.url, incidencias: h.incidencias });
      for (const ej of h.ejemplos || []) {
        if (acc.ejemplos.length < 5) acc.ejemplos.push({ ...ej, url: p.url });
      }
    }
  }

  const lista = Object.values(hallazgos)
    .map((h) => {
      const minutos = esfuerzoMinutos(h.id, h.incidencias);
      return {
        ...h,
        minutos,
        coste: Math.round((minutos / 60) * config.euroHoraDesarrollo),
      };
    })
    .sort((a, b) => (ORDEN_GRAVEDAD[a.gravedad] ?? 9) - (ORDEN_GRAVEDAD[b.gravedad] ?? 9)
      || b.incidencias - a.incidencias);

  const suma = (f) => lista.filter(f).length;
  const totales = {
    paginas: paginas.length,
    tiposDeFallo: lista.length,
    incidencias: lista.reduce((s, h) => s + h.incidencias, 0),
    criticos: suma((h) => h.gravedad === 'critica'),
    altos: suma((h) => h.gravedad === 'alta'),
    minutosCorreccion: lista.reduce((s, h) => s + h.minutos, 0),
  };
  totales.costeCorreccion = Math.round((totales.minutosCorreccion / 60) * config.euroHoraDesarrollo);

  return {
    id: idEscaneo,
    version: 1,
    url: inicio,
    dominio: new URL(origen).hostname,
    cliente: opciones.cliente || new URL(origen).hostname,
    fecha: new Date().toISOString(),
    paginasVisitadas: paginas.map((p) => p.url),
    errores,
    totales,
    hallazgos: lista,
    // Cifras brutas de la portada, para comparar meses y detectar regresiones.
    datosPortada: paginas[0]?.datos || {},
    semaforo: semaforo(totales, lista),
  };
}

/** Un solo indicador para la portada del informe y para el panel. */
function semaforo(totales, lista) {
  const bloqueaCompra = lista.some((h) => h.bloqueaCompra && h.gravedad !== 'informativa');
  if (totales.criticos > 0 || bloqueaCompra) return 'rojo';
  if (totales.altos > 0) return 'ambar';
  return 'verde';
}
