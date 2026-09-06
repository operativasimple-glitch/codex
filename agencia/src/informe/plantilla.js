/**
 * La plantilla del informe. Un solo fichero HTML autocontenido (capturas incrustadas
 * en base64) que se abre en cualquier navegador y se imprime a PDF sin perder nada.
 *
 * El orden está pensado para cómo lee esto un gerente no técnico:
 *   1. Un semáforo y una cifra de coste. Si solo lee la portada, ya sabe qué pasa.
 *   2. Qué le obliga la ley y qué le puede costar.
 *   3. La lista priorizada: qué primero, cuánto cuesta cada cosa.
 *   4. El detalle con captura y el trozo de código, para su programador.
 *   5. Lo que este informe NO dice. Va siempre, aunque no lo pida nadie.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { DATOS, escaparHTML, fechaLegible, euros } from '../util.js';
import { ETIQUETA_GRAVEDAD } from '../auditoria/catalogo.js';

const COLOR_SEMAFORO = { rojo: '#b42318', ambar: '#b54708', verde: '#067647' };
const TEXTO_SEMAFORO = {
  rojo: 'Incumplimiento con impacto directo en clientes',
  ambar: 'Incumplimientos relevantes, ninguno bloqueante',
  verde: 'Sin incumplimientos automáticos detectados',
};

function capturaBase64(idEscaneo, archivo) {
  if (!archivo) return null;
  const ruta = join(DATOS, 'capturas', idEscaneo, archivo);
  if (!existsSync(ruta)) return null;
  return `data:image/png;base64,${readFileSync(ruta).toString('base64')}`;
}

const estilos = () => `
:root{--tinta:#1a1a1a;--suave:#666;--linea:#e3e3e0;--papel:#fff;--acento:#0b3b2e}
*{box-sizing:border-box}
body{margin:0;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;color:var(--tinta);background:#f2f2ef}
.hoja{max-width:820px;margin:0 auto;background:var(--papel);padding:52px 56px}
h1{font-size:27px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:17px;margin:34px 0 12px;padding-top:16px;border-top:1px solid var(--linea);letter-spacing:-.01em}
h3{font-size:14px;margin:22px 0 6px}
p{margin:0 0 10px}
.gris{color:var(--suave)}
.marca{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--acento);padding-bottom:10px;margin-bottom:26px}
.marca b{font-size:15px;color:var(--acento);letter-spacing:.02em}
.semaforo{display:flex;gap:14px;align-items:center;padding:16px 18px;border-radius:10px;background:#faf9f7;border:1px solid var(--linea);margin:18px 0}
.punto{width:14px;height:14px;border-radius:50%;flex:none}
.cifras{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 6px}
.cifra{border:1px solid var(--linea);border-radius:10px;padding:12px 14px;background:#fff}
.cifra b{display:block;font-size:22px;letter-spacing:-.02em}
.cifra span{font-size:11px;color:var(--suave)}
table{width:100%;border-collapse:collapse;font-size:12px;margin:12px 0}
th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--suave);border-bottom:1px solid var(--linea);padding:7px 8px}
td{padding:8px;border-bottom:1px solid #f0efec;vertical-align:top}
.etq{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:600;white-space:nowrap}
.g-critica{background:#fee4e2;color:#912018}.g-alta{background:#fef0c7;color:#93370d}
.g-media{background:#e0eaff;color:#1e40af}.g-baja{background:#f2f4f7;color:#475467}
.g-informativa{background:#e6f4ea;color:#065f46}
.hallazgo{border:1px solid var(--linea);border-radius:12px;padding:18px 20px;margin:14px 0;background:#fff;break-inside:avoid}
.hallazgo header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}
.hallazgo h3{margin:0}
.meta{font-size:11px;color:var(--suave);margin:2px 0 10px}
figure{margin:12px 0}
figure img{max-width:100%;border:1px solid var(--linea);border-radius:8px;display:block}
figcaption{font-size:11px;color:var(--suave);margin-top:5px}
pre{background:#14161a;color:#e6e6e6;padding:11px 13px;border-radius:8px;font:11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-x:auto;margin:6px 0;white-space:pre-wrap;word-break:break-word}
pre.mal{border-left:3px solid #f04438}pre.bien{border-left:3px solid #12b76a}
.aviso{background:#fffbf0;border:1px solid #f5d599;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:12px}
.limites{background:#f7f7f5;border-radius:10px;padding:14px 18px;font-size:11.5px;color:#444}
.limites li{margin-bottom:6px}
.pie{margin-top:34px;padding-top:14px;border-top:1px solid var(--linea);font-size:11px;color:var(--suave);display:flex;justify-content:space-between}
@media print{body{background:#fff}.hoja{max-width:none;padding:0}h2{break-after:avoid}}
@page{size:A4;margin:16mm 14mm}
`;

const etiquetaGravedad = (g) =>
  `<span class="etq g-${g}">${ETIQUETA_GRAVEDAD[g] || g}</span>`;

function bloqueHallazgo(h, escaneo, { conCodigo = true } = {}) {
  const ejemploConCaptura = h.ejemplos?.find((e) => e.captura);
  const img = ejemploConCaptura ? capturaBase64(escaneo.id, ejemploConCaptura.captura) : null;
  const paginas = h.paginas?.length
    ? `Afecta a ${h.paginas.length} ${h.paginas.length === 1 ? 'página' : 'páginas'} de las ${escaneo.totales.paginas} revisadas.`
    : '';
  return `
  <div class="hallazgo">
    <header>
      <h3>${escaparHTML(h.titulo)}</h3>
      ${etiquetaGravedad(h.gravedad)}
    </header>
    <div class="meta">
      ${h.criterio !== '—' ? `WCAG ${escaparHTML(h.criterio)} (nivel ${escaparHTML(h.nivel)}) · ` : ''}
      ${h.incidencias} ${h.incidencias === 1 ? 'incidencia' : 'incidencias'} · ${paginas}
      ${h.minutos ? ` · Corrección estimada: ${h.minutos} min (${euros(h.coste)})` : ''}
      ${h.aMano ? ' · <b>requiere confirmación manual</b>' : ''}
    </div>
    <p>${escaparHTML(h.gerente)}</p>
    ${img ? `<figure><img src="${img}" alt="Captura del fallo: ${escaparHTML(h.titulo)}">
      <figcaption>${escaparHTML(ejemploConCaptura.url || escaneo.url)}${ejemploConCaptura.ratio ? ` · contraste medido ${ejemploConCaptura.ratio}:1 (mínimo ${ejemploConCaptura.minimo}:1)` : ''}</figcaption></figure>` : ''}
    <p><b>Cómo se corrige.</b> ${escaparHTML(h.arreglo)}</p>
    ${conCodigo && h.codigo ? `<pre class="mal">${escaparHTML(h.codigo.mal)}</pre><pre class="bien">${escaparHTML(h.codigo.bien)}</pre>` : ''}
  </div>`;
}

const cabecera = (titulo, escaneo) => `
<div class="marca"><b>${escaparHTML(config.marca.toUpperCase())}</b><span class="gris">${escaparHTML(titulo)}</span></div>
<h1>${escaparHTML(escaneo.cliente)}</h1>
<p class="gris">${escaparHTML(escaneo.url)} · Revisión del ${fechaLegible(escaneo.fecha)} · ${escaneo.totales.paginas} páginas analizadas</p>`;

const semaforoHTML = (escaneo) => `
<div class="semaforo">
  <span class="punto" style="background:${COLOR_SEMAFORO[escaneo.semaforo]}"></span>
  <div><b>${TEXTO_SEMAFORO[escaneo.semaforo]}</b><br>
  <span class="gris">${escaneo.totales.incidencias} incidencias de ${escaneo.totales.tiposDeFallo} tipos distintos ·
  corrección estimada en ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h de desarrollo (${euros(escaneo.totales.costeCorreccion)})</span></div>
</div>`;

const marcoLegal = () => `
<h2>Qué obliga y qué se arriesga</h2>
<p>La <b>Ley 11/2023</b> traspone la Ley Europea de Accesibilidad y es aplicable desde el
<b>28 de junio de 2025</b>. Exige el nivel <b>WCAG 2.1 AA</b> en comercio electrónico, banca,
transporte, telecomunicaciones y servicios audiovisuales, y alcanza a cualquier empresa que venda a
consumidores de la Unión Europea con independencia de dónde tenga su sede. Quedan fuera las
microempresas de menos de 10 personas y menos de 2 M€.</p>
<p>Las sanciones en España llegan a <b>1.000.000 €</b> y a la exclusión de la contratación pública.
En otros países de la Unión ya se están imponiendo: hasta 100.000 € por infracción en Alemania,
50.000 € a un banco digital en Francia, y 25.000 € más 1.000 € por día de retraso en Países Bajos.</p>
<p class="gris">Como referencia del estado general: según el estudio WebAIM Million, el 95,9 % de las
webs analizadas incumple requisitos básicos. Esto no es un problema aislado de su empresa; lo que
cambia es que ahora hay una obligación con fecha.</p>`;

const bloqueLimites = () => `
<h2>Lo que este informe no dice</h2>
<div class="limites"><ul>${config.limites.map((l) => `<li>${escaparHTML(l)}</li>`).join('')}</ul></div>`;

const pie = (escaneo) => `
<div class="pie">
  <span>${escaparHTML(config.marca)} · ${escaparHTML(config.correo)}</span>
  <span>Escaneo ${escaparHTML(escaneo.id)}</span>
</div>`;

const documento = (titulo, cuerpo) => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escaparHTML(titulo)}</title><style>${estilos()}</style></head>
<body><div class="hoja">${cuerpo}</div></body></html>`;

/** Diagnóstico gratuito: dos páginas, los tres fallos más graves. Es el gancho. */
export function informeDiagnostico(escaneo) {
  const top = escaneo.hallazgos.filter((h) => h.gravedad !== 'informativa').slice(0, 3);
  const cuerpo = `
${cabecera('Diagnóstico gratuito de accesibilidad', escaneo)}
${semaforoHTML(escaneo)}
<p>Hemos revisado ${escaneo.totales.paginas} páginas de su web con herramientas de accesibilidad
estándar. Este documento recoge <b>los tres fallos más importantes</b>, sin coste y sin compromiso.
El resto de hallazgos y la revisión manual van en la auditoría completa.</p>

<h2>Los tres fallos que hay que mirar primero</h2>
${top.map((h) => bloqueHallazgo(h, escaneo, { conCodigo: false })).join('')}

${marcoLegal()}

<h2>Qué costaría dejarlo en regla</h2>
<table>
  <tr><th>Concepto</th><th>Precio</th></tr>
  <tr><td>Auditoría completa: ${escaneo.totales.paginas}+ páginas, revisión automática y manual, informe priorizado y declaración de conformidad</td><td>${euros(config.precios.auditoria)}</td></tr>
  <tr><td>Corrección del código (opcional; también puede hacerla su equipo con este informe)</td><td>${euros(config.precios.remediacionMin)} – ${euros(config.precios.remediacionMax)}</td></tr>
  <tr><td>Vigilancia mensual: reescaneo, alerta de regresiones e informe</td><td>${euros(config.precios.vigilanciaMin)} – ${euros(config.precios.vigilanciaMax)} al mes</td></tr>
</table>
<p class="gris">Corrección estimada de lo detectado automáticamente: ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h
de desarrollo, en torno a ${euros(escaneo.totales.costeCorreccion)} a precio de mercado. Si tienen quien les lleva la web,
pueden pasarle este documento tal cual.</p>

${bloqueLimites()}
${pie(escaneo)}`;
  return documento(`Diagnóstico de accesibilidad · ${escaneo.cliente}`, cuerpo);
}

