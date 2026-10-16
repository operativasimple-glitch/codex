/* Genera la estrategia de TradingView (Pine Script v6) «Ruptura del rango de Londres».
   Mismas reglas que lb.js; test/pine-parity.mjs compara ambos operación por operación. */
(function (root) {
  'use strict';

  const hhmmNum = s => { const [h, m] = String(s).split(':').map(Number); return h * 100 + (m || 0); };
  const num = v => { const n = +v || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); };

  function pineStrategy(params, specs) {
    const p = params;
    const spec = (specs || {})[p.contract] || { commission: p.contract === 'MNQ' ? 1.5 : 4.5 };
    const rt = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const perSide = Math.round(rt / 2 * 10000) / 10000;
    const ENTRY = { touch: 'Al tocar el nivel', reclaim: 'Vuelve dentro (cierre)' };
    const STOP = { points: 'Puntos tras el nivel', range: '% del rango tras el nivel', sweep: 'Tras el extremo del barrido' };
    const DIR = { both: 'Ambas', long: 'Solo compras', short: 'Solo ventas' };
    const BREAK = { reclaim: 'Manipulación (vuelve dentro)', breakout: 'Ruptura (sigue fuera)', both: 'Ambas: lo que pase primero' };
    const BTARGET = { close: 'Hasta la hora de cierre', r: 'R fijo', range: 'Proyección del rango' };
    return `//@version=6
// Ruptura del rango de Londres · NQ / MNQ
// 1) Marca el máximo y el mínimo de Londres: 03:00–09:00 de Nueva York (09:00–15:00 en España).
// 2) No opera antes de las 09:30 de Nueva York (15:30 en España).
// 3) Entrada «Al tocar el nivel»: COMPRA en el mínimo y VENTA en el máximo con orden limitada.
//    Entrada «Vuelve dentro»: cuando el precio rompe un nivel, lo lee como
//      MANIPULACIÓN si una vela cierra de nuevo dentro del rango → a la contra, objetivo el otro extremo;
//      RUPTURA si varias velas seguidas cierran fuera → a favor de la rotura.
// Comisión en Propiedades: por contrato y por orden = mitad de la ida y vuelta (NQ 2.25 · MNQ 0.75).
strategy("Ruptura rango Londres · NQ", shorttitle = "Londres NQ", overlay = true, pyramiding = 4,
     default_qty_type = strategy.fixed, default_qty_value = ${Math.max(1, Math.floor(+p.qty || 1))}, initial_capital = 50000, margin_long = 0, margin_short = 0,
     commission_type = strategy.commission.cash_per_contract, commission_value = ${perSide},
     slippage = ${Math.max(0, Math.floor(+p.slipTicks || 0))}, process_orders_on_close = false, calc_on_every_tick = false,
     max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500)

// ───── Horario (hora de Nueva York; España = Nueva York + 6 h casi todo el año) ─────
lStart     = input.int(${hhmmNum(p.londonStart)}, "Londres desde (HHMM)", minval = 0, maxval = 2359, group = "Horario (Nueva York)", tooltip = "0300 NY = 09:00 en España")
lEnd       = input.int(${hhmmNum(p.londonEnd)}, "Londres hasta (HHMM)", minval = 0, maxval = 2359, group = "Horario (Nueva York)", tooltip = "0900 NY = 15:00 en España")
tFrom      = input.int(${hhmmNum(p.tradeFrom)}, "Operar desde (HHMM)", minval = 0, maxval = 2359, group = "Horario (Nueva York)", tooltip = "0930 NY = 15:30 en España")
tLast      = input.int(${hhmmNum(p.lastEntry)}, "Última entrada (HHMM)", minval = 0, maxval = 2359, group = "Horario (Nueva York)")
tClose     = input.int(${hhmmNum(p.closeAt)}, "Cerrar todo a las (HHMM)", minval = 0, maxval = 2359, group = "Horario (Nueva York)")

// ───── Reglas ─────
entryMode  = input.string("${ENTRY[p.entryMode] || ENTRY.touch}", "Entrada", options = ["Al tocar el nivel", "Vuelve dentro (cierre)"], group = "Reglas", tooltip = "Al tocar: orden limitada en el nivel. Vuelve dentro: tras romper, entra cuando una vela cierra de nuevo dentro del rango")
stopMode   = input.string("${STOP[p.stopMode] || STOP.points}", "Stop", options = ["Puntos tras el nivel", "% del rango tras el nivel", "Tras el extremo del barrido"], group = "Reglas", tooltip = "«Tras el extremo del barrido» solo con la entrada «Vuelve dentro»")
stopPts    = input.float(${num(p.stopPts)}, "Stop: puntos tras el nivel", minval = 0.25, step = 0.25, group = "Reglas")
stopPct    = input.float(${num((+p.stopFrac || 0) * 100)}, "Stop: % del rango tras el nivel", minval = 1, step = 1, group = "Reglas")
sweepBuf   = input.int(${Math.floor(+p.sweepBuffer || 0)}, "Stop: ticks tras el extremo del barrido", minval = 0, group = "Reglas")
targetMode = input.string("${p.targetMode === 'r' ? 'R fijo' : 'Otro extremo de Londres'}", "Objetivo", options = ["Otro extremo de Londres", "R fijo"], group = "Reglas")
targetR    = input.float(${num(p.targetR)}, "Objetivo: R fijo", minval = 0.25, step = 0.25, group = "Reglas")
minRR      = input.float(${num(p.minRR)}, "No operar si el objetivo es menor de X R (0 = off)", minval = 0, step = 0.25, group = "Reglas")
maxTrades  = input.int(${Math.max(1, Math.floor(+p.maxTrades || 1))}, "Máx. entradas por día", minval = 1, group = "Reglas")
direction  = input.string("${DIR[p.direction] || DIR.both}", "Dirección", options = ["Ambas", "Solo compras", "Solo ventas"], group = "Reglas")

// ───── Manipulación o ruptura (entrada «Vuelve dentro») ─────
breakMode  = input.string("${BREAK[p.breakMode] || BREAK.reclaim}", "Lectura de la rotura", options = ["Manipulación (vuelve dentro)", "Ruptura (sigue fuera)", "Ambas: lo que pase primero"], group = "Manipulación o ruptura", tooltip = "Manipulación: rompe y una vela cierra de nuevo dentro del rango → a la contra (stop y objetivo de «Reglas»). Ruptura: varias velas seguidas cierran fuera → a favor de la rotura. Ambas: en cada nivel manda lo que pase primero")
acceptBars = input.int(${Math.max(1, Math.floor(+p.acceptBars || 3))}, "Ruptura: velas seguidas cerrando fuera", minval = 1, group = "Manipulación o ruptura")
acceptPts  = input.float(${num(p.acceptPts)}, "Ruptura: la última, al menos X puntos fuera", minval = 0, step = 0.25, group = "Manipulación o ruptura")
bStopMode  = input.string("${p.bStopMode === 'level' ? 'Dentro del rango, tras el nivel' : 'Puntos desde el cierre'}", "Ruptura: stop", options = ["Puntos desde el cierre", "Dentro del rango, tras el nivel"], group = "Manipulación o ruptura")
bStopPts   = input.float(${num(p.bStopPts)}, "Ruptura: puntos del stop", minval = 0.25, step = 0.25, group = "Manipulación o ruptura")
bTargetMode = input.string("${BTARGET[p.bTargetMode] || BTARGET.r}", "Ruptura: objetivo", options = ["Hasta la hora de cierre", "R fijo", "Proyección del rango"], group = "Manipulación o ruptura", tooltip = "Proyección: el nivel roto ± X veces el tamaño del rango de Londres")
bTargetR   = input.float(${num(p.bTargetR)}, "Ruptura: R fijo", minval = 0.25, step = 0.25, group = "Manipulación o ruptura")
bRangeK    = input.float(${num(p.bRangeK)}, "Ruptura: proyección (× rango)", minval = 0.1, step = 0.1, group = "Manipulación o ruptura")
bEntry     = input.string("${p.bEntry === 'retest' ? 'En el retesteo del nivel' : 'A mercado al confirmar'}", "Ruptura: entrada", options = ["En el retesteo del nivel", "A mercado al confirmar"], group = "Manipulación o ruptura", tooltip = "Retesteo: orden limitada en el nivel roto, con el stop dentro del rango («Ruptura: puntos del stop» tras el nivel)")
bRetestOff = input.float(${num(p.bRetestOff)}, "Ruptura: retesteo, puntos más allá del nivel", minval = 0, step = 0.25, group = "Manipulación o ruptura")
rangeSplit = input.float(${num(p.rangeSplit)}, "Decidir por el rango: ruptura si el rango de Londres < X × rango medio de NY (0 = off)", minval = 0, step = 0.05, group = "Manipulación o ruptura", tooltip = "Rango medio de NY = media de 09:30–16:00 de los 10 días anteriores. Rango estrecho: día de ruptura. Rango ancho: día de manipulación. Con «Lectura de la rotura» en Manipulación o Ruptura, solo opera ese tipo de día")

// ───── Gestión de la operación ─────
beR        = input.float(${num(p.beR)}, "Breakeven al ir X R a favor (0 = off)", minval = 0, step = 0.25, group = "Gestión", tooltip = "R = distancia del stop. Se activa al cierre de la vela y protege desde la siguiente")
beOff      = input.int(${Math.floor(+p.beOffTicks || 2)}, "Breakeven: ticks a favor de la entrada", minval = 0, group = "Gestión")
addR       = input.float(${num(p.addEveryR)}, "Añadir contratos cada X R a favor (0 = off)", minval = 0, step = 0.25, group = "Gestión", tooltip = "Piramidar: cuando una vela cierra +1×, +2×… X R a favor desde el nivel de entrada, añade contratos a mercado en la apertura siguiente")
maxAdds    = input.int(${Math.floor(+p.maxAdds || 0)}, "Máx. veces que añade", minval = 0, maxval = 3, group = "Gestión")
addQty     = input.int(${Math.max(1, Math.floor(+p.addQty || 1))}, "Contratos por añadido", minval = 1, group = "Gestión")
addToBE    = input.bool(${p.addMovesStopToBE === false ? 'false' : 'true'}, "Al añadir, mover el stop a breakeven", group = "Gestión")

// ───── Estilo ─────
cRange     = input.color(#5C6BC0, "Rango de Londres", group = "Estilo")
cLong      = input.color(#26A69A, "Compra / objetivo", group = "Estilo")
cShort     = input.color(#EF5350, "Venta / stop", group = "Estilo")

// ───── Tiempo ─────
minOf(t) => hour(t, "America/New_York") * 60 + minute(t, "America/New_York")
dayKey(t) => year(t, "America/New_York") * 10000 + month(t, "America/New_York") * 100 + dayofmonth(t, "America/New_York")
toMin(v) => math.floor(v / 100) * 60 + v % 100
ls = toMin(lStart)
le = toMin(lEnd)
tf = toMin(tFrom)
tl = toMin(tLast)
tc = toMin(tClose)
inLondon(m) => ls < le ? (m >= ls and m < le) : (m >= ls or m < le)

// ───── Rango de Londres del día ─────
var float H = na
var float L = na
var int dk = -1
var int dayStartCount = 0
var bool brokeLow = false
var bool brokeHigh = false
var float sweepLow = na
var float sweepHigh = na
var int outLow = 0
var int outHigh = 0
var bool doneLow = false
var bool doneHigh = false
var array<float> nyRanges = array.new_float()
var float nyH = na
var float nyL = na
var float avgNY = na
var int pendSide = 0
var bool pendLive = false
var float pendPx = na
curKey = dayKey(time)
m = minOf(time)
if curKey != dk
    // Rango medio de Nueva York (09:30–16:00) de los 10 días anteriores
    if not na(nyH)
        array.push(nyRanges, nyH - nyL)
        if array.size(nyRanges) > 10
            array.shift(nyRanges)
    nyH := na
    nyL := na
    avgNY := array.size(nyRanges) > 0 ? array.avg(nyRanges) : na
    pendSide := 0
    pendLive := false
    dk := curKey
    H := na
    L := na
    dayStartCount := strategy.closedtrades + strategy.opentrades
    brokeLow := false
    brokeHigh := false
    sweepLow := na
    sweepHigh := na
    outLow := 0
    outHigh := 0
    doneLow := false
    doneHigh := false
if inLondon(m)
    H := na(H) ? high : math.max(H, high)
    L := na(L) ? low : math.min(L, low)
if m >= 570 and m < 960
    nyH := na(nyH) ? high : math.max(nyH, high)
    nyL := na(nyL) ? low : math.min(nyL, low)

tradesToday = strategy.closedtrades + strategy.opentrades - dayStartCount
nextMin = dayKey(time_close) == curKey ? minOf(time_close) : 1440
isWeekday = dayofweek(time, "America/New_York") >= dayofweek.monday and dayofweek(time, "America/New_York") <= dayofweek.friday
ready = not na(H) and not inLondon(m) and m >= le
canEnter = ready and nextMin >= tf and nextMin < tl and tradesToday < maxTrades and isWeekday
longOk = direction != "Solo ventas"
shortOk = direction != "Solo compras"
pos = strategy.position_size
rangeSize = H - L
dist = stopMode == "% del rango tras el nivel" ? stopPct / 100 * rangeSize : stopPts

// ───── Órdenes ─────
var float stL = na
var float refL = na
var float refS = na
var float riskL = na
var float riskS = na
var float tgL = na
var float stS = na
var float tgS = na
if pos != 0 and nextMin >= tc
    strategy.close_all(comment = "Hora de cierre")
if pos != 0
    outLow := 0
    outHigh := 0
    pendSide := 0
if pos != 0 or not canEnter
    pendLive := false

// Las órdenes limitadas se emiten una vez y se mantienen; se vuelven a emitir solo tras una operación
var bool touchLive = false
var int touchCount = -1
if pos != 0 or not canEnter or tradesToday != touchCount
    touchLive := false
bool placedL = false
bool placedS = false
if pos == 0 and canEnter
    if entryMode == "Al tocar el nivel" and touchLive
        placedL := true
        placedS := true
    else if entryMode == "Al tocar el nivel"
        touchLive := true
        touchCount := tradesToday
        float sL = math.round_to_mintick(L - dist)
        float tL = targetMode == "R fijo" ? math.round_to_mintick(L + (L - sL) * targetR) : H
        float sS = math.round_to_mintick(H + dist)
        float tS = targetMode == "R fijo" ? math.round_to_mintick(H - (sS - H) * targetR) : L
        if longOk and (minRR <= 0 or tL - L >= minRR * (L - sL))
            strategy.entry("Compra", strategy.long, limit = L, oca_name = "LDN", oca_type = strategy.oca.cancel)
            refL := L
            riskL := L - sL
            stL := sL
            tgL := tL
            placedL := true
        if shortOk and (minRR <= 0 or H - tS >= minRR * (sS - H))
            strategy.entry("Venta", strategy.short, limit = H, oca_name = "LDN", oca_type = strategy.oca.cancel)
            refS := H
            riskS := sS - H
            stS := sS
            tgS := tS
            placedS := true
    else if m >= tf
        if low < L
            brokeLow := true
            sweepLow := na(sweepLow) ? low : math.min(sweepLow, low)
        if high > H
            brokeHigh := true
            sweepHigh := na(sweepHigh) ? high : math.max(sweepHigh, high)
        outLow := close < L ? outLow + 1 : 0
        outHigh := close > H ? outHigh + 1 : 0
        bool bOn = breakMode != "Manipulación (vuelve dentro)"
        bool rOn = breakMode != "Ruptura (sigue fuera)"
        if rangeSplit > 0 and not na(avgNY)
            bool narrow = rangeSize / avgNY < rangeSplit
            bOn := bOn and narrow
            rOn := rOn and not narrow
        bool bothMode = breakMode == "Ambas: lo que pase primero"
        bool marketNow = false
        if bOn and shortOk and not doneLow and outLow >= acceptBars and L - close >= acceptPts
            // RUPTURA del mínimo → venta a favor
            float sS = math.round_to_mintick(bStopMode == "Dentro del rango, tras el nivel" ? L + bStopPts : close + bStopPts)
            float tS = bTargetMode == "R fijo" ? math.round_to_mintick(close - (sS - close) * bTargetR) : bTargetMode == "Proyección del rango" ? math.round_to_mintick(L - bRangeK * rangeSize) : na
            // A mercado: sin recorrido si el precio ya pasó la proyección
            if bEntry == "En el retesteo del nivel"
                // Venta limitada en el mínimo roto; stop dentro del rango
                float px = math.round_to_mintick(L - bRetestOff)
                float s2 = math.round_to_mintick(L + bStopPts)
                pendSide := -1
                pendPx := px
                refS := px
                riskS := s2 - px
                stS := s2
                tgS := bTargetMode == "R fijo" ? math.round_to_mintick(px - (s2 - px) * bTargetR) : bTargetMode == "Proyección del rango" ? math.round_to_mintick(L - bRangeK * rangeSize) : na
                label.new(bar_index, high, "RUPTURA\\nVENTA en " + str.tostring(px, format.mintick), style = label.style_label_down, color = cShort, textcolor = color.white, size = size.small)
            else if na(tS) or tS < close
                marketNow := true
                strategy.entry("Venta", strategy.short)
                refS := close
                riskS := sS - close
                stS := sS
                tgS := tS
                placedS := true
                label.new(bar_index, high, "RUPTURA\\nVENTA", style = label.style_label_down, color = cShort, textcolor = color.white, size = size.small)
            doneLow := true
            brokeLow := false
            sweepLow := na
        else if bOn and longOk and not doneHigh and outHigh >= acceptBars and close - H >= acceptPts
            // RUPTURA del máximo → compra a favor
            float sL = math.round_to_mintick(bStopMode == "Dentro del rango, tras el nivel" ? H - bStopPts : close - bStopPts)
            float tL = bTargetMode == "R fijo" ? math.round_to_mintick(close + (close - sL) * bTargetR) : bTargetMode == "Proyección del rango" ? math.round_to_mintick(H + bRangeK * rangeSize) : na
            if bEntry == "En el retesteo del nivel"
                // Compra limitada en el máximo roto; stop dentro del rango
                float px = math.round_to_mintick(H + bRetestOff)
                float s2 = math.round_to_mintick(H - bStopPts)
                pendSide := 1
                pendPx := px
                refL := px
                riskL := px - s2
                stL := s2
                tgL := bTargetMode == "R fijo" ? math.round_to_mintick(px + (px - s2) * bTargetR) : bTargetMode == "Proyección del rango" ? math.round_to_mintick(H + bRangeK * rangeSize) : na
                label.new(bar_index, low, "RUPTURA\\nCOMPRA en " + str.tostring(px, format.mintick), style = label.style_label_up, color = cLong, textcolor = color.white, size = size.small)
            else if na(tL) or tL > close
                marketNow := true
                strategy.entry("Compra", strategy.long)
                refL := close
                riskL := close - sL
                stL := sL
                tgL := tL
                placedL := true
                label.new(bar_index, low, "RUPTURA\\nCOMPRA", style = label.style_label_up, color = cLong, textcolor = color.white, size = size.small)
            doneHigh := true
            brokeHigh := false
            sweepHigh := na
        else if rOn and longOk and not doneLow and brokeLow and close > L
            // MANIPULACIÓN del mínimo → compra a la contra
            doneLow := bothMode
            float sL = math.round_to_mintick(stopMode == "Tras el extremo del barrido" ? sweepLow - sweepBuf * syminfo.mintick : close - dist)
            float tL = targetMode == "R fijo" ? math.round_to_mintick(close + (close - sL) * targetR) : H
            if minRR <= 0 or tL - close >= minRR * (close - sL)
                marketNow := true
                strategy.entry("Compra", strategy.long)
                refL := close
                riskL := close - sL
                stL := sL
                tgL := tL
                placedL := true
                label.new(bar_index, low, "MANIPULACIÓN\\nCOMPRA", style = label.style_label_up, color = cLong, textcolor = color.white, size = size.small)
            brokeLow := false
            sweepLow := na
        else if rOn and shortOk and not doneHigh and brokeHigh and close < H
            // MANIPULACIÓN del máximo → venta a la contra
            doneHigh := bothMode
            float sS = math.round_to_mintick(stopMode == "Tras el extremo del barrido" ? sweepHigh + sweepBuf * syminfo.mintick : close + dist)
            float tS = targetMode == "R fijo" ? math.round_to_mintick(close - (sS - close) * targetR) : L
            if minRR <= 0 or close - tS >= minRR * (sS - close)
                marketNow := true
                strategy.entry("Venta", strategy.short)
                refS := close
                riskS := sS - close
                stS := sS
                tgS := tS
                placedS := true
                label.new(bar_index, high, "MANIPULACIÓN\\nVENTA", style = label.style_label_down, color = cShort, textcolor = color.white, size = size.small)
            brokeHigh := false
            sweepHigh := na
        // Orden de retesteo pendiente: se emite una vez y se mantiene mientras se pueda entrar
        if marketNow and pendSide != 0
            if pendLive
                strategy.cancel(pendSide > 0 ? "Compra" : "Venta")
            pendSide := 0
            pendLive := false
        if pendSide != 0
            if not pendLive
                strategy.entry(pendSide > 0 ? "Compra" : "Venta", pendSide > 0 ? strategy.long : strategy.short, limit = pendPx)
                pendLive := true
            if pendSide > 0
                placedL := true
            else
                placedS := true
// ───── Gestión al cierre: breakeven y contratos añadidos ─────
var float curStop = na
var float bestPx = na
var int lastCnt = 0
var int addsDone = 0
posSide = int(math.sign(pos))
if posSide == 0
    curStop := na
    bestPx := na
    lastCnt := 0
    addsDone := 0
else
    float risk = posSide > 0 ? riskL : riskS
    float ref = posSide > 0 ? refL : refS
    float first = strategy.opentrades.entry_price(0)
    if na(curStop)
        curStop := posSide > 0 ? stL : stS
    bestPx := na(bestPx) ? (posSide > 0 ? high : low) : posSide > 0 ? math.max(bestPx, high) : math.min(bestPx, low)
    float beLvl = math.round_to_mintick(first + posSide * beOff * syminfo.mintick)
    bool toBE = beR > 0 and (bestPx - first) * posSide >= beR * risk
    if addToBE and lastCnt > 0 and strategy.opentrades > lastCnt
        toBE := true
    if toBE
        curStop := posSide > 0 ? math.max(curStop, beLvl) : math.min(curStop, beLvl)
    lastCnt := strategy.opentrades
    // Añadir: si la vela cierra más allá de +k·X R desde el nivel, entra a mercado en la apertura siguiente
    if addR > 0 and maxAdds > 0
        int k = addsDone + 1
        while k <= maxAdds and (close - math.round_to_mintick(ref + posSide * k * addR * risk)) * posSide >= 0
            strategy.entry("Añadir " + str.tostring(k), posSide > 0 ? strategy.long : strategy.short, qty = addQty)
            addsDone := k
            k += 1

// Stop y objetivo: activos mientras la orden de entrada o la posición sigan vivas (los añadidos comparten stop y objetivo)
// Una sola llamada por salida (misma orden con el stop y el objetivo actuales)
if posSide > 0 or pos == 0 and placedL and not na(stL)
    strategy.exit("Salida C", "Compra", stop = posSide > 0 ? curStop : stL, limit = tgL, comment_loss = "Stop", comment_profit = "Objetivo")
if posSide < 0 or pos == 0 and placedS and not na(stS)
    strategy.exit("Salida V", "Venta", stop = posSide < 0 ? curStop : stS, limit = tgS, comment_loss = "Stop", comment_profit = "Objetivo")
if posSide != 0 and maxAdds > 0
    for k = 1 to maxAdds
        strategy.exit("Salida A" + str.tostring(k), "Añadir " + str.tostring(k), stop = curStop, limit = posSide > 0 ? tgL : tgS, comment_loss = "Stop", comment_profit = "Objetivo")
if posSide == 0 and maxAdds > 0
    for k = 1 to maxAdds
        strategy.cancel("Añadir " + str.tostring(k))
if pos == 0 and not placedL
    strategy.cancel("Compra")
if pos == 0 and not placedS
    strategy.cancel("Venta")

// ───── Gráfico ─────
var box rangeBox = na
var line lnH = na
var line lnL = na
firstLondon = inLondon(m) and not (inLondon(minOf(time[1])) and dayKey(time[1]) == curKey)
if firstLondon
    rangeBox := box.new(bar_index, high, bar_index, low, border_color = color.new(cRange, 30), bgcolor = color.new(cRange, 88), text = "Londres", text_color = color.new(cRange, 0), text_size = size.small, text_valign = text.align_top, text_halign = text.align_left)
if inLondon(m) and not na(rangeBox)
    rangeBox.set_right(bar_index)
    rangeBox.set_top(H)
    rangeBox.set_bottom(L)
afterLondon = ready and m < tc
if afterLondon and not afterLondon[1]
    lnH := line.new(bar_index, H, bar_index, H, color = cShort, style = line.style_dashed, width = 2)
    lnL := line.new(bar_index, L, bar_index, L, color = cLong, style = line.style_dashed, width = 2)
    label.new(bar_index, H, "High Londres " + str.tostring(H, format.mintick) + (entryMode == "Al tocar el nivel" ? " → VENTA" : ""), style = label.style_label_lower_left, color = color.new(cShort, 15), textcolor = color.white, size = size.tiny)
    label.new(bar_index, L, "Low Londres " + str.tostring(L, format.mintick) + (entryMode == "Al tocar el nivel" ? " → COMPRA" : ""), style = label.style_label_upper_left, color = color.new(cLong, 15), textcolor = color.white, size = size.tiny)
    if entryMode != "Al tocar el nivel" and rangeSplit > 0 and not na(avgNY)
        bool narrowDay = rangeSize / avgNY < rangeSplit
        label.new(bar_index, (H + L) / 2, "Rango " + str.tostring(math.round(rangeSize / avgNY * 100)) + "% del medio NY\\nHoy: " + (narrowDay ? "RUPTURA" : "MANIPULACIÓN"), style = label.style_label_left, color = color.new(narrowDay ? #FFA726 : cRange, 10), textcolor = color.white, size = size.small)
if afterLondon and not na(lnH)
    lnH.set_x2(bar_index)
    lnL.set_x2(bar_index)
bgcolor(ready and m >= tf and m < tl ? color.new(cRange, 95) : na, title = "Ventana de entrada")

posNow = strategy.position_size
plot(posNow != 0 ? curStop : na, "Stop", color = cShort, style = plot.style_linebr, linewidth = 2)
plot(posNow > 0 ? tgL : posNow < 0 ? tgS : na, "Objetivo", color = cLong, style = plot.style_linebr, linewidth = 2)
`;
  }

  const api = { pineStrategy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LondonBreakPine = api;
})(typeof self !== 'undefined' ? self : this);
