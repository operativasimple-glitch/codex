/**
 * Generador de la landing de venta. La estructura sigue el orden en el que un
 * comprador de producto digital toma la decision: promesa concreta -> problema
 * reconocible -> mecanismo -> que recibe exactamente -> prueba -> riesgo cero
 * -> objeciones -> compra.
 *
 * Regla dura: aqui no se inventan testimonios ni cifras. Si offer.testimonials
 * viene vacio, la seccion de prueba social no se renderiza. Una landing sin
 * testimonios convierte peor que una con testimonios reales, pero muchisimo
 * mejor que una con testimonios falsos y una cuenta publicitaria cerrada.
 */

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (n, cur) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n);

export function renderLanding(offer, { checkoutUrl, preview = false } = {}) {
  const cur = offer.currency;
  const accent = offer.brand?.accent || '#4338ca';
  const accentDark = offer.brand?.accentDark || '#312e81';
  const cta = offer.cta || 'Quiero acceso ahora';
  const buy = checkoutUrl || `/products/${offer.slug}`;

  const priceBlock = offer.compareAtPrice
    ? `<span class="old">${money(offer.compareAtPrice, cur)}</span> <span class="now">${money(offer.price, cur)}</span>`
    : `<span class="now">${money(offer.price, cur)}</span>`;

  const stackTotal = [...(offer.deliverables || []), ...(offer.bonuses || [])]
    .reduce((s, d) => s + (Number(d.value) || 0), 0);

  return `<!doctype html>
<html lang="${esc(offer.lang || 'es')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(offer.seoTitle || offer.name)}</title>
<meta name="description" content="${esc(offer.seoDescription || offer.promise)}">
<meta property="og:title" content="${esc(offer.seoTitle || offer.name)}">
<meta property="og:description" content="${esc(offer.seoDescription || offer.promise)}">
<meta property="og:type" content="product">
${offer.heroImage ? `<meta property="og:image" content="${esc(offer.heroImage)}">` : ''}
<style>
*,*::before,*::after{box-sizing:border-box}
:root{
  --accent:${accent}; --accent-dark:${accentDark};
  --ink:#0f172a; --body:#475569; --mute:#94a3b8;
  --bg:#ffffff; --soft:#f8fafc; --line:#e2e8f0; --ok:#059669;
  --radius:14px; --wrap:1080px;
}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--body);
  font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;padding-bottom:76px}
h1,h2,h3{color:var(--ink);line-height:1.2;margin:0 0 .5em;letter-spacing:-.02em}
h1{font-size:clamp(2rem,5.2vw,3.3rem);font-weight:800}
h2{font-size:clamp(1.5rem,3.6vw,2.25rem);font-weight:750}
h3{font-size:1.1rem;font-weight:700}
p{margin:0 0 1em}
a{color:var(--accent)}
.wrap{max-width:var(--wrap);margin:0 auto;padding-inline:20px}
section{padding-block:clamp(48px,7vw,88px)}
.soft{background:var(--soft);border-block:1px solid var(--line)}

/* Cabecera */
.top{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.92);
  backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-block:12px}
.brand{font-weight:800;color:var(--ink);text-decoration:none;letter-spacing:-.02em}
.top .btn{padding:10px 18px;font-size:.95rem}

/* Botones */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  background:var(--accent);color:#fff;font-weight:700;font-size:1.05rem;
  padding:16px 30px;border-radius:var(--radius);text-decoration:none;border:0;cursor:pointer;
  box-shadow:0 6px 20px -6px color-mix(in srgb,var(--accent) 65%,transparent);
  transition:transform .12s ease,background .15s ease}
.btn:hover{background:var(--accent-dark);transform:translateY(-1px)}
.btn:active{transform:translateY(0)}
.btn-ghost{background:transparent;color:var(--accent);box-shadow:none;border:1.5px solid var(--line)}

/* Hero */
.hero{padding-top:clamp(40px,6vw,72px)}
.hero-grid{display:grid;gap:clamp(32px,5vw,56px);grid-template-columns:1fr;align-items:center}
@media(min-width:900px){.hero-grid{grid-template-columns:1.1fr .9fr}}
.eyebrow{display:inline-block;font-size:.82rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent);
  padding:6px 12px;border-radius:99px;margin-bottom:18px}
.lede{font-size:1.15rem;max-width:56ch}
.ticks{list-style:none;padding:0;margin:24px 0}
.ticks li{position:relative;padding-left:30px;margin-bottom:10px;color:var(--ink);font-weight:500}
.ticks li::before{content:"";position:absolute;left:0;top:.42em;width:17px;height:17px;border-radius:50%;
  background:var(--ok);
  -webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M20 6 9 17l-5-5' fill='none' stroke='black' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/></svg>") center/13px no-repeat,linear-gradient(#000,#000);
  -webkit-mask-composite:xor;mask-composite:exclude}
.buybox{display:flex;flex-wrap:wrap;align-items:center;gap:16px;margin-top:8px}
.price{font-size:1.35rem;color:var(--ink);font-weight:700}
.price .old{color:var(--mute);text-decoration:line-through;font-weight:500;font-size:1.05rem;margin-right:6px}
.trust{display:flex;flex-wrap:wrap;gap:18px;margin-top:20px;font-size:.9rem;color:var(--mute)}
.trust span{display:inline-flex;align-items:center;gap:7px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--ok);flex:none}
.shot{width:100%;border-radius:18px;border:1px solid var(--line);
  box-shadow:0 24px 60px -24px rgba(15,23,42,.28);display:block}
.shot-ph{aspect-ratio:4/3;border-radius:18px;border:1.5px dashed var(--line);background:var(--soft);
  display:grid;place-items:center;color:var(--mute);font-size:.9rem;text-align:center;padding:24px}

/* Bloques genericos */
.center{text-align:center;max-width:62ch;margin-inline:auto}
.cards{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-top:40px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);padding:24px}
.soft .card{background:#fff}
.card .n{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;
  background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);
  font-weight:800;font-size:.9rem;margin-bottom:12px}
.card p{margin:0;font-size:.97rem}
.pains{list-style:none;padding:0;margin:32px auto 0;max-width:60ch}
.pains li{position:relative;padding-left:28px;margin-bottom:12px}
.pains li::before{content:"×";position:absolute;left:6px;top:-1px;color:#dc2626;font-weight:800;font-size:1.2rem}

/* Stack de valor */
.stack{max-width:620px;margin:40px auto 0;border:1px solid var(--line);border-radius:var(--radius);
  overflow:hidden;background:#fff}
.stack-row{display:flex;justify-content:space-between;gap:16px;padding:15px 20px;border-bottom:1px solid var(--line)}
.stack-row span:first-child{color:var(--ink)}
.stack-row .v{color:var(--mute);white-space:nowrap}
.stack-row.bonus span:first-child::before{content:"Bonus · ";color:var(--accent);font-weight:700}
.stack-row.total{background:var(--soft);font-weight:700;color:var(--ink);border-bottom:0}
.stack-row.total .v{color:var(--ink)}

/* Garantia */
.guarantee{max-width:620px;margin-inline:auto;border:2px solid color-mix(in srgb,var(--ok) 35%,transparent);
  border-radius:var(--radius);padding:32px;background:color-mix(in srgb,var(--ok) 4%,#fff);text-align:center}

/* Testimonios */
.quotes{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:40px}
.quote{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:24px}
.quote p{font-size:.98rem;color:var(--ink)}
.quote .who{font-size:.87rem;color:var(--mute);margin:0}

/* FAQ */
.faq{max-width:720px;margin:40px auto 0}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{cursor:pointer;padding:18px 32px 18px 0;font-weight:650;color:var(--ink);
  list-style:none;position:relative}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";position:absolute;right:4px;top:15px;font-size:1.4rem;
  color:var(--mute);font-weight:400;transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq .a{padding:0 0 18px;font-size:.97rem}

/* Barra fija movil */
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(255,255,255,.96);
  backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:10px 16px;
  display:flex;align-items:center;justify-content:space-between;gap:12px}
.sticky .price{font-size:1.05rem}
.sticky .btn{padding:13px 22px;font-size:1rem;flex:none}
@media(min-width:900px){body{padding-bottom:0}.sticky{display:none}}

footer{background:var(--ink);color:#cbd5e1;padding-block:40px;font-size:.88rem}
footer a{color:#cbd5e1}
footer .links{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px}
.legal{color:#64748b;font-size:.8rem;max-width:70ch}
</style>
</head>
<body>

<header class="top">
  <div class="wrap">
    <a class="brand" href="#top">${esc(offer.brand?.name || offer.vendor || offer.name)}</a>
    <a class="btn" href="${esc(buy)}">${esc(cta)}</a>
  </div>
</header>

<section class="hero" id="top">
  <div class="wrap hero-grid">
    <div>
      ${offer.eyebrow ? `<span class="eyebrow">${esc(offer.eyebrow)}</span>` : ''}
      <h1>${esc(offer.headline || offer.promise)}</h1>
      <p class="lede">${esc(offer.subheadline || offer.promise)}</p>
      <ul class="ticks">
        ${(offer.heroBullets || (offer.deliverables || []).slice(0, 4).map((d) => d.name))
          .map((b) => `<li>${esc(b)}</li>`).join('\n        ')}
      </ul>
      <div class="buybox">
        <a class="btn" href="${esc(buy)}">${esc(cta)}</a>
        <span class="price">${priceBlock}</span>
      </div>
      <div class="trust">
        <span><i class="dot"></i>Acceso inmediato tras el pago</span>
        <span><i class="dot"></i>Pago seguro</span>
        ${offer.guarantee ? `<span><i class="dot"></i>${esc(offer.guarantee.short || 'Garantia de devolucion')}</span>` : ''}
      </div>
    </div>
    <div>
      ${offer.heroImage
        ? `<img class="shot" src="${esc(offer.heroImage)}" alt="${esc(offer.name)}" loading="eager" width="960" height="720">`
        : `<div class="shot-ph">Aqui va el mockup del producto.<br>Sustituye <code>heroImage</code> en la oferta.</div>`}
    </div>
  </div>
</section>

${(offer.pains || []).length ? `
<section class="soft">
  <div class="wrap">
    <h2 class="center">${esc(offer.painsTitle || 'Si estas aqui, probablemente te suene esto')}</h2>
    <ul class="pains">
      ${offer.pains.map((p) => `<li>${esc(p)}</li>`).join('\n      ')}
    </ul>
    ${offer.painsClose ? `<p class="center" style="margin-top:28px;color:var(--ink);font-weight:600">${esc(offer.painsClose)}</p>` : ''}
  </div>
</section>` : ''}

${(offer.steps || []).length ? `
<section>
  <div class="wrap">
    <h2 class="center">${esc(offer.stepsTitle || 'Como funciona')}</h2>
    <div class="cards">
      ${offer.steps.map((s, i) => `<div class="card"><span class="n">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section class="soft">
  <div class="wrap">
    <h2 class="center">${esc(offer.deliverablesTitle || 'Que te llevas exactamente')}</h2>
    <div class="cards">
      ${(offer.deliverables || []).map((d) => `<div class="card"><h3>${esc(d.name)}</h3><p>${esc(d.detail || '')}</p></div>`).join('\n      ')}
    </div>

    ${stackTotal > offer.price ? `
    <div class="stack">
      ${(offer.deliverables || []).filter((d) => d.value).map((d) => `<div class="stack-row"><span>${esc(d.name)}</span><span class="v">${money(d.value, cur)}</span></div>`).join('\n      ')}
      ${(offer.bonuses || []).filter((d) => d.value).map((d) => `<div class="stack-row bonus"><span>${esc(d.name)}</span><span class="v">${money(d.value, cur)}</span></div>`).join('\n      ')}
      <div class="stack-row total"><span>Hoy pagas</span><span class="v">${money(offer.price, cur)}</span></div>
    </div>
    <p class="center" style="margin-top:14px;font-size:.85rem;color:var(--mute)">
      Los importes por pieza son el precio de referencia si se vendiera por separado.
    </p>` : ''}
  </div>
</section>

${(offer.testimonials || []).length ? `
<section>
  <div class="wrap">
    <h2 class="center">Lo que dicen quienes ya lo usan</h2>
    <div class="quotes">
      ${offer.testimonials.map((t) => `<div class="quote"><p>"${esc(t.text)}"</p><p class="who">${esc(t.name)}${t.role ? ` · ${esc(t.role)}` : ''}</p></div>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

${offer.guarantee ? `
<section class="soft">
  <div class="wrap">
    <div class="guarantee">
      <h2>${esc(offer.guarantee.title || 'Garantia de devolucion')}</h2>
      <p style="margin-bottom:0">${esc(offer.guarantee.text)}</p>
    </div>
  </div>
</section>` : ''}

${(offer.faq || []).length ? `
<section>
  <div class="wrap">
    <h2 class="center">Preguntas frecuentes</h2>
    <div class="faq">
      ${offer.faq.map((f) => `<details><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section class="soft">
  <div class="wrap center">
    <h2>${esc(offer.finalCtaTitle || 'Empieza hoy')}</h2>
    <p>${esc(offer.finalCtaText || offer.promise)}</p>
    <p style="margin:24px 0 12px"><a class="btn" href="${esc(buy)}">${esc(cta)}</a></p>
    <p class="price">${priceBlock}</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="links">
      <a href="/pages/terminos">Terminos</a>
      <a href="/pages/privacidad">Privacidad</a>
      <a href="/pages/reembolsos">Reembolsos</a>
      <a href="/pages/contacto">Contacto</a>
    </div>
    <p class="legal">${esc(offer.legalNote || `${offer.brand?.name || offer.vendor || ''} · Producto digital. El acceso se entrega por email tras confirmarse el pago. Este sitio no esta afiliado a Meta ni a TikTok.`)}</p>
  </div>
</footer>

<div class="sticky">
  <span class="price">${priceBlock}</span>
  <a class="btn" href="${esc(buy)}">${esc(cta)}</a>
</div>

${preview ? '<!-- PREVIEW LOCAL: los enlaces del footer apuntan a paginas de Shopify que aun no existen -->' : ''}
</body>
</html>`;
}

/** Descripcion del producto dentro de Shopify (mas corta que la landing). */
export function renderProductDescription(offer) {
  const cur = offer.currency;
  return `
<p><strong>${esc(offer.promise)}</strong></p>
<p>${esc(offer.subheadline || '')}</p>
<h3>Que incluye</h3>
<ul>
${(offer.deliverables || []).map((d) => `  <li><strong>${esc(d.name)}</strong>${d.detail ? ` — ${esc(d.detail)}` : ''}</li>`).join('\n')}
</ul>
${(offer.bonuses || []).length ? `<h3>Bonus incluidos</h3>\n<ul>\n${offer.bonuses.map((b) => `  <li><strong>${esc(b.name)}</strong>${b.detail ? ` — ${esc(b.detail)}` : ''}</li>`).join('\n')}\n</ul>` : ''}
<h3>Entrega</h3>
<p>Producto 100% digital. Recibes el acceso por email inmediatamente despues del pago. No se envia nada fisico.</p>
${offer.guarantee ? `<h3>${esc(offer.guarantee.title || 'Garantia')}</h3>\n<p>${esc(offer.guarantee.text)}</p>` : ''}
`.trim();
}
