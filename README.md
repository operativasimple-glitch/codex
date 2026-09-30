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

A separate page for backtesting the EMA crossover filtered by session VWAP on **NQ / MNQ** futures. Open `ema-vwap/index.html` (or `<pages-url>/ema-vwap/`).

- **Long**: fast EMA crosses above slow EMA and the close is above VWAP. **Short**: the mirror image.
- Signals are confirmed at bar close and filled at the next bar's open. Stop/target are checked inside the bar; if both are touched in the same bar, the stop is assumed.
- Adjustable settings: EMA lengths, VWAP reset time (09:30 RTH or 18:00 Globex), trading hours (New York time), stop/target in points, reverse on opposite cross, flatten at end of day, commission, and slippage.
- Data: export the chart from TradingView (`NQ1!` / `MNQ1!`, *Export chart data*) or NinjaTrader and load the CSV. Includes simulated demo data, which is clearly labeled as not real.
- The engine (`engine.js`) has no dependencies and also runs in Node.
