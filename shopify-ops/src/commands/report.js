import { log, table, money, pct } from '../lib/log.js';
import * as shopify from '../lib/shopify.js';
import * as metaApi from '../lib/meta.js';
import * as tiktokApi from '../lib/tiktok.js';
import { joinSpendWithOrders, aggregate, blended } from '../lib/metrics.js';

export function dateWindow(days = 7) {
  const until = new Date();
  const since = new Date(Date.now() - (days - 1) * 86400_000);
  return { since: since.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) };
}

/** Descarga gasto e ingresos y los cruza. Es la base de report y de optimize. */
export async function gather(offer, { days = 7, platform = 'all' } = {}) {
  const { since, until } = dateWindow(days);
  const rows = [];

  if (platform === 'all' || platform === 'meta') {
    if (process.env.META_ACCESS_TOKEN) {
      rows.push(...await metaApi.insights({ level: 'ad', since, until }));
    }
  }
  if (platform === 'all' || platform === 'tiktok') {
    if (process.env.TIKTOK_ACCESS_TOKEN) {
      rows.push(...await tiktokApi.insights({ level: 'AUCTION_AD', since, until }));
    }
  }

  // Solo las filas de esta oferta: la convencion es que el nombre de campana
  // empieza por el slug.
  const mine = rows.filter((r) => (r.campaignName || '').startsWith(offer.slug));
  const orders = await shopify.ordersSince(since);
  const joined = joinSpendWithOrders(mine.length ? mine : rows, orders, { productHandle: offer.slug });

  return { since, until, rows: joined, orders, all: rows };
}

export async function report(offer, { days = 7, platform = 'all' } = {}) {
  const { since, until, rows, orders } = await gather(offer, { days, platform });
  const b = blended(rows, orders, { productHandle: offer.slug });
  const e = offer.economics;

  log.step(`Informe · ${offer.name} · ${since} a ${until}`);

  if (!rows.length) {
    log.warn('No hay datos de anuncios en esta ventana. ¿Estan las campanas activas?');
  }

  console.log('');
  table([
    { k: 'Gasto publicitario', v: money(b.spend) },
    { k: 'Ingresos (pedidos reales)', v: money(b.revenue) },
    { k: 'Pedidos', v: String(b.orders) },
    { k: 'Beneficio bruto', v: money(b.profit) },
    { k: 'ROAS combinado', v: b.blendedRoas.toFixed(2) },
    { k: 'ROAS de equilibrio', v: e.breakevenRoas.toFixed(2) },
    { k: 'Coste por cliente (CAC)', v: b.cac != null ? money(b.cac) : 'n/d' },
  ], [{ label: 'Metrica', get: (r) => r.k }, { label: '', get: (r) => r.v }]);

  console.log('');
  if (b.spend === 0) {
    log.dim('  Sin gasto todavia.');
  } else if (b.blendedRoas >= e.targetRoas) {
    log.ok(`Por encima del objetivo (${e.targetRoas}). Toca escalar.`);
  } else if (b.blendedRoas >= e.breakevenRoas) {
    log.info(`Rentable pero por debajo del objetivo ${e.targetRoas}. Mejora conversion o creatividades antes de subir presupuesto.`);
  } else {
    log.err(`Por debajo del punto de equilibrio ${e.breakevenRoas}: cada euro gastado pierde dinero.`);
  }

  const adsets = aggregate(rows, (r) => r.adsetId);
  if (adsets.length) {
    log.step('Por ad set');
    table(adsets.sort((a, b2) => b2.spend - a.spend), [
      { label: 'Ad set', get: (r) => (r.name || r.key).slice(0, 34) },
      { label: 'Gasto', get: (r) => money(r.spend) },
      { label: 'Ventas', get: (r) => String(r.purchases) },
      { label: 'CPA', get: (r) => (r.cpa != null ? money(r.cpa) : '–') },
      { label: 'ROAS real', get: (r) => (r.realRoas != null ? r.realRoas.toFixed(2) : '–') },
      { label: 'ROAS plat.', get: (r) => r.platformRoas.toFixed(2) },
    ]);
  }

  const ads = rows.filter((r) => r.adId);
  if (ads.length) {
    log.step('Por anuncio');
    table(ads.sort((a, b2) => b2.spend - a.spend).slice(0, 20), [
      { label: 'Anuncio', get: (r) => (r.adName || r.adId).slice(0, 30) },
      { label: 'Gasto', get: (r) => money(r.spend) },
      { label: 'CTR', get: (r) => pct(r.ctr) },
      { label: 'CPC', get: (r) => money(r.cpc) },
      { label: 'Frec.', get: (r) => r.frequency.toFixed(2) },
      { label: 'Ventas', get: (r) => String(r.purchases) },
      { label: 'ROAS', get: (r) => (r.effectiveRoas || 0).toFixed(2) },
    ]);
  }

  const unattributed = rows.filter((r) => r.spend > 0 && !r.attributed).length;
  if (unattributed) {
    console.log('');
    log.dim(`  ${unattributed} fila(s) sin pedidos atribuidos en Shopify; para esas se usa el ROAS de la plataforma.`);
  }

  return { blended: b, rows, adsets };
}
