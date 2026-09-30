// Tests del motor: node --test ema-vwap/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

// Velas de 5 min desde las 10:00 de Nueva York (un martes)
const T0 = E.zonedToEpoch(2025, 3, 4, 10, 0, 0, 'America/New_York');
function mk(rows, startMs) {
  return rows.map(([o, h, l, c], i) => ({ t: (startMs || T0) + i * 300000, o, h, l, c, v: 1000 }));
}
// EMA 1 = cierre y EMA 2: un cierre que salta sobre los anteriores produce un cruce alcista
const BASE = { fast: 1, slow: 2, contract: 'MNQ', qty: 1, slipTicks: 1, commission: 1.5, stopPts: 10, targetPts: 20, targetR: 0, beR: 0,
  tradeStart: '09:30', tradeEnd: '15:55', exitOnCross: false, reverse: false };
const flat = n => Array.from({ length: n }, () => [100, 100.5, 99.5, 100]);

test('EMA arranca con la media simple, como TradingView', () => {
  const e = E.ema([1, 2, 3, 4], 3);
  assert.equal(e[0], null); assert.equal(e[1], null);
  assert.equal(e[2], 2);
  assert.equal(e[3], 4 * 0.5 + 2 * 0.5);
});

test('entrada en la apertura siguiente con deslizamiento y stop con deslizamiento', () => {
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 106, 94, 96], [96, 97, 95, 96]]);
  const r = E.backtest(bars, BASE);
  const t = r.trades[0];
  assert.equal(t.side, 1);
  assert.equal(t.entryIdx, 4);
  assert.equal(t.entry, 105.25);          // apertura 105 + 1 tick
  assert.equal(t.reason, 'Stop');
  assert.equal(t.exit, 95);               // stop 95.25 − 1 tick
  assert.equal(t.pnl, (95 - 105.25) * 2 - 1.5);
});

test('stop y objetivo en la misma vela: ruta de TradingView y modo pesimista', () => {
  // Apertura más cerca del máximo → primero máximo → objetivo
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 126, 80, 100], [100, 101, 99, 100]]);
  const tv = E.backtest(bars, BASE).trades[0];
  assert.equal(tv.reason, 'Objetivo');
  assert.equal(tv.exit, 125.25 - 0.25);
  const worst = E.backtest(bars, Object.assign({}, BASE, { intrabar: 'worst' })).trades[0];
  assert.equal(worst.reason, 'Stop');
  // Apertura más cerca del mínimo → primero mínimo → stop
  const bars2 = mk([...flat(3), [100, 105.5, 100, 105], [105, 140, 94, 100], [100, 101, 99, 100]]);
  assert.equal(E.backtest(bars2, BASE).trades[0].reason, 'Stop');
});

test('hueco en la apertura: el stop se ejecuta al precio de apertura', () => {
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 106, 104, 105], [90, 91, 89, 90], [90, 91, 89, 90]]);
  const t = E.backtest(bars, BASE).trades[0];
  assert.equal(t.exitIdx, 5);
  assert.equal(t.exit, 90 - 0.25);
});

test('filtro VWAP: no compra si el cierre está bajo el VWAP', () => {
  // Precio alto al principio → VWAP alto; el cruce alcista posterior cierra por debajo
  const rows = [[130, 131, 129, 130], [130, 131, 129, 130], [100, 100.5, 99.5, 100], [100, 100.5, 99.5, 100], [100, 105.5, 100, 105], [105, 106, 104, 105], [105, 106, 104, 105]];
  const r = E.backtest(mk(rows), BASE);
  assert.equal(r.trades.filter(t => t.side > 0).length, 0);
  assert.ok(r.signals.some(s => s.side === 1 && !s.valid && s.why === 'cierre bajo VWAP'));
  const r2 = E.backtest(mk(rows), Object.assign({}, BASE, { vwapFilter: false, exitOnCross: true, reverse: true }));
  assert.equal(r2.trades.filter(t => t.side > 0).length, 1);
});

test('fuera de horario no entra y al final del horario cierra en la apertura siguiente', () => {
  const start = E.zonedToEpoch(2025, 3, 4, 15, 30, 0, 'America/New_York');
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 106, 104, 105], [105, 106, 104, 105.5], [106, 107, 105, 106], [106, 107, 105, 106]], start);
  // 15:45 señal → entra 15:50; la vela 15:55 queda fuera → cierra en su apertura
  const r = E.backtest(bars, Object.assign({}, BASE, { stopPts: 0, targetPts: 0 }));
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].reason, 'Cierre de horario');
  assert.equal(r.trades[0].exitIdx, 5);
  assert.equal(r.trades[0].exit, 105 - 0.25);
  const late = E.backtest(bars, Object.assign({}, BASE, { tradeEnd: '15:50' }));
  assert.equal(late.trades.length, 0);
});

test('breakeven: el stop pasa a la entrada desde la vela siguiente', () => {
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 113, 104, 112], [112, 112.5, 104, 105], [105, 106, 104, 105]]);
  const t = E.backtest(bars, Object.assign({}, BASE, { beTrigger: 5, targetPts: 0 })).trades[0];
  assert.equal(t.reason, 'Breakeven');
  assert.equal(t.exitIdx, 5);
  assert.equal(t.exit, 105.25 - 0.25);
});

