// Ejecuta el indicador Pine (pine.js) con PineTS sobre las mismas velas que el motor web y compara:
//  - cada entrada y salida del plan (precio y vela)
//  - el resultado neto de cada stop de la tabla
// Uso: cd ema-vwap/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs 7,11
import { PineTS } from 'pinets';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const E = req('../engine.js');
const P = req('../pine.js');

const STOPS = [5, 8, 10, 15, 20, 30, 40];
const BASE = { contract: 'NQ', targetPts: 0, beTrigger: 0, targetR: 2, beR: 1, stopPts: 15 };
const SETS = [{},
  { targetR: 0 }, { beR: 0 }, { targetR: 1.5, beR: 0.5 }, { targetR: 3, beR: 0 },
  { stopMode: 'swing', swingBars: 5, stopBuffer: 2, stopMin: 5, stopMax: 40 },
  { stopMode: 'swing', swingBars: 10, stopBuffer: 4, stopMin: 8, stopMax: 0, targetR: 1.5 },
  { maxVwapDist: 15 }, { exitOnCross: false }, { reverse: false }, { exitOnVwap: true },
  { flatAtEnd: false }, { vwapSession: 'globex' }, { direction: 'long' }, { vwapFilter: false },
  { fast: 5, slow: 50 }, { slipTicks: 0, commission: 0 }, { qty: 2 }, { session: 'custom', tradeStart: '10:00', tradeEnd: '12:00' },
  // Datos de 24 h (Globex) para las sesiones fuera de Nueva York
  { _full: true }, { _full: true, session: 'london' }, { _full: true, session: 'asia' }, { _full: true, session: 'all' },
  { _full: true, session: 'custom', tradeStart: '20:00', tradeEnd: '02:00' }, { _full: true, session: 'all', vwapSession: 'rth', vwapFilter: false }];
const SEEDS = (process.argv[2] || '7,11').split(',').map(Number);

async function runPine(bars, params) {
  const spec = E.CONTRACTS[params.contract];
  const provider = {
    configure() {},
    async getMarketData() { return bars.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, openTime: b.t, closeTime: b.t + 300000 })); },
    async getSymbolInfo() { return { ticker: 'NQ1!', tickerid: 'NQ1!', timezone: 'America/New_York', mintick: spec.tick, pointvalue: spec.pointValue, currency: 'USD', type: 'futures', session: '24x7' }; }
  };
  const res = await new PineTS(provider, 'NQ1!', '5').run(P.pineIndicator(params, E.CONTRACTS));
  const last = k => { const d = res.plots[k].data; return d[d.length - 1].value; };
  const series = k => res.plots[k].data.map(d => d.value);
  return { last, series };
}

const close = (a, b) => Math.abs(a - b) < 0.005;
let failed = 0, total = 0;
for (const seed of SEEDS) for (const set of SETS) {
  const params = Object.assign({}, E.DEFAULTS, BASE, set);
  delete params._full;
  const bars = E.demoBars(set._full ? 8 : 15, seed, !!set._full);
  const pine = await runPine(bars, params);
  const problems = [];
  // Plan
  const plan = E.backtest(bars.map(b => Object.assign({}, b)), params).trades.filter(t => t.reason !== 'Fin de datos');
  const ent = pine.series('entryPx'), ext = pine.series('exitPx');
  const pEntries = ent.map((v, i) => [i, v]).filter(x => Number.isFinite(x[1]));
  const pExits = ext.map((v, i) => [i, v]).filter(x => Number.isFinite(x[1]));
  // Entradas: una por vela. Salidas: puede haber dos en la misma vela (cierre en la apertura y
  // stop de la nueva posición); Pine muestra la última, así que se compara la última de cada vela.
  plan.forEach((t, k) => {
    const e = pEntries[k];
    if (!e || e[0] !== t.entryIdx || !close(e[1], t.entry)) problems.push(`entrada ${k}`);
  });
  const lastExit = new Map();
  plan.forEach(t => lastExit.set(t.exitIdx, t.exit));
  const jsExits = [...lastExit.entries()];
  jsExits.forEach(([idx, px], k) => {
    const x = pExits[k];
    if (!x || x[0] !== idx || !close(x[1], px)) problems.push(`salida vela ${idx}`);
  });
  if (pExits.length !== jsExits.length) problems.push(`velas con salida ${jsExits.length} vs ${pExits.length}`);
  const netPlan = plan.reduce((s, t) => s + t.pnl, 0);
  if (!close(pine.last('net0'), netPlan)) problems.push(`neto plan ${netPlan} vs ${pine.last('net0')}`);
  // Tabla de stops
  STOPS.forEach((s, k) => {
    const v = Object.assign({}, params, { stopMode: 'points', stopPts: s });
    const net = E.backtest(bars.map(b => Object.assign({}, b)), v).trades.filter(t => t.reason !== 'Fin de datos').reduce((a, t) => a + t.pnl, 0);
    if (!close(pine.last('net' + (k + 1)), net)) problems.push(`stop ${s}: ${net.toFixed(2)} vs ${pine.last('net' + (k + 1))}`);
  });
  // Tu plan en cada sesión
  [['ny', 'sessNY'], ['london', 'sessLondon'], ['asia', 'sessAsia'], ['all', 'sessAll']].forEach(([sess, plot]) => {
    const v = Object.assign({}, params, { session: sess });
    const net = E.backtest(bars.map(b => Object.assign({}, b)), v).trades.filter(t => t.reason !== 'Fin de datos').reduce((a, t) => a + t.pnl, 0);
    if (!close(pine.last(plot), net)) problems.push(`sesión ${sess}: ${net.toFixed(2)} vs ${pine.last(plot)}`);
  });
  total++;
  if (problems.length) failed++;
  console.log(`${problems.length ? 'MAL' : 'ok '} semilla ${seed} ${JSON.stringify(set)} · ${plan.length} ops · neto ${netPlan.toFixed(0)}${problems.length ? ' · ' + problems.slice(0, 4).join(' | ') : ''}`);
}
console.log(`\n${total - failed}/${total} configuraciones idénticas`);
process.exit(failed ? 1 : 0);
