import fs from 'node:fs';
import path from 'node:path';
import { DIST_DIR, ensureDir } from '../config.js';
import { renderLanding, renderProductDescription } from '../templates/landing.js';
import { log } from '../lib/log.js';

/** Genera la landing en dist/ para revisarla en local antes de subir nada. */
export function pageBuild(offer) {
  ensureDir(DIST_DIR);
  const html = renderLanding(offer, { preview: true, checkoutUrl: `/products/${offer.slug}` });
  const file = path.join(DIST_DIR, `${offer.slug}.html`);
  fs.writeFileSync(file, html);

  const desc = renderProductDescription(offer);
  fs.writeFileSync(path.join(DIST_DIR, `${offer.slug}.product.html`), desc);

  log.ok(`Landing generada: dist/${offer.slug}.html (${(html.length / 1024).toFixed(1)} KB)`);
  log.dim(`  Abrela en el navegador para revisarla antes de subirla.`);

  const warnings = auditOffer(offer);
  if (warnings.length) {
    log.step('Revisa esto antes de publicar');
    warnings.forEach((w) => log.warn(w));
  }
  return { file, html, desc, warnings };
}

/** Chequeo de calidad de la oferta. No bloquea, avisa. */
export function auditOffer(offer) {
  const w = [];
  if (!offer.heroImage) w.push('No hay heroImage. Una landing sin mockup del producto convierte mucho peor.');
  if (!offer.testimonials?.length) w.push('Sin testimonios. Consigue 3 reales antes de escalar gasto (regala el producto a 10 personas a cambio de feedback).');
  if (!offer.guarantee) w.push('Sin garantia. En producto digital frio, la garantia suele ser la diferencia entre vender y no vender.');
  if ((offer.faq?.length || 0) < 3) w.push('Menos de 3 preguntas frecuentes. Cada objecion sin responder es una venta perdida.');
  if (offer.headline && offer.headline.length > 70) w.push(`El titular tiene ${offer.headline.length} caracteres. Por encima de 70 se lee mal en movil.`);
  if (offer.price < 9) w.push(`Precio de ${offer.price}. Con trafico de pago por debajo de ~15 es muy dificil que salgan los numeros.`);
  if ((offer.deliverables?.length || 0) < 2) w.push('Un solo entregable. Descomponer el producto en piezas concretas sube el valor percibido.');

  const claims = /garantiz\w+ (?:ingres|ganan)|gana \d|\d+\s*€\s*(?:al mes|\/mes)|hazte rico|dinero facil|resultados garantizados/i;
  const text = JSON.stringify(offer);
  if (claims.test(text)) {
    w.push('Hay promesas de ingresos en el texto. Meta y TikTok rechazan o cierran cuentas por esto. Reescribelo en terminos de proceso, no de dinero.');
  }
  return w;
}
