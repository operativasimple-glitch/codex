import { request, qs, ApiError } from './http.js';
import { env } from '../config.js';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const TOKEN = () => env('TIKTOK_ACCESS_TOKEN', { required: true });
const ADV = () => env('TIKTOK_ADVERTISER_ID', { required: true });

/** TikTok devuelve 200 con {code, message, data}. code != 0 es un error de verdad. */
function unwrap(body, label) {
  if (body?.code !== 0) {
    throw new ApiError(`tiktok ${label}: [${body?.code}] ${body?.message || 'error desconocido'}`, { body });
  }
  return body.data;
}

async function get(pathname, params = {}) {
  const body = await request(
    `${BASE}/${pathname}?${qs({ advertiser_id: ADV(), ...params })}`,
    { headers: { 'Access-Token': TOKEN() } },
    { label: `tiktok:GET ${pathname}` }
  );
  return unwrap(body, pathname);
}

async function post(pathname, payload = {}) {
  const body = await request(
    `${BASE}/${pathname}`,
    {
      method: 'POST',
      headers: { 'Access-Token': TOKEN(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ advertiser_id: ADV(), ...payload }),
    },
    { label: `tiktok:POST ${pathname}` }
  );
  return unwrap(body, pathname);
}

export const tiktok = { get, post };

export async function account() {
  const d = await get('advertiser/info/', { advertiser_ids: JSON.stringify([ADV()]) });
  return d.list?.[0];
}

// ── Creacion ────────────────────────────────────────────────────────────────

export async function createCampaign({ name, objective = 'CONVERSIONS', status = 'DISABLE' }) {
  const d = await post('campaign/create/', {
    campaign_name: name,
    objective_type: objective,
    budget_mode: 'BUDGET_MODE_INFINITE',
    operation_status: status,
  });
  return { id: d.campaign_id };
}

export async function createAdGroup({
  name, campaignId, dailyBudget, locationIds, status = 'DISABLE',
  optimizationEvent = 'ON_WEB_ORDER', startTime, ageGroups, gender,
}) {
  const d = await post('adgroup/create/', {
    campaign_id: campaignId,
    adgroup_name: name,
    promotion_type: 'WEBSITE',
    placement_type: 'PLACEMENT_TYPE_NORMAL',
    placements: ['PLACEMENT_TIKTOK'],
    pixel_id: env('TIKTOK_PIXEL_ID', { required: true }),
    optimization_event: optimizationEvent,
    optimization_goal: 'CONVERT',
    billing_event: 'OCPM',
    bid_type: 'BID_TYPE_NO_BID',
    budget_mode: 'BUDGET_MODE_DAY',
    budget: dailyBudget,
    schedule_type: 'SCHEDULE_FROM_NOW',
    schedule_start_time: startTime,
    location_ids: locationIds,
    age_groups: ageGroups,
    gender,
    operation_status: status,
  });
  return { id: d.adgroup_id };
}

export async function createAd({ adgroupId, creatives, status = 'DISABLE' }) {
  const d = await post('ad/create/', { adgroup_id: adgroupId, creatives, operation_status: status });
  return { ids: d.ad_ids || [] };
}

// ── Lectura ─────────────────────────────────────────────────────────────────

const METRICS = [
  'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm', 'frequency',
  'conversion', 'total_complete_payment_rate', 'complete_payment', 'total_purchase_value',
];

export async function insights({ level = 'AUCTION_AD', since, until }) {
  const dimensionMap = {
    AUCTION_AD: ['ad_id'],
    AUCTION_ADGROUP: ['adgroup_id'],
    AUCTION_CAMPAIGN: ['campaign_id'],
  };
  const rows = [];
  let page = 1;
  for (;;) {
    const d = await get('report/integrated/get/', {
      report_type: 'BASIC',
      data_level: level,
      dimensions: JSON.stringify(dimensionMap[level]),
      metrics: JSON.stringify(METRICS),
      start_date: since,
      end_date: until,
      page,
      page_size: 200,
    });
    rows.push(...(d.list || []));
    const total = d.page_info?.total_page || 1;
    if (page >= total) break;
    page++;
  }
  return rows.map(normalize);
}

function normalize(r) {
  const m = r.metrics || {};
  const d = r.dimensions || {};
  const spend = Number(m.spend || 0);
  const purchases = Number(m.complete_payment || m.conversion || 0);
  const revenue = Number(m.total_purchase_value || 0);
  return {
    platform: 'tiktok',
    adId: d.ad_id, adName: m.ad_name,
    adsetId: d.adgroup_id, adsetName: m.adgroup_name,
    campaignId: d.campaign_id, campaignName: m.campaign_name,
    spend,
    impressions: Number(m.impressions || 0),
    clicks: Number(m.clicks || 0),
    ctr: Number(m.ctr || 0) / 100,
    cpc: Number(m.cpc || 0),
    cpm: Number(m.cpm || 0),
    frequency: Number(m.frequency || 0),
    purchases,
    revenue,
    platformRoas: spend > 0 ? revenue / spend : 0,
    cpa: purchases > 0 ? spend / purchases : null,
  };
}

// ── Acciones de optimizacion ────────────────────────────────────────────────

export async function setAdStatus(adIds, status) {
  return post('ad/status/update/', { ad_ids: adIds, operation_status: status });
}

export async function setAdGroupStatus(adgroupIds, status) {
  return post('adgroup/status/update/', { adgroup_ids: adgroupIds, operation_status: status });
}

export async function setAdGroupBudget(adgroupId, budget) {
  return post('adgroup/budget/update/', {
    budget_list: [{ adgroup_id: adgroupId, budget }],
  });
}
