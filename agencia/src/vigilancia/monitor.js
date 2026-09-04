/**
 * Vigilancia mensual: lo que sostiene la cuota recurrente de 250-500 €/mes.
 *
 * Reescanea, compara con el escaneo anterior del mismo cliente y produce el informe
 * corto de una página. Lo que se vende aquí no es encontrar fallos nuevos: es que
 * cuando el equipo del cliente toque la web y rompa algo, se entere alguien.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { asegurarDir, DATOS, escaparHTML, fechaLegible, hoyISO, slug, euros } from '../util.js';
import { listarEscaneos } from '../almacen.js';
import { auditar } from '../auditoria/motor.js';

/** Compara dos escaneos y devuelve qué ha cambiado. */
export function comparar(anterior, actual) {
  const indice = (e) => Object.fromEntries(e.hallazgos.map((h) => [h.id, h]));
  const antes = indice(anterior);
  const ahora = indice(actual);

  const nuevos = actual.hallazgos.filter((h) => !antes[h.id]);
  const resueltos = anterior.hallazgos.filter((h) => !ahora[h.id]);
  const empeorados = actual.hallazgos
    .filter((h) => antes[h.id] && h.incidencias > antes[h.id].incidencias)
    .map((h) => ({ ...h, antes: antes[h.id].incidencias }));
  const mejorados = actual.hallazgos
    .filter((h) => antes[h.id] && h.incidencias < antes[h.id].incidencias)
    .map((h) => ({ ...h, antes: antes[h.id].incidencias }));

  const regresiones = [...nuevos, ...empeorados];
  return {
    desde: anterior.fecha,
    hasta: actual.fecha,
    nuevos, resueltos, empeorados, mejorados, regresiones,
    hayRegresionGrave: regresiones.some((h) => ['critica', 'alta'].includes(h.gravedad)),
    saldoIncidencias: actual.totales.incidencias - anterior.totales.incidencias,
  };
}

/** Reescanea un cliente y compara con su escaneo anterior. */
export async function vigilar(clienteOUrl, opciones = {}) {
  const previos = listarEscaneos(clienteOUrl);
  const anterior = previos[0];
  const url = opciones.url || anterior?.url || (clienteOUrl.includes('.') ? clienteOUrl : null);
  if (!url) throw new Error(`No hay escaneo previo de "${clienteOUrl}" ni URL con la que reescanear.`);

  const actual = await auditar(url, {
    paginas: opciones.paginas ?? anterior?.totales?.paginas ?? config.rastreo.maxPaginas,
    cliente: anterior?.cliente || clienteOUrl,
  });
  if (!anterior) return { actual, comparacion: null };
  return { actual, anterior, comparacion: comparar(anterior, actual) };
}

/** Informe corto de vigilancia: una página, para mandar cada mes. */
export function informeVigilancia(actual, anterior, cmp) {
  const fila = (h, prefijo) => `<tr><td>${prefijo}</td><td>${escaparHTML(h.titulo)}</td>
    <td class="gris">${escaparHTML(h.criterio)}</td>
    <td>${h.antes !== undefined ? `${h.antes} → ${h.incidencias}` : h.incidencias}</td></tr>`;

  const estado = cmp.hayRegresionGrave
    ? { color: '#b42318', texto: 'Hay regresiones que requieren corrección' }
    : cmp.regresiones.length
      ? { color: '#b54708', texto: 'Cambios menores, nada urgente' }
      : { color: '#067647', texto: 'Sin regresiones respecto al mes anterior' };

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Vigilancia · ${escaparHTML(actual.cliente)}</title><style>
body{margin:0;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,sans-serif;color:#1a1a1a;background:#f2f2ef}
.hoja{max-width:760px;margin:0 auto;background:#fff;padding:48px 52px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;border-top:1px solid #e3e3e0;padding-top:14px}
.gris{color:#666}.estado{display:flex;gap:12px;align-items:center;background:#faf9f7;border:1px solid #e3e3e0;border-radius:10px;padding:14px 16px;margin:18px 0}
.punto{width:13px;height:13px;border-radius:50%}
table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#666;border-bottom:1px solid #e3e3e0;padding:7px 8px}
td{padding:7px 8px;border-bottom:1px solid #f0efec}
.pie{margin-top:30px;padding-top:12px;border-top:1px solid #e3e3e0;font-size:11px;color:#666}
@page{size:A4;margin:16mm 14mm}@media print{body{background:#fff}.hoja{padding:0;max-width:none}}
</style></head><body><div class="hoja">
<h1>${escaparHTML(actual.cliente)}</h1>
<p class="gris">Vigilancia de accesibilidad · ${fechaLegible(anterior.fecha)} → ${fechaLegible(actual.fecha)} · ${actual.totales.paginas} páginas</p>
<div class="estado"><span class="punto" style="background:${estado.color}"></span>
<div><b>${estado.texto}</b><br><span class="gris">${actual.totales.incidencias} incidencias
(${cmp.saldoIncidencias >= 0 ? '+' : ''}${cmp.saldoIncidencias} respecto al escaneo anterior)</span></div></div>

${cmp.regresiones.length ? `<h2>Lo que hay que corregir</h2><table>
<tr><th></th><th>Fallo</th><th>Criterio</th><th>Casos</th></tr>
${cmp.nuevos.map((h) => fila(h, 'Nuevo')).join('')}${cmp.empeorados.map((h) => fila(h, 'Más casos')).join('')}</table>
<p class="gris">Esfuerzo estimado de corrección: ${Math.round(cmp.regresiones.reduce((s, h) => s + (h.minutos || 0), 0))} min
(${euros(Math.round(cmp.regresiones.reduce((s, h) => s + (h.coste || 0), 0)))}).</p>` : '<h2>Sin regresiones</h2><p>Ningún fallo nuevo respecto al escaneo anterior.</p>'}

${(cmp.resueltos.length || cmp.mejorados.length) ? `<h2>Corregido desde el último informe</h2><table>
<tr><th></th><th>Fallo</th><th>Criterio</th><th>Casos</th></tr>
${cmp.resueltos.map((h) => fila(h, 'Resuelto')).join('')}${cmp.mejorados.map((h) => fila(h, 'Mejora')).join('')}</table>` : ''}

<div class="pie">${escaparHTML(config.marca)} · ${escaparHTML(config.correo)} · Escaneo ${escaparHTML(actual.id)}<br>
Este informe recoge la comparación automática entre dos escaneos. No certifica el cumplimiento legal.</div>
</div></body></html>`;

  const ruta = join(asegurarDir(join(DATOS, 'informes')), `vigilancia-${slug(actual.cliente)}-${hoyISO()}.html`);
  writeFileSync(ruta, html);
  return ruta;
}
