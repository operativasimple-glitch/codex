/**
 * Veredicto de un test de producto.
 *
 * La idea que gobierna todo este fichero: matar es barato, confirmar un ganador
 * es caro. Con 90 € puedes demostrar con bastante seguridad que algo NO funciona;
 * para demostrar que SI funciona necesitas el triple. Por eso un test con poco
 * presupuesto es perfectamente valido para descartar productos en serie, pero no
 * puede declarar ganador a nadie. El tope de gasto se respeta siempre.
 *
 * Funciones puras: no tocan ninguna API.
 */

export const VERDICT = {
  RUNNING: 'RUNNING',   // el test sigue vivo, aun no toca decidir
  KILL: 'KILL',         // no funciona: parar y pasar al siguiente producto
  ITERATE: 'ITERATE',   // hay senal: merece un cambio concreto y otra vuelta
  EXTEND: 'EXTEND',     // pinta bien pero con muy pocos pedidos: amplia antes de escalar
  WINNER: 'WINNER',     // funciona y hay datos para creerselo: escalar
};

/** Pedidos observados que hacen creible un veredicto de ganador. */
const MIN_ORDERS_WIN = 8;

/**
 * Numero de pedidos que, bajo la hipotesis de que la oferta va justa de rentable,
 * deberiamos haber visto con este gasto. Si el observado es cero y este numero es
 * alto, la hipotesis se cae: probabilidad de cero pedidos ≈ e^-N.
 *   N = 3  → ~5% de probabilidad de que sea mala suerte
 *   N = 5  → ~0,7%
 */
const KILL_CONFIDENCE_N = 3;

/**
 * Cuanto presupuesto hace falta para que este test signifique algo.
 * Se calcula ANTES de gastar, para no montar un test que no puede concluir nada.
 */
export function testPower({ budgetCap }, economics, price) {
  const be = economics.breakevenRoas;
  const target = economics.targetRoas;

  // Gasto con el que cero ventas ya es evidencia solida de que no funciona.
  const killThreshold = (KILL_CONFIDENCE_N * price) / be;
  // Gasto con el que un ganador habria producido pedidos suficientes para creerselo.
  const winThreshold = (MIN_ORDERS_WIN * price) / target;
  // Pedidos esperados si la oferta rindiera justo al ROAS objetivo.
  const expectedOrdersIfWinner = (budgetCap * target) / price;

  return {
    killThreshold: round2(killThreshold),
    winThreshold: round2(winThreshold),
    expectedOrdersIfWinner: round2(expectedOrdersIfWinner),
    canKill: budgetCap >= killThreshold,
    canConfirmWin: budgetCap >= winThreshold,
  };
}

/**
 * Donde esta el cuello de botella. Sirve para saber QUE cambiar en la siguiente
 * vuelta en vez de cambiarlo todo a la vez y no aprender nada.
 */
export function diagnose({ spend, clicks, impressions, orders }, economics, price) {
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cvr = clicks > 0 ? orders / clicks : 0;
  const cpc = clicks > 0 ? spend / clicks : null;

  if (impressions < 1000) {
    return { where: 'datos', text: 'Muy pocas impresiones para diagnosticar nada todavia.' };
  }
  if (ctr < 0.01) {
    return {
      where: 'anuncio',
      text: `CTR ${(ctr * 100).toFixed(2)}%: el gancho no engancha. Cambia el angulo del anuncio, no la landing.`,
      fix: 'Escribe 3 angulos nuevos: otro dolor, otra objecion, otro resultado.',
    };
  }
  if (clicks >= 100 && cvr < 0.01) {
    return {
      where: 'landing',
      text: `CTR ${(ctr * 100).toFixed(2)}% pero solo ${(cvr * 100).toFixed(2)}% de los clics compran: el anuncio funciona y la landing no.`,
      fix: 'Cambia el titular y revisa precio, garantia y las 3 primeras objeciones del FAQ.',
    };
  }
  if (cvr >= 0.01) {
    return {
      where: 'precio',
      text: `La gente compra (${(cvr * 100).toFixed(2)}% de los clics) pero el CPC de ${fmt(cpc)} no lo cubre.`,
      fix: `Sube el precio, anade un upsell, o busca trafico mas barato. Necesitas ${fmt(price / (economics.breakevenRoas * (cvr || 1)))} de CPC maximo.`,
    };
  }
  return { where: 'datos', text: 'Aun no hay clics suficientes para separar anuncio de landing.' };
}

