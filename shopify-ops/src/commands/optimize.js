import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, ensureDir } from '../config.js';
import { log, table, money } from '../lib/log.js';
import { decide, aggregate, blended, ACTIONS } from '../lib/metrics.js';
import { gather } from './report.js';
import { readLaunchState } from './ads-launch.js';
import * as metaApi from '../lib/meta.js';
import * as tiktokApi from '../lib/tiktok.js';

const ICON = { KILL: '✗', SCALE: '↑', ROTATE: '↻', HOLD: '·' };

function daysSinceLaunch(offer) {
  const s = readLaunchState(offer.slug);
  const dates = [s.meta?.launchedAt, s.tiktok?.launchedAt].filter(Boolean);
  if (!dates.length) return 99; // sin estado guardado, asumimos que ya paso el aprendizaje
  const oldest = Math.min(...dates.map((d) => new Date(d).getTime()));
  return Math.max(1, Math.floor((Date.now() - oldest) / 86400_000) + 1);
}

function logDecisions(slug, entries) {
  ensureDir(STATE_DIR);
  const f = path.join(STATE_DIR, 'decisions.jsonl');
  const ts = new Date().toISOString();
  fs.appendFileSync(f, entries.map((e) => JSON.stringify({ ts, slug, ...e })).join('\n') + '\n');
  return f;
}

/**
 * Revisa la cuenta y decide que matar, que escalar y que rotar.
 * Por defecto solo enseña las decisiones; hay que pasar --apply para ejecutarlas.
 */
