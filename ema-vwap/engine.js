/* Motor de backtest: cruce de EMAs filtrado por VWAP de sesión (NQ / MNQ).
   Sin dependencias; funciona en navegador y en Node (para tests). */
(function (root) {
  'use strict';

  const CONTRACTS = {
    NQ:  { name: 'NQ (E-mini Nasdaq-100)',  pointValue: 20, tick: 0.25, commission: 4.5 },
    MNQ: { name: 'MNQ (Micro E-mini Nasdaq-100)', pointValue: 2, tick: 0.25, commission: 1.5 }
  };

  const DEFAULTS = {
    contract: 'MNQ',
    qty: 1,
    fast: 9,
    slow: 21,
    vwapFilter: true,       // largos solo con cierre > VWAP, cortos con cierre < VWAP
    direction: 'both',      // both | long | short
    vwapSession: 'rth',     // rth (reinicia 09:30 ET) | globex (reinicia 18:00 ET)
    tradeStart: '09:30',    // horario operativo (hora de Nueva York)
    tradeEnd: '15:55',
    flatAtEnd: true,        // cerrar posición al final del horario
    stopPts: 20,            // 0 = sin stop
    targetPts: 40,          // 0 = sin objetivo
    exitOnCross: true,      // salir con el cruce contrario de EMAs
    exitOnVwap: false,      // salir si el cierre cruza el VWAP en contra
    reverse: true,          // en cruce contrario válido, girar posición
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
  function ema(values, n) {
    const out = new Array(values.length);
    const k = 2 / (n + 1);
    let prev = values[0];
    for (let i = 0; i < values.length; i++) {
      prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  const hhmm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

  // Añade a cada vela: et (partes en NY), session (clave), vwap
  function annotate(bars, mode) {
    let key = null, pv = 0, vol = 0;
    for (const b of bars) {
      b.et = tzParts(b.t);
      let sKey, active;
      if (mode === 'globex') {
        // La sesión de CME empieza a las 18:00 ET: se atribuye al día siguiente
        sKey = tzParts(b.t + 6 * 3600e3).date;
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
  function backtest(bars, params) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const spec = CONTRACTS[p.contract] || CONTRACTS.MNQ;
    const commission = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const slip = (+p.slipTicks || 0) * spec.tick;
    const qty = Math.max(1, Math.floor(+p.qty || 1));
    const fast = Math.max(1, Math.floor(+p.fast)), slow = Math.max(2, Math.floor(+p.slow));

    annotate(bars, p.vwapSession);
    const closes = bars.map(b => b.c);
    const ef = ema(closes, fast), es = ema(closes, slow);
    const start = hhmm(p.tradeStart), end = hhmm(p.tradeEnd);
    const inWindow = b => b.et.wd >= 1 && b.et.wd <= 5 && b.et.min >= start && b.et.min < end;

    // Duración típica de vela (para detectar huecos)
    const gaps = [];
    for (let i = 1; i < Math.min(bars.length, 500); i++) gaps.push(bars[i].t - bars[i - 1].t);
    gaps.sort((a, b) => a - b);
    const barMs = gaps.length ? gaps[gaps.length >> 1] : 60000;

    const trades = [];
    const signals = [];
    let pos = null;          // { side, entry, idx, stop, target }
    let pending = null;      // { exit?:reason, enter?:side } a ejecutar en la apertura de la vela siguiente

    const close = (i, price, reason) => {
      const pts = (price - pos.entry) * pos.side;
      const gross = pts * spec.pointValue * qty;
      const fee = commission * qty;
      trades.push({
        side: pos.side, entryIdx: pos.idx, exitIdx: i, entryTime: bars[pos.idx].t, exitTime: bars[i].t,
        entry: pos.entry, exit: price, pts, gross, fee, pnl: gross - fee, reason, bars: i - pos.idx + 1,
        stop: pos.stop, target: pos.target
      });
      pos = null;
    };
    const open = (i, side) => {
      const entry = bars[i].o + side * slip;
      pos = {
        side, entry, idx: i,
        stop: +p.stopPts > 0 ? entry - side * +p.stopPts : null,
        target: +p.targetPts > 0 ? entry + side * +p.targetPts : null
      };
    };

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];

      // 1) Órdenes pendientes en la apertura
      if (pending) {
        if (pending.exit && pos) close(i, b.o - pos.side * slip, pending.exit);
        if (pending.enter && !pos) open(i, pending.enter);
        pending = null;
      }

      // 2) Stop / objetivo dentro de la vela (si tocan ambos, se asume el stop: conservador)
      if (pos) {
        const s = pos.side;
        const hitStop = pos.stop != null && (s > 0 ? b.l <= pos.stop : b.h >= pos.stop);
        const hitTgt = pos.target != null && (s > 0 ? b.h >= pos.target : b.l <= pos.target);
        if (hitStop) {
          const gapThrough = s > 0 ? b.o < pos.stop : b.o > pos.stop;
          close(i, (gapThrough ? b.o : pos.stop) - s * slip, 'Stop');
        } else if (hitTgt) {
          const gapThrough = s > 0 ? b.o > pos.target : b.o < pos.target;
          close(i, gapThrough ? b.o : pos.target, 'Objetivo');
        }
      }

      // 3) Señales al cierre de la vela
      if (i < slow) continue;
      const next = bars[i + 1];
      const up = ef[i - 1] <= es[i - 1] && ef[i] > es[i];
      const dn = ef[i - 1] >= es[i - 1] && ef[i] < es[i];
      let side = 0;
      if (up) side = 1; else if (dn) side = -1;
      let valid = side !== 0;
      let why = '';
      if (valid && p.vwapFilter) {
        if (b.vwap == null) { valid = false; why = 'sin VWAP'; }
        else if (side > 0 ? b.c <= b.vwap : b.c >= b.vwap) { valid = false; why = side > 0 ? 'cierre bajo VWAP' : 'cierre sobre VWAP'; }
      }
      if (valid && (p.direction === 'long' && side < 0 || p.direction === 'short' && side > 0)) { valid = false; why = 'dirección desactivada'; }
      const sameSession = next && next.session === b.session && next.t - b.t <= barMs * 3;
      if (valid && !(next && sameSession && inWindow(next))) { valid = false; why = 'fuera de horario'; }
      if (side) signals.push({ idx: i, side, valid, why });

      if (pos) {
        let exitReason = null;
        if (p.exitOnCross && side === -pos.side) exitReason = 'Cruce contrario';
        else if (p.exitOnVwap && b.vwap != null && (pos.side > 0 ? b.c < b.vwap : b.c > b.vwap)) exitReason = 'Cruce VWAP';
        if (!next) { close(i, b.c, 'Fin de datos'); continue; }
        const endOfDay = p.flatAtEnd && (!inWindow(next) || !sameSession);
        if (endOfDay) { close(i, b.c - pos.side * slip, 'Cierre de horario'); continue; }
        if (exitReason) {
          pending = { exit: exitReason };
          if (p.reverse && valid && side === -pos.side) pending.enter = side;
        }
      } else if (valid) {
        pending = { enter: side };
      }
    }
    if (pos) close(bars.length - 1, bars[bars.length - 1].c, 'Fin de datos');

    return { trades, signals, emaFast: ef, emaSlow: es, stats: stats(trades), spec, params: p, commission };
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
  function demoBars(days, seed) {
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
      // Solo sesión regular + algo de pre-market: 08:00 – 16:00 ET, velas de 5 minutos
      for (let m = 8 * 60; m < 16 * 60; m += 5) {
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
        bars.push({ t: zonedToEpoch(y, mo, d, Math.floor(m / 60), m % 60, 0, 'America/New_York'),
          o: r(o), h: r(h), l: r(l), c: r(c), v: volume });
        price = c;
      }
      price += gauss() * 25; // hueco nocturno
    }
    return bars;
  }

  const api = { CONTRACTS, DEFAULTS, parseCSV, parseTime, ema, annotate, backtest, stats, demoBars, tzParts, zonedToEpoch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmaVwap = api;
})(typeof self !== 'undefined' ? self : this);
