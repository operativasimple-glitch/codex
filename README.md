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

A separate page for backtesting the EMA crossover filtered by session VWAP on **NQ / MNQ** futures, plus the same strategy as a TradingView Pine Script. Open `ema-vwap/index.html` (or `<pages-url>/ema-vwap/`).

- **Long**: fast EMA crosses above slow EMA and the close is above VWAP. **Short**: the mirror image.
- Signals are confirmed at bar close and filled at the next bar's open.
- Stop/target are checked inside the bar using TradingView's path rule: open→high→low→close if the open is closer to the high, otherwise open→low→high→close. A pessimistic mode is also available.
- Slippage (in ticks) applies to every fill. Commission is per contract.
- Settings: EMA lengths, VWAP reset time (09:30 RTH or 18:00 Globex), direction, stop/target in points, breakeven, reverse on opposite cross, exit on VWAP cross, trading hours (New York time), max entries per day, and daily loss limit.
- At the end of the trading window, the position closes at the open of the first bar outside the window.
- **Optimizer**: tries grids of EMA/stop/target combinations. It picks on the first 70% of the data and reports the untouched last 30%, which exposes overfitting.
- **TradingView**: `ema_vwap_strategy.pine` is the Pine Script v6 strategy with the default settings. The page also generates it with the current settings and has a copy button.
- **Data**: export the chart from TradingView (`NQ1!` / `MNQ1!`, *Export chart data*) or NinjaTrader and load the CSV. Includes simulated demo data, which is clearly labeled as not real.

### Tests

```bash
node --test ema-vwap/test/engine.test.js              # engine rules, hand-built candles
cd ema-vwap/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs 7,11,23,99
```

`pine-parity.mjs` runs the Pine strategy with [PineTS](https://github.com/LuxAlgo/PineTS), an open-source Pine interpreter, on the same candles. It checks that every trade matches the web engine exactly: entry/exit bar, price, and P&L.
