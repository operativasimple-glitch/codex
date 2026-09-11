/**
 * Motor de decision. Todo aqui son funciones puras: no tocan ninguna API,
 * asi que se pueden probar y auditar sin gastar un euro.
 */

export const ACTIONS = {
  KILL: 'KILL',
  SCALE: 'SCALE',
  ROTATE: 'ROTATE',
  HOLD: 'HOLD',
};

/** Parsea las UTM que Shopify guarda en la primera visita del cliente. */
export function orderAttribution(order) {
  const utm = order?.customerJourneySummary?.firstVisit?.utmParameters || {};
  return {
    source: utm.source || null,
    medium: utm.medium || null,
    campaign: utm.campaign || null,
    // Convencion de este repo: utm_content lleva el ad id, utm_term el adset id.
    adId: utm.content || null,
    adsetId: utm.term || null,
  };
}

export function orderRevenue(order) {
  const gross = Number(order?.currentTotalPriceSet?.shopMoney?.amount || 0);
  const refunded = Number(order?.totalRefundedSet?.shopMoney?.amount || 0);
  return Math.max(0, gross - refunded);
}

/**
 * Cruza el gasto de la plataforma con los ingresos reales de Shopify.
 * El ROAS de la plataforma cuenta conversiones dentro de su ventana de
 * atribucion, que casi siempre infla el numero. El unico que paga las facturas
 * es el que sale de los pedidos de verdad.
 */
export function joinSpendWithOrders(insights, orders, { productHandle } = {}) {
  const byAd = new Map();
  const byAdset = new Map();

  for (const o of orders) {
    if (o.test || o.cancelledAt) continue;
    if (productHandle) {
      const hit = (o.lineItems?.nodes || []).some((li) => li.product?.handle === productHandle);
      if (!hit) continue;
    }
    const { adId, adsetId } = orderAttribution(o);
    const rev = orderRevenue(o);
    if (adId) {
      const cur = byAd.get(adId) || { revenue: 0, orders: 0 };
      byAd.set(adId, { revenue: cur.revenue + rev, orders: cur.orders + 1 });
    }
    if (adsetId) {
      const cur = byAdset.get(adsetId) || { revenue: 0, orders: 0 };
      byAdset.set(adsetId, { revenue: cur.revenue + rev, orders: cur.orders + 1 });
    }
  }

  return insights.map((row) => {
    const matched = byAd.get(row.adId) || byAdset.get(row.adsetId) || null;
    const realRevenue = matched?.revenue ?? null;
    const realOrders = matched?.orders ?? null;
    return {
      ...row,
      realRevenue,
      realOrders,
      realRoas: realRevenue != null && row.spend > 0 ? realRevenue / row.spend : null,
      // Si Shopify no pudo atribuir (bloqueadores, compra en otro dispositivo),
      // caemos al dato de la plataforma en vez de dar la fila por muerta.
      effectiveRoas: realRevenue != null && row.spend > 0 ? realRevenue / row.spend : row.platformRoas,
      attributed: realRevenue != null,
    };
  });
}

export function aggregate(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const cur = map.get(k) || {
      key: k, platform: r.platform, name: r.adsetName || r.campaignName || k,
      spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0, realRevenue: 0,
      attributed: false, frequency: 0, _n: 0,
    };
    cur.spend += r.spend;
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.purchases += r.purchases;
    cur.revenue += r.revenue;
    cur.realRevenue += r.realRevenue || 0;
    cur.attributed = cur.attributed || r.attributed;
    cur.frequency = Math.max(cur.frequency, r.frequency || 0);
    cur._n++;
    map.set(k, cur);
  }
  return [...map.values()].map((c) => ({
    ...c,
    ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
    cpa: c.purchases > 0 ? c.spend / c.purchases : null,
    platformRoas: c.spend > 0 ? c.revenue / c.spend : 0,
    realRoas: c.attributed && c.spend > 0 ? c.realRevenue / c.spend : null,
    effectiveRoas: c.spend > 0 ? (c.attributed ? c.realRevenue : c.revenue) / c.spend : 0,
  }));
}

