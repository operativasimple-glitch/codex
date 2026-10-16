/* Ruptura del rango de Londres (NQ / MNQ) — simulador.
   Rango: máximo y mínimo de 03:00 a 09:00 (hora de Nueva York = 09:00–15:00 en España).
   Desde las 09:30 NY (15:30 en España):
     - si el precio toca el mínimo de Londres → compra; objetivo en el máximo de Londres
     - si toca el máximo → venta; objetivo en el mínimo
   Con la entrada «vuelve dentro», breakMode decide cómo se lee la rotura de un nivel:
     - manipulación: una vela cierra de nuevo dentro del rango → a la contra, hacia el otro extremo
     - ruptura: acceptBars velas seguidas cierran fuera → a favor de la rotura
     - both: lo que pase primero en cada nivel
   Reproduce el emulador de órdenes de TradingView: órdenes decididas al cierre activas desde la vela
   siguiente, órdenes limitadas que se llenan al tocar (o en la apertura si el precio ya está más allá),
   y recorrido dentro de la vela apertura→máximo→mínimo→cierre si la apertura está más cerca del máximo
   (si no, apertura→mínimo→máximo→cierre). Deslizamiento en ticks en todas las ejecuciones. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' && module.exports ? require('../ema-vwap/engine.js') : root.EmaVwap;

  const DEFAULTS = {
    contract: 'NQ',
    qty: 1,
    londonStart: '03:00',   // hora de Nueva York
    londonEnd: '09:00',
    tradeFrom: '09:30',     // no se opera antes
    lastEntry: '15:00',     // no se abren operaciones nuevas desde esta hora
    closeAt: '15:55',       // se cierra lo abierto en la apertura de esta vela
    entryMode: 'touch',     // touch: al tocar el nivel | reclaim: vuelve dentro tras romper (cierre)
    stopMode: 'points',     // points: stopPts tras el nivel | range: stopFrac × rango tras el nivel | sweep: tras el extremo del barrido (solo reclaim)
    stopPts: 20,
    stopFrac: 0.25,
    sweepBuffer: 4,         // ticks tras el extremo del barrido
    targetMode: 'opposite', // opposite: el otro extremo de Londres | r: targetR × riesgo
    targetR: 2.5,
    minRR: 0,               // no operar si objetivo/riesgo < minRR (0 = off)
    maxTrades: 1,           // entradas por día
    direction: 'both',      // both | long | short
    slipTicks: 1,
    commission: null,
    breakMode: 'reclaim',   // reclaim: solo manipulación | breakout: solo ruptura | both: lo que pase primero
    acceptBars: 3,          // ruptura: velas seguidas cerrando fuera del rango
    acceptPts: 0,           // ruptura: y la última al menos X puntos fuera
    bStopMode: 'points',    // points: bStopPts desde el cierre | level: dentro del rango, bStopPts tras el nivel
    bStopPts: 20,
    bTargetMode: 'r',       // r: bTargetR × riesgo | range: proyección de bRangeK × rango desde el nivel | close: hasta la hora de cierre
    bTargetR: 2,
    bRangeK: 1,
    bEntry: 'market',       // market: a mercado tras la confirmación | retest: orden limitada en el nivel roto (+ bRetestOff puntos)
    bRetestOff: 0,
    rangeSplit: 0,          // >0: decide por el rango: rango de Londres < rangeSplit × rango medio de NY (09:30–16:00, 10 días previos) → día de ruptura; si no, de manipulación
  };

  const hhmm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

  function backtest(bars, params) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const compat = !!p._pinetsCompat;
    const spec = E.CONTRACTS[p.contract] || E.CONTRACTS.NQ;
    const tick = spec.tick, slip = (+p.slipTicks || 0) * tick, qty = Math.max(1, Math.floor(+p.qty || 1));
    const commission = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const ls = hhmm(p.londonStart), le = hhmm(p.londonEnd), tf = hhmm(p.tradeFrom), lastE = hhmm(p.lastEntry), ca = hhmm(p.closeAt);
    const rt = x => Math.round(x / tick) * tick; // como math.round_to_mintick
    const inLondon = m => ls < le ? m >= ls && m < le : m >= ls || m < le;
    const gaps = [];
    for (let i = 1; i < Math.min(bars.length, 500); i++) gaps.push(bars[i].t - bars[i - 1].t);
    gaps.sort((a, b) => a - b);
    const barMs = gaps.length ? gaps[gaps.length >> 1] : 60000;

    const nyR = {}; // rango 09:30–16:00 de cada día
    for (const b of bars) { const q = b.et || (b.et = E.tzParts(b.t)); if (q.min >= 570 && q.min < 960) { const x = nyR[q.date] || (nyR[q.date] = { h: -Infinity, l: Infinity }); x.h = Math.max(x.h, b.h); x.l = Math.min(x.l, b.l); } }
    const nyKeys = Object.keys(nyR).sort();
    const avgNY = key => { const prev = nyKeys.filter(k => k < key).slice(-10); return prev.length ? prev.reduce((a, k) => a + nyR[k].h - nyR[k].l, 0) / prev.length : null; };
    const trades = [], days = [];
    let pos = null;                 // { side, entry, stop, target, idx, risk }
    let limits = null;              // { buy: {px, stop, target}, sell: {...} }
    let market = null;              // { side, stop, target } en la apertura siguiente
    let closeAll = false;
    let day = null;                 // { key, H, L, n, brokeLow, sweepLow, brokeHigh, sweepHigh }

    const close = (i, px, reason) => {
      const pts = (px - pos.entry) * pos.side;
      const pnl = pts * spec.pointValue * qty - commission * qty;
      trades.push({ side: pos.side, entryIdx: pos.idx, exitIdx: i, entryTime: bars[pos.idx].t, exitTime: bars[i].t,
        entry: pos.entry, exit: px, stop: pos.stop, target: pos.target, risk: pos.risk, pts, pnl, reason,
        H: pos.H, L: pos.L, kind: pos.kind });
      pos = null;
    };
    const open = (i, side, px, o) => {
      pos = { side, entry: px + side * slip, stop: o.stop, target: o.target, idx: i, risk: Math.abs(o.ref - o.stop), H: day.H, L: day.L,
        kind: o.kind || (p.entryMode === 'touch' ? 'toque' : 'manipulación') };
      day.n++;
      day.pend = null;
      limits = null; // OCA: la otra orden se cancela
    };

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (!b.et) b.et = E.tzParts(b.t);

      // 1) Órdenes a mercado decididas al cierre anterior
      if (closeAll && pos) close(i, b.o - pos.side * slip, 'Hora de cierre');
      closeAll = false;
      if (market && !pos) open(i, market.side, b.o, market);
      market = null;

      // 2) Recorrido de la vela
      const hFirst = (b.h - b.o) <= (b.o - b.l);
      const limitsWere = !!limits;
      let continue3 = false;
      const path = hFirst ? [b.o, b.h, b.l, b.c] : [b.o, b.l, b.h, b.c];
      // Huecos en la apertura
      if (pos) {
        const s = pos.side;
        if (s > 0 ? b.o <= pos.stop : b.o >= pos.stop) close(i, b.o - s * slip, 'Stop');
        else if (s > 0 ? b.o >= pos.target : b.o <= pos.target) close(i, b.o - s * slip, 'Objetivo');
      } else if (limits) {
        // TradingView llena la orden limitada a la apertura si ya está más allá del nivel (precio mejor)
        if (limits.buy && b.o <= limits.buy.px) open(i, 1, compat ? limits.buy.px : b.o, limits.buy);
        else if (limits.sell && b.o >= limits.sell.px) open(i, -1, compat ? limits.sell.px : b.o, limits.sell);
      }
      // Solo para el test con PineTS: tras entrar en la vela, PineTS mira el máximo y el mínimo de toda la vela
      if (compat && pos && pos.idx === i && limitsWere) {
        const s = pos.side, fav = s > 0 ? hFirst : !hFirst;
        const tg = s > 0 ? b.h >= pos.target : b.l <= pos.target, sl = s > 0 ? b.l <= pos.stop : b.h >= pos.stop;
        if (tg && (fav || !sl)) close(i, pos.target - s * slip, 'Objetivo');
        else if (sl) close(i, pos.stop - s * slip, 'Stop');
        continue3 = true;
      }
      for (let k = 0; k < 3 && !continue3; k++) {
        const a = path[k], z = path[k + 1];
        if (a === z) continue;
        const down = z < a;
        let from = a;
        if (!pos && limits) {
          if (down && limits.buy && limits.buy.px < a && limits.buy.px >= z) { open(i, 1, limits.buy.px, limits.buy); from = pos.entry - slip; }
          else if (!down && limits.sell && limits.sell.px > a && limits.sell.px <= z) { open(i, -1, limits.sell.px, limits.sell); from = pos.entry + slip; }
          if (compat && pos) {
            const s = pos.side, fav = s > 0 ? hFirst : !hFirst;
            const tg = s > 0 ? b.h >= pos.target : b.l <= pos.target, sl = s > 0 ? b.l <= pos.stop : b.h >= pos.stop;
            if (tg && (fav || !sl)) close(i, pos.target - s * slip, 'Objetivo');
            else if (sl) close(i, pos.stop - s * slip, 'Stop');
            break;
          }
        }
        if (pos) {
          const s = pos.side;
          // En bajada: stop de largos y objetivo de cortos; en subida: objetivo de largos y stop de cortos
          if (down) {
            if (s > 0 && pos.stop < from && pos.stop >= z) close(i, pos.stop - slip, 'Stop');
            else if (s < 0 && pos.target < from && pos.target >= z) close(i, pos.target + slip, 'Objetivo');
          } else {
            if (s > 0 && pos.target > from && pos.target <= z) close(i, pos.target - slip, 'Objetivo');
            else if (s < 0 && pos.stop > from && pos.stop <= z) close(i, pos.stop + slip, 'Stop');
          }
        }
      }

      // 3) Decisiones al cierre de la vela
      const key = b.et.date;
      if (!day || day.key !== key) {
        if (day) days.push(day);
        day = { key, H: null, L: null, n: 0, brokeLow: false, sweepLow: null, brokeHigh: false, sweepHigh: null, outLow: 0, outHigh: 0, doneLow: false, doneHigh: false, pend: null, avg: avgNY(key) };
      }
      if (inLondon(b.et.min)) {
        day.H = day.H == null ? b.h : Math.max(day.H, b.h);
        day.L = day.L == null ? b.l : Math.min(day.L, b.l);
      }
      const nx = E.tzParts(b.t + barMs);
      const nextMin = nx.date === key ? nx.min : 24 * 60;
      const ready = day.H != null && !inLondon(b.et.min) && b.et.min >= le;
      const canEnter = ready && nextMin >= tf && nextMin < lastE && day.n < p.maxTrades && b.et.wd >= 1 && b.et.wd <= 5;
      if (pos && nextMin >= ca) closeAll = true;
      limits = null;
      if (pos) { day.outLow = 0; day.outHigh = 0; }
      if (!pos && canEnter) {
        const H = day.H, L = day.L, range = H - L;
        const dist = p.stopMode === 'range' ? +p.stopFrac * range : +p.stopPts;
        const longOk = p.direction !== 'short', shortOk = p.direction !== 'long';
        const tgt = (side, ref, stop) => p.targetMode === 'r' ? rt(ref + side * Math.abs(ref - stop) * +p.targetR) : side > 0 ? H : L;
        const rrOk = (ref, stop, target) => !(+p.minRR > 0) || Math.abs(target - ref) >= +p.minRR * Math.abs(ref - stop);
        if (p.entryMode === 'touch') {
          limits = {};
          if (longOk) { const st = rt(L - dist), t = tgt(1, L, st); if (rrOk(L, st, t)) limits.buy = { px: L, ref: L, stop: st, target: t }; }
          if (shortOk) { const st = rt(H + dist), t = tgt(-1, H, st); if (rrOk(H, st, t)) limits.sell = { px: H, ref: H, stop: st, target: t }; }
        } else if (b.et.min >= tf) {
          // Tras romper un nivel: manipulación (vuelve dentro) o ruptura (sigue fuera)
          if (b.l < L) { day.brokeLow = true; day.sweepLow = day.sweepLow == null ? b.l : Math.min(day.sweepLow, b.l); }
          if (b.h > H) { day.brokeHigh = true; day.sweepHigh = day.sweepHigh == null ? b.h : Math.max(day.sweepHigh, b.h); }
          const buf = (+p.sweepBuffer || 0) * tick;
          // Ruptura: N velas seguidas cerrando fuera → a favor de la rotura
          day.outLow = b.c < L ? day.outLow + 1 : 0;
          day.outHigh = b.c > H ? day.outHigh + 1 : 0;
          let bOn = p.breakMode !== 'reclaim', rOn = p.breakMode !== 'breakout';
          if (+p.rangeSplit > 0 && day.avg) { const narrow = range / day.avg < +p.rangeSplit; bOn = bOn && narrow; rOn = rOn && !narrow; }
          const bTgt = (side, ref, stop, lvl) => p.bTargetMode === 'r' ? rt(ref + side * Math.abs(ref - stop) * +p.bTargetR) : p.bTargetMode === 'range' ? rt(lvl + side * +p.bRangeK * range) : side * Infinity;
          if (bOn && shortOk && !day.doneLow && day.outLow >= +p.acceptBars && L - b.c >= +p.acceptPts) {
            const st = rt(p.bStopMode === 'level' ? L + +p.bStopPts : b.c + +p.bStopPts), t = bTgt(-1, b.c, st, L);
            if (p.bEntry === 'retest') { const px = rt(L - +p.bRetestOff), s2 = rt(L + +p.bStopPts); day.pend = { side: -1, px, ref: px, stop: s2, target: bTgt(-1, px, s2, L), kind: 'ruptura' }; }
            else if (t < b.c) market = { side: -1, ref: b.c, stop: st, target: t, kind: 'ruptura' }; // sin recorrido si ya pasó la proyección
            day.doneLow = true; day.brokeLow = false; day.sweepLow = null;
          } else if (bOn && longOk && !day.doneHigh && day.outHigh >= +p.acceptBars && b.c - H >= +p.acceptPts) {
            const st = rt(p.bStopMode === 'level' ? H - +p.bStopPts : b.c - +p.bStopPts), t = bTgt(1, b.c, st, H);
            if (p.bEntry === 'retest') { const px = rt(H + +p.bRetestOff), s2 = rt(H - +p.bStopPts); day.pend = { side: 1, px, ref: px, stop: s2, target: bTgt(1, px, s2, H), kind: 'ruptura' }; }
            else if (t > b.c) market = { side: 1, ref: b.c, stop: st, target: t, kind: 'ruptura' };
            day.doneHigh = true; day.brokeHigh = false; day.sweepHigh = null;
          } else if (rOn && longOk && !day.doneLow && day.brokeLow && b.c > L) {
            // Manipulación: rompe el nivel y una vela cierra de nuevo dentro del rango → a la contra
            day.doneLow = p.breakMode === 'both';
            const st = rt(p.stopMode === 'sweep' ? day.sweepLow - buf : b.c - dist), t = tgt(1, b.c, st);
            if (rrOk(b.c, st, t)) market = { side: 1, ref: b.c, stop: st, target: t };
            day.brokeLow = false; day.sweepLow = null;
          } else if (rOn && shortOk && !day.doneHigh && day.brokeHigh && b.c < H) {
            day.doneHigh = p.breakMode === 'both';
            const st = rt(p.stopMode === 'sweep' ? day.sweepHigh + buf : b.c + dist), t = tgt(-1, b.c, st);
            if (rrOk(b.c, st, t)) market = { side: -1, ref: b.c, stop: st, target: t };
            day.brokeHigh = false; day.sweepHigh = null;
          }
          if (day.pend && !market) limits = day.pend.side > 0 ? { buy: day.pend } : { sell: day.pend };
        }
      }
    }
    if (day) days.push(day);
    return { trades, days, open: pos, stats: E.stats(trades), params: p };
  }

  const api = { DEFAULTS, backtest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LondonBreak = api;
})(typeof self !== 'undefined' ? self : this);
