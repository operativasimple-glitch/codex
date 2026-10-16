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
- **Sessions** (New York time): New York 09:30–15:55 (default), London 03:00–09:30, Asia 18:00–03:00, 24 h 18:00–16:55, or custom. Custom sessions can cross midnight, and Sunday evening counts as Monday (CME session day). VWAP "Auto" resets at 09:30 for New York and at 18:00 for the other sessions.
- **Exits**: stop, target, breakeven stop, opposite cross (optionally reversing), VWAP cross, or at the open of the first bar after the session.
- **Compare timeframes on the same period**: "count only from" date filter.
- **Fills**: stop/target inside a bar follow TradingView's path rule (open→high→low→close if the open is closer to the high, otherwise open→low→high→close). Slippage in ticks applies to every fill, and commission is charged per contract.
- **Short or wide stop?**: the same signals are re-run with each stop from a list. It reports trades, win rate, profit factor, net, drawdown and $/trade, plus the result on the last 30% of the data.
- **Optimizer**: grids of EMA lengths, stops and R targets. It picks on the first 70% of the data and reports the untouched last 30%.
- **TradingView indicator** (`ema_vwap_nq_plan.pine`, also generated from the page's current settings):
  - labels each entry with its stop, breakeven price and target;
  - marks the move to breakeven and each exit with its reason and P&L;
  - fires `alert()` messages for entry, breakeven and exit;
  - draws the stop-size comparison table on your own chart data.
- **Data**: export the chart from TradingView (`NQ1!`, *Export chart data*, with the Volume indicator on the chart so VWAP matches) or NinjaTrader and load the CSV. Includes simulated demo data, which is clearly labeled as not real.

### Tests

```bash
node --test ema-vwap/test/engine.test.js              # engine rules, hand-built candles
cd ema-vwap/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs 7,11,23
```

`pine-parity.mjs` runs the Pine indicator with [PineTS](https://github.com/LuxAlgo/PineTS), an open-source Pine interpreter, on the same candles. It checks that every entry and exit of the plan, and the net result of every stop in the table, match the web engine.

## London range breakout (`/london-break/`)

A TradingView strategy for **NQ / MNQ** built on the London session range.

1. Mark the high and low from 03:00 to 09:00 New York time (09:00–15:00 Spain).
2. Do not trade before 09:30 New York (15:30 Spain).
3. If price touches the London **low**, buy; if it touches the **high**, sell.
4. The target is the other side of the range, or a fixed R.

- **Entry modes**:
  - *touch*: a limit order at the level.
  - *reclaim*: after the break, enter when a bar closes back inside the range.
- **Manipulation or breakout** (reclaim entry only). Each break of a London level is read one of two ways:
  - *manipulation*: a bar closes back inside the range, so trade against the break toward the other side;
  - *breakout*: N bars in a row close outside the range, so trade with the break. The stop is X points from the signal close or inside the range behind the level. The target is the closing time, a fixed R or a projection of the range from the level. A projection target that price has already passed means no trade;
  - *both*: whichever happens first at each level. The chart labels each entry MANIPULACIÓN or RUPTURA.
  - The breakout entry can be a market order on confirmation or a limit order on the retest of the broken level, with the stop inside the range.
  - *Decide by range*: compare the London range with the average 09:30–16:00 New York range of the previous 10 days. Below the threshold the day is a breakout day, otherwise a manipulation day; the chart labels the day.
- **Stop modes**: points beyond the level, a percentage of the range, or beyond the sweep extreme (reclaim mode only).
- **Other settings**: max entries per day, direction, last entry time and closing time.
- **Trade management**:
  - breakeven after X R in favour;
  - pyramiding: add contracts at the next open when a bar closes +1×, +2×… X R in favour from the entry level, and optionally move the stop to breakeven on each add.
- **Management tests on the NinjaTrader sample** (`manage.js` covers trailing stops and partial exits too):
  - trailing stops and partial exits reduced results;
  - breakeven at 1R plus adding at +1R and +2R gave the best result.
- **Three-year test** (Dukascopy 1-minute Nasdaq-100 CFD, Oct 2023 – Oct 2026, 1 MNQ with commission and slippage):
  - the CFD matched the NinjaTrader MNQ sample: London ranges within 0–5 points and the same days touching each level;
  - *touch*: none of 180 stop, target and management combinations won in both Oct 2024 – Oct 2026 years. Breakeven plus pyramiding, the best on the short NinjaTrader sample, lost in both;
  - *reclaim* on 3-minute bars, 20 point stop from the signal close and target at the other side won in every year: +734 / +874 / +4,443 (PF 1.10 / 1.11 / 1.56), +6,051 in total, max drawdown −1,319. The 2023–24 year was not used to pick it;
  - it wins about 20% of trades and the profit comes from a few trend days: without the 10 best trades the three years net +763;
  - 2-minute bars also won every year; 5-minute bars did not.
  - *both* on 3-minute bars, breakout after 3 bars outside with a 40 point stop held to the close, manipulation as above, 1 entry a day: +1,196 / +2,926 / +5,007 (PF 1.12 / 1.27 / 1.42), +9,129 in total, max drawdown −1,137. Breakouts made +6,680 of it. Neighbouring settings also won every year: 3 or 5 bars outside with 30–60 point stops. These settings were picked using all three years.
  - **Out-of-sample year Oct 2022 – Sep 2023, not used for any choice: everything lost.** *both* −544 (PF 0.95, max drawdown −4,206, 5 of 12 months up), manipulation only −897, breakout only −175. Neighbouring *both* settings lost −173 to −1,661. The edge is not stable from year to year.
  - Breakout only over the four years: −175 / +3,358 / +2,762 / +5,112, +11,057 in total, max drawdown −2,119, 23–30% of trades win. Its settings were picked using the 2023–2026 years, so only 2022–23 is out of sample. Market breakout entries sat a median 40 points past the level, so the usual retest hit the 40 point stop: 186 of 247 trades in 2025–26 were stopped.
- **Walk-forward test, decide by range** (settings picked on Oct 2022 – Sep 2024 only, checked on Oct 2024 – Oct 2026):
  - the picked settings: London range below 0.4× the average New York range means a breakout day, entered on the retest after 1 close outside, 30 point stop inside the range, target 3R; otherwise a manipulation day, with the stop 1 point past the sweep extreme and the target at the other side;
  - results: +2,956 / +2,883 (picking years), then +484 / +3,842 (checking years), +10,165 in total, max drawdown −1,896, 27–30% of trades win, still positive with 2 ticks of slippage;
  - 274 of 384 tested settings won all four years, and 91% of those that won both picking years won both checking years;
  - almost all the profit comes from manipulation days. Breakout trades netted about −500 over the four years; skipping narrow days entirely (`londres_MNQ_manipulacion_3m.pine`) gave +2,008 / +3,123 / +1,144 / +4,341, +10,615 in total, max drawdown −1,687, with about 145 trades a year instead of 225;
  - 2-minute bars won every year; 5-minute bars lost in 2024–25.
- **Files**:
  - `lb.js` is the simulator. It follows TradingView's order emulator: limit fills at the level, or at the open when the bar opens beyond it, and the intrabar path rule.
  - `pine.js` generates the Pine v6 strategy.
  - Ready-to-paste scripts: `londres_tocar_nivel.pine`, `londres_vuelve_dentro_2.5R.pine`, `londres_MNQ_limite_borde.pine`, `londres_MNQ_BE_piramidar.pine`, `londres_MNQ_vuelve_dentro_3m.pine` (manipulation only), `londres_MNQ_manipulacion_o_ruptura_3m.pine` (decides by range with the walk-forward settings) and `londres_MNQ_manipulacion_3m.pine` (the same settings, manipulation days only). Use the last three on a 3-minute chart.
- **Tests**:
  - `node --test london-break/test/lb.test.js`
  - `cd london-break/test && npm install --no-save pinets@0.10.0 && node pine-parity.mjs <NinjaTrader 1-min file> 5` compares the Pine strategy run in PineTS with the simulator. PineTS fills a few same-bar and gap cases differently from TradingView, so the simulator imitates them only in that test. Three of the original configurations still differ for that reason; the breakout and both configurations match.
  - `node test/manage-parity.mjs 5 <NinjaTrader 1-min file>` (from `london-break/test`) checks the breakeven and pyramiding options day by day.
