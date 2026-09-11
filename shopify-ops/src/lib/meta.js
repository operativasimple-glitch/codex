import { request, qs } from './http.js';
import { env } from '../config.js';

const V = () => env('META_API_VERSION', { fallback: 'v21.0' });
const GRAPH = () => `https://graph.facebook.com/${V()}`;
const TOKEN = () => env('META_ACCESS_TOKEN', { required: true });
const ACCT = () => env('META_AD_ACCOUNT_ID', { required: true });

async function get(pathname, params = {}) {
  const url = `${GRAPH()}/${pathname}?${qs({ ...params, access_token: TOKEN() })}`;
  return request(url, {}, { label: `meta:GET ${pathname}` });
}

async function post(pathname, params = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  body.append('access_token', TOKEN());
  return request(`${GRAPH()}/${pathname}`, { method: 'POST', body }, { label: `meta:POST ${pathname}` });
}

export const meta = { get, post };

// ── Comprobaciones ──────────────────────────────────────────────────────────

export async function account() {
  return get(ACCT(), { fields: 'name,account_status,currency,timezone_name,amount_spent,disable_reason' });
}

export async function pixels() {
  const d = await get(`${ACCT()}/adspixels`, { fields: 'id,name,last_fired_time' });
  return d.data || [];
}

// ── Creacion de campanas ────────────────────────────────────────────────────

/**
 * Campana de ventas. El presupuesto va en el ad set (ABO), no en la campana:
 * con productos digitales de ticket bajo conviene controlar el gasto por
 * publico para poder matar uno sin tocar los demas.
 */
export async function createCampaign({ name, objective = 'OUTCOME_SALES', status = 'PAUSED' }) {
  return post(`${ACCT()}/campaigns`, {
    name,
    objective,
    status,
    special_ad_categories: [],
    buying_type: 'AUCTION',
  });
}

export async function createAdSet({
  name, campaignId, dailyBudget, targeting, status = 'PAUSED',
  optimizationGoal = 'OFFSITE_CONVERSIONS', customEvent = 'PURCHASE', startTime,
}) {
  return post(`${ACCT()}/adsets`, {
    name,
    campaign_id: campaignId,
    // La API de Meta trabaja en la unidad minima de la moneda (centimos en EUR).
    daily_budget: Math.round(dailyBudget * 100),
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    promoted_object: { pixel_id: env('META_PIXEL_ID', { required: true }), custom_event_type: customEvent },
    targeting,
    start_time: startTime,
    status,
  });
}

export async function uploadImage(bytes, filename = 'creative.jpg') {
  const form = new FormData();
  form.append('access_token', TOKEN());
  form.append(filename, new Blob([bytes]), filename);
  const d = await request(`${GRAPH()}/${ACCT()}/adimages`, { method: 'POST', body: form }, { label: 'meta:adimages' });
  const first = Object.values(d.images || {})[0];
  return first?.hash;
}

export async function createCreative({ name, imageHash, link, primaryText, headline, description, cta = 'SHOP_NOW', urlTags }) {
  return post(`${ACCT()}/adcreatives`, {
    name,
    object_story_spec: {
      page_id: env('META_PAGE_ID', { required: true }),
      instagram_actor_id: env('META_INSTAGRAM_ACTOR_ID') || undefined,
      link_data: {
        image_hash: imageHash,
        link,
        message: primaryText,
        name: headline,
        description,
        call_to_action: { type: cta, value: { link } },
      },
    },
    degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
    url_tags: urlTags,
  });
}

export async function createAd({ name, adsetId, creativeId, status = 'PAUSED' }) {
  return post(`${ACCT()}/ads`, { name, adset_id: adsetId, creative: { creative_id: creativeId }, status });
}

// ── Lectura de resultados ───────────────────────────────────────────────────

const INSIGHT_FIELDS = [
  'ad_id', 'ad_name', 'adset_id', 'adset_name', 'campaign_id', 'campaign_name',
  'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency',
  'actions', 'action_values', 'purchase_roas',
].join(',');

/** level: 'ad' | 'adset' | 'campaign'. since/until en YYYY-MM-DD. */
export async function insights({ level = 'ad', since, until, campaignIds }) {
  const params = {
    level,
    fields: INSIGHT_FIELDS,
    time_range: { since, until },
    time_increment: 'all_days',
    limit: 500,
  };
  if (campaignIds?.length) {
    params.filtering = [{ field: 'campaign.id', operator: 'IN', value: campaignIds }];
  }
  const rows = [];
  let next = `${GRAPH()}/${ACCT()}/insights?${qs({ ...params, access_token: TOKEN() })}`;
  while (next) {
    const d = await request(next, {}, { label: 'meta:insights' });
    rows.push(...(d.data || []));
    next = d.paging?.next || null;
  }
  return rows.map(normalizeInsight);
}

function normalizeInsight(r) {
  const find = (list, type) => Number((list || []).find((a) => a.action_type === type)?.value || 0);
  const purchases = find(r.actions, 'purchase') || find(r.actions, 'omni_purchase');
  const revenue = find(r.action_values, 'purchase') || find(r.action_values, 'omni_purchase');
  const spend = Number(r.spend || 0);
  return {
    platform: 'meta',
    adId: r.ad_id, adName: r.ad_name,
    adsetId: r.adset_id, adsetName: r.adset_name,
    campaignId: r.campaign_id, campaignName: r.campaign_name,
    spend,
    impressions: Number(r.impressions || 0),
    clicks: Number(r.clicks || 0),
    ctr: Number(r.ctr || 0) / 100,
    cpc: Number(r.cpc || 0),
    cpm: Number(r.cpm || 0),
    frequency: Number(r.frequency || 0),
    purchases,
    revenue,
    // ROAS que reporta la plataforma. Suele inflarse por la ventana de atribucion;
    // el que manda es el que calculamos contra los pedidos reales de Shopify.
    platformRoas: spend > 0 ? revenue / spend : 0,
    cpa: purchases > 0 ? spend / purchases : null,
  };
}

// ── Acciones de optimizacion ────────────────────────────────────────────────

export async function setStatus(id, status) {
  return post(id, { status });
}

export async function setDailyBudget(adsetId, amount) {
  return post(adsetId, { daily_budget: Math.round(amount * 100) });
}

export async function getAdSet(adsetId) {
  return get(adsetId, { fields: 'id,name,daily_budget,status,effective_status,learning_stage_info' });
}