/**
 * El veredicto. `stats` sale de blended() + los agregados de anuncios.
 * `test` es el registro del test en curso: { startedAt, days, budgetCap, iteration, maxIterations }.
 */
export function verdict(stats, economics, test, price, now = new Date()) {
  const spend = stats.spend || 0;
  const revenue = stats.revenue || 0;
  const orders = stats.orders || 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const be = economics.breakevenRoas;
  const target = economics.targetRoas;

  const daysElapsed = Math.max(1, Math.ceil((now - new Date(test.startedAt)) / 86400_000));
  const capHit = spend >= test.budgetCap;
  const windowOver = daysElapsed >= test.days;
  const power = testPower(test, economics, price);
  const diag = diagnose(stats, economics, price);
  const lastIteration = (test.iteration || 1) >= (test.maxIterations || 2);

  const base = {
    spend: round2(spend), revenue: round2(revenue), orders,
    roas: round2(roas), daysElapsed, capHit, windowOver, power, diagnosis: diag,
    budgetLeft: round2(Math.max(0, test.budgetCap - spend)),
  };

  // ── Muerte temprana ───────────────────────────────────────────────────────
  // Si ya hay evidencia suficiente de que no vende, no se espera a fin de semana.
  // Esto es lo que evita quemar el tope entero en un producto muerto.
  if (orders === 0 && spend >= power.killThreshold) {
    return {
      ...base,
      verdict: VERDICT.KILL,
      reason: `${fmt(spend)} gastados y cero ventas. Un producto minimamente rentable habria dado ~${KILL_CONFIDENCE_N} pedidos con este gasto.`,
      next: 'Para todo y pasa al siguiente producto de la lista.',
      early: !windowOver,
    };
  }

  // ── Test aun en marcha ────────────────────────────────────────────────────
  if (!capHit && !windowOver) {
    return {
      ...base,
      verdict: VERDICT.RUNNING,
      reason: `Dia ${daysElapsed} de ${test.days}, ${fmt(spend)} de ${fmt(test.budgetCap)} gastados.`,
      next: daysElapsed <= (economics.learningDays || 3)
        ? 'Fase de aprendizaje: no toques nada.'
        : 'Sigue. El veredicto llega al cerrar la ventana o al tocar el tope.',
    };
  }

  const closedBy = capHit ? `tope de ${fmt(test.budgetCap)} alcanzado` : `${test.days} dias cumplidos`;

  // ── Ganador ───────────────────────────────────────────────────────────────
  if (roas >= target) {
    if (orders >= MIN_ORDERS_WIN) {
      return {
        ...base,
        verdict: VERDICT.WINNER,
        reason: `ROAS ${roas.toFixed(2)} sobre un objetivo de ${target} con ${orders} pedidos (${closedBy}).`,
        next: 'Sube presupuesto un 20% al dia y prepara 2 creatividades nuevas antes de que se queme la actual.',
      };
    }
    return {
      ...base,
      verdict: VERDICT.EXTEND,
      reason: `ROAS ${roas.toFixed(2)} pero solo ${orders} pedido(s): con tan pocos datos el numero todavia es ruido.`,
      next: `Amplia el tope hasta ${fmt(power.winThreshold)} sin tocar nada mas. Si aguanta el ROAS, es ganador.`,
    };
  }

  // ── Rentable pero flojo: NO se mata algo que da dinero ─────────────────────
  if (roas >= be) {
    return {
      ...base,
      verdict: VERDICT.ITERATE,
      reason: `ROAS ${roas.toFixed(2)}: por encima del equilibrio (${be}) pero por debajo del objetivo (${target}).`,
      next: `Gana dinero, no lo mates. ${diag.fix || diag.text}`,
    };
  }

  // ── Pierde dinero ─────────────────────────────────────────────────────────
  if (lastIteration) {
    return {
      ...base,
      verdict: VERDICT.KILL,
      reason: `ROAS ${roas.toFixed(2)} bajo el equilibrio (${be}) tras ${test.iteration} intento(s). ${diag.text}`,
      next: 'Se acabaron los intentos para este producto. Para todo y pasa al siguiente.',
    };
  }

  return {
    ...base,
    verdict: VERDICT.ITERATE,
    reason: `ROAS ${roas.toFixed(2)} bajo el equilibrio (${be}), ${closedBy}. ${diag.text}`,
    next: diag.fix || 'Cambia una sola cosa y vuelve a medir.',
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) => (n == null ? 'n/d' : `${round2(n)} €`);
