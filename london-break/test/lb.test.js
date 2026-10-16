// Tests del simulador: node --test london-break/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../ema-vwap/engine.js');
const LB = require('../lb.js');

// Día de prueba (martes) con velas de 30 min en hora de Nueva York
const day = (y, mo, d) => (h, mi) => E.zonedToEpoch(y, mo, d, h, mi, 0, 'America/New_York');
const T = day(2025, 3, 4);
// Rango de Londres 03:00–09:00: máximo 110, mínimo 90
function london() {
  const rows = [];
  for (let h = 3; h < 9; h++) for (const mi of [0, 30]) rows.push({ t: T(h, mi), o: 100, h: 105, l: 95, c: 100, v: 100 });
  rows[2].h = 110; rows[5].l = 90;
  rows.push({ t: T(9, 0), o: 100, h: 104, l: 96, c: 100, v: 100 }); // 09:00–09:30: no se opera
  return rows;
}
const P = { slipTicks: 0, commission: 0, contract: 'NQ' };

test('marca el rango de Londres y no opera antes de las 09:30', () => {
  const bars = london();
  bars[12].l = 85; // 09:00 rompe el mínimo, pero aún no se opera
  bars.push({ t: T(9, 30), o: 100, h: 104, l: 96, c: 100, v: 100 });
  const r = LB.backtest(bars, P);
  assert.equal(r.trades.length, 0);
  assert.equal(r.days[0].H, 110);
  assert.equal(r.days[0].L, 90); // el mínimo de Londres solo usa 03:00–09:00 (la rotura de las 09:00 no cuenta)
});

test('toca el mínimo → compra en el nivel; objetivo el máximo de Londres', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 100, h: 101, l: 89, c: 95, v: 100 });   // baja a 89: compra en 90 (stop 70 no tocado)
  bars.push({ t: T(10, 0), o: 95, h: 111, l: 94, c: 108, v: 100 });   // sube a 111: objetivo 110
  const r = LB.backtest(bars, Object.assign({}, P, { stopPts: 20 }));
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.side, 1);
  assert.equal(t.entry, 90);
  assert.equal(t.stop, 70);
  assert.equal(t.reason, 'Objetivo');
  assert.equal(t.exit, 110);
  assert.equal(t.pnl, 20 * 20);
});

test('si la vela abre por debajo del mínimo, la compra se llena a la apertura (precio mejor)', () => {
  const bars = london();
  bars[12].c = 88;
  bars.push({ t: T(9, 30), o: 87, h: 92, l: 86, c: 91, v: 100 });
  const t = LB.backtest(bars, P).open; // sigue abierta al acabar los datos
  assert.equal(t.entry, 87);
});

test('el recorrido de la vela decide: entra en el máximo y luego toca el stop en la misma vela', () => {
  const bars = london();
  // Apertura más cerca del máximo: recorrido apertura → máximo (vende en 110) → mínimo
  bars.push({ t: T(9, 30), o: 108, h: 135, l: 100, c: 101, v: 100 });
  const t = LB.backtest(bars, Object.assign({}, P, { stopPts: 20 })).trades[0];
  assert.equal(t.side, -1);
  assert.equal(t.entry, 110);
  assert.equal(t.reason, 'Stop'); // tras vender en 110 sube a 135 (stop 130) antes de bajar
});

test('vuelve dentro: rompe, cierra dentro y pone el stop tras el extremo del barrido', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 92, h: 93, l: 84, c: 86, v: 100 });   // barre hasta 84
  bars.push({ t: T(10, 0), o: 86, h: 95, l: 85, c: 94, v: 100 });   // cierra dentro (94 > 90)
  bars.push({ t: T(10, 30), o: 94, h: 96, l: 93, c: 95, v: 100 });  // entra a la apertura: 94
  const r = LB.backtest(bars, Object.assign({}, P, { entryMode: 'reclaim', stopMode: 'sweep', sweepBuffer: 4, targetMode: 'r', targetR: 2.5 }));
  const t = r.open;
  assert.equal(t.side, 1);
  assert.equal(t.entry, 94);
  assert.equal(t.stop, 84 - 1);                     // 4 ticks bajo el mínimo del barrido
  assert.equal(t.target, 94 + (94 - 83) * 2.5);     // 2,5R desde el cierre de la señal
});