test('cruce contrario: sale y gira en la apertura siguiente', () => {
  const rows = [...flat(3), [100, 105.5, 100, 105], [105, 106, 104, 105], [105, 105.5, 95, 95.5], [95.5, 96, 95, 95.5], [95.5, 96, 95, 95.5]];
  const p = Object.assign({}, BASE, { stopPts: 0, targetPts: 0, exitOnCross: true, reverse: true, vwapFilter: false });
  const r = E.backtest(mk(rows), p);
  assert.equal(r.trades[0].reason, 'Cruce contrario');
  assert.equal(r.trades[0].exitIdx, 6);
  assert.equal(r.trades[1].side, -1);
  assert.equal(r.trades[1].entryIdx, 6);
});

test('máximo de entradas por día y límite de pérdida diaria', () => {
  const bars = E.demoBars(10, 5);
  const free = E.backtest(bars, { targetR: 0, beR: 0, targetPts: 40, stopPts: 20 });
  const capped = E.backtest(bars, { targetR: 0, beR: 0, targetPts: 40, stopPts: 20, maxTradesDay: 1 });
  const perDay = {};
  capped.trades.forEach(t => { const d = E.tzParts(t.entryTime).date; perDay[d] = (perDay[d] || 0) + 1; });
  assert.ok(Object.values(perDay).every(n => n <= 1));
  assert.ok(capped.trades.length < free.trades.length);
  const lim = E.backtest(bars, { targetR: 0, beR: 0, targetPts: 40, stopPts: 20, contract: 'MNQ', dailyLossLimit: 40 });
  assert.ok(lim.signals.some(s => s.why === 'límite de pérdida diaria'));
});

test('CSV: TradingView (unix), NinjaTrader y fecha/hora separadas dan las mismas velas', () => {
  const bars = E.demoBars(2, 3);
  const pad = n => String(n).padStart(2, '0');
  const tv = 'time,open,high,low,close,Volume\n' + bars.map(b => [b.t / 1000, b.o, b.h, b.l, b.c, b.v].join(',')).join('\n');
  const nt = bars.map(b => { const p = E.tzParts(b.t); return `${p.y}${pad(p.mo)}${pad(p.d)} ${pad(p.h)}${pad(p.mi)}00;${b.o};${b.h};${b.l};${b.c};${b.v}`; }).join('\n');
  const sep = 'Date,Time,Open,High,Low,Close,Vol\n' + bars.map(b => { const p = E.tzParts(b.t); return `${pad(p.mo)}/${pad(p.d)}/${p.y},${pad(p.h)}:${pad(p.mi)},${b.o},${b.h},${b.l},${b.c},${b.v}`; }).join('\n');
  for (const text of [tv, nt, sep]) {
    const got = E.parseCSV(text, 'America/New_York');
    assert.equal(got.length, bars.length);
    assert.ok(got.every((b, i) => b.t === bars[i].t && b.c === bars[i].c));
  }
});

test('optimizador: separa dentro y fuera de muestra', () => {
  const bars = E.demoBars(10, 9);
  const job = E.optimize(bars, {}, { fast: [5, 9], slow: [21], stopPts: [10, 20], targetR: [2] });
  job.step();
  assert.equal(job.rows.length, 4);
  for (const r of job.rows) assert.equal(r.is.n + r.oos.n, r.all.n);
  const ranked = job.rank();
  assert.ok(ranked[0].is.net >= ranked[ranked.length - 1].is.net);
});

test('stop por estructura, objetivo y breakeven en R', () => {
  // Señal en la vela 3: mínimo de las 3 últimas velas 99.5 − 2 ticks = 99; entrada 105.25 → riesgo 6.25 pts
  const bars = mk([...flat(3), [100, 105.5, 100, 105], [105, 106, 104.5, 105.5], [105.5, 106, 105, 105.5]]);
  const p = Object.assign({}, BASE, { stopMode: 'swing', swingBars: 3, stopBuffer: 2, stopMin: 2, stopMax: 0, targetR: 2, beR: 1, vwapFilter: false });
  const t = E.backtest(bars, p).trades[0];
  assert.equal(t.entry, 105.25);
  assert.equal(t.risk, 105.25 - (99.5 - 0.5));
  assert.equal(t.stop, 99);
  assert.equal(t.target, 105.25 + t.risk * 2);
  assert.equal(t.beAt, 105.25 + t.risk);
  const capped = E.backtest(bars, Object.assign({}, p, { stopMax: 3 })).trades[0];
  assert.equal(capped.risk, 3);
});

test('no entra si el cierre está lejos del VWAP', () => {
  const bars = mk([...flat(3), [100, 110.5, 100, 110], [110, 111, 109, 110], [110, 111, 109, 110]]);
  const r = E.backtest(bars, Object.assign({}, BASE, { maxVwapDist: 3 }));
  assert.equal(r.trades.length, 0);
  assert.ok(r.signals.some(s => s.why === 'lejos del VWAP'));
});

test('solo cuenta entradas desde la fecha indicada', () => {
  const bars = E.demoBars(10, 5);
  const all = E.backtest(bars, {});
  const mid = E.tzParts(bars[Math.floor(bars.length / 2)].t);
  const pad = n => String(n).padStart(2, '0');
  const from = `${mid.y}-${pad(mid.mo)}-${pad(mid.d)}`;
  const part = E.backtest(bars, { fromDate: from });
  const t0 = E.zonedToEpoch(mid.y, mid.mo, mid.d, 0, 0, 0, 'America/New_York');
  assert.ok(part.trades.length > 0 && part.trades.length < all.trades.length);
  assert.ok(part.trades.every(t => t.entryTime >= t0));
});
