import { log, table, money, pct } from '../lib/log.js';
import * as pipeline from '../lib/pipeline.js';
import { listOffers } from '../config.js';

const LABEL = {
  idea: 'idea', testing: 'probando', winner: 'GANADOR', dead: 'descartado', paused: 'pausado',
};

/** La foto de la cartera: que se prueba, que murio y cuanto ha costado aprenderlo. */
export function board() {
  const state = pipeline.read();
  const slugs = new Set([...Object.keys(state.offers), ...listOffers()]);

  if (!slugs.size) {
    log.warn('No hay productos todavia. Empieza con: npm run ops -- new-offer <slug>');
    return;
  }

  const rows = [...slugs].map((slug) => {
    const e = state.offers[slug] || { status: 'idea', history: [] };
    const h = e.history || [];
    const spend = h.reduce((s, x) => s + (x.spend || 0), 0);
    const revenue = h.reduce((s, x) => s + (x.revenue || 0), 0);
    const orders = h.reduce((s, x) => s + (x.orders || 0), 0);
    return {
      slug,
      status: e.status || 'idea',
      iteration: e.test?.iteration || h.length || 0,
      spend, revenue, orders,
      roas: spend > 0 ? revenue / spend : null,
      learning: e.learning || h[h.length - 1]?.learning || '',
    };
  });

  const order = { testing: 0, winner: 1, paused: 2, idea: 3, dead: 4 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.spend - a.spend);

  log.step('Cartera de productos');
  table(rows, [
    { label: 'Producto', get: (r) => r.slug.slice(0, 30) },
    { label: 'Estado', get: (r) => LABEL[r.status] || r.status },
    { label: 'Intento', get: (r) => (r.iteration ? String(r.iteration) : '–') },
    { label: 'Gasto', get: (r) => (r.spend ? money(r.spend) : '–') },
    { label: 'Ingresos', get: (r) => (r.spend ? money(r.revenue) : '–') },
    { label: 'ROAS', get: (r) => (r.roas != null ? r.roas.toFixed(2) : '–') },
  ]);

  const t = pipeline.totals();
  if (t.tested) {
    log.step('Acumulado');
    table([
      { k: 'Productos probados', v: String(t.tested) },
      { k: 'Descartados', v: String(t.dead) },
      { k: 'Ganadores', v: String(t.winners) },
      { k: 'Tasa de acierto', v: t.hitRate != null ? pct(t.hitRate) : '–' },
      { k: 'Coste medio por test', v: t.costPerTest != null ? money(t.costPerTest) : '–' },
      { k: 'Gasto total', v: money(t.spend) },
      { k: 'Ingresos totales', v: money(t.revenue) },
      { k: 'Neto', v: money(t.net) },
    ], [{ label: '', get: (r) => r.k }, { label: '', get: (r) => r.v }]);

    console.log('');
    if (t.winners === 0 && t.tested >= 5) {
      log.warn(`${t.tested} productos probados sin ningun ganador.`);
      log.dim('  Con esa racha el problema raramente son los productos: suele ser el publico');
      log.dim('  (demasiado amplio o demasiado frio) o el precio. Revisa el playbook 05.');
    } else if (t.net > 0) {
      log.ok(`La cartera va en positivo: ${money(t.net)}.`);
    }
  }

  const learnings = rows.filter((r) => r.learning);
  if (learnings.length) {
    log.step('Lo aprendido');
    learnings.forEach((r) => log.dim(`  ${r.slug}: ${r.learning}`));
  }

  return rows;
}
