// Compara la estrategia Pine con breakeven y contratos añadidos (PineTS) con manage.js, día a día.
// Uso: cd london-break/test && npm install --no-save pinets@0.10.0 && node manage-parity.mjs 5 <archivo NinjaTrader 1 min>
import { PineTS } from 'pinets';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
import fs from 'fs';
const E = req('../../ema-vwap/engine.js');
const m1 = E.parseCSV(fs.readFileSync(process.argv[3], 'utf8'), 'UTC');
const resample = E.resample;
const A = req('../manage.js');
const LB = req('../lb.js');
const P = req('../pine.js');
const f = x => (x >= 0 ? '+' : '') + Math.round(x);
const tfm = +(process.argv[2] || 5);
const bars = resample(m1, tfm);
const provider = { configure() {}, async getMarketData() { return bars.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v, openTime: b.t, closeTime: b.t + tfm * 60000 })); },
  async getSymbolInfo() { return { ticker: 'MNQ1!', tickerid: 'MNQ1!', timezone: 'America/New_York', mintick: 0.25, pointvalue: 2, currency: 'USD', type: 'futures', session: '24x7' }; } };
for (const [name, cfg] of [['base', {}], ['BE 1R', { beR: 1 }], ['piramidar', { addEveryR: 1, maxAdds: 2 }], ['BE + piramidar', { beR: 1, addEveryR: 1, maxAdds: 2 }]]) {
  const sim = A.run(bars, Object.assign({ contract: 'MNQ', stopPts: 10, target: 'opposite', addQty: 1 }, cfg));
  const res = await new PineTS(provider, 'MNQ1!', String(tfm)).run(P.pineStrategy(Object.assign({}, LB.DEFAULTS, { contract: 'MNQ', stopPts: 10, targetMode: 'opposite', maxTrades: 1 }, cfg), E.CONTRACTS));
  const ct = res.strategy.closedtrades;
  const byDay = {};
  ct.forEach(t => { const d = E.tzParts(t.entry_time).date.slice(5); byDay[d] = (byDay[d] || 0) + t.profit; });
  const simDay = {};
  sim.trades.forEach(t => { const d = E.tzParts(t.t).date.slice(5); simDay[d] = (simDay[d] || 0) + t.pnl; });
  const days = [...new Set([...Object.keys(byDay), ...Object.keys(simDay)])].sort();
  const diff = days.filter(d => Math.abs((byDay[d] || 0) - (simDay[d] || 0)) > 0.01);
  console.log(`${name}: simulador ${f(sim.st.net)} | Pine ${f(ct.reduce((a, t) => a + t.profit, 0))} (${ct.length} entradas) | días distintos: ${diff.map(d => d + ' ' + f(simDay[d] || 0) + '/' + f(byDay[d] || 0)).join(', ') || 'ninguno'}`);
}