/** Auditoría completa: lo que se entrega por 1.200 €. */
export function informeCompleto(escaneo) {
  const conteo = (g) => escaneo.hallazgos.filter((h) => h.gravedad === g).length;
  const reales = escaneo.hallazgos.filter((h) => h.gravedad !== 'informativa');
  const informativos = escaneo.hallazgos.filter((h) => h.gravedad === 'informativa');
  const manual = escaneo.manual;

  const fases = [
    { nombre: 'Fase 1 — Bloquea el uso de la web', items: reales.filter((h) => h.gravedad === 'critica' || h.bloqueaCompra) },
    { nombre: 'Fase 2 — Incumplimientos relevantes', items: reales.filter((h) => h.gravedad === 'alta' && !h.bloqueaCompra) },
    { nombre: 'Fase 3 — Resto', items: reales.filter((h) => ['media', 'baja'].includes(h.gravedad) && !h.bloqueaCompra) },
  ].filter((f) => f.items.length);

  const cuerpo = `
${cabecera('Auditoría de accesibilidad · WCAG 2.1 AA', escaneo)}
${semaforoHTML(escaneo)}
<div class="cifras">
  <div class="cifra"><b>${escaneo.totales.incidencias}</b><span>incidencias</span></div>
  <div class="cifra"><b>${conteo('critica')}</b><span>críticas</span></div>
  <div class="cifra"><b>${conteo('alta')}</b><span>graves</span></div>
  <div class="cifra"><b>${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h</b><span>de corrección</span></div>
</div>

<h2>Resumen para dirección</h2>
${escaneo.resumenIA ? escaneo.resumenIA.split('\n\n').map((par) => `<p>${escaparHTML(par)}</p>`).join('') : ''}
<p>Se han analizado <b>${escaneo.totales.paginas} páginas</b> de ${escaparHTML(escaneo.dominio)} contra el estándar
WCAG 2.1 nivel AA, que es el que exige la Ley 11/2023. Se han encontrado
<b>${escaneo.totales.incidencias} incidencias</b> de ${escaneo.totales.tiposDeFallo} tipos distintos.
${reales.some((h) => h.bloqueaCompra) ? '<b>Al menos una de ellas impide completar una compra o un contacto</b> a quien usa lector de pantalla o navega sin ratón.' : ''}
El esfuerzo de corrección de lo detectado se estima en
<b>${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} horas</b> de desarrollo
(${euros(escaneo.totales.costeCorreccion)} a ${euros(config.euroHoraDesarrollo)}/h).</p>

${marcoLegal()}

<h2>Prioridad de corrección</h2>
<table>
  <tr><th>Fallo</th><th>Criterio</th><th>Gravedad</th><th>Casos</th><th>Esfuerzo</th></tr>
  ${escaneo.hallazgos.map((h) => `<tr>
    <td>${escaparHTML(h.titulo)}</td>
    <td class="gris">${escaparHTML(h.criterio)}</td>
    <td>${etiquetaGravedad(h.gravedad)}</td>
    <td>${h.incidencias}</td>
    <td>${h.minutos ? `${h.minutos} min` : '—'}</td></tr>`).join('')}
</table>

<h2>Detalle de los hallazgos</h2>
${reales.map((h) => bloqueHallazgo(h, escaneo)).join('')}

${manual ? bloqueManual(manual) : `<div class="aviso"><b>Pendiente: revisión manual.</b>
Este documento recoge la capa automática, que según el estudio de cobertura de Deque detecta en torno
al 57 % de las incidencias reales. La navegación con teclado, la escucha con lector de pantalla y el
juicio sobre la calidad de los textos alternativos se realizan a mano y se incorporan a este informe.</div>`}

${informativos.length ? `<h2>Otros asuntos detectados</h2>${informativos.map((h) => bloqueHallazgo(h, escaneo, { conCodigo: false })).join('')}` : ''}

<h2>Plan de corrección propuesto</h2>
${fases.map((f) => `<h3>${escaparHTML(f.nombre)}</h3><ul>${f.items.map((h) =>
    `<li>${escaparHTML(h.titulo)} — ${h.incidencias} ${h.incidencias === 1 ? 'caso' : 'casos'}, ${h.minutos} min</li>`).join('')}</ul>`).join('')}
<p class="gris">Total estimado: ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h · ${euros(escaneo.totales.costeCorreccion)}.
La corrección puede hacerla su propio equipo con este documento; si prefieren que la asumamos nosotros,
el presupuesto va aparte.</p>

<h2>Páginas analizadas</h2>
<ul class="gris">${escaneo.paginasVisitadas.map((u) => `<li>${escaparHTML(u)}</li>`).join('')}</ul>
${escaneo.errores?.length ? `<p class="gris">No se pudieron analizar: ${escaneo.errores.map((e) => `${escaparHTML(e.url)} (${escaparHTML(e.motivo)})`).join(', ')}</p>` : ''}

${bloqueLimites()}
${pie(escaneo)}`;
  return documento(`Auditoría de accesibilidad · ${escaneo.cliente}`, cuerpo);
}

function bloqueManual(manual) {
  const filas = manual.respuestas.map((r) => `<tr>
    <td>${escaparHTML(r.titulo)}</td>
    <td class="gris">${escaparHTML(r.criterio)}</td>
    <td>${r.resultado === 'falla' ? '<span class="etq g-critica">Falla</span>' : r.resultado === 'pasa' ? '<span class="etq g-informativa">Correcto</span>' : '<span class="etq g-baja">No aplica</span>'}</td>
    <td>${escaparHTML(r.nota || '')}</td></tr>`).join('');
  return `
<h2>Revisión manual</h2>
<p>Realizada el ${fechaLegible(manual.fecha)} recorriendo la web con teclado y con lector de pantalla.
Es la parte que ninguna herramienta automática puede hacer y donde está el 43 % restante de las incidencias.</p>
<table><tr><th>Comprobación</th><th>Criterio</th><th>Resultado</th><th>Observación</th></tr>${filas}</table>`;
}
