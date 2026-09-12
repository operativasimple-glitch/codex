import { log, money } from '../lib/log.js';
import * as metaApi from '../lib/meta.js';
import * as tiktokApi from '../lib/tiktok.js';
import * as pipeline from '../lib/pipeline.js';
import { readLaunchState } from './ads-launch.js';

/**
 * Para TODO el gasto de una oferta. Es el freno de mano del sistema:
 * pausa la campana entera en cada plataforma, no anuncio a anuncio, para que
 * no quede nada corriendo por un fallo parcial.
 */
export async function stopAllSpend(slug, { apply = false } = {}) {
  const state = readLaunchState(slug);
  const targets = [];

  if (state.meta?.campaignId) targets.push({ platform: 'meta', id: state.meta.campaignId });
  if (state.tiktok?.campaignId) targets.push({ platform: 'tiktok', id: state.tiktok.campaignId });

  if (!targets.length) {
    log.warn(`No hay campanas registradas para "${slug}" en state/${slug}.launch.json.`);
    log.dim('  Si lanzaste a mano, pausalas tu en el administrador.');
    return { stopped: [], targets };
  }

  if (!apply) {
    targets.forEach((t) => log.info(`pausaria la campana de ${t.platform}: ${t.id}`));
    return { stopped: [], targets, dryRun: true };
  }

  const stopped = [];
  for (const t of targets) {
    try {
      if (t.platform === 'meta') await metaApi.setStatus(t.id, 'PAUSED');
      else await tiktokApi.post('campaign/status/update/', { campaign_ids: [t.id], operation_status: 'DISABLE' });
      log.ok(`Campana de ${t.platform} pausada (${t.id})`);
      stopped.push(t);
    } catch (e) {
      log.err(`No he podido pausar ${t.platform} ${t.id}: ${e.message}`);
      log.warn('PAUSALA A MANO AHORA MISMO en el administrador de anuncios.');
    }
  }
  return { stopped, targets };
}

/**
 * Mata un producto: para el gasto, lo marca como descartado y guarda lo aprendido.
 * El aprendizaje es obligatorio: probar veinte productos sin anotar por que
 * murio cada uno es pagar veinte veces por la misma leccion.
 */
export async function killOffer(slug, { learning, apply = false } = {}) {
  log.step(`Matando "${slug}"`);

  const res = await stopAllSpend(slug, { apply });

  if (!apply) {
    log.dim('\n  Simulacion. Anade --apply para parar de verdad y marcarlo como descartado.');
    return res;
  }

  const entry = pipeline.get(slug);
  if (entry?.test) {
    pipeline.closeTest(slug, {
      verdict: 'KILL',
      stats: { spend: 0, revenue: 0, orders: 0, roas: 0 },
      learning: learning || 'Cerrado a mano sin anotar el motivo.',
    });
  }
  pipeline.markDead(slug, learning || null);

  log.ok(`"${slug}" marcado como descartado.`);
  if (!learning) {
    log.warn('No has anotado que aprendiste. Usa --learning "..." la proxima vez.');
    log.dim('  Sin eso, dentro de tres productos no recordaras por que este fallo.');
  }

  log.step('Siguiente');
  log.dim('  ops board                 → ver como va la cartera');
  log.dim('  ops new-offer <slug>      → montar el siguiente producto');
  return res;
}
