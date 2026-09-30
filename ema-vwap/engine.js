/* Motor de backtest: cruce de EMAs filtrado por VWAP de sesión (NQ / MNQ).
   Sin dependencias; funciona en navegador y en Node (para tests). */
(function (root) {
  'use strict';

  const CONTRACTS = {
    NQ:  { name: 'NQ (E-mini Nasdaq-100)',  pointValue: 20, tick: 0.25, commission: 4.5 },
    MNQ: { name: 'MNQ (Micro E-mini Nasdaq-100)', pointValue: 2, tick: 0.25, commission: 1.5 }
  };

  // Sesiones en hora de Nueva York [desde, cierre]. Si desde > cierre, cruza la medianoche.
  const SESSIONS = {
    ny: ['09:30', '15:55'],
    london: ['03:00', '09:30'],
    asia: ['18:00', '03:00'],
    all: ['18:00', '16:55']
  };

  const DEFAULTS = {
    contract: 'NQ',
    qty: 1,
    fast: 9,
    slow: 21,
    vwapFilter: true,       // largos solo con cierre > VWAP, cortos con cierre < VWAP
    direction: 'both',      // both | long | short
    session: 'ny',          // ny | london | asia | all (24 h Globex) | custom (tradeStart–tradeEnd)
    vwapSession: 'auto',    // auto (RTH en Nueva York, Globex en las demás) | rth (09:30) | globex (18:00)
    tradeStart: '09:30',    // horario personalizado (hora de Nueva York); puede cruzar la medianoche
    tradeEnd: '15:55',     // la posición se cierra en la apertura de esta vela
    flatAtEnd: true,        // cerrar posición al final del horario
    stopPts: 15,            // 0 = sin stop
    targetPts: 0,           // objetivo fijo en pts si targetR = 0 (0 = sin objetivo)
    exitOnCross: true,      // salir con el cruce contrario de EMAs
    exitOnVwap: false,      // salir si el cierre cruza el VWAP en contra
    reverse: true,          // en cruce contrario válido, girar posición
    beTrigger: 0,           // pts a favor para mover el stop a la entrada (0 = off)
    stopMode: 'points',     // points: stopPts fijos | swing: tras el mínimo/máximo de las últimas swingBars velas
    swingBars: 5,
    stopBuffer: 2,          // ticks por detrás del mínimo/máximo
    stopMin: 5,             // límites del stop por estructura (pts); stopMax 0 = sin tope
    stopMax: 40,
    targetR: 2,             // objetivo en múltiplos del riesgo (0 = usar targetPts)
    beR: 1,                 // breakeven en múltiplos del riesgo (0 = usar beTrigger)
    maxVwapDist: 0,         // no entrar si el cierre está a más de X pts del VWAP (0 = off)
    fromDate: '',           // 'AAAA-MM-DD': solo cuenta entradas desde esa fecha (Nueva York); '' = todo
    maxTradesDay: 0,        // máx. entradas por día (0 = sin límite)
    dailyLossLimit: 0,      // $ de pérdida diaria que bloquea nuevas entradas (0 = off)
    intrabar: 'tv',         // tv: como TradingView | worst: si toca stop y objetivo, cuenta el stop
    slipTicks: 1,           // deslizamiento en entradas y salidas a mercado
    commission: null        // $ por contrato ida y vuelta (null = por defecto del contrato)
  };

  // ---------- zona horaria (America/New_York) ----------
  const fmtCache = {};
  function tzFormatter(tz) {
    if (!fmtCache[tz]) {
      fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return fmtCache[tz];
  }
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function tzParts(ms, tz) {
    const o = {};
    for (const p of tzFormatter(tz || 'America/New_York').formatToParts(new Date(ms))) o[p.type] = p.value;
    const hour = +o.hour % 24;
    return {
      y: +o.year, mo: +o.month, d: +o.day, h: hour, mi: +o.minute, s: +o.second,
      wd: WD[o.weekday], date: `${o.year}-${o.month}-${o.day}`, min: hour * 60 + +o.minute
    };
  }
  // Componentes de reloj en una zona -> epoch ms
  function zonedToEpoch(y, mo, d, h, mi, s, tz) {
    if (!tz || tz === 'UTC') return Date.UTC(y, mo - 1, d, h, mi, s || 0);
    const want = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    let t = want;
    for (let k = 0; k < 3; k++) {
      const p = tzParts(t, tz);
      const got = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
      const diff = want - got;
      if (!diff) break;
      t += diff;
    }
    return t;
  }

  // ---------- CSV ----------
  function parseTime(raw, tz) {
    const s = String(raw).trim().replace(/^"|"$/g, '');
    if (/^\d+(\.\d+)?$/.test(s) && s.length >= 9 && !/^\d{8}$/.test(s)) {
      const n = +s;
      return n > 1e11 ? n : n * 1000;
    }
    if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s) && /\d[T ]\d/.test(s)) {
      const t = Date.parse(s.replace(' ', 'T'));
      if (!isNaN(t)) return t;
    }
    let m;
    // 2024-01-02 09:30[:00]  |  2024/01/02T09:30
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)))
      return zonedToEpoch(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
    // 20240102 093000 (NinjaTrader)
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(?:[ T]+(\d{2})(\d{2})(\d{2})?)?$/)))
      return zonedToEpoch(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), tz);
    // 01/02/2024 09:30[:00] [AM|PM] (mes/día/año)
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?/))) {
      let h = +(m[4] || 0);
      if (m[7]) { const pm = /p/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
      return zonedToEpoch(+m[3], +m[1], +m[2], h, +(m[5] || 0), +(m[6] || 0), tz);
    }
    const t = Date.parse(s);
    return isNaN(t) ? NaN : t;
  }

  function splitLine(line, delim) {
    if (line.indexOf('"') < 0) return line.split(delim);
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') q = !q;
      else if (c === delim && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  // tz: zona de las fechas SIN offset del CSV (las unix y las ISO con Z/offset son absolutas)
  function parseCSV(text, tz) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) throw new Error('El archivo está vacío.');
    const first = lines[0];
    const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    let head = splitLine(first, delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const hasHeader = head.some(h => /[a-z]/.test(h) && !/^\d{4}/.test(h));
    let col;
    if (hasHeader) {
      const find = (...names) => head.findIndex(h => names.some(n => h === n || h.startsWith(n + ' ') || h.startsWith(n + '(')));
      col = {
        time: find('time', 'datetime', 'timestamp', 'date/time', 'date time', 'fecha', 'gmt time', 'local time'),
        date: find('date', 'fecha'),
        clock: find('time', 'hora'),
        o: find('open', 'o', 'apertura'), h: find('high', 'h', 'máximo', 'maximo', 'max'),
        l: find('low', 'l', 'mínimo', 'minimo', 'min'), c: find('close', 'c', 'last', 'cierre', 'último', 'ultimo'),
        v: find('volume', 'vol', 'v', 'volumen')
      };
      // Columnas separadas Date + Time
      if (col.date >= 0 && col.clock >= 0 && col.date !== col.clock) col.time = -1;
      else col.date = col.clock = -1;
    } else {
      // Sin cabecera: fecha[,hora],open,high,low,close[,volume]
      const n = head.length;
      const sep = n >= 7 && /^\d{1,2}:?\d{2}/.test(head[1]);
      col = sep
        ? { time: -1, date: 0, clock: 1, o: 2, h: 3, l: 4, c: 5, v: n > 6 ? 6 : -1 }
        : { time: 0, date: -1, clock: -1, o: 1, h: 2, l: 3, c: 4, v: n > 5 ? 5 : -1 };
    }
    if (col.o < 0 || col.h < 0 || col.l < 0 || col.c < 0 || (col.time < 0 && col.date < 0))
      throw new Error('No encuentro las columnas time/open/high/low/close en el CSV.');

    const bars = [];
    const num = x => parseFloat(String(x).replace(/"/g, '').trim());
    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
      const f = splitLine(lines[i], delim);
      const rawT = col.time >= 0 ? f[col.time] : `${f[col.date]} ${f[col.clock]}`;
      const t = parseTime(rawT, tz);
      const o = num(f[col.o]), h = num(f[col.h]), l = num(f[col.l]), c = num(f[col.c]);
      if (!isFinite(t) || ![o, h, l, c].every(isFinite)) continue;
      const v = col.v >= 0 ? num(f[col.v]) : NaN;
      bars.push({ t, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v: isFinite(v) ? v : 0 });
    }
    if (bars.length < 30) throw new Error(`Solo se leyeron ${bars.length} velas válidas; hacen falta más.`);
    bars.sort((a, b) => a.t - b.t);
    const dedup = [bars[0]];
    for (let i = 1; i < bars.length; i++) if (bars[i].t !== dedup[dedup.length - 1].t) dedup.push(bars[i]);
    return dedup;
  }

  // ---------- indicadores ----------
  // Igual que ta.ema de TradingView: sin valor hasta la vela n, arranca con la media simple
  function ema(values, n) {
    const out = new Array(values.length).fill(null);
    if (values.length < n) return out;
    const k = 2 / (n + 1);
    let prev = 0;
    for (let i = 0; i < n; i++) prev += values[i];
    prev /= n;
    out[n - 1] = prev;
    for (let i = n; i < values.length; i++) out[i] = prev = values[i] * k + prev * (1 - k);
    return out;
  }

  const hhmm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

  // Añade a cada vela: et (partes en NY), session (clave), vwap
  function annotate(bars, mode) {
    let key = null, pv = 0, vol = 0;
    for (const b of bars) {
      if (!b.et) b.et = tzParts(b.t);
      // Día de la sesión de CME: empieza a las 18:00 ET y se atribuye al día siguiente
      if (!b.g) b.g = tzParts(b.t + 6 * 3600e3);
      let sKey, active;
      if (mode === 'globex') {
        sKey = b.g.date;
        active = true;
      } else {
        sKey = b.et.date;
        active = b.et.min >= 570 && b.et.min < 960 && b.et.wd >= 1 && b.et.wd <= 5;
      }
      b.session = sKey;
      if (!active) { b.vwap = null; continue; }
      if (sKey !== key) { key = sKey; pv = 0; vol = 0; }
      const w = b.v > 0 ? b.v : 1;
      pv += ((b.h + b.l + b.c) / 3) * w;
      vol += w;
      b.vwap = pv / vol;
    }
  }

  // ---------- backtest ----------
  // Reproduce el emulador de órdenes de TradingView:
  //  - las órdenes decididas al cierre se ejecutan en la apertura siguiente (+ deslizamiento)
  //  - stop y objetivo se evalúan dentro de la vela; con intrabar 'tv' el recorrido es
  //    apertura→máximo→mínimo→cierre si la apertura está más cerca del máximo, si no apertura→mínimo→máximo→cierre
  //  - el deslizamiento (en ticks) se aplica a todas las ejecuciones, también al objetivo
  //  - al acabar el horario se cierra en la apertura de la primera vela fuera de horario
  function backtest(bars, params) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const spec = CONTRACTS[p.contract] || CONTRACTS.MNQ;
    const commission = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const slip = (+p.slipTicks || 0) * spec.tick;
    const qty = Math.max(1, Math.floor(+p.qty || 1));
    const fast = Math.max(1, Math.floor(+p.fast)), slow = Math.max(2, Math.floor(+p.slow));
    const stopPts = +p.stopPts || 0, targetPts = +p.targetPts || 0, beTrigger = +p.beTrigger || 0;
    const swing = p.stopMode === 'swing', swingBars = Math.max(1, Math.floor(+p.swingBars || 1));
    const stopBuf = (+p.stopBuffer || 0) * spec.tick, stopMin = +p.stopMin || 0, stopMax = +p.stopMax || 0;
    const targetR = +p.targetR || 0, beR = +p.beR || 0, maxVwapDist = +p.maxVwapDist || 0;
    const fd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.fromDate || '');
    const fromTime = fd ? zonedToEpoch(+fd[1], +fd[2], +fd[3], 0, 0, 0, 'America/New_York') : 0;
    const maxTrades = Math.floor(+p.maxTradesDay || 0), maxLoss = +p.dailyLossLimit || 0;

    const sess = SESSIONS[p.session] || [p.tradeStart, p.tradeEnd];
    const vwapMode = p.vwapSession === 'auto' || !p.vwapSession ? (p.session === 'ny' ? 'rth' : 'globex') : p.vwapSession;
    annotate(bars, vwapMode);
    const closes = bars.map(b => b.c);
    const ef = ema(closes, fast), es = ema(closes, slow);
    const start = hhmm(sess[0]), end = hhmm(sess[1]);
    // Lunes–viernes según el día de sesión de CME (el domingo a las 18:00 ya cuenta como lunes)
    const inWin = (et, g) => g.wd >= 1 && g.wd <= 5 &&
      (start < end ? et.min >= start && et.min < end : et.min >= start || et.min < end);

    // Duración típica de vela: la vela siguiente empieza en t + barMs (como time_close en TradingView)
    const gaps = [];
    for (let i = 1; i < Math.min(bars.length, 500); i++) gaps.push(bars[i].t - bars[i - 1].t);
    gaps.sort((a, b) => a - b);
    const barMs = gaps.length ? gaps[gaps.length >> 1] : 60000;

    const trades = [];
    const signals = [];
    let pos = null;          // { side, entry, idx, stop, target, best, be }
    let pending = null;      // { exit?:reason, enter?:side } a ejecutar en la apertura de la vela siguiente
    let net = 0, dayKey = null, dayStart = 0, dayTrades = 0;

    const close = (i, price, reason) => {
      const pts = (price - pos.entry) * pos.side;
      const gross = pts * spec.pointValue * qty;
      const fee = commission * qty;
      trades.push({
        side: pos.side, entryIdx: pos.idx, exitIdx: i, entryTime: bars[pos.idx].t, exitTime: bars[i].t,
        entry: pos.entry, exit: price, pts, gross, fee, pnl: gross - fee, reason, bars: i - pos.idx + 1,
        stop: pos.initStop, target: pos.target, risk: pos.risk, beAt: pos.beT > 0 ? pos.entry + pos.side * pos.beT : null
      });
      net += gross - fee;
      pos = null;
    };
    // Precio de stop por estructura calculado al cierre de la vela de señal
    const swingStop = (i, side) => {
      let x = side > 0 ? Infinity : -Infinity;
      for (let k = Math.max(0, i - swingBars + 1); k <= i; k++) x = side > 0 ? Math.min(x, bars[k].l) : Math.max(x, bars[k].h);
      return x - side * stopBuf;
    };
    const open = (i, side, stopPx) => {
      const entry = bars[i].o + side * slip;
      let risk = stopPts;
      if (swing) {
        risk = Math.max(stopMin, (entry - stopPx) * side);
        if (stopMax > 0) risk = Math.min(stopMax, risk);
      }
      const stop = risk > 0 ? entry - side * risk : null;
      const target = targetR > 0 && risk > 0 ? entry + side * risk * targetR : targetPts > 0 ? entry + side * targetPts : null;
      const beT = beR > 0 && risk > 0 ? risk * beR : beTrigger;
      pos = { side, entry, idx: i, stop, initStop: stop, target, beT, risk, best: null, be: false };
    };
    // Stop / objetivo dentro de la vela
    const checkExits = b => {
      const s = pos.side;
      const stopHit = lvl => lvl != null && (s > 0 ? b.l <= lvl : b.h >= lvl);
      const tgtHit = lvl => lvl != null && (s > 0 ? b.h >= lvl : b.l <= lvl);
      const stopName = pos.be ? 'Breakeven' : 'Stop';
      // Hueco en la apertura
      if (pos.stop != null && (s > 0 ? b.o <= pos.stop : b.o >= pos.stop)) return [b.o - s * slip, stopName];
      if (pos.target != null && (s > 0 ? b.o >= pos.target : b.o <= pos.target)) return [b.o - s * slip, 'Objetivo'];
      const hFirst = p.intrabar === 'worst' ? s < 0 : (b.h - b.o) <= (b.o - b.l);
      for (const leg of hFirst ? ['h', 'l'] : ['l', 'h']) {
        const favorable = (leg === 'h') === (s > 0);
        if (favorable ? tgtHit(pos.target) : stopHit(pos.stop))
          return favorable ? [pos.target - s * slip, 'Objetivo'] : [pos.stop - s * slip, stopName];
      }
      return null;
    };

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];

      // 1) Órdenes pendientes en la apertura
      if (pending) {
        if (pending.exit && pos) close(i, b.o - pos.side * slip, pending.exit);
        if (pending.enter && !pos) open(i, pending.enter, pending.stopPx);
        pending = null;
      }

      // 2) Stop / objetivo dentro de la vela
      if (pos) {
        const hit = checkExits(b);
        if (hit) close(i, hit[0], hit[1]);
      }

      // 3) Breakeven: se activa al cierre y protege desde la vela siguiente
      if (pos) {
        pos.best = pos.best == null ? (pos.side > 0 ? b.h : b.l) : pos.side > 0 ? Math.max(pos.best, b.h) : Math.min(pos.best, b.l);
        if (pos.beT > 0 && !pos.be && (pos.best - pos.entry) * pos.side >= pos.beT) { pos.be = true; pos.stop = pos.entry; }
      }

      // Límites diarios (día de Nueva York; el P&L incluye lo cerrado en esta vela)
      if (b.et.date !== dayKey) { dayKey = b.et.date; dayStart = net; dayTrades = 0; }

      // 4) Señales al cierre de la vela
      if (i < slow) continue;
      const next = bars[i + 1];
      const ready = ef[i - 1] != null && es[i - 1] != null;
      const up = ready && ef[i - 1] <= es[i - 1] && ef[i] > es[i];
      const dn = ready && ef[i - 1] >= es[i - 1] && ef[i] < es[i];
      let side = 0;
      if (up) side = 1; else if (dn) side = -1;
      let valid = side !== 0;
      let why = '';
      if (valid && p.vwapFilter) {
        if (b.vwap == null) { valid = false; why = 'sin VWAP'; }
        else if (side > 0 ? b.c <= b.vwap : b.c >= b.vwap) { valid = false; why = side > 0 ? 'cierre bajo VWAP' : 'cierre sobre VWAP'; }
      }
      if (valid && (p.direction === 'long' && side < 0 || p.direction === 'short' && side > 0)) { valid = false; why = 'dirección desactivada'; }
      // ¿La vela siguiente (cierre de esta) cae en la sesión? Igual que time_close en TradingView
      if (!b.nx) { b.nx = tzParts(b.t + barMs); b.nxg = tzParts(b.t + barMs + 6 * 3600e3); }
      const nextIn = inWin(b.nx, b.nxg);
      if (valid && !(next && nextIn)) { valid = false; why = 'fuera de horario'; }
      if (valid && maxTrades > 0 && dayTrades >= maxTrades) { valid = false; why = 'máx. operaciones del día'; }
      if (valid && maxLoss > 0 && net - dayStart <= -maxLoss) { valid = false; why = 'límite de pérdida diaria'; }
      if (valid && maxVwapDist > 0 && b.vwap != null && Math.abs(b.c - b.vwap) > maxVwapDist) { valid = false; why = 'lejos del VWAP'; }
      if (valid && b.t < fromTime) { valid = false; why = 'antes de la fecha'; }
      if (side) signals.push({ idx: i, side, valid, why });

      if (pos) {
        let exitReason = null;
        if (p.exitOnCross && side === -pos.side) exitReason = 'Cruce contrario';
        else if (p.exitOnVwap && b.vwap != null && (pos.side > 0 ? b.c < b.vwap : b.c > b.vwap)) exitReason = 'Cruce VWAP';
        if (!next) { close(i, b.c, 'Fin de datos'); continue; }
        const endOfDay = p.flatAtEnd && !nextIn;
        if (endOfDay) { pending = { exit: 'Cierre de horario' }; continue; }
        if (exitReason) {
          pending = { exit: exitReason };
          if (p.reverse && valid && side === -pos.side) { pending.enter = side; pending.stopPx = swing ? swingStop(i, side) : null; dayTrades++; }
        }
      } else if (valid) {
        pending = { enter: side, stopPx: swing ? swingStop(i, side) : null };
        dayTrades++;
      }
    }
    if (pos) close(bars.length - 1, bars[bars.length - 1].c, 'Fin de datos');

    return { trades, signals, emaFast: ef, emaSlow: es, stats: stats(trades), spec, params: p, commission };
  }

  // Busca la mejor combinación en la parte inicial de los datos y la comprueba en el resto (fuera de muestra)
  function optimize(bars, base, grid, opts) {
    opts = opts || {};
    const split = bars[Math.floor(bars.length * (opts.inSample || 0.7))].t;
    const combos = [];
    for (const fast of grid.fast) for (const slow of grid.slow) {
      if (fast >= slow) continue;
      for (const stopPts of grid.stopPts) for (const targetR of grid.targetR) combos.push({ fast, slow, stopPts, targetR, stopMode: 'points' });
    }
    const rows = [];
    let k = 0;
    const step = () => {
      const until = Math.min(combos.length, k + (opts.chunk || combos.length));
      for (; k < until; k++) {
        const c = combos[k];
        const r = backtest(bars, Object.assign({}, base, c));
        const ins = r.trades.filter(t => t.entryTime < split), oos = r.trades.filter(t => t.entryTime >= split);
        rows.push(Object.assign({ is: stats(ins), oos: stats(oos), all: r.stats }, c));
      }
      return k >= combos.length;
    };
    const rank = () => rows.slice().sort((a, b) => b.is.net - a.is.net);
    return { combos, rows, step, rank, split, get done() { return k >= combos.length; }, get progress() { return combos.length ? k / combos.length : 1; } };
  }

  function stats(trades) {
    const s = { n: trades.length, wins: 0, losses: 0, net: 0, grossWin: 0, grossLoss: 0, pts: 0,
      maxDD: 0, best: 0, worst: 0, longs: 0, longNet: 0, shorts: 0, shortNet: 0, fees: 0, equity: [0],
      maxWinStreak: 0, maxLossStreak: 0 };
    let peak = 0, eq = 0, ws = 0, ls = 0;
    for (const t of trades) {
      eq += t.pnl; s.net += t.pnl; s.pts += t.pts; s.fees += t.fee;
      s.equity.push(eq);
      peak = Math.max(peak, eq);
      s.maxDD = Math.max(s.maxDD, peak - eq);
      if (t.pnl > 0) { s.wins++; s.grossWin += t.pnl; ws++; ls = 0; } else { s.losses++; s.grossLoss -= t.pnl; ls++; ws = 0; }
      s.maxWinStreak = Math.max(s.maxWinStreak, ws); s.maxLossStreak = Math.max(s.maxLossStreak, ls);
      s.best = Math.max(s.best, t.pnl); s.worst = Math.min(s.worst, t.pnl);
      if (t.side > 0) { s.longs++; s.longNet += t.pnl; } else { s.shorts++; s.shortNet += t.pnl; }
    }
    s.winRate = s.n ? s.wins / s.n : 0;
    s.pf = s.grossLoss ? s.grossWin / s.grossLoss : (s.grossWin ? Infinity : 0);
    s.avgWin = s.wins ? s.grossWin / s.wins : 0;
    s.avgLoss = s.losses ? -s.grossLoss / s.losses : 0;
    s.expectancy = s.n ? s.net / s.n : 0;
    return s;
  }

  // ---------- datos de ejemplo (simulados, NO reales) ----------
  function demoBars(days, seed, full) {
    let x = seed || 42;
    const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
    const bars = [];
    let price = 20150, drift = 0;
    // Días hábiles hacia atrás desde hoy
    const today = tzParts(Date.now());
    const dates = [];
    let t = Date.UTC(today.y, today.mo - 1, today.d, 12);
    while (dates.length < (days || 15)) {
      t -= 86400e3;
      const d = new Date(t), wd = d.getUTCDay();
      if (wd >= 1 && wd <= 5) dates.unshift([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]);
    }
    for (const [y, mo, d] of dates) {
      // Por defecto 08:00 – 16:00 ET; con full, la sesión Globex completa (18:00 del día anterior – 16:55)
      const midnight = zonedToEpoch(y, mo, d, 0, 0, 0, 'America/New_York');
      for (let m = full ? -360 : 8 * 60; m < (full ? 17 * 60 : 16 * 60); m += 5) {
        if (rnd() < 0.04) drift = (rnd() - 0.5) * 3.2;
        const rth = m >= 570;
        const open = m === 570 ? 1.9 : 1;
        const vol = (rth ? 7.5 : 3) * open * (0.7 + 0.3 * Math.abs(Math.sin(m / 90)));
        const o = price;
        let c = o + drift + gauss() * vol;
        const h = Math.max(o, c) + Math.abs(gauss()) * vol * 0.6;
        const l = Math.min(o, c) - Math.abs(gauss()) * vol * 0.6;
        const r = v => Math.round(v * 4) / 4;
        const volume = Math.round((rth ? 9000 : 1800) * (m < 600 || m > 930 ? 1.8 : 1) * (0.6 + rnd()));
        bars.push({ t: full ? midnight + m * 60000 : zonedToEpoch(y, mo, d, Math.floor(m / 60), m % 60, 0, 'America/New_York'),
          o: r(o), h: r(h), l: r(l), c: r(c), v: volume });
        price = c;
      }
      price += gauss() * 25; // hueco nocturno
    }
    return bars;
  }

  const api = { CONTRACTS, SESSIONS, DEFAULTS, parseCSV, parseTime, ema, annotate, backtest, optimize, stats, demoBars, tzParts, zonedToEpoch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmaVwap = api;
})(typeof self !== 'undefined' ? self : this);
