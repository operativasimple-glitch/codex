// Simulador de gestión avanzada para la entrada con orden limitada en el borde.
// Ruptura de Londres con orden limitada en el borde + gestión avanzada (breakeven, trailing, parciales, piramidar).
// Mismo emulador que lb.js: órdenes decididas al cierre activas desde la vela siguiente, recorrido O→H→L→C o
// O→L→H→C, huecos en la apertura y deslizamiento en todas las ejecuciones. BE / trailing se ajustan al cierre.
const E = require('../ema-vwap/engine.js');
const hhmm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

function run(bars, cfg) {
  const p = Object.assign({
    contract: 'MNQ', stopPts: 10, target: 'opposite', targetR: 2.5,
    qty: 1,                 // contratos al entrar
    partials: [],           // [{ qty, r }] cerrar qty contratos a r × riesgo
    beR: 0, beOffTicks: 2,  // breakeven al ir beR × riesgo a favor (0 = off)
    trailStartR: 0, trailDistR: 0, // trailing: activa a trailStartR, distancia trailDistR (× riesgo)
    addEveryR: 0, addQty: 1, maxAdds: 0, addMovesStopToBE: true, // piramidar
    ls: '03:00', le: '09:00', tf: '09:30', lastEntry: '15:00', closeAt: '15:55', slipTicks: 1
  }, cfg);
  const spec = E.CONTRACTS[p.contract], tick = spec.tick, slip = p.slipTicks * tick, pv = spec.pointValue, comm = spec.commission;
  const rt = x => Math.round(x / tick) * tick;
  const LS = hhmm(p.ls), LE = hhmm(p.le), TF = hhmm(p.tf), LAST = hhmm(p.lastEntry), CA = hhmm(p.closeAt);
  const gaps = []; for (let i = 1; i < 300; i++) gaps.push(bars[i].t - bars[i - 1].t); gaps.sort((a, b) => a - b);
  const barMs = gaps[gaps.length >> 1];
  const trades = [];
  let pos = null, limits = null, closeAll = false, day = null;

  const fillLot = (qty, px) => { pos.lots.push({ qty, entry: px + pos.side * slip }); pos.maxQty = Math.max(pos.maxQty, pos.lots.reduce((a, l) => a + l.qty, 0)); };
  const closeQty = (qty, px, why) => {
    let left = qty;
    while (left > 0 && pos.lots.length) {
      const l = pos.lots[0], q = Math.min(l.qty, left);
      pos.pnl += (px - pos.side * slip - l.entry) * pos.side * pv * q - comm * q;
      l.qty -= q; left -= q; if (!l.qty) pos.lots.shift();
    }
    pos.reasons.push(why);
    if (!pos.lots.length) { trades.push({ side: pos.side, pnl: pos.pnl, reasons: pos.reasons, maxQty: pos.maxQty, t: pos.t, risk: pos.risk }); pos = null; }
  };
  const openPos = (i, side, px, o) => {
    pos = { side, lots: [], stop: o.stop, target: o.target, risk: o.risk, first: px + side * slip, best: null, pnl: 0, reasons: [], maxQty: 0, t: bars[i].t,
      partials: p.partials.map(x => ({ qty: x.qty, px: rt(o.ref + side * x.r * o.risk) })), adds: 0,
      addLevels: p.maxAdds > 0 && p.addEveryR > 0 ? Array.from({ length: p.maxAdds }, (_, k) => ({ px: rt(o.ref + side * (k + 1) * p.addEveryR * o.risk) })) : [], beDone: false };
    fillLot(p.qty, px);
    day.n++; limits = null;
  };
  const qtyOpen = () => pos.lots.reduce((a, l) => a + l.qty, 0);
  // Niveles a favor en orden de distancia: parciales, añadidos y objetivo
  const favorable = (from, to, isGap) => {
    const s = pos.side;
    const lv = [];
    for (const pr of pos.partials) if (!pr.done) lv.push({ px: pr.px, k: 'p', pr });
    if (pos.target != null) lv.push({ px: pos.target, k: 't' });
    lv.sort((a, b) => (a.px - b.px) * s);
    for (const x of lv) {
      if (!pos) return;
      const reached = s > 0 ? x.px <= to && (isGap || x.px > from) : x.px >= to && (isGap || x.px < from);
      if (!reached) continue;
      const fillPx = isGap ? to : x.px;
      if (x.k === 'p') { x.pr.done = true; if (qtyOpen() > x.pr.qty) closeQty(x.pr.qty, fillPx, 'Parcial'); else closeQty(qtyOpen(), fillPx, 'Objetivo'); }
      else if (x.k === 'a') { x.ad.done = true; fillLot(p.addQty, fillPx); pos.adds++; if (p.addMovesStopToBE) pos.pendingBE = true; }
      else closeQty(qtyOpen(), fillPx, 'Objetivo');
    }
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (!b.et) b.et = E.tzParts(b.t);
    if (closeAll && pos) closeQty(qtyOpen(), b.o, 'Hora');
    closeAll = false;
    // Añadidos decididos al cierre anterior: a mercado en la apertura
    if (pos && pos.pendingAdds) { for (let k = 0; k < pos.pendingAdds; k++) { fillLot(p.addQty, b.o); pos.adds++; } pos.pendingAdds = 0; if (p.addMovesStopToBE) pos.pendingBE = true; }
    const hFirst = (b.h - b.o) <= (b.o - b.l);
    const path = hFirst ? [b.o, b.h, b.l, b.c] : [b.o, b.l, b.h, b.c];
    if (pos) {
      const s = pos.side;
      if (s > 0 ? b.o <= pos.stop : b.o >= pos.stop) closeQty(qtyOpen(), b.o, 'Stop');
      else favorable(b.o, b.o, true);
    } else if (limits) {
      if (limits.buy && b.o <= limits.buy.px) openPos(i, 1, b.o, limits.buy);
      else if (limits.sell && b.o >= limits.sell.px) openPos(i, -1, b.o, limits.sell);
    }
    for (let k = 0; k < 3; k++) {
      const a = path[k], z = path[k + 1];
      if (a === z) continue;
      const down = z < a;
      let from = a;
      if (!pos && limits) {
        if (down && limits.buy && limits.buy.px < a && limits.buy.px >= z) { from = limits.buy.px; openPos(i, 1, from, limits.buy); }
        else if (!down && limits.sell && limits.sell.px > a && limits.sell.px <= z) { from = limits.sell.px; openPos(i, -1, from, limits.sell); }
      }
      if (!pos) continue;
      const s = pos.side, adverse = (s > 0) === down;
      if (adverse) { if (s > 0 ? pos.stop < from && pos.stop >= z : pos.stop > from && pos.stop <= z) closeQty(qtyOpen(), pos.stop, 'Stop'); }
      else favorable(from, z, false);
    }
    // Ajustes al cierre: breakeven, trailing y stop a BE tras añadir
    if (pos) {
      const s = pos.side;
      pos.addReady = true; // las órdenes de añadir se colocan al cierre de la vela de entrada
      pos.best = pos.best == null ? (s > 0 ? b.h : b.l) : s > 0 ? Math.max(pos.best, b.h) : Math.min(pos.best, b.l);
      const run = (pos.best - pos.first) * s;
      const better = x => { pos.stop = s > 0 ? Math.max(pos.stop, x) : Math.min(pos.stop, x); };
      const be = rt(pos.first + s * p.beOffTicks * tick);
      if (p.beR > 0 && run >= p.beR * pos.risk) better(be);
      if (pos.pendingBE) { better(be); pos.pendingBE = false; }
      if (p.trailStartR > 0 && run >= p.trailStartR * pos.risk) better(rt(pos.best - s * p.trailDistR * pos.risk));
      for (const ad of pos.addLevels) if (!ad.done && (b.c - ad.px) * s >= 0) { ad.done = true; pos.pendingAdds = (pos.pendingAdds || 0) + 1; } else if (!ad.done) break;
    }
    // Rango y órdenes para la vela siguiente
    const key = b.et.date;
    if (!day || day.key !== key) day = { key, H: null, L: null, n: 0 };
    const m = b.et.min;
    if (m >= LS && m < LE) { day.H = day.H == null ? b.h : Math.max(day.H, b.h); day.L = day.L == null ? b.l : Math.min(day.L, b.l); }
    const nx = E.tzParts(b.t + barMs), nextMin = nx.date === key ? nx.min : 1440;
    if (pos && nextMin >= CA) closeAll = true;
    limits = null;
    const ready = day.H != null && m >= LE;
    if (!pos && ready && nextMin >= TF && nextMin < LAST && day.n < 1 && b.et.wd >= 1 && b.et.wd <= 5) {
      const H = day.H, L = day.L, d = p.stopPts;
      const tgt = (side, ref) => p.target === 'opposite' ? (side > 0 ? H : L) : p.target === 'r' ? rt(ref + side * p.targetR * d) : null;
      limits = { buy: { px: L, ref: L, stop: rt(L - d), risk: d, target: tgt(1, L) }, sell: { px: H, ref: H, stop: rt(H + d), risk: d, target: tgt(-1, H) } };
    }
  }
  const st = { n: trades.length, net: 0, gw: 0, gl: 0, wins: 0, peak: 0, dd: 0, maxQty: 0 };
  let eq = 0;
  for (const t of trades) { eq += t.pnl; st.net += t.pnl; if (t.pnl > 0) { st.wins++; st.gw += t.pnl; } else st.gl -= t.pnl; st.peak = Math.max(st.peak, eq); st.dd = Math.max(st.dd, st.peak - eq); st.maxQty = Math.max(st.maxQty, t.maxQty); }
  st.pf = st.gl ? st.gw / st.gl : (st.gw ? 99 : 0);
  st.wr = st.n ? st.wins / st.n : 0;
  return { trades, st };
}
module.exports = { run };
