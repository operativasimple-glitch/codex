/**
 * Panel del negocio: una página HTML con el estado real de la agencia.
 *
 * Sirve para dos cosas: mirarlo por la mañana antes de empezar, y enseñárselo al
 * socio y al inversor sin tener que preparar nada. Se regenera con `agencia panel`.
 *
 * Sobre el color: el embudo es una sola serie, así que va en un único tono y con
 * las cifras escritas al lado (nada depende de distinguir colores). Los semáforos
 * usan la paleta de estado reservada y siempre llevan texto, nunca color a secas.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { asegurarDir, DATOS, escaparHTML, fechaLegible, euros, diasDesde } from '../util.js';
import { calcularAgenda, marcador, ventanaLlamadas } from '../agente/hoy.js';
import { leerBitacora, bandeja } from '../agente/herramientas.js';

const ESTADO = {
  rojo: { color: 'var(--critico)', icono: '●', texto: 'Incumple' },
  ambar: { color: 'var(--aviso)', icono: '▲', texto: 'Con fallos' },
  verde: { color: 'var(--bien)', icono: '✓', texto: 'Limpio' },
};

export function generarPanel() {
  const { estado, escaneos, acciones } = calcularAgenda();
  const m = marcador(estado, escaneos);
  const v = ventanaLlamadas();

  // Embudo: una sola serie, en un tono, con la cifra escrita.
  const embudo = [
    ['En la lista', m.leads],
    ['Auditados', m.auditados],
    ['Contactados', m.contactados],
    ['Han respondido', m.respuestas],
    ['Clientes', m.clientes],
  ];
  const tope = Math.max(1, ...embudo.map(([, n]) => n));

  const bitacora = leerBitacora(40);
  const ultimaSesion = bitacora.find((e) => e.tipo === 'sesion');
  const pendientes = bandeja();

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Panel · ${escaparHTML(config.marca)}</title>
<style>
:root{color-scheme:light;--fondo:#f2f2ef;--tarjeta:#fcfcfb;--linea:#e3e3e0;--tinta:#0b0b0b;--suave:#52514e;
--serie:#2a78d6;--bien:#0ca30c;--aviso:#fab219;--critico:#d03b3b;--acento:#0b3b2e}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--fondo:#111110;--tarjeta:#1a1a19;--linea:#2e2e2c;
--tinta:#fff;--suave:#c3c2b7;--serie:#3987e5;--acento:#8fd6bd}}
*{box-sizing:border-box}
body{margin:0;background:var(--fondo);color:var(--tinta);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif}
.env{max-width:1040px;margin:0 auto;padding:32px 24px 64px}
header{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px}
h1{font-size:22px;margin:0;letter-spacing:-.02em}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--suave);margin:34px 0 12px;font-weight:600}
.suave{color:var(--suave)}
.fichas{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}
.ficha{background:var(--tarjeta);border:1px solid var(--linea);border-radius:12px;padding:16px 18px}
.ficha b{display:block;font-size:28px;letter-spacing:-.03em;line-height:1.1}
.ficha span{font-size:12px;color:var(--suave)}
.embudo{background:var(--tarjeta);border:1px solid var(--linea);border-radius:12px;padding:18px 20px}
.fila{display:grid;grid-template-columns:130px 1fr 42px;align-items:center;gap:12px;margin:9px 0}
.barra{height:14px;border-radius:0 4px 4px 0;background:var(--serie)}
.fila em{font-style:normal;font-variant-numeric:tabular-nums;text-align:right;color:var(--suave)}
table{width:100%;border-collapse:collapse;background:var(--tarjeta);border:1px solid var(--linea);border-radius:12px;overflow:hidden}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--suave);padding:10px 12px;border-bottom:1px solid var(--linea);font-weight:600}
td{padding:10px 12px;border-bottom:1px solid var(--linea);font-size:13px}
tr:last-child td{border-bottom:none}
.estado{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
.accion{background:var(--tarjeta);border:1px solid var(--linea);border-left:3px solid var(--acento);border-radius:10px;padding:13px 16px;margin-bottom:9px}
.accion b{display:block;margin-bottom:3px}
code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,127,127,.14);padding:2px 6px;border-radius:5px}
.pie{margin-top:40px;font-size:12px;color:var(--suave)}
</style></head><body><div class="env">

<header>
  <h1>${escaparHTML(config.marca)} · panel</h1>
  <span class="suave">${fechaLegible(new Date().toISOString())} · en España son las ${v.horaEspana}
  ${v.abierta ? '· se puede llamar' : '· fuera de la ventana de llamadas'}</span>
</header>
<p class="suave">Día ${m.dias} de los 90. ${m.objetivoCumplido
    ? 'Objetivo cumplido: dos clientes o más pagando.'
    : `Faltan ${Math.max(0, 2 - m.clientes)} cliente(s) para el punto de decisión.`}</p>

<div class="fichas">
  <div class="ficha"><b>${m.clientes}</b><span>clientes pagando</span></div>
  <div class="ficha"><b>${euros(m.mrr)}</b><span>recurrente al mes</span></div>
  <div class="ficha"><b>${m.tasaRespuesta} %</b><span>responden (${m.respuestas} de ${m.contactados})</span></div>
  <div class="ficha"><b>${m.auditados}</b><span>webs auditadas</span></div>
  <div class="ficha"><b>${m.restantes}</b><span>días hasta la decisión</span></div>
</div>

<h2>Embudo</h2>
<div class="embudo">
  ${embudo.map(([etq, n]) => `<div class="fila"><span class="suave">${etq}</span>
    <span class="barra" style="width:${Math.max(2, (n / tope) * 100)}%"></span><em>${n}</em></div>`).join('')}
</div>

${ultimaSesion ? `<h2>Última sesión automática</h2>
<div class="accion"><b>${fechaLegible(ultimaSesion.fecha)} · modo ${escaparHTML(ultimaSesion.modo || 'piloto')}</b>
<span class="suave">${escaparHTML(String(ultimaSesion.resumen || '').split('\n').slice(0, 4).join(' · '))}</span></div>` : ''}

${pendientes.length ? `<h2>Bandeja de salida · ${pendientes.length} sin enviar</h2>
<table><tr><th>Empresa</th><th>Plantilla</th><th>Asunto</th><th>Vía</th></tr>
${pendientes.slice(0, 10).map((c) => `<tr><td>${escaparHTML(c.empresa)}</td>
  <td class="suave">${escaparHTML(c.plantilla)}</td>
  <td>${escaparHTML(c.asunto)}</td>
  <td class="suave">${escaparHTML(c.via || 'formulario de su web')}</td></tr>`).join('')}</table>
<p class="suave">Los prepara el agente; los manda una persona. <code>agencia bandeja</code></p>` : ''}

<h2>Qué toca ahora</h2>
${acciones.length ? acciones.map((a) => `<div class="accion"><b>${escaparHTML(a.titulo)}</b>
  <span class="suave">${escaparHTML(a.porque)}</span><br><code>${escaparHTML(a.comando)}</code></div>`).join('')
    : '<p class="suave">Nada pendiente. Si no hay clientes, el cuello de botella son los leads.</p>'}

<h2>Últimas auditorías</h2>
${escaneos.length ? `<table><tr><th>Cliente</th><th>Estado</th><th>Incidencias</th><th>Corrección</th><th>Manual</th><th>Fecha</th></tr>
${escaneos.slice(0, 12).map((e) => {
    const s = ESTADO[e.semaforo] || ESTADO.ambar;
    return `<tr><td>${escaparHTML(e.cliente)}<br><span class="suave">${escaparHTML(e.dominio)}</span></td>
    <td><span class="estado" style="color:${s.color}">${s.icono} ${s.texto}</span></td>
    <td>${e.totales.incidencias} <span class="suave">en ${e.totales.paginas} pág.</span></td>
    <td>${Math.round(e.totales.minutosCorreccion / 60 * 10) / 10} h · ${euros(e.totales.costeCorreccion)}</td>
    <td>${e.manual ? '✓ hecha' : '<span class="suave">pendiente</span>'}</td>
    <td class="suave">${fechaLegible(e.fecha)}</td></tr>`;
  }).join('')}</table>` : '<p class="suave">Todavía no hay ninguna auditoría.</p>'}

<h2>Leads</h2>
${estado.leads.length ? `<table><tr><th>Empresa</th><th>Segmento</th><th>Estado</th><th>Últ. contacto</th></tr>
${estado.leads.slice().sort((a, b) => a.prioridad - b.prioridad).slice(0, 25).map((l) => `<tr>
  <td>${escaparHTML(l.empresa)}${l.web ? `<br><span class="suave">${escaparHTML(l.web)}</span>` : ''}</td>
  <td class="suave">${escaparHTML(l.segmento || '')}</td>
  <td>${escaparHTML(l.estado)}</td>
  <td class="suave">${l.fechaContacto ? `hace ${diasDesde(l.fechaContacto)} días` : '—'}</td></tr>`).join('')}</table>`
    : '<p class="suave">Sin leads cargados. <code>agencia leads --sembrar</code></p>'}

${estado.clientes.length ? `<h2>Clientes</h2><table><tr><th>Cliente</th><th>Plan</th><th>Cuota</th><th>Último escaneo</th></tr>
${estado.clientes.map((c) => `<tr><td>${escaparHTML(c.nombre)}</td><td>${escaparHTML(c.plan)}</td>
  <td>${c.cuota ? `${euros(c.cuota)}/mes` : '—'}</td>
  <td class="suave">${c.ultimoEscaneo ? `hace ${diasDesde(c.ultimoEscaneo)} días` : '—'}</td></tr>`).join('')}</table>` : ''}

<div class="pie">${escaparHTML(config.marca)} · generado por el propio programa. Ninguna cifra de este panel
certifica cumplimiento legal: son resultados de escaneo y estado comercial.</div>
</div></body></html>`;

  const ruta = join(asegurarDir(join(DATOS, 'informes')), 'panel.html');
  writeFileSync(ruta, html);
  return ruta;
}