/**
 * Decide que hacer con una fila. Devuelve siempre un motivo legible:
 * si no puedes explicar por que mataste algo, no deberias haberlo matado.
 */
export function decide(row, economics, { daysRunning = 99, level = 'ad', currentBudget = null } = {}) {
  const e = economics;
  const roas = row.effectiveRoas ?? 0;
  const spend = row.spend || 0;
  const fmt = (n) => (n == null ? 'n/d' : Number(n).toFixed(2));

  // 1. Sangrado puro: gasto suficiente y cero ventas. No hace falta esperar mas.
  if (row.purchases === 0 && !row.realOrders && spend >= e.minSpendAdNoSale) {
    return {
      action: ACTIONS.KILL,
      reason: `${fmt(spend)} gastados y ninguna venta (umbral ${fmt(e.minSpendAdNoSale)})`,
      confidence: 'alta',
    };
  }

  // 2. Fase de aprendizaje: el algoritmo aun no ha estabilizado. Tocar ahora
  //    solo genera ruido y reinicia el aprendizaje.
  if (daysRunning < e.learningDays) {
    return {
      action: ACTIONS.HOLD,
      reason: `en aprendizaje (dia ${daysRunning} de ${e.learningDays})`,
      confidence: 'alta',
    };
  }

  // 3. Muestra insuficiente para concluir nada.
  const minSpend = level === 'ad' ? e.minSpendAdNoSale : e.minSpendAdset;
  if (spend < minSpend) {
    return {
      action: ACTIONS.HOLD,
      reason: `datos insuficientes (${fmt(spend)} de ${fmt(minSpend)})`,
      confidence: 'media',
    };
  }

  // 4. Por debajo del ROAS de corte: pierde dinero de forma sostenida.
  if (roas < e.killRoas) {
    return {
      action: ACTIONS.KILL,
      reason: `ROAS ${fmt(roas)} por debajo del corte ${fmt(e.killRoas)} (break-even ${fmt(e.breakevenRoas)})`,
      confidence: row.attributed ? 'alta' : 'media',
    };
  }

  // 5. Creatividad quemada: la audiencia ya la ha visto demasiadas veces.
  if (row.frequency >= e.frequencyRotate) {
    return {
      action: ACTIONS.ROTATE,
      reason: `frecuencia ${fmt(row.frequency)} >= ${fmt(e.frequencyRotate)}, la creatividad esta quemada`,
      confidence: 'media',
    };
  }

  // 6. Ganador: escalar, pero despacio.
  if (roas >= e.targetRoas && level === 'adset') {
    const next = currentBudget ? Math.min(currentBudget * (1 + e.scaleStepPct), e.maxDailyBudget) : null;
    if (currentBudget && next <= currentBudget + 0.01) {
      return { action: ACTIONS.HOLD, reason: `ganador pero ya en el tope de ${fmt(e.maxDailyBudget)}/dia`, confidence: 'alta' };
    }
    return {
      action: ACTIONS.SCALE,
      reason: `ROAS ${fmt(roas)} >= objetivo ${fmt(e.targetRoas)}`,
      newBudget: next,
      confidence: 'alta',
    };
  }

  return {
    action: ACTIONS.HOLD,
    reason: `ROAS ${fmt(roas)} entre el corte y el objetivo, se deja correr`,
    confidence: 'media',
  };
}

/** Resumen de la cuenta: lo unico que de verdad dice si el negocio funciona. */
export function blended(rows, orders, { productHandle } = {}) {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const relevant = orders.filter((o) => {
    if (o.test || o.cancelledAt) return false;
    if (!productHandle) return true;
    return (o.lineItems?.nodes || []).some((li) => li.product?.handle === productHandle);
  });
  const revenue = relevant.reduce((s, o) => s + orderRevenue(o), 0);
  return {
    spend,
    revenue,
    orders: relevant.length,
    blendedRoas: spend > 0 ? revenue / spend : 0,
    cac: relevant.length > 0 ? spend / relevant.length : null,
    profit: revenue - spend,
  };
}
