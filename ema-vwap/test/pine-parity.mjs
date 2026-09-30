// Ejecuta la estrategia Pine (pine.js) con PineTS sobre las mismas velas que el motor web
// y compara operación por operación. Uso:
//   cd ema-vwap/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs
import { PineTS } from 'pinets';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const E = req('../engine.js');
const P = req('../pine.js');

const SETS = [{},
  { vwapSession: 'globex' }, { direction: 'long' }, { direction: 'short' }, { vwapFilter: false },
  { stopPts: 0 }, { targetPts: 0 }, { stopPts: 0, targetPts: 0 },
  { beTrigger: 10 }, { beTrigger: 15, stopPts: 0 }, { beTrigger: 8, targetPts: 0 },
  { maxTradesDay: 2 }, { dailyLossLimit: 60 }, { maxTradesDay: 3, dailyLossLimit: 100, beTrigger: 12 },
  { exitOnVwap: true }, { reverse: false }, { exitOnCross: false }, { exitOnCross: false, exitOnVwap: true },
  { flatAtEnd: false }, { contract: 'NQ', qty: 2 }, { slipTicks: 0 }, { slipTicks: 3, contract: 'NQ' },
  { fast: 5, slow: 13 }, { fast: 20, slow: 50, stopPts: 30, targetPts: 60 },
  { tradeStart: '10:00', tradeEnd: '12:00' }, { commission: 4 }];
const SEEDS = (process.argv[2] || '7,11').split(',').map(Number);

async function runPine(bars, params) {
  const spec = E.CONTRACTS[params.contract || 'MNQ'];
  const provider = {
    configure() {},
    async getMarketData() { return bars.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, openTime: b.t, closeTime: b.t + 300000 })); },
    async getSymbolInfo() { return { ticker: 'MNQ1!', tickerid: 'MNQ1!', timezone: 'America/New_York', mintick: spec.tick, pointvalue: spec.pointValue, currency: 'USD', type: 'futures', session: '24x7' }; }
  };
  const res = await new PineTS(provider, 'MNQ1!', '5').run(P.pineScript(Object.assign({}, E.DEFAULTS, params), E.CONTRACTS));
  return res.strategy.closedtrades;
}

let failed = 0, total = 0;
for (const seed of SEEDS) for (const params of SETS) {
  const bars = E.demoBars(15, seed);
  const js = E.backtest(bars.map(b => Object.assign({}, b)), params).trades.filter(t => t.reason !== 'Fin de datos');
  const pine = await runPine(bars, params);
  const same = js.length === pine.length && js.every((a, i) => {
    const b = pine[i];
    return a.entryIdx === b.entry_bar_index && a.exitIdx === b.exit_bar_index && Math.sign(b.size) === a.side &&
      Math.abs(a.entry - b.entry_price) < 1e-6 && Math.abs(a.exit - b.exit_price) < 1e-6 && Math.abs(a.pnl - b.profit) < 0.01;
  });
  total++;
  if (!same) failed++;
  console.log(`${same ? 'ok ' : 'MAL'} semilla ${seed} ${JSON.stringify(params)} · ${js.length} operaciones · neto ${js.reduce((s, t) => s + t.pnl, 0).toFixed(2)}`);
}
console.log(`\n${total - failed}/${total} configuraciones idénticas`);
process.exit(failed ? 1 : 0);
