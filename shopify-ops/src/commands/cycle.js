import { log, table, money, pct } from '../lib/log.js';
import { gather } from './report.js';
import { optimize } from './optimize.js';
import { stopAllSpend } from './kill.js';
import * as pipeline from '../lib/pipeline.js';
import { blended } from '../lib/metrics.js';
import { verdict as computeVerdict, VERDICT } from '../lib/verdict.js';

/**
 * El comando de cada dia. Hace, en este orden:
 *   1. mira gasto e ingresos reales
 *   2. si se ha tocado el tope, para el gasto ANTES de nada mas
 *   3. dicta veredicto sobre el producto entero
 *   4. si el test sigue vivo, optimiza dentro de el
 *   5. si el veredicto es matar, para todo y lo marca como descartado
 *
 * Pensado para un cron diario. Sin --apply solo informa.
 */
export async function cycle(offer, {
  apply = false, autoExtend = false, platform = 'all',
  // Inyectable para poder probar el ciclo entero sin tocar ninguna API.
  fetchData = gather,
} = {}) {
  const entry = pipeline.get(offer.slug);

  if (!entry?.test || entry.status !== pipeline.STATUS.TESTING) {
    log.warn(`"${offer.slug}" no tiene ningun test abierto.`);
    log.dim(`  Abrelo con: npm run ops -- test-start --offer ${offer.slug} --days 7 --budget 150`);
    return { verdict: null };
  }

  const test = entry.test;
  const daysWindow = Math.max(test.days, Math.ceil((Date.now() - new Date(test.startedAt)) / 86400_000) + 1);
  const { rows, orders } = await fetchData(offer, { days: daysWindow, platform });

  const b = blended(rows, orders, { productHandle: offer.slug });
  const stats = {
    ...b,
    impressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: rows.reduce((s, r) => s + (r.clicks || 0), 0),
  };

  const v = computeVerdict(stats, offer.economics, test, offer.price);

  // ── Estado del test ───────────────────────────────────────────────────────
  log.step(`${offer.name} · intento ${test.iteration}/${test.maxIterations} · dia ${v.daysElapsed}/${test.days}`);
  table([
    { k: 'Gastado', v: `${money(v.spend)} de ${money(test.budgetCap)}` },
    { k: 'Queda', v: money(v.budgetLeft) },
    { k: 'Ingresos reales', v: money(v.revenue) },
    { k: 'Pedidos', v: String(v.orders) },
    { k: 'ROAS', v: `${v.roas.toFixed(2)} (equilibrio ${offer.economics.breakevenRoas}, objetivo ${offer.economics.targetRoas})` },
    { k: 'CTR', v: stats.impressions ? pct(stats.clicks / stats.impressions) : '–' },
    { k: 'Conversion', v: stats.clicks ? pct(v.orders / stats.clicks) : '–' },
  ], [{ label: 'Metrica', get: (r) => r.k }, { label: '', get: (r) => r.v }]);

  console.log('');
  const banner = { RUNNING: log.info, WINNER: log.ok, EXTEND: log.info, ITERATE: log.warn, KILL: log.err };
  (banner[v.verdict] || log.info)(`VEREDICTO: ${v.verdict} — ${v.reason}`);
  log.dim(`  ${v.next}`);
  if (v.diagnosis?.where && v.verdict !== VERDICT.RUNNING) {
    log.dim(`  Cuello de botella: ${v.diagnosis.where}. ${v.diagnosis.text}`);
  }
  if (v.early) log.dim('  (veredicto adelantado: no hace falta agotar la semana para saberlo)');

  // ── Tope de gasto: se respeta siempre ─────────────────────────────────────
  if (v.capHit && v.verdict !== VERDICT.WINNER) {
    console.log('');
    log.warn(`Tope de ${money(test.budgetCap)} alcanzado. Paro el gasto.`);
    await stopAllSpend(offer.slug, { apply });
  }

  if (!apply) {
    console.log('');
    log.dim('  Simulacion: no he tocado nada. Anade --apply para que actue.');
    return { verdict: v, stats };
  }

  // ── Acciones segun veredicto ──────────────────────────────────────────────
  switch (v.verdict) {
    case VERDICT.RUNNING: {
      // El test sigue: optimizamos dentro de el (matar anuncios malos, escalar buenos).
      console.log('');
      await optimize(offer, { days: daysWindow, platform, apply: true });
      break;
    }

    case VERDICT.KILL: {
      const learning = `${v.reason} ${v.diagnosis?.text || ''}`.trim();
      await stopAllSpend(offer.slug, { apply: true });
      pipeline.closeTest(offer.slug, { verdict: v.verdict, stats: v, learning });
      pipeline.markDead(offer.slug, learning);
      console.log('');
      log.err(`"${offer.slug}" descartado. Gasto total del experimento: ${money(v.spend)}.`);
      log.step('Siguiente producto');
      log.dim('  ops board                  → ver la cartera y lo aprendido');
      log.dim('  ops new-offer <slug>       → montar el siguiente');
      break;
    }

    case VERDICT.ITERATE: {
      const learning = `${v.reason} → ${v.next}`;
      await stopAllSpend(offer.slug, { apply: true });
      pipeline.closeTest(offer.slug, { verdict: v.verdict, stats: v, learning });
      pipeline.upsert(offer.slug, { status: pipeline.STATUS.PAUSED });
      console.log('');
      log.warn('Gasto parado. Hay senal, pero hay que cambiar algo antes de volver.');
      log.dim(`  Cambia UNA cosa (${v.diagnosis?.where || 'lo que indique el diagnostico'}) y reabre el test:`);
      log.dim(`  ops test-start --offer ${offer.slug} --days ${test.days} --budget ${test.budgetCap}`);
      if (test.iteration >= test.maxIterations - 1) {
        log.warn(`Te queda ${test.maxIterations - test.iteration} intento. Despues, a la basura.`);
      }
      break;
    }

    case VERDICT.EXTEND: {
      if (autoExtend) {
        const newCap = Math.max(v.power.winThreshold, test.budgetCap * 1.5);
        pipeline.upsert(offer.slug, { test: { ...test, budgetCap: Math.round(newCap) } });
        log.ok(`Tope ampliado a ${money(newCap)} para confirmar si es ganador de verdad.`);
        await optimize(offer, { days: daysWindow, platform, apply: true });
      } else {
        await stopAllSpend(offer.slug, { apply: true });
        console.log('');
        log.info('Pinta bien pero con pocos pedidos. He parado en el tope, como estaba pactado.');
        log.dim(`  Para darle mas cuerda: ops test-start --offer ${offer.slug} --budget ${Math.round(v.power.winThreshold)}`);
        log.dim('  O usa --auto-extend en el cycle para que lo amplie solo cuando pase esto.');
      }
      break;
    }

    case VERDICT.WINNER: {
      pipeline.closeTest(offer.slug, { verdict: v.verdict, stats: v, learning: v.reason });
      pipeline.markWinner(offer.slug);
      console.log('');
      log.ok(`"${offer.slug}" pasa el test. Sale del modo prueba y entra en escalado.`);
      log.dim('  A partir de ahora el tope ya no aplica: lo gobierna optimize con el ROAS objetivo.');
      await optimize(offer, { days: daysWindow, platform, apply: true });
      log.step('No te duermas');
      log.dim('  Prepara 2 creatividades nuevas ya: el ganador se quema en 2-3 semanas.');
      break;
    }
  }

  return { verdict: v, stats };
}
