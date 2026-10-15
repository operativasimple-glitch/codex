// Ejecuta la estrategia Pine (pine.js) con PineTS y la compara con el simulador lb.js operación por operación.
// PineTS difiere de TradingView en dos detalles del emulador de órdenes (orden limitada con hueco: llena al
// nivel, no a la apertura; y en la vela de entrada mira el máximo/mínimo de toda la vela). El simulador los
// imita con _pinetsCompat solo para esta prueba; sin esa opción sigue el comportamiento de TradingView.
// Uso: cd london-break/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs [archivo NinjaTrader 1 min]
import { PineTS } from 'pinets';
import { createRequire } from 'module';
import fs from 'fs';
const req = createRequire(import.meta.url);
const E = req('../../ema-vwap/engine.js');
const LB = req('../lb.js');
const P = req('../pine.js');

const file = process.argv[2];
const m1 = file ? E.parseCSV(fs.readFileSync(file, 'utf8'), 'UTC') : E.demoBars(10, 7, true);
const TFS = (process.argv[3] || '5').split(',').map(Number);
const SETS = [{},
  { stopMode: 'range', stopFrac: 0.25 }, { targetMode: 'r', targetR: 2.5 }, { stopPts: 10 }, { stopPts: 40 },
  { maxTrades: 2 }, { direction: 'long' }, { direction: 'short' }, { minRR: 2.5 },
  { entryMode: 'reclaim', stopMode: 'sweep' }, { entryMode: 'reclaim', stopMode: 'sweep', targetMode: 'r', targetR: 2.5 },
  { entryMode: 'reclaim', stopMode: 'points', stopPts: 20 }, { lastEntry: '11:00', closeAt: '12:00' }, { slipTicks: 0, commission: 0 }];

async function runPine(bars, params, tfMin) {
  const spec = E.CONTRACTS[params.contract || 'NQ'];
  const provider = {
    configure() {},
    async getMarketData() { return bars.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, openTime: b.t, closeTime: b.t + tfMin * 60000 })); },
    async getSymbolInfo() { return { ticker: 'NQ1!', tickerid: 'NQ1!', timezone: 'America/New_York', mintick: spec.tick, pointvalue: spec.pointValue, currency: 'USD', type: 'futures', session: '24x7' }; }
  };
  const res = await new PineTS(provider, 'NQ1!', String(tfMin)).run(P.pineStrategy(Object.assign({}, LB.DEFAULTS, params), E.CONTRACTS));
  return res.strategy.closedtrades;
}

let failed = 0, total = 0;
for (const tfMin of TFS) {
  const bars = E.resample(m1, tfMin);
  for (const set of SETS) {
    const js = LB.backtest(bars.map(b => Object.assign({}, b)), Object.assign({ _pinetsCompat: true }, set)).trades.filter(t => t.reason !== 'Fin de datos');
    const pine = await runPine(bars, set, tfMin);
    const problems = [];
    const n = Math.max(js.length, pine.length);
    for (let i = 0; i < n; i++) {
      const a = js[i], b = pine[i];
      if (!a || !b || a.entryIdx !== b.entry_bar_index || a.exitIdx !== b.exit_bar_index || Math.sign(b.size) !== a.side ||
        Math.abs(a.entry - b.entry_price) > 1e-6 || Math.abs(a.exit - b.exit_price) > 1e-6 || Math.abs(a.pnl - b.profit) > 0.01) {
        problems.push(JSON.stringify({ i, js: a && [a.entryIdx, a.exitIdx, a.side, a.entry, a.exit, a.reason], pine: b && [b.entry_bar_index, b.exit_bar_index, Math.sign(b.size), b.entry_price, b.exit_price, b.exit_comment || b.exit_id] }));
        break;
      }
    }
    total++;
    if (problems.length) failed++;
    console.log(`${problems.length ? 'MAL' : 'ok '} ${tfMin}m ${JSON.stringify(set)} · ${js.length} vs ${pine.length} ops · neto ${js.reduce((s, t) => s + t.pnl, 0).toFixed(0)}${problems.length ? ' · ' + problems[0] : ''}`);
  }
}
console.log(`\n${total - failed}/${total} configuraciones idénticas`);
process.exit(failed ? 1 : 0);
