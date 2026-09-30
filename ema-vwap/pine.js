/* Genera la estrategia de TradingView (Pine Script v6) con los parámetros de la web.
   Mismas reglas que engine.js; los tests comparan ambos operación por operación. */
(function (root) {
  'use strict';

  const hhmmNum = s => { const [h, m] = String(s).split(':').map(Number); return h * 100 + (m || 0); };
  const num = v => { const n = +v || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); };
  const bool = v => (v ? 'true' : 'false');

  function pineScript(params, specs) {
    const p = params;
    const spec = (specs || {})[p.contract] || { commission: p.contract === 'NQ' ? 4.5 : 1.5 };
    const rt = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const perSide = Math.round(rt / 2 * 10000) / 10000;
    const dir = { both: 'Ambas', long: 'Solo largos', short: 'Solo cortos' }[p.direction] || 'Ambas';
    return `//@version=6
// Cruce EMA + VWAP · NQ / MNQ
// Largo: la EMA rápida cruza sobre la lenta y el cierre está sobre el VWAP de la sesión.
// Corto: la EMA rápida cruza bajo la lenta y el cierre está bajo el VWAP.
// La señal se decide al cierre de la vela y se ejecuta en la apertura de la siguiente.
// Comisión (Propiedades): por contrato y por orden = la mitad de la comisión ida y vuelta.
//   MNQ: 0.75 (1.50 ida y vuelta) · NQ: 2.25 (4.50 ida y vuelta)
strategy("Cruce EMA + VWAP", shorttitle = "EMA×VWAP", overlay = true, pyramiding = 0,
     default_qty_type = strategy.fixed, default_qty_value = ${Math.max(1, Math.floor(+p.qty || 1))}, initial_capital = 50000, margin_long = 0, margin_short = 0,
     commission_type = strategy.commission.cash_per_contract, commission_value = ${perSide},
     slippage = ${Math.max(0, Math.floor(+p.slipTicks || 0))}, process_orders_on_close = false, calc_on_every_tick = false)

const string TZ = "America/New_York"

// ───── Entradas ─────
gS = "Señal"
fastLen    = input.int(${Math.floor(+p.fast)}, "EMA rápida", minval = 1, group = gS)
slowLen    = input.int(${Math.floor(+p.slow)}, "EMA lenta", minval = 2, group = gS)
useVwap    = input.bool(${bool(p.vwapFilter)}, "Filtro VWAP (largo sobre, corto bajo)", group = gS)
vwapMode   = input.string("${p.vwapSession === 'globex' ? 'Globex 18:00' : 'RTH 09:30'}", "VWAP reinicia", options = ["RTH 09:30", "Globex 18:00"], group = gS)
direction  = input.string("${dir}", "Dirección", options = ["Ambas", "Solo largos", "Solo cortos"], group = gS)

gG = "Gestión (puntos)"
stopPts    = input.float(${num(p.stopPts)}, "Stop (0 = sin stop)", minval = 0, step = 0.25, group = gG)
targetPts  = input.float(${num(p.targetPts)}, "Objetivo (0 = sin objetivo)", minval = 0, step = 0.25, group = gG)
beTrigger  = input.float(${num(p.beTrigger)}, "Breakeven tras X pts a favor (0 = off)", minval = 0, step = 0.25, group = gG)
exitOnCross = input.bool(${bool(p.exitOnCross)}, "Salir en cruce contrario", group = gG)
reverseOn  = input.bool(${bool(p.reverse)}, "Girar posición en cruce válido", group = gG)
exitOnVwap = input.bool(${bool(p.exitOnVwap)}, "Salir si el cierre cruza el VWAP", group = gG)

gH = "Horario (Nueva York) y límites"
tStart     = input.int(${hhmmNum(p.tradeStart)}, "Operar desde (HHMM)", minval = 0, maxval = 2359, group = gH)
tEnd       = input.int(${hhmmNum(p.tradeEnd)}, "Hasta (HHMM)", minval = 0, maxval = 2359, group = gH)
flatAtEnd  = input.bool(${bool(p.flatAtEnd)}, "Cerrar todo al final del horario", group = gH)
maxTrades  = input.int(${Math.floor(+p.maxTradesDay || 0)}, "Máx. entradas por día (0 = sin límite)", minval = 0, group = gH)
dailyLoss  = input.float(${num(p.dailyLossLimit)}, "Pérdida diaria máx. $ (0 = off)", minval = 0, group = gH)

// ───── Utilidades de tiempo ─────
toMin(v) => math.floor(v / 100) * 60 + v % 100
startMin = toMin(tStart)
endMin = toMin(tEnd)
dayKey(t) => year(t, TZ) * 10000 + month(t, TZ) * 100 + dayofmonth(t, TZ)
minOf(t) => hour(t, TZ) * 60 + minute(t, TZ)
weekday(t) => dayofweek(t, TZ) >= dayofweek.monday and dayofweek(t, TZ) <= dayofweek.friday
inWindow(t) => weekday(t) and minOf(t) >= startMin and minOf(t) < endMin

// ───── Indicadores ─────
emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)

// VWAP de sesión calculado a mano para controlar el reinicio (09:30 RTH o 18:00 Globex)
isRth = vwapMode == "RTH 09:30"
sessKey = isRth ? dayKey(time) : dayKey(time + 6 * 3600000)
vwapActive = isRth ? (weekday(time) and minOf(time) >= 570 and minOf(time) < 960) : true
var float pv = 0.0
var float vv = 0.0
var int lastKey = -1
float vwapVal = na
if vwapActive
    if sessKey != lastKey
        pv := 0.0
        vv := 0.0
        lastKey := sessKey
    w = volume > 0 ? volume : 1.0
    pv := pv + hlc3 * w
    vv := vv + w
    vwapVal := pv / vv

// ───── Límites diarios ─────
dk = dayKey(time)
var int dayTrades = 0
var float dayStart = 0.0
if bar_index == 0 or dk != dk[1]
    dayTrades := 0
    dayStart := strategy.netprofit

// ───── Señales ─────
crossUp = ta.crossover(emaFast, emaSlow)
crossDn = ta.crossunder(emaFast, emaSlow)
int sig = bar_index >= slowLen ? (crossUp ? 1 : crossDn ? -1 : 0) : 0
bool valid = sig != 0
if valid and useVwap
    valid := not na(vwapVal) and (sig > 0 ? close > vwapVal : close < vwapVal)
if valid and (direction == "Solo largos" and sig < 0 or direction == "Solo cortos" and sig > 0)
    valid := false
nextInWindow = inWindow(time_close)
if valid and not nextInWindow
    valid := false
if valid and maxTrades > 0 and dayTrades >= maxTrades
    valid := false
if valid and dailyLoss > 0 and strategy.netprofit - dayStart <= -dailyLoss
    valid := false

// ───── Breakeven: mejor precio desde la entrada ─────
pos = strategy.position_size
var float best = na
var bool beOn = false
if pos != 0
    isNew = strategy.opentrades.entry_bar_index(0) == bar_index
    if isNew or na(best)
        best := pos > 0 ? high : low
        beOn := false
    else
        best := pos > 0 ? math.max(best, high) : math.min(best, low)
    if beTrigger > 0 and not beOn and (best - strategy.position_avg_price) * math.sign(pos) >= beTrigger
        beOn := true
else
    best := na
    beOn := false

// ───── Órdenes ─────
bool flattened = false
if pos != 0 and flatAtEnd and not nextInWindow
    strategy.close_all(comment = "Cierre de horario")
    flattened := true

if not flattened
    if pos != 0
        bool doExit = exitOnCross and sig == -math.sign(pos)
        string why = "Cruce contrario"
        if not doExit and exitOnVwap and not na(vwapVal) and (pos > 0 ? close < vwapVal : close > vwapVal)
            doExit := true
            why := "Cruce VWAP"
        if doExit
            if reverseOn and valid and sig == -math.sign(pos)
                strategy.entry(sig > 0 ? "L" : "S", sig > 0 ? strategy.long : strategy.short)
                dayTrades += 1
            else
                strategy.close_all(comment = why)
    else if valid
        strategy.entry(sig > 0 ? "L" : "S", sig > 0 ? strategy.long : strategy.short)
        dayTrades += 1

// Stop / objetivo / breakeven en ticks desde el precio de entrada real.
// Una sola llamada por lado: el breakeven solo cambia la distancia del stop a 0.
float stopTicks = stopPts > 0 ? stopPts / syminfo.mintick : na
float profitTicks = targetPts > 0 ? targetPts / syminfo.mintick : na
float lossL = beOn and strategy.position_size > 0 ? 0.0 : stopTicks
float lossS = beOn and strategy.position_size < 0 ? 0.0 : stopTicks
if not na(lossL) or not na(profitTicks)
    strategy.exit("XL", "L", loss = lossL, profit = profitTicks, comment_loss = lossL == 0 ? "Breakeven" : "Stop", comment_profit = "Objetivo")
if not na(lossS) or not na(profitTicks)
    strategy.exit("XS", "S", loss = lossS, profit = profitTicks, comment_loss = lossS == 0 ? "Breakeven" : "Stop", comment_profit = "Objetivo")

// ───── Gráfico ─────
plot(emaFast, "EMA rápida", color = color.new(#E0A24C, 0), linewidth = 2)
plot(emaSlow, "EMA lenta", color = color.new(#6E9BD6, 0), linewidth = 2)
plot(vwapVal, "VWAP", color = color.new(#A45CC9, 0), linewidth = 2, style = plot.style_linebr)
plotshape(sig != 0 and not valid, "Cruce descartado", shape.circle, location.abovebar, color.new(color.gray, 40), size = size.tiny)
bgcolor(inWindow(time) ? color.new(#A45CC9, 94) : na, title = "Horario operativo")
`;
  }

  const api = { pineScript };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmaVwapPine = api;
})(typeof self !== 'undefined' ? self : this);