export async function optimize(offer, { days = 7, platform = 'all', apply = false } = {}) {
  const { since, until, rows, orders } = await gather(offer, { days, platform });
  const e = offer.economics;
  const daysRunning = daysSinceLaunch(offer);

  log.step(`Optimizacion · ${offer.name} · ${since} a ${until} · dia ${daysRunning}`);

  if (!rows.length) {
    log.warn('Sin datos de anuncios en esta ventana. Nada que decidir.');
    return { decisions: [] };
  }

  const b = blended(rows, orders, { productHandle: offer.slug });
  log.dim(`  Gasto ${money(b.spend)} · ingresos ${money(b.revenue)} · ROAS ${b.blendedRoas.toFixed(2)} · equilibrio ${e.breakevenRoas}`);

  // ── Decisiones a nivel de anuncio ─────────────────────────────────────────
  const adDecisions = rows
    .filter((r) => r.adId)
    .map((r) => ({ level: 'ad', row: r, ...decide(r, e, { daysRunning, level: 'ad' }) }));

  // ── Decisiones a nivel de ad set ──────────────────────────────────────────
  const adsets = aggregate(rows, (r) => r.adsetId);
  // Leemos el presupuesto actual siempre, tambien en simulacion, para poder
  // enseñar a cuanto subiria cada ad set antes de tocar nada.
  const budgets = new Map();
  for (const a of adsets) {
    if (a.platform !== 'meta') continue;
    try {
      const info = await metaApi.getAdSet(a.key);
      budgets.set(a.key, Number(info.daily_budget || 0) / 100);
    } catch { /* sin permiso de lectura, seguimos sin presupuesto */ }
  }
  const adsetDecisions = adsets.map((a) => ({
    level: 'adset',
    row: a,
    ...decide(a, e, { daysRunning, level: 'adset', currentBudget: budgets.get(a.key) || null }),
  }));

  const all = [...adsetDecisions, ...adDecisions];

  console.log('');
  table(all, [
    { label: '', get: (d) => ICON[d.action] },
    { label: 'Nivel', get: (d) => d.level },
    { label: 'Nombre', get: (d) => (d.row.adName || d.row.name || d.row.key || d.row.adId || '').slice(0, 30) },
    { label: 'Gasto', get: (d) => money(d.row.spend) },
    { label: 'ROAS', get: (d) => (d.row.effectiveRoas ?? 0).toFixed(2) },
    { label: 'Accion', get: (d) => d.action },
    { label: 'Motivo', get: (d) => d.reason },
  ]);

  const actionable = all.filter((d) => d.action !== ACTIONS.HOLD);

  // ── Aviso de oferta muerta ────────────────────────────────────────────────
  const activeAdsets = adsetDecisions.length;
  const killedAdsets = adsetDecisions.filter((d) => d.action === ACTIONS.KILL).length;
  if (activeAdsets > 0 && killedAdsets === activeAdsets && b.spend >= e.minSpendAdset) {
    console.log('');
    log.err('Todos los ad sets estan para matar: esta oferta no funciona tal y como esta.');
    log.dim('  Antes de volver a gastar, cambia UNA cosa y vuelve a medir:');
    log.dim('  1. El angulo del anuncio (mismo producto, dolor distinto) — es lo mas barato y lo que mas mueve.');
    log.dim('  2. La landing (titular y precio) si el CTR es bueno pero no hay ventas.');
    log.dim('  3. La oferta entera si ni el angulo ni la landing mueven la aguja.');
    log.dim(`  Mira el CTR: por encima de 1% el anuncio funciona y el problema es la landing; por debajo, el problema es el anuncio.`);
  }

  if (!actionable.length) {
    console.log('');
    log.ok('Nada que cambiar en esta pasada.');
    return { decisions: all, applied: [] };
  }

  if (!apply) {
    console.log('');
    log.warn(`${actionable.length} accion(es) pendientes. Simulacion: no he tocado nada.`);
    log.dim('  Para ejecutarlas: anade --apply');
    logDecisions(offer.slug, actionable.map((d) => ({
      level: d.level, action: d.action, reason: d.reason, applied: false,
      id: d.row.adId || d.row.key, spend: d.row.spend, roas: d.row.effectiveRoas,
    })));
    return { decisions: all, applied: [] };
  }

  // ── Ejecucion ─────────────────────────────────────────────────────────────
  console.log('');
  log.step('Aplicando');
  const applied = [];

  for (const d of actionable) {
    const id = d.row.adId || d.row.key;
    const isMeta = (d.row.platform || 'meta') === 'meta';
    try {
      if (d.action === ACTIONS.KILL) {
        if (isMeta) await metaApi.setStatus(id, 'PAUSED');
        else if (d.level === 'ad') await tiktokApi.setAdStatus([id], 'DISABLE');
        else await tiktokApi.setAdGroupStatus([id], 'DISABLE');
        log.ok(`Pausado ${d.level} ${id} — ${d.reason}`);
        applied.push({ ...d, ok: true });
      } else if (d.action === ACTIONS.SCALE && d.newBudget) {
        if (isMeta) await metaApi.setDailyBudget(id, d.newBudget);
        else await tiktokApi.setAdGroupBudget(id, d.newBudget);
        log.ok(`Presupuesto de ${id}: ${money(budgets.get(id) || 0)} → ${money(d.newBudget)}/dia`);
        applied.push({ ...d, ok: true });
      } else if (d.action === ACTIONS.ROTATE) {
        // Rotar creatividad no se automatiza: hace falta material nuevo.
        log.warn(`Sube creatividad nueva para ${id} — ${d.reason}`);
        applied.push({ ...d, ok: true, manual: true });
      }
    } catch (err) {
      log.err(`Fallo en ${d.action} sobre ${id}: ${err.message}`);
      applied.push({ ...d, ok: false, error: err.message });
    }
  }

  const file = logDecisions(offer.slug, applied.map((d) => ({
    level: d.level, action: d.action, reason: d.reason, applied: d.ok,
    id: d.row.adId || d.row.key, spend: d.row.spend, roas: d.row.effectiveRoas,
    newBudget: d.newBudget, error: d.error,
  })));

  console.log('');
  log.ok(`${applied.filter((a) => a.ok).length} de ${actionable.length} acciones aplicadas.`);
  log.dim(`  Registro: ${path.relative(process.cwd(), file)}`);
  return { decisions: all, applied };
}
