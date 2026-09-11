import fs from 'node:fs';
import path from 'node:path';
import { STATE_DIR, ensureDir, env } from '../config.js';
import { log, money } from '../lib/log.js';
import * as meta from '../lib/meta.js';
import * as tiktok from '../lib/tiktok.js';

/**
 * Las UTM son lo que permite cruzar gasto con ventas reales de Shopify.
 * Meta sustituye estas macros en cada clic; utm_content acaba siendo el ad id
 * y utm_term el adset id, que es justo lo que espera el motor de decision.
 */
const META_UTMS = (slug) =>
  `utm_source=facebook&utm_medium=paid&utm_campaign=${slug}&utm_content={{ad.id}}&utm_term={{adset.id}}`;

const TIKTOK_UTMS = (slug) =>
  `utm_source=tiktok&utm_medium=paid&utm_campaign=${slug}&utm_content=__CID__&utm_term=__AID__`;

function landingUrl(offer) {
  const store = env('SHOPIFY_STORE', { required: true });
  const domain = offer.domain || `https://${store}`;
  const p = offer.ads?.landingPath || `/pages/${offer.slug}`;
  return `${domain.replace(/\/$/, '')}${p}`;
}

function stateFile(slug) {
  ensureDir(STATE_DIR);
  return path.join(STATE_DIR, `${slug}.launch.json`);
}

export function readLaunchState(slug) {
  const f = stateFile(slug);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { meta: {}, tiktok: {} };
}

function writeLaunchState(slug, state) {
  fs.writeFileSync(stateFile(slug), JSON.stringify(state, null, 2) + '\n');
}

// ── Meta ────────────────────────────────────────────────────────────────────

async function launchMeta(offer, { apply }) {
  const cfg = offer.ads?.meta;
  if (!cfg) throw new Error(`La oferta "${offer.slug}" no tiene bloque ads.meta`);
  const variants = cfg.variants || [];
  if (!variants.length) throw new Error('ads.meta.variants esta vacio: necesitas al menos una creatividad');

  const url = landingUrl(offer);
  const campaignName = `${offer.slug} | test | ${new Date().toISOString().slice(0, 10)}`;

  log.step('Meta · plan');
  log.info(`Campana: ${campaignName} (objetivo OUTCOME_SALES)`);
  log.info(`1 ad set a ${money(cfg.dailyBudget)}/dia, publico ${(cfg.countries || []).join(',')} ${cfg.ageMin}-${cfg.ageMax}`);
  log.info(`${variants.length} anuncio(s): ${variants.map((v) => v.name).join(', ')}`);
  log.info(`Destino: ${url}`);
  log.dim('  Todo se crea EN PAUSA. Lo revisas en el administrador y lo activas tu.');

  if (!apply) {
    log.dim('\n  Simulacion. Anade --apply para crearlo de verdad.');
    return { dryRun: true };
  }

  const state = readLaunchState(offer.slug);

  const campaign = await meta.createCampaign({ name: campaignName });
  log.ok(`Campana creada: ${campaign.id}`);

  const adset = await meta.createAdSet({
    name: `${offer.slug} | ${(cfg.countries || ['ES']).join('-')} | ${cfg.ageMin}-${cfg.ageMax}`,
    campaignId: campaign.id,
    dailyBudget: cfg.dailyBudget,
    targeting: {
      geo_locations: { countries: cfg.countries || ['ES'] },
      age_min: cfg.ageMin || 25,
      age_max: cfg.ageMax || 55,
      // Publico amplio a proposito: con presupuesto bajo, segmentar de mas
      // deja al algoritmo sin espacio para encontrar al comprador.
      targeting_automation: { advantage_audience: 1 },
      ...(cfg.targeting || {}),
    },
  });
  log.ok(`Ad set creado: ${adset.id}`);

  const ads = [];
  for (const v of variants) {
    let imageHash = v.imageHash;
    if (!imageHash && v.image) {
      const bytes = fs.readFileSync(path.resolve(v.image));
      imageHash = await meta.uploadImage(bytes, path.basename(v.image));
      log.dim(`  imagen subida: ${path.basename(v.image)} -> ${imageHash}`);
    }
    if (!imageHash) {
      log.warn(`La variante "${v.name}" no tiene imagen; la salto.`);
      continue;
    }

    const creative = await meta.createCreative({
      name: `${offer.slug} | ${v.name}`,
      imageHash,
      link: url,
      primaryText: v.primaryText,
      headline: v.headline,
      description: v.description,
      cta: v.cta || 'SHOP_NOW',
      urlTags: META_UTMS(offer.slug),
    });

    const ad = await meta.createAd({
      name: `${offer.slug} | ${v.name}`,
      adsetId: adset.id,
      creativeId: creative.id,
    });
    ads.push({ id: ad.id, name: v.name, creativeId: creative.id });
    log.ok(`Anuncio creado: ${v.name} (${ad.id})`);
  }

  state.meta = { campaignId: campaign.id, adsetIds: [adset.id], ads, launchedAt: new Date().toISOString(), url };
  writeLaunchState(offer.slug, state);

  log.step('Siguiente paso');
  log.warn('Entra en el administrador de anuncios, revisa textos e imagenes y activa la campana.');
  log.dim(`  Estado guardado en state/${offer.slug}.launch.json`);
  return state.meta;
}

