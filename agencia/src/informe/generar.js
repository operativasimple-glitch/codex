/**
 * Genera el informe en HTML y, si se pide, en PDF.
 *
 * El HTML es el entregable principal: pesa poco, se abre en el móvil del cliente y
 * lleva las capturas dentro. El PDF se genera con el mismo navegador de la auditoría,
 * así que no hay una segunda dependencia solo para imprimir.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { asegurarDir, DATOS, hoyISO, slug } from '../util.js';
import { informeCompleto, informeDiagnostico } from './plantilla.js';
import { abrirNavegador } from '../auditoria/navegador.js';

export async function generarInforme(escaneo, { tipo = 'completo', pdf = false } = {}) {
  const html = tipo === 'diagnostico' ? informeDiagnostico(escaneo) : informeCompleto(escaneo);
  const dir = asegurarDir(join(DATOS, 'informes'));
  const base = `${tipo}-${slug(escaneo.cliente)}-${hoyISO()}`;
  const rutaHtml = join(dir, `${base}.html`);
  writeFileSync(rutaHtml, html);

  const salida = { html: rutaHtml, pdf: null };
  if (pdf) salida.pdf = await imprimirPDF(html, join(dir, `${base}.pdf`));
  return salida;
}

async function imprimirPDF(html, ruta) {
  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    await pagina.pdf({
      path: ruta,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
    return ruta;
  } finally {
    await navegador.close().catch(() => {});
  }
}
