/* Genera el indicador de TradingView (Pine Script v6) con los parámetros de la web.
   Mismas reglas que engine.js; test/pine-parity.mjs compara ambos. */
(function (root) {
  'use strict';

  const hhmmNum = s => { const [h, m] = String(s).split(':').map(Number); return h * 100 + (m || 0); };
  const num = v => { const n = +v || 0; return Number.isInteger(n) ? n.toFixed(1) : String(n); };
  const bool = v => (v ? 'true' : 'false');

  function pineIndicator(params, specs) {
    const p = params;
    const spec = (specs || {})[p.contract] || { commission: p.contract === 'NQ' ? 4.5 : 1.5 };
    const rt = p.commission == null || p.commission === '' ? spec.commission : +p.commission;
    const dir = { both: 'Ambas', long: 'Solo largos', short: 'Solo cortos' }[p.direction] || 'Ambas';
    const stopList = p.stopList || '5, 8, 10, 15, 20, 30, 40';
    return `//@version=6
// EMA × VWAP · Plan de operación para NQ / MNQ
// Entrada: la EMA rápida cruza la lenta y el cierre está del mismo lado del VWAP de la sesión.
// La señal se confirma al cierre de la vela; se entra a mercado en la apertura de la siguiente.
// En el gráfico: entrada, stop, nivel de breakeven, objetivo y motivo del cierre de cada operación.
// Tabla: resultado de las mismas señales con distintos stops (con comisión y deslizamiento).
indicator("EMA×VWAP · Plan NQ", shorttitle = "EMA×VWAP NQ", overlay = true, max_labels_count = 500, max_lines_count = 500, max_boxes_count = 500)

// ───── Señal ─────
fastLen     = input.int(${Math.floor(+p.fast)}, "EMA rápida", minval = 1, group = "Señal")
slowLen     = input.int(${Math.floor(+p.slow)}, "EMA lenta", minval = 2, group = "Señal")
useVwap     = input.bool(${bool(p.vwapFilter)}, "Filtro VWAP (largo sobre, corto bajo)", group = "Señal")
vwapMode    = input.string("${p.vwapSession === 'globex' ? 'Globex 18:00' : 'RTH 09:30'}", "VWAP reinicia", options = ["RTH 09:30", "Globex 18:00"], group = "Señal")
maxVwapDist = input.float(${num(p.maxVwapDist)}, "No entrar si el cierre está a más de X pts del VWAP (0 = off)", minval = 0, step = 0.25, group = "Señal")
direction   = input.string("${dir}", "Dirección", options = ["Ambas", "Solo largos", "Solo cortos"], group = "Señal")

// ───── Riesgo ─────
stopMode    = input.string("${p.stopMode === 'swing' ? 'Estructura' : 'Puntos fijos'}", "Stop", options = ["Puntos fijos", "Estructura"], group = "Riesgo", tooltip = "Estructura: el stop va detrás del mínimo (largos) o del máximo (cortos) de las últimas N velas")
stopPts     = input.float(${num(p.stopPts)}, "Stop en puntos (modo fijo)", minval = 0, step = 0.25, group = "Riesgo")
swingBars   = input.int(${Math.max(1, Math.floor(+p.swingBars || 5))}, "N velas (modo estructura)", minval = 1, group = "Riesgo")
stopBuffer  = input.int(${Math.floor(+p.stopBuffer || 0)}, "Ticks detrás del mínimo/máximo", minval = 0, group = "Riesgo")
stopMin     = input.float(${num(p.stopMin)}, "Stop mínimo (pts, modo estructura)", minval = 0, step = 0.25, group = "Riesgo")
stopMax     = input.float(${num(p.stopMax)}, "Stop máximo (pts, 0 = sin tope)", minval = 0, step = 0.25, group = "Riesgo")
targetR     = input.float(${num(p.targetR)}, "Objetivo en R (veces el riesgo, 0 = sin objetivo)", minval = 0, step = 0.25, group = "Riesgo")
beR         = input.float(${num(p.beR)}, "Breakeven al ir X R a favor (0 = off)", minval = 0, step = 0.25, group = "Riesgo")

// ───── Salida ─────
exitOnCross = input.bool(${bool(p.exitOnCross)}, "Cerrar en cruce contrario", group = "Salida")
reverseOn   = input.bool(${bool(p.reverse)}, "Girar posición en cruce válido", group = "Salida")
exitOnVwap  = input.bool(${bool(p.exitOnVwap)}, "Cerrar si el cierre cruza el VWAP", group = "Salida")
tStart      = input.int(${hhmmNum(p.tradeStart)}, "Operar desde (HHMM, Nueva York)", minval = 0, maxval = 2359, group = "Salida")
tEnd        = input.int(${hhmmNum(p.tradeEnd)}, "Cerrar todo a las (HHMM, Nueva York)", minval = 0, maxval = 2359, group = "Salida")
flatAtEnd   = input.bool(${bool(p.flatAtEnd)}, "Cerrar al final del horario", group = "Salida")

// ───── Costes y tabla ─────
qty         = input.int(${Math.max(1, Math.floor(+p.qty || 1))}, "Contratos", minval = 1, group = "Costes y tabla")
commRT      = input.float(${num(rt)}, "Comisión ida y vuelta por contrato ($)", minval = 0, step = 0.1, group = "Costes y tabla")
slipTicks   = input.int(${Math.floor(+p.slipTicks || 0)}, "Deslizamiento por ejecución (ticks)", minval = 0, group = "Costes y tabla")
showTable   = input.bool(true, "Mostrar tabla de stops", group = "Costes y tabla")
stopList    = input.string("${stopList}", "Stops a comparar (pts, separados por comas)", group = "Costes y tabla")
tablePos    = input.string("Arriba derecha", "Posición de la tabla", options = ["Arriba derecha", "Abajo derecha", "Abajo izquierda", "Arriba izquierda"], group = "Costes y tabla")

// ───── Estilo ─────
cLong       = input.color(#26A69A, "Largo / TP", group = "Estilo")
cShort      = input.color(#EF5350, "Corto / SL", group = "Estilo")
cBE         = input.color(#FFB74D, "Breakeven", group = "Estilo")
cFast       = input.color(#4FC3F7, "EMA rápida", group = "Estilo")
cSlow       = input.color(#B39DDB, "EMA lenta", group = "Estilo")
cVwap       = input.color(#F5F5F5, "VWAP", group = "Estilo")
showDiscard = input.bool(false, "Mostrar cruces descartados", group = "Estilo")
showWindow  = input.bool(false, "Sombrear horario operativo", group = "Estilo")

// ───── Tiempo (Nueva York) ─────
dayKey(t) => year(t, "America/New_York") * 10000 + month(t, "America/New_York") * 100 + dayofmonth(t, "America/New_York")
minOf(t) => hour(t, "America/New_York") * 60 + minute(t, "America/New_York")
isWeekday(t) => dayofweek(t, "America/New_York") >= dayofweek.monday and dayofweek(t, "America/New_York") <= dayofweek.friday
startMin = math.floor(tStart / 100) * 60 + tStart % 100
endMin = math.floor(tEnd / 100) * 60 + tEnd % 100
inWindow(t) => isWeekday(t) and minOf(t) >= startMin and minOf(t) < endMin

// ───── Indicadores ─────
emaFast = ta.ema(close, fastLen)
emaSlow = ta.ema(close, slowLen)

isRth = vwapMode == "RTH 09:30"
sessKey = isRth ? dayKey(time) : dayKey(time + 6 * 3600000)
vwapActive = isRth ? (isWeekday(time) and minOf(time) >= 570 and minOf(time) < 960) : true
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

swingLow = ta.lowest(low, swingBars) - stopBuffer * syminfo.mintick
swingHigh = ta.highest(high, swingBars) + stopBuffer * syminfo.mintick

// ───── Señal al cierre ─────
crossUp = ta.crossover(emaFast, emaSlow)
crossDn = ta.crossunder(emaFast, emaSlow)
warm = bar_index >= slowLen
int sig = warm ? (crossUp ? 1 : crossDn ? -1 : 0) : 0
bool valid = sig != 0
if valid and useVwap
    valid := not na(vwapVal) and (sig > 0 ? close > vwapVal : close < vwapVal)
if valid and (direction == "Solo largos" and sig < 0 or direction == "Solo cortos" and sig > 0)
    valid := false
nextInWindow = inWindow(time_close)
if valid and not nextInWindow
    valid := false
if valid and maxVwapDist > 0 and not na(vwapVal) and math.abs(close - vwapVal) > maxVwapDist
    valid := false

// ───── Simulador (misma lógica para tu plan y para cada stop de la tabla) ─────
type Sim
    float stopPts
    bool swing
    int side = 0
    float entry = na
    float stop = na
    float target = na
    float beT = 0.0
    float risk = na
    float best = na
    bool be = false
    bool pendExit = false
    string pendReason = ""
    int pendEnter = 0
    float pendStopPx = na
    bool evEntry = false
    bool evBE = false
    bool evExit = false
    string exitReason = ""
    float exitPrice = na
    float exitPts = na
    float exitPnl = na
    int n = 0
    int wins = 0
    float net = 0.0
    float gw = 0.0
    float gl = 0.0
    float peak = 0.0
    float dd = 0.0

method closeAt(Sim s, float px, string why) =>
    float pts = (px - s.entry) * s.side
    float pnl = pts * syminfo.pointvalue * qty - commRT * qty
    s.n := s.n + 1
    if pnl > 0
        s.wins := s.wins + 1
        s.gw := s.gw + pnl
    else
        s.gl := s.gl - pnl
    s.net := s.net + pnl
    s.peak := math.max(s.peak, s.net)
    s.dd := math.max(s.dd, s.peak - s.net)
    s.evExit := true
    s.exitReason := why
    s.exitPrice := px
    s.exitPts := pts
    s.exitPnl := pnl
    s.side := 0
    s

method step(Sim s, int sg, bool vld, bool isWarm, bool nextIn, float vw, float swL, float swH) =>
    s.evEntry := false
    s.evBE := false
    s.evExit := false
    float slip = slipTicks * syminfo.mintick
    // 1) Órdenes pendientes en la apertura
    if s.pendExit and s.side != 0
        s.closeAt(open - s.side * slip, s.pendReason)
    s.pendExit := false
    if s.pendEnter != 0 and s.side == 0
        int d = s.pendEnter
        float e = open + d * slip
        float r = s.stopPts
        if s.swing
            r := math.max(stopMin, (e - s.pendStopPx) * d)
            if stopMax > 0
                r := math.min(stopMax, r)
        s.side := d
        s.entry := e
        s.risk := r
        s.stop := r > 0 ? e - d * r : na
        s.target := targetR > 0 and r > 0 ? e + d * r * targetR : na
        s.beT := beR > 0 and r > 0 ? r * beR : 0.0
        s.best := na
        s.be := false
        s.evEntry := true
    s.pendEnter := 0
    // 2) Stop / objetivo dentro de la vela (ruta de TradingView)
    if s.side != 0
        int d = s.side
        string stopName = s.be ? "Breakeven" : "Stop"
        if not na(s.stop) and (d > 0 ? open <= s.stop : open >= s.stop)
            s.closeAt(open - d * slip, stopName)
        else if not na(s.target) and (d > 0 ? open >= s.target : open <= s.target)
            s.closeAt(open - d * slip, "Objetivo")
        else
            bool highFirst = (high - open) <= (open - low)
            bool favFirst = d > 0 ? highFirst : not highFirst
            bool tgtHit = not na(s.target) and (d > 0 ? high >= s.target : low <= s.target)
            bool stopHit = not na(s.stop) and (d > 0 ? low <= s.stop : high >= s.stop)
            if favFirst
                if tgtHit
                    s.closeAt(s.target - d * slip, "Objetivo")
                else if stopHit
                    s.closeAt(s.stop - d * slip, stopName)
            else
                if stopHit
                    s.closeAt(s.stop - d * slip, stopName)
                else if tgtHit
                    s.closeAt(s.target - d * slip, "Objetivo")
    // 3) Breakeven: se activa al cierre y protege desde la vela siguiente
    if s.side != 0
        s.best := na(s.best) ? (s.side > 0 ? high : low) : s.side > 0 ? math.max(s.best, high) : math.min(s.best, low)
        if s.beT > 0 and not s.be and (s.best - s.entry) * s.side >= s.beT
            s.be := true
            s.stop := s.entry
            s.evBE := true
    // 4) Decisiones al cierre de la vela
    if isWarm
        if s.side != 0
            if flatAtEnd and not nextIn
                s.pendExit := true
                s.pendReason := "Fin de horario"
            else
                bool doExit = exitOnCross and sg == -s.side
                string why = "Cruce contrario"
                if not doExit and exitOnVwap and not na(vw) and (s.side > 0 ? close < vw : close > vw)
                    doExit := true
                    why := "Cruce VWAP"
                if doExit
                    s.pendExit := true
                    s.pendReason := why
                    if reverseOn and vld and sg == -s.side
                        s.pendEnter := sg
                        s.pendStopPx := sg > 0 ? swL : swH
        else if vld
            s.pendEnter := sg
            s.pendStopPx := sg > 0 ? swL : swH
    s

// Sim 0 = tu plan; el resto = un stop fijo por cada valor de la lista
var array<Sim> sims = array.new<Sim>()
if barstate.isfirst
    sims.push(Sim.new(stopPts, stopMode == "Estructura"))
    for part in str.split(stopList, ",")
        float v = str.tonumber(str.replace_all(part, " ", ""))
        if not na(v) and v > 0
            sims.push(Sim.new(v, false))

for s in sims
    s.step(sig, valid, warm, nextInWindow, vwapVal, swingLow, swingHigh)

// ───── Gráfico ─────
plot(emaFast, "EMA rápida", color = cFast, linewidth = 1)
plot(emaSlow, "EMA lenta", color = cSlow, linewidth = 2)
plot(vwapVal, "VWAP", color = cVwap, linewidth = 2, style = plot.style_linebr)
bgcolor(showWindow and inWindow(time) ? color.new(cVwap, 96) : na, title = "Horario operativo")
plotshape(valid and sig > 0, "Señal largo", shape.triangleup, location.belowbar, cLong, size = size.tiny)
plotshape(valid and sig < 0, "Señal corto", shape.triangledown, location.abovebar, cShort, size = size.tiny)
plotshape(showDiscard and sig != 0 and not valid, "Cruce descartado", shape.xcross, location.abovebar, color.new(color.gray, 50), size = size.tiny)

fmtPx(x) => str.tostring(x, format.mintick)
fmtUsd(x) => (x < 0 ? "-$" : "$") + str.tostring(math.abs(x), "#,##0")
fmtPts(x) => (x >= 0 ? "+" : "") + str.tostring(x, "#.##")

// Dibujos de la operación abierta: zona de riesgo (roja), zona de beneficio (verde),
// línea de breakeven y etiquetas SL / BE / TP que avanzan con el precio
var box bxRisk = na
var box bxReward = na
var line lnBE = na
var line lnStopBE = na
var label tagSL = na
var label tagBE = na
var label tagTP = na
Sim plan = sims.get(0)

if plan.evExit
    if not na(bxRisk)
        bxRisk.set_right(bar_index)
    if not na(bxReward)
        bxReward.set_right(bar_index)
    if not na(lnBE)
        lnBE.set_x2(bar_index)
    if not na(lnStopBE)
        lnStopBE.set_x2(bar_index)
    label.delete(tagSL)
    label.delete(tagBE)
    label.delete(tagTP)
    tagSL := na
    tagBE := na
    tagTP := na
    bxRisk := na
    bxReward := na
    lnBE := na
    lnStopBE := na
    string r = plan.exitReason
    string head = r == "Objetivo" ? "TP ✓" : r == "Stop" ? "SL ✕" : r == "Breakeven" ? "BE" : r == "Fin de horario" ? "Hora" : "Cruce"
    color ec = plan.exitPnl > 0 ? cLong : r == "Breakeven" ? cBE : cShort
    label.new(bar_index, plan.exitPrice, head + " " + fmtPts(plan.exitPts), color = ec, textcolor = r == "Breakeven" ? color.black : color.white, style = label.style_label_left, size = size.tiny, tooltip = "Cierre: " + r + "\\nSalida " + fmtPx(plan.exitPrice) + "\\n" + fmtPts(plan.exitPts) + " pts · " + fmtUsd(plan.exitPnl))

if plan.evEntry
    int d = plan.side
    float beLvl = plan.entry + d * plan.beT
    string tip = (d > 0 ? "LARGO " : "CORTO ") + str.tostring(qty) + " NQ @ " + fmtPx(plan.entry)
    if not na(plan.stop)
        tip += "\\nSL " + fmtPx(plan.stop) + "  (-" + str.tostring(plan.risk, "#.##") + " pts, " + fmtUsd(-plan.risk * syminfo.pointvalue * qty) + ")"
    if plan.beT > 0
        tip += "\\nBE: al tocar " + fmtPx(beLvl) + " mover el stop a " + fmtPx(plan.entry)
    if not na(plan.target)
        tip += "\\nTP " + fmtPx(plan.target) + "  (+" + str.tostring(plan.risk * targetR, "#.##") + " pts)"
    label.new(bar_index, d > 0 ? low : high, (d > 0 ? "▲ " : "▼ ") + fmtPx(plan.entry), color = d > 0 ? cLong : cShort, textcolor = color.white, style = d > 0 ? label.style_label_up : label.style_label_down, size = size.small, tooltip = tip)
    if not na(plan.stop)
        bxRisk := box.new(bar_index, math.max(plan.entry, plan.stop), bar_index + 1, math.min(plan.entry, plan.stop), border_color = color.new(cShort, 40), bgcolor = color.new(cShort, 82))
        tagSL := label.new(bar_index + 1, plan.stop, "SL " + fmtPx(plan.stop) + "  -" + str.tostring(plan.risk, "#.##"), color = cShort, textcolor = color.white, style = label.style_label_left, size = size.tiny)
    if not na(plan.target)
        bxReward := box.new(bar_index, math.max(plan.entry, plan.target), bar_index + 1, math.min(plan.entry, plan.target), border_color = color.new(cLong, 40), bgcolor = color.new(cLong, 82))
        tagTP := label.new(bar_index + 1, plan.target, "TP " + fmtPx(plan.target) + "  +" + str.tostring(plan.risk * targetR, "#.##"), color = cLong, textcolor = color.white, style = label.style_label_left, size = size.tiny)
    if plan.beT > 0
        lnBE := line.new(bar_index, beLvl, bar_index + 1, beLvl, color = cBE, style = line.style_dashed, width = 1)
        tagBE := label.new(bar_index + 1, beLvl, "BE al tocar " + fmtPx(beLvl), color = cBE, textcolor = color.black, style = label.style_label_left, size = size.tiny)
    // Entró y salió en la misma vela: se cierran los dibujos aquí mismo
    if plan.side == 0
        if not na(bxRisk)
            bxRisk.set_right(bar_index + 1)
        if not na(bxReward)
            bxReward.set_right(bar_index + 1)
        if not na(lnBE)
            lnBE.set_x2(bar_index + 1)
        if not na(lnStopBE)
            lnStopBE.set_x2(bar_index + 1)
        label.delete(tagSL)
        label.delete(tagBE)
        label.delete(tagTP)
        tagSL := na
        tagBE := na
        tagTP := na
        bxRisk := na
        bxReward := na
        lnBE := na

if plan.evBE and plan.side != 0
    if not na(bxRisk)
        bxRisk.set_right(bar_index)
    bxRisk := na
    if not na(lnBE)
        lnBE.set_x2(bar_index)
    lnBE := na
    label.delete(tagBE)
    tagBE := na
    label.new(bar_index, plan.side > 0 ? high : low, "BE", color = cBE, textcolor = color.black, style = plan.side > 0 ? label.style_label_down : label.style_label_up, size = size.tiny, tooltip = "Stop movido a la entrada " + fmtPx(plan.entry))
    lnStopBE := line.new(bar_index, plan.entry, bar_index + 1, plan.entry, color = cBE, width = 2)
    if not na(tagSL)
        tagSL.set_y(plan.entry)
        tagSL.set_text("SL en BE " + fmtPx(plan.entry))
        tagSL.set_color(cBE)
        tagSL.set_textcolor(color.black)

if plan.side != 0
    int x = bar_index + 1
    if not na(bxRisk)
        bxRisk.set_right(x)
    if not na(bxReward)
        bxReward.set_right(x)
    if not na(lnBE)
        lnBE.set_x2(x)
    if not na(lnStopBE)
        lnStopBE.set_x2(x)
    if not na(tagSL)
        tagSL.set_x(x)
    if not na(tagBE)
        tagBE.set_x(x)
    if not na(tagTP)
        tagTP.set_x(x)

// ───── Alertas: crear alerta con la condición «Cualquier llamada a la función alert()» ─────
if plan.pendEnter != 0
    string stopTxt = stopMode == "Estructura" ? "detrás de " + fmtPx(plan.pendStopPx) : str.tostring(stopPts) + " pts"
    alert("NQ " + (plan.pendEnter > 0 ? "LARGO" : "CORTO") + ": entrar a mercado en la apertura · stop " + stopTxt, alert.freq_once_per_bar_close)
if plan.evBE
    alert("NQ: mover el stop a breakeven " + fmtPx(plan.entry), alert.freq_once_per_bar_close)
if plan.pendExit
    alert("NQ: cerrar en la apertura · " + plan.pendReason, alert.freq_once_per_bar_close)

// ───── Tabla: ¿stop corto o largo? ─────
var int firstTime = time
tbPos = tablePos == "Abajo derecha" ? position.bottom_right : tablePos == "Abajo izquierda" ? position.bottom_left : tablePos == "Arriba izquierda" ? position.top_left : position.top_right
var table tb = table.new(tbPos, 7, 13, bgcolor = color.new(#131722, 8), frame_color = color.new(#434651, 0), frame_width = 1, border_color = color.new(#2A2E39, 0), border_width = 1)
if showTable and barstate.islastconfirmedhistory
    tb.merge_cells(0, 0, 6, 0)
if showTable and barstate.islast
    color hc = color.new(#B2B5BE, 0)
    string tfTxt = timeframe.isminutes ? timeframe.period + " min" : timeframe.period
    tb.cell(0, 0, "¿Qué stop rinde más?  ·  " + tfTxt + "  ·  desde " + str.format_time(firstTime, "dd/MM/yy", "America/New_York") + "  ·  " + str.tostring(qty) + " contrato(s)", text_color = color.white, text_size = size.small, text_halign = text.align_left)
    tb.cell(0, 1, "Stop", text_color = hc, text_size = size.tiny)
    tb.cell(1, 1, "Ops", text_color = hc, text_size = size.tiny)
    tb.cell(2, 1, "Acierto", text_color = hc, text_size = size.tiny)
    tb.cell(3, 1, "PF", text_color = hc, text_size = size.tiny)
    tb.cell(4, 1, "Neto", text_color = hc, text_size = size.tiny)
    tb.cell(5, 1, "Máx. DD", text_color = hc, text_size = size.tiny)
    tb.cell(6, 1, "$/op", text_color = hc, text_size = size.tiny)
    float bestNet = na
    int rows = math.min(sims.size(), 11)
    if rows > 1
        for i = 1 to rows - 1
            bestNet := na(bestNet) ? sims.get(i).net : math.max(bestNet, sims.get(i).net)
    for i = 0 to rows - 1
        Sim s = sims.get(i)
        bool isBest = i > 0 and s.net == bestNet
        string name = i == 0 ? (stopMode == "Estructura" ? "Tu plan (estructura)" : "Tu plan · " + str.tostring(s.stopPts) + " pts") : str.tostring(s.stopPts) + " pts" + (isBest ? "  ★" : "")
        color c = isBest ? cLong : i == 0 ? cBE : color.white
        color bg = isBest ? color.new(cLong, 85) : na
        tb.cell(0, i + 2, name, text_color = c, bgcolor = bg, text_size = size.small, text_halign = text.align_left)
        tb.cell(1, i + 2, str.tostring(s.n), text_color = c, bgcolor = bg, text_size = size.small)
        tb.cell(2, i + 2, s.n > 0 ? str.tostring(100.0 * s.wins / s.n, "#") + "%" : "—", text_color = c, bgcolor = bg, text_size = size.small)
        tb.cell(3, i + 2, s.gl > 0 ? str.tostring(s.gw / s.gl, "#.##") : "—", text_color = c, bgcolor = bg, text_size = size.small)
        tb.cell(4, i + 2, fmtUsd(s.net), text_color = s.net >= 0 ? cLong : cShort, bgcolor = bg, text_size = size.small)
        tb.cell(5, i + 2, fmtUsd(-s.dd), text_color = c, bgcolor = bg, text_size = size.small)
        tb.cell(6, i + 2, s.n > 0 ? fmtUsd(s.net / s.n) : "—", text_color = c, bgcolor = bg, text_size = size.small)

// Valores internos para comprobar el cálculo (ocultos)
plot(plan.net, "net0", display = display.none)
plot(plan.n, "n0", display = display.none)
plot(sims.size() > 1 ? sims.get(1).net : na, "net1", display = display.none)
plot(sims.size() > 2 ? sims.get(2).net : na, "net2", display = display.none)
plot(sims.size() > 3 ? sims.get(3).net : na, "net3", display = display.none)
plot(sims.size() > 4 ? sims.get(4).net : na, "net4", display = display.none)
plot(sims.size() > 5 ? sims.get(5).net : na, "net5", display = display.none)
plot(sims.size() > 6 ? sims.get(6).net : na, "net6", display = display.none)
plot(sims.size() > 7 ? sims.get(7).net : na, "net7", display = display.none)
plot(plan.evEntry ? plan.entry : na, "entryPx", display = display.none)
plot(plan.evExit ? plan.exitPrice : na, "exitPx", display = display.none)
`;
  }

  const api = { pineIndicator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmaVwapPine = api;
})(typeof self !== 'undefined' ? self : this);
