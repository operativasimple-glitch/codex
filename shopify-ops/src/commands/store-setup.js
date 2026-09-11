import { log } from '../lib/log.js';
import * as shopify from '../lib/shopify.js';
import { renderLanding, renderProductDescription } from '../templates/landing.js';

const LEGAL_PAGES = (offer) => {
  const brand = offer.brand?.name || offer.vendor || 'la tienda';
  const email = offer.supportEmail || 'soporte@tudominio.com';
  return [
    {
      handle: 'reembolsos',
      title: 'Politica de reembolsos',
      body: `<p>Producto digital de descarga inmediata. ${offer.guarantee
        ? `Ofrecemos garantia de devolucion: ${escapeText(offer.guarantee.text)}`
        : 'Indica aqui tu politica de devolucion.'}</p>
<p>Para solicitar un reembolso escribe a <a href="mailto:${email}">${email}</a> indicando el numero de pedido. Respondemos en un maximo de 48 horas laborables.</p>
<p>Conforme al articulo 103.m del Real Decreto Legislativo 1/2007, el derecho de desistimiento no aplica a contenido digital ya descargado cuando el comprador ha dado su consentimiento expreso. La garantia comercial que ofrecemos es adicional y voluntaria.</p>`,
    },
    {
      handle: 'terminos',
      title: 'Terminos y condiciones',
      body: `<p>Al comprar en ${brand} aceptas estos terminos.</p>
<h3>Licencia de uso</h3><p>La compra otorga una licencia personal e intransferible. No se permite revender, redistribuir ni publicar el material.</p>
<h3>Entrega</h3><p>El acceso se entrega por email tras confirmarse el pago. Si no lo recibes en 15 minutos, revisa spam y escribe a <a href="mailto:${email}">${email}</a>.</p>
<h3>Limitacion de responsabilidad</h3><p>El material es informativo y educativo. No constituye asesoramiento profesional y no garantiza ningun resultado concreto.</p>
<p><strong>Completa esta pagina con tu razon social, NIF y domicilio fiscal antes de anunciar.</strong></p>`,
    },
    {
      handle: 'privacidad',
      title: 'Politica de privacidad',
      body: `<p>Tratamos tus datos para procesar el pedido, entregar el producto y enviarte comunicaciones si lo has consentido.</p>
<h3>Datos que recogemos</h3><p>Nombre, email y datos de facturacion. El pago lo procesa la pasarela; no almacenamos datos de tarjeta.</p>
<h3>Terceros</h3><p>Usamos Shopify (tienda y pagos) y herramientas de medicion publicitaria de Meta y TikTok, que pueden instalar cookies.</p>
<h3>Tus derechos</h3><p>Puedes ejercer acceso, rectificacion, supresion, oposicion y portabilidad escribiendo a <a href="mailto:${email}">${email}</a>.</p>
<p><strong>Completa con tu razon social, NIF, domicilio y, si aplica, delegado de proteccion de datos.</strong></p>`,
    },
    {
      handle: 'contacto',
      title: 'Contacto',
      body: `<p>Escribenos a <a href="mailto:${email}">${email}</a>. Respondemos en menos de 48 horas laborables.</p>
<p><strong>Anade aqui tu razon social, NIF y domicilio fiscal.</strong> Meta y TikTok comprueban que existan datos de contacto verificables antes de aprobar anuncios.</p>`,
    },
  ];
};

const escapeText = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Monta la tienda para una oferta: producto digital, landing, paginas legales.
 * Idempotente: se puede ejecutar varias veces sin duplicar nada.
 */
export async function storeSetup(offer, { apply = false } = {}) {
  const plan = [
    `producto "${offer.slug}" a ${offer.price} ${offer.currency}, sin envio y sin inventario`,
    `pagina /pages/${offer.slug} con la landing completa`,
    `4 paginas legales: reembolsos, terminos, privacidad, contacto`,
    `publicar producto y paginas en el canal Tienda Online`,
  ];

  if (!apply) {
    log.step('Plan (simulacion, no se toca nada)');
    plan.forEach((p) => log.info(p));
    log.dim('\n  Para ejecutarlo de verdad: anade --apply');
    return { dryRun: true, plan };
  }

  const out = {};

  log.step('1/4 · Producto');
  const descriptionHtml = renderProductDescription(offer);
  const { product, created } = await shopify.createDigitalProduct(offer, { descriptionHtml });
  out.product = product;
  log[created ? 'ok' : 'warn'](`${created ? 'Creado' : 'Ya existia'}: ${product.title} (${product.handle})`);

  log.step('2/4 · Publicacion en Tienda Online');
  const pubId = await shopify.onlineStorePublicationId();
  if (pubId) {
    await shopify.publish(product.id, pubId);
    log.ok('Producto publicado');
  } else {
    log.warn('No encuentro el canal Tienda Online. Publica el producto a mano.');
  }

  log.step('3/4 · Landing');
  const html = renderLanding(offer, { checkoutUrl: `/products/${offer.slug}` });
  // Shopify inyecta la pagina dentro del layout del tema, asi que subimos solo
  // el cuerpo: si subieramos el <html> entero se anidaria dentro del theme.
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  const styles = html.slice(html.indexOf('<style>'), html.indexOf('</style>') + 8);
  const { page, created: pageCreated } = await shopify.upsertPage({
    handle: offer.slug,
    title: offer.name,
    body: styles + body,
  });
  out.page = page;
  log[pageCreated ? 'ok' : 'warn'](`${pageCreated ? 'Creada' : 'Actualizada'}: /pages/${page.handle}`);

  log.step('4/4 · Paginas legales');
  out.legal = [];
  for (const p of LEGAL_PAGES(offer)) {
    const r = await shopify.upsertPage(p);
    out.legal.push(r.page);
    log[r.created ? 'ok' : 'dim'](`${r.created ? 'Creada' : 'Actualizada'}: /pages/${p.handle}`);
  }

  log.step('Pendiente de hacer a mano en Shopify');
  log.warn('Instala la app gratuita "Digital Downloads" de Shopify y adjunta el fichero al producto.');
  log.dim('  La API de Shopify no permite adjuntar el fichero descargable: lo gestiona esa app.');
  log.warn('Revisa las paginas legales y anade razon social, NIF y domicilio fiscal.');
  log.warn('Configura la pasarela de pago y haz un pedido de prueba antes de gastar en anuncios.');

  return out;
}
