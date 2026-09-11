import { log, table } from '../lib/log.js';
import * as shopify from '../lib/shopify.js';
import * as meta from '../lib/meta.js';
import * as tiktok from '../lib/tiktok.js';

const NEEDED_SCOPES = [
  'write_products', 'read_products',
  'write_content', 'read_content',
  'read_orders',
  'write_themes', 'read_themes',
];

/** Comprueba accesos ANTES de gastar dinero o crear cosas a medias. */
export async function preflight() {
  const results = [];
  const check = async (name, fn) => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail });
    } catch (e) {
      results.push({ name, ok: false, detail: e.message.split('\n')[0].slice(0, 110) });
    }
  };

  log.step('Comprobando accesos');

  await check('Shopify · tienda', async () => {
    const s = await shopify.shopInfo();
    return `${s.name} (${s.currencyCode}, plan ${s.plan?.displayName || '?'})`;
  });

  await check('Shopify · permisos', async () => {
    const scopes = await shopify.accessScopes();
    const missing = NEEDED_SCOPES.filter((s) => !scopes.includes(s));
    if (missing.length) throw new Error(`faltan permisos: ${missing.join(', ')}`);
    return `${scopes.length} permisos, todos los necesarios`;
  });

  await check('Shopify · tema principal', async () => {
    const id = await shopify.mainThemeId();
    if (!id) throw new Error('no encuentro el tema publicado');
    return `theme ${id}`;
  });

  if (process.env.META_ACCESS_TOKEN) {
    await check('Meta · cuenta publicitaria', async () => {
      const a = await meta.account();
      if (a.account_status !== 1) throw new Error(`cuenta en estado ${a.account_status} (1 = activa)`);
      return `${a.name} (${a.currency})`;
    });
    await check('Meta · pixel', async () => {
      const list = await meta.pixels();
      const want = process.env.META_PIXEL_ID;
      const hit = list.find((p) => p.id === want);
      if (!hit) throw new Error(`el pixel ${want} no esta en esta cuenta`);
      if (!hit.last_fired_time) throw new Error('el pixel existe pero nunca ha disparado un evento');
      return `${hit.name}, ultimo evento ${hit.last_fired_time}`;
    });
  } else {
    results.push({ name: 'Meta', ok: null, detail: 'sin configurar (opcional)' });
  }

  if (process.env.TIKTOK_ACCESS_TOKEN) {
    await check('TikTok · anunciante', async () => {
      const a = await tiktok.account();
      return `${a?.name || a?.advertiser_name || 'ok'} (${a?.currency || '?'})`;
    });
  } else {
    results.push({ name: 'TikTok', ok: null, detail: 'sin configurar (opcional)' });
  }

  console.log('');
  table(results, [
    { label: '', get: (r) => (r.ok === null ? '–' : r.ok ? '✓' : '✗') },
    { label: 'Comprobacion', get: (r) => r.name },
    { label: 'Resultado', get: (r) => r.detail },
  ]);

  const failed = results.filter((r) => r.ok === false);
  console.log('');
  if (failed.length) {
    log.err(`${failed.length} comprobacion(es) fallan. Mira playbooks/01-cuentas-y-accesos.md.`);
    process.exitCode = 1;
  } else {
    log.ok('Todo listo para lanzar.');
  }
  return results;
}