// ── TikTok ──────────────────────────────────────────────────────────────────

async function launchTikTok(offer, { apply }) {
  const cfg = offer.ads?.tiktok;
  if (!cfg) throw new Error(`La oferta "${offer.slug}" no tiene bloque ads.tiktok`);
  const url = landingUrl(offer);
  const campaignName = `${offer.slug} | test | ${new Date().toISOString().slice(0, 10)}`;

  log.step('TikTok · plan');
  log.info(`Campana: ${campaignName} (objetivo CONVERSIONS)`);
  log.info(`1 ad group a ${money(cfg.dailyBudget)}/dia`);
  log.info(`Destino: ${url}?${TIKTOK_UTMS(offer.slug)}`);

  if (!apply) {
    log.dim('\n  Simulacion. Anade --apply para crearlo de verdad.');
    return { dryRun: true };
  }

  const state = readLaunchState(offer.slug);
  const campaign = await tiktok.createCampaign({ name: campaignName });
  log.ok(`Campana creada: ${campaign.id}`);

  const adgroup = await tiktok.createAdGroup({
    name: `${offer.slug} | ${(cfg.locationIds || []).join('-')}`,
    campaignId: campaign.id,
    dailyBudget: cfg.dailyBudget,
    locationIds: cfg.locationIds || ['2724'],
    ageGroups: cfg.ageGroups,
    gender: cfg.gender,
    startTime: new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 19).replace('T', ' '),
  });
  log.ok(`Ad group creado: ${adgroup.id}`);

  const creatives = (cfg.variants || []).map((v) => ({
    ad_name: `${offer.slug} | ${v.name}`,
    ad_format: 'SINGLE_VIDEO',
    video_id: v.videoId,
    identity_id: env('TIKTOK_IDENTITY_ID', { required: true }),
    identity_type: 'CUSTOMIZED_USER',
    ad_text: v.text,
    call_to_action: v.cta || 'SHOP_NOW',
    landing_page_url: `${url}?${TIKTOK_UTMS(offer.slug)}`,
  })).filter((c) => c.video_id);

  if (!creatives.length) {
    log.warn('Ninguna variante tiene videoId. Sube los videos en TikTok Ads Manager y anota su id en la oferta.');
    state.tiktok = { campaignId: campaign.id, adgroupIds: [adgroup.id], ads: [], launchedAt: new Date().toISOString(), url };
    writeLaunchState(offer.slug, state);
    return state.tiktok;
  }

  const res = await tiktok.createAd({ adgroupId: adgroup.id, creatives });
  log.ok(`${res.ids.length} anuncio(s) creado(s)`);

  state.tiktok = {
    campaignId: campaign.id,
    adgroupIds: [adgroup.id],
    ads: res.ids.map((id, i) => ({ id, name: creatives[i]?.ad_name })),
    launchedAt: new Date().toISOString(),
    url,
  };
  writeLaunchState(offer.slug, state);
  return state.tiktok;
}

export async function adsLaunch(offer, { platform = 'meta', apply = false } = {}) {
  if (platform === 'meta') return launchMeta(offer, { apply });
  if (platform === 'tiktok') return launchTikTok(offer, { apply });
  throw new Error(`Plataforma desconocida: "${platform}". Usa meta o tiktok.`);
}