test('cierra lo abierto a la hora de cierre', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 100, h: 101, l: 89, c: 95, v: 100 });
  for (let h = 10; h < 16; h++) for (const mi of [0, 30]) bars.push({ t: T(h, mi), o: 95, h: 97, l: 93, c: 95, v: 100 });
  const t = LB.backtest(bars, Object.assign({}, P, { closeAt: '15:30' })).trades[0];
  assert.equal(t.reason, 'Hora de cierre');
  assert.equal(E.tzParts(t.exitTime).min, 15 * 60 + 30);
});

test('ruptura: 3 velas seguidas cierran bajo el mínimo → vende a favor y aguanta hasta el cierre', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 92, h: 93, l: 87, c: 88, v: 100 });   // 1.ª fuera
  bars.push({ t: T(10, 0), o: 88, h: 89, l: 86, c: 87, v: 100 });   // 2.ª fuera
  bars.push({ t: T(10, 30), o: 87, h: 88, l: 85, c: 86, v: 100 });  // 3.ª fuera → ruptura
  bars.push({ t: T(11, 0), o: 86, h: 87, l: 80, c: 81, v: 100 });   // vende a la apertura: 86
  for (let h = 11; h < 16; h++) for (const mi of [0, 30]) if (h > 11 || mi === 30) bars.push({ t: T(h, mi), o: 80, h: 82, l: 78, c: 80, v: 100 });
  const cfg = Object.assign({}, P, { entryMode: 'reclaim', breakMode: 'breakout', acceptBars: 3, bStopPts: 20, bTargetMode: 'close', closeAt: '15:30' });
  const t = LB.backtest(bars, cfg).trades[0];
  assert.equal(t.kind, 'ruptura');
  assert.equal(t.side, -1);
  assert.equal(t.entry, 86);
  assert.equal(t.stop, 86 + 20);
  assert.equal(t.reason, 'Hora de cierre');
  assert.equal(t.exit, 80);
});

test('ambas: si vuelve dentro antes de la 3.ª vela fuera es manipulación → compra a la contra', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 92, h: 93, l: 85, c: 88, v: 100 });   // rompe y cierra fuera (1)
  bars.push({ t: T(10, 0), o: 88, h: 95, l: 87, c: 94, v: 100 });   // cierra dentro → manipulación
  bars.push({ t: T(10, 30), o: 94, h: 96, l: 93, c: 95, v: 100 });  // compra a la apertura: 94
  const r = LB.backtest(bars, Object.assign({}, P, { entryMode: 'reclaim', breakMode: 'both', acceptBars: 3, stopPts: 20, targetMode: 'opposite' }));
  assert.equal(r.open.kind, 'manipulación');
  assert.equal(r.open.side, 1);
  assert.equal(r.open.entry, 94);
  assert.equal(r.open.target, 110);
});

test('ambas: tras confirmar la ruptura, volver dentro ya no cuenta como manipulación en ese nivel', () => {
  const bars = london();
  bars.push({ t: T(9, 30), o: 92, h: 93, l: 87, c: 88, v: 100 });
  bars.push({ t: T(10, 0), o: 88, h: 89, l: 86, c: 87, v: 100 });   // 2.ª fuera → ruptura (acceptBars 2)
  bars.push({ t: T(10, 30), o: 87, h: 108, l: 86, c: 100, v: 100 }); // vende en 87, sube al stop (107) y cierra dentro
  bars.push({ t: T(11, 0), o: 100, h: 101, l: 99, c: 100, v: 100 });
  const r = LB.backtest(bars, Object.assign({}, P, { entryMode: 'reclaim', breakMode: 'both', acceptBars: 2, bStopPts: 20, bTargetMode: 'close', maxTrades: 2 }));
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].kind, 'ruptura');
  assert.equal(r.trades[0].reason, 'Stop');
  assert.equal(r.open, null);
});
