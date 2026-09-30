# Savings Goals

A simple, Apple-styled web app for creating savings goals, adding money to each one, and tracking progress. Built to feel at home on an iPhone — system colors, SF fonts, grouped lists, and native-style sheets.

## Features

- Create goals with a name, target amount, optional due date, and an icon.
- Add money to any goal with quick-amount chips (+$5, +$10, +$20...) or a custom amount.
- Track progress with a slim progress bar and percentage.
- See total saved, active goals, and completed goals at a glance.
- Goals move to a "Completed" section automatically once fully funded, with a success animation.
- Edit or delete a goal from its `•••` menu.
- Installable as a PWA — add it to the iPhone home screen and it works offline.

Data is stored on-device (`localStorage`) — no account or server required.

## Publish with GitHub Pages

1. Go to **Settings → Pages** on this repository.
2. Under "Build and deployment", set the source branch to this branch and folder to `/ (root)`.
3. Save, then open the published URL on your phone and choose "Add to Home Screen" to install it like a native app.

## EMA + VWAP crossover backtest (`/ema-vwap/`)

A page for backtesting the EMA crossover filtered by session VWAP on **NQ / MNQ** futures (NQ by default), plus a TradingView indicator with the same rules. Open `ema-vwap/index.html` (or `<pages-url>/ema-vwap/`).

- **Long**: fast EMA crosses above slow EMA and the close is above VWAP. **Short**: the mirror image. Optional filter: skip entries whose close is more than X pts from VWAP.
- Signals are confirmed at bar close and filled at the next bar's open.
- **Stop**: either a fixed number of points, or behind the low/high of the last N bars plus a buffer (with min/max caps).
- **Target and breakeven**: in multiples of the risk (R); the defaults are 2R and 1R.
- **Exits**: stop, target, breakeven stop, opposite cross (optionally reversing), VWAP cross, or at the open of the first bar after the trading window.
- **Fills**: stop/target inside a bar follow TradingView's path rule (open→high→low→close if the open is closer to the high, otherwise open→low→high→close). Slippage in ticks applies to every fill, and commission is charged per contract.
- **Short or wide stop?**: the same signals are re-run with each stop from a list. It reports trades, win rate, profit factor, net, drawdown and $/trade, plus the result on the last 30% of the data.
- **Optimizer**: grids of EMA lengths, stops and R targets. It picks on the first 70% of the data and reports the untouched last 30%.
- **TradingView indicator** (`ema_vwap_nq_plan.pine`, also generated from the page's current settings):
  - labels each entry with its stop, breakeven price and target;
  - marks the move to breakeven and each exit with its reason and P&L;
  - fires `alert()` messages for entry, breakeven and exit;
  - draws the stop-size comparison table on your own chart data.
- **Data**: export the chart from TradingView (`NQ1!`, *Export chart data*) or NinjaTrader and load the CSV. Includes simulated demo data, which is clearly labeled as not real.

### Tests

```bash
node --test ema-vwap/test/engine.test.js              # engine rules, hand-built candles
cd ema-vwap/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs 7,11,23
```

`pine-parity.mjs` runs the Pine indicator with [PineTS](https://github.com/LuxAlgo/PineTS), an open-source Pine interpreter, on the same candles. It checks that every entry and exit of the plan, and the net result of every stop in the table, match the web engine.
