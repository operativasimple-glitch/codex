(function () {
  'use strict';
  const E = window.EmaVwap;
  const $ = id => document.getElementById(id);
  const STORE = 'emaVwap.params.v3', STORE_CSV = 'emaVwap.csv.v1';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let params = Object.assign({}, E.DEFAULTS, { csvTz: 'America/New_York', groupMin: '1' });
  try { Object.assign(params, JSON.parse(store.get(STORE) || '{}')); } catch (e) {}

  const parseList = id => $(id).value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(v => isFinite(v) && v >= 0);
  let rawBars = [], bars = [], result = null, isDemo = false, sourceName = '', csvText = null;
  let selected = -1;

  // ---------- formato ----------
  const money = v => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = v => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const px = v => v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = n => String(n).padStart(2, '0');
  const fmtDT = t => { const p = E.tzParts(t); return `${pad(p.d)}/${pad(p.mo)} ${pad(p.h)}:${pad(p.mi)}`; };
  const fmtT = t => { const p = E.tzParts(t); return `${pad(p.h)}:${pad(p.mi)}`; };
  const cls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- parámetros ----------
  const numFields = ['qty', 'commission', 'slipTicks', 'fast', 'slow', 'stopPts', 'targetPts', 'maxTradesDay', 'dailyLossLimit',
    'swingBars', 'stopBuffer', 'stopMin', 'stopMax', 'targetR', 'beR', 'maxVwapDist'];
  const boolFields = ['vwapFilter', 'exitOnCross', 'reverse', 'exitOnVwap', 'flatAtEnd'];
  const selFields = ['vwapSession', 'direction', 'tradeStart', 'tradeEnd', 'csvTz', 'intrabar', 'stopMode', 'fromDate', 'session', 'groupMin'];

  function fillForm() {
    numFields.forEach(k => { $(k).value = k === 'commission' && params.commission == null ? E.CONTRACTS[params.contract].commission : params[k]; });
    boolFields.forEach(k => { $(k).checked = !!params[k]; });
    selFields.forEach(k => { $(k).value = params[k]; });
    document.querySelectorAll('#contractSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === params.contract));
    toggleStopRows();
  }
  function toggleStopRows() {
    const swing = $('stopMode').value === 'swing';
    $('swingRows').hidden = !swing;
    $('rowStopPts').hidden = swing;
    $('customRows').hidden = $('session').value !== 'custom';
  }
  function readForm() {
    numFields.forEach(k => { const v = $(k).value; params[k] = v === '' ? (k === 'commission' ? null : E.DEFAULTS[k]) : +v; });
    boolFields.forEach(k => { params[k] = $(k).checked; });
    selFields.forEach(k => { params[k] = $(k).value; });
    store.set(STORE, JSON.stringify(params));
  }

  let runTimer = 0;
  const scheduleRun = () => { clearTimeout(runTimer); runTimer = setTimeout(run, 120); };
  document.querySelectorAll('#panel input:not([type=file]), #panel select').forEach(el =>
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      readForm();
      if (el.id === 'stopMode' || el.id === 'session') toggleStopRows();
      if (el.id === 'groupMin' && rawBars.length) {
        bars = E.resample(rawBars, isDemo ? Math.max(5, +params.groupMin || 1) : +params.groupMin || 1);
        setStatus(`${sourceName}: ${bars.length.toLocaleString('es-ES')} velas de ${isDemo ? Math.max(5, +params.groupMin || 1) : +params.groupMin || 'su'} min`);
        run(true); return;
      }
      if (el.id === 'csvTz' && csvText) loadText(csvText, sourceName);
      else scheduleRun();
    }));
  document.querySelectorAll('#contractSeg button').forEach(b => b.addEventListener('click', () => {
    params.contract = b.dataset.v;
    params.commission = E.CONTRACTS[params.contract].commission;
    fillForm(); readForm(); run();
  }));
  $('reset').addEventListener('click', () => {
    params = Object.assign({}, E.DEFAULTS, { csvTz: params.csvTz, contract: params.contract, groupMin: params.groupMin });
    fillForm(); readForm(); run();
  });

  // ---------- carga de datos ----------
  function setStatus(msg, err) { const s = $('status'); s.textContent = msg; s.classList.toggle('err', !!err); }

  function loadText(text, name) {
    try {
      rawBars = E.parseCSV(text, params.csvTz);
      bars = E.resample(rawBars, +params.groupMin || 1);
      bars.ninjaTrader = rawBars.ninjaTrader;
      csvText = text; sourceName = name; isDemo = false;
      const saved = text.length < 3.5e6 && store.set(STORE_CSV, JSON.stringify({ name, text }));
      const noVol = bars.every(b => !b.v);
      if (bars.ninjaTrader) name += ' (NinjaTrader: hora de cierre → apertura)';
      setStatus(`${name}: ${bars.length.toLocaleString('es-ES')} velas · ${fmtDT(bars[0].t)} → ${fmtDT(bars[bars.length - 1].t)}${saved ? '' : ' (demasiado grande para recordarlo)'}` +
        (noVol ? ' · SIN VOLUMEN: el VWAP no coincidirá con TradingView. Añade el indicador «Volumen» al gráfico antes de exportar.' : ''), noVol);
      run(true);
    } catch (e) {
      setStatus(e.message, true);
    }
  }
  function loadDemo() {
    rawBars = E.demoBars(20, 7, true); bars = E.resample(rawBars, Math.max(5, +params.groupMin || 1)); isDemo = true; csvText = null; sourceName = 'Ejemplo';
    store.del(STORE_CSV);
    setStatus(`Datos simulados (no son reales): ${bars.length} velas de 5 min, 20 sesiones de 24 h.`);
    run(true);
  }
  function readFile(f) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => loadText(String(r.result), f.name);
    r.onerror = () => setStatus('No se pudo leer el archivo.', true);
    r.readAsText(f);
  }
  $('file').addEventListener('change', e => readFile(e.target.files[0]));
  $('demo').addEventListener('click', loadDemo);
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => readFile(e.dataTransfer.files[0]));

  // ---------- ejecución ----------
  function run(resetView) {
    if (!bars.length) return;
    result = E.backtest(bars, params);
    selected = -1;
    renderKpis(); renderTable(); renderPine(); renderCmp();
    if (resetView) toEnd();
    drawChart(); drawEquity();
  }

  function renderKpis() {
    const s = result.stats;
    const pf = s.pf === Infinity ? '∞' : s.pf.toFixed(2);
    const items = [
      ['Resultado neto', money(s.net), cls(s.net)],
      ['Operaciones', s.n, ''],
      ['% ganadoras', (s.winRate * 100).toFixed(0) + '%', ''],
      ['Profit factor', pf, s.pf >= 1 ? 'pos' : s.n ? 'neg' : ''],
      ['Media por op.', money(s.expectancy), cls(s.expectancy)],
      ['Ganancia media', money(s.avgWin), 'pos'],
      ['Pérdida media', money(s.avgLoss), 'neg'],
      ['Máx. drawdown', money(-s.maxDD), s.maxDD ? 'neg' : ''],
      ['Puntos netos', (s.pts >= 0 ? '+' : '') + s.pts.toFixed(2), cls(s.pts)],
      ['Largos', `${s.longs} · ${money(s.longNet)}`, cls(s.longNet)],
      ['Cortos', `${s.shorts} · ${money(s.shortNet)}`, cls(s.shortNet)],
      ['Comisiones', money(-s.fees), s.fees ? 'neg' : '']
    ];
    $('kpis').innerHTML = items.map(([k, v, c]) => `<div class="kpi"><div class="k">${k}</div><div class="v ${c}">${v}</div></div>`).join('');
  }

  function renderTable() {
    const t = result.trades;
    const src = isDemo ? '<span class="demo-flag">datos simulados</span>' : '';
    $('nTrades').innerHTML = `· ${t.length} · ${params.contract} × ${params.qty}${src}`;
    $('tbody').innerHTML = t.map((x, i) => `<tr data-i="${i}">
      <td>${i + 1}</td><td>${fmtDT(x.entryTime)}</td>
      <td><span class="side ${x.side > 0 ? 'l' : 's'}">${x.side > 0 ? 'Largo' : 'Corto'}</span></td>
      <td>${px(x.entry)}</td><td>${fmtT(x.exitTime)}</td><td>${px(x.exit)}</td><td>${x.reason}</td>
      <td class="${cls(x.pts)}">${x.pts >= 0 ? '+' : ''}${x.pts.toFixed(2)}</td>
      <td class="${cls(x.pnl)}">${money2(x.pnl)}</td></tr>`).join('')
      || '<tr><td colspan="9" class="hint" style="padding:14px 8px">Sin operaciones con estos parámetros.</td></tr>';
  }
  $('tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    selectTrade(+tr.dataset.i, true);
  });
  function selectTrade(i, scrollChart) {
    selected = i;
    document.querySelectorAll('#tbody tr').forEach(r => r.classList.toggle('sel', +r.dataset.i === i));
    const t = result.trades[i];
    if (t && scrollChart) {
      const mid = (t.entryIdx + t.exitIdx) / 2;
      view.count = Math.max(view.count > 0 ? Math.min(view.count, 160) : 120, t.exitIdx - t.entryIdx + 40);
      view.from = mid - view.count / 2;
      clampView();
      $('chartWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    drawChart();
  }

  // ---------- gráfico ----------
  const canvas = $('chart'), ctx = canvas.getContext('2d');
  const view = { from: 0, count: 150 };
  const AXIS_R = 66, AXIS_B = 22;
  let hover = -1, W = 0, H = 0;

  function clampView() {
    const n = bars.length;
    view.count = Math.max(20, Math.min(view.count, Math.max(20, n + 10)));
    view.from = Math.max(-5, Math.min(view.from, n - view.count * 0.25));
  }
  function toEnd() { view.count = Math.min(150, bars.length); view.from = bars.length - view.count + 4; clampView(); }

  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [r.width, r.height];
  }

  function niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function drawChart() {
    [W, H] = sizeCanvas(canvas);
    ctx.clearRect(0, 0, W, H);
    const col = { up: css('--up'), down: css('--down'), fast: css('--ema-fast'), slow: css('--ema-slow'), vwap: css('--vwap'),
      grid: css('--grid'), label2: css('--label2'), label: css('--label'), card: css('--card'), hair: css('--hairline'), accent: css('--accent') };
    if (!bars.length || !result) {
      ctx.fillStyle = col.label2; ctx.font = '14px -apple-system,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Carga un CSV o usa los datos de ejemplo', W / 2, H / 2);
      renderLegend();
      return;
    }
    const pw = W - AXIS_R, ph = H - AXIS_B;
    const bw = pw / view.count;
    const i0 = Math.max(0, Math.floor(view.from)), i1 = Math.min(bars.length - 1, Math.ceil(view.from + view.count));
    const X = i => (i - view.from + 0.5) * bw;

    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) {
      const b = bars[i];
      lo = Math.min(lo, b.l); hi = Math.max(hi, b.h);
      for (const v of [result.emaSlow[i], result.emaFast[i]]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (b.vwap != null) { lo = Math.min(lo, b.vwap); hi = Math.max(hi, b.vwap); }
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    const padY = (hi - lo) * 0.08 || 1; lo -= padY; hi += padY;
    const Y = v => ph - (v - lo) / (hi - lo) * ph;

    // Rejilla y eje de precios
    ctx.font = '11px ' + css('--mono');
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const step = niceStep(hi - lo, Math.max(3, ph / 60));
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1; ctx.fillStyle = col.label2;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
      ctx.fillText(v.toFixed(step < 1 ? 2 : 0), pw + 6, y);
    }
    // Eje de tiempo: separadores de día y horas
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const every = Math.max(1, Math.ceil(80 / bw));
    const dayX = [];
    for (let i = Math.max(1, i0); i <= i1; i++) if (bars[i].session !== bars[i - 1].session || bars[i].et.date !== bars[i - 1].et.date) dayX.push(i);
    ctx.strokeStyle = col.hair; ctx.setLineDash([3, 4]);
    for (const i of dayX) {
      const x = Math.round(X(i) - bw / 2) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ph); ctx.stroke();
      const e = bars[i].et;
      ctx.fillStyle = col.label; ctx.fillText(`${pad(e.d)}/${pad(e.mo)}`, X(i), ph + 5);
    }
    ctx.setLineDash([]);
    ctx.fillStyle = col.label2;
    for (let i = i0; i <= i1; i++) {
      const x = X(i);
      if (i % every || x < 20 || x > pw - 20 || dayX.some(d => Math.abs(X(d) - x) < 48)) continue;
      const e = bars[i].et;
      ctx.fillText(`${pad(e.h)}:${pad(e.mi)}`, x, ph + 5);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();

    // Operación seleccionada: franja de fondo + stop/objetivo
    const sel = result.trades[selected];
    if (sel) {
      ctx.fillStyle = css('--fill');
      ctx.fillRect(X(sel.entryIdx) - bw / 2, 0, (sel.exitIdx - sel.entryIdx + 1) * bw, ph);
      const hl = (v, c) => { if (v == null) return; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); ctx.beginPath();
        ctx.moveTo(X(sel.entryIdx) - bw / 2, Y(v)); ctx.lineTo(X(sel.exitIdx) + bw / 2, Y(v)); ctx.stroke(); ctx.setLineDash([]); };
      hl(sel.stop, col.down); hl(sel.target, col.up); hl(sel.beAt, col.fast);
    }

    // Velas
    const cw = Math.max(1, Math.min(bw * 0.7, 14));
    for (let i = i0; i <= i1; i++) {
      const b = bars[i], x = X(i), upB = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = upB ? col.up : col.down;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(b.h)); ctx.lineTo(Math.round(x) + 0.5, Y(b.l)); ctx.stroke();
      const yo = Y(b.o), yc = Y(b.c);
      ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
    }

    // Líneas: EMAs y VWAP
    const line = (get, color, width, breakOn) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      let pen = false;
      for (let i = i0; i <= i1; i++) {
        const v = get(i);
        if (v == null || (breakOn && i > 0 && breakOn(i))) { pen = false; if (v == null) continue; }
        pen ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v));
        pen = true;
      }
      ctx.stroke(); ctx.lineWidth = 1;
    };
    line(i => bars[i].vwap, col.vwap, 2, i => bars[i].session !== bars[i - 1].session);
    line(i => result.emaSlow[i], col.slow, 1.6);
    line(i => result.emaFast[i], col.fast, 1.6);

    // Cruces descartados por filtros
    ctx.lineWidth = 1.5;
    for (const s of result.signals) {
      if (s.valid || s.idx < i0 || s.idx > i1) continue;
      ctx.strokeStyle = s.side > 0 ? col.up : col.down;
      ctx.beginPath(); ctx.arc(X(s.idx), Y(result.emaFast[s.idx] ?? bars[s.idx].c), 4, 0, Math.PI * 2); ctx.stroke();
    }

    // Operaciones
    const tri = (x, y, dir, color) => {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 6, y + dir * 10); ctx.lineTo(x + 6, y + dir * 10); ctx.closePath(); ctx.fill();
    };
    result.trades.forEach((t, k) => {
      if (t.exitIdx < i0 || t.entryIdx > i1) return;
      const xe = X(t.entryIdx), xx = X(t.exitIdx);
      ctx.strokeStyle = t.pnl >= 0 ? col.up : col.down; ctx.lineWidth = k === selected ? 2 : 1.2;
      ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xe, Y(t.entry)); ctx.lineTo(xx, Y(t.exit)); ctx.stroke(); ctx.setLineDash([]);
      const eb = bars[t.entryIdx];
      if (t.side > 0) tri(xe, Y(eb.l) + 5, 1, col.up); else tri(xe, Y(eb.h) - 5, -1, col.down);
      ctx.fillStyle = col.card; ctx.strokeStyle = t.pnl >= 0 ? col.up : col.down; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(xx - 3.5, Y(t.exit) - 3.5, 7, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1;
    });

    // Cruceta
    if (hover >= i0 && hover <= i1) {
      ctx.strokeStyle = col.label2; ctx.globalAlpha = .35;
      ctx.beginPath(); ctx.moveTo(Math.round(X(hover)) + 0.5, 0); ctx.lineTo(Math.round(X(hover)) + 0.5, ph); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Etiqueta del último precio
    const lb = bars[Math.min(i1, bars.length - 1)];
    const yl = Y(lb.c);
    if (yl > 0 && yl < ph) {
      ctx.fillStyle = lb.c >= lb.o ? col.up : col.down;
      ctx.fillRect(pw + 1, yl - 9, AXIS_R - 2, 18);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(lb.c.toFixed(2), pw + 5, yl);
    }
    renderLegend();
  }

  function renderLegend() {
    const i = hover >= 0 && hover < bars.length ? hover : Math.max(0, Math.min(bars.length - 1, Math.ceil(view.from + view.count) - 1));
    const b = bars[i];
    const L = $('legend');
    if (!b || !result) {
      L.innerHTML = `<span><i style="background:var(--ema-fast)"></i>EMA ${params.fast}</span><span><i style="background:var(--ema-slow)"></i>EMA ${params.slow}</span><span><i style="background:var(--vwap)"></i>VWAP</span>`;
      return;
    }
    const tr = result.trades.find(t => i >= t.entryIdx && i <= t.exitIdx);
    L.innerHTML = `<span><b>${params.contract}</b> ${fmtDT(b.t)}</span>
      <span>A <b>${px(b.o)}</b> M <b>${px(b.h)}</b> m <b>${px(b.l)}</b> C <b>${px(b.c)}</b></span>
      <span><i style="background:var(--ema-fast)"></i>EMA ${params.fast} <b>${px(result.emaFast[i])}</b></span>
      <span><i style="background:var(--ema-slow)"></i>EMA ${params.slow} <b>${px(result.emaSlow[i])}</b></span>
      <span><i style="background:var(--vwap)"></i>VWAP <b>${px(b.vwap)}</b></span>
      ${tr ? `<span>En ${tr.side > 0 ? 'largo' : 'corto'} desde ${px(tr.entry)}</span>` : ''}
      ${isDemo ? '<span class="demo-flag">simulado</span>' : ''}`;
  }

  // Interacción: arrastrar, rueda, pellizco
  const pointers = new Map();
  let pinch = null, dragStart = null;
  const idxAt = x => Math.floor(view.from + x / ((W - AXIS_R) / view.count));
  function zoomAt(factor, x) {
    const pw = W - AXIS_R;
    const anchor = view.from + (x / pw) * view.count;
    view.count *= factor; clampView();
    view.from = anchor - (x / pw) * view.count; clampView();
    drawChart();
  }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), count: view.count, from: view.from, cx: (a.x + b.x) / 2 };
      dragStart = null;
    } else dragStart = { x: e.offsetX, from: view.from, moved: false };
  });
  canvas.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const pw = W - AXIS_R, anchor = pinch.from + (pinch.cx / pw) * pinch.count;
      view.count = pinch.count * pinch.d / d; clampView();
      view.from = anchor - (pinch.cx / pw) * view.count; clampView();
      drawChart(); return;
    }
    if (dragStart && pointers.size === 1) {
      const dx = e.offsetX - dragStart.x;
      if (Math.abs(dx) > 3) dragStart.moved = true;
      view.from = dragStart.from - dx / ((W - AXIS_R) / view.count); clampView();
    }
    hover = idxAt(e.offsetX);
    drawChart();
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (dragStart && !dragStart.moved && result) {
      const i = idxAt(e.offsetX);
      const k = result.trades.findIndex(t => i >= t.entryIdx && i <= t.exitIdx);
      if (k >= 0) {
        selectTrade(k, false);
        const row = document.querySelector(`#tbody tr[data-i="${k}"]`);
        if (row) row.scrollIntoView({ block: 'nearest' });
      }
    }
    dragStart = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = -1; drawChart(); } });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      view.from += e.deltaX / ((W - AXIS_R) / view.count); clampView(); drawChart();
    } else zoomAt(Math.exp(e.deltaY * 0.0015), e.offsetX);
  }, { passive: false });
  $('zoomIn').addEventListener('click', () => zoomAt(0.7, (W - AXIS_R) / 2));
  $('zoomOut').addEventListener('click', () => zoomAt(1.4, (W - AXIS_R) / 2));
  $('toEnd').addEventListener('click', () => { toEnd(); drawChart(); });

  // ---------- curva de capital ----------
  function drawEquity() {
    const cv = $('equity'), c = cv.getContext('2d');
    const [w, h] = sizeCanvas(cv);
    c.clearRect(0, 0, w, h);
    if (!result || result.trades.length === 0) return;
    const eq = result.stats.equity;
    let lo = Math.min(0, ...eq), hi = Math.max(0, ...eq);
    if (hi === lo) hi = lo + 1;
    const padL = 58, pw = w - padL - 6, ph = h - 10;
    const X = i => padL + i / (eq.length - 1) * pw;
    const Y = v => 5 + ph - (v - lo) / (hi - lo) * ph;
    c.font = '11px ' + css('--mono'); c.textBaseline = 'middle'; c.fillStyle = css('--label2'); c.textAlign = 'right';
    c.strokeStyle = css('--grid');
    [lo, 0, hi].forEach(v => { c.beginPath(); c.moveTo(padL, Y(v)); c.lineTo(w - 6, Y(v)); c.stroke(); c.fillText(money(v), padL - 6, Y(v)); });
    const last = eq[eq.length - 1], color = last >= 0 ? css('--up') : css('--down');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, color + '44'); g.addColorStop(1, color + '00');
    c.beginPath(); c.moveTo(X(0), Y(0));
    eq.forEach((v, i) => c.lineTo(X(i), Y(v)));
    c.lineTo(X(eq.length - 1), Y(0)); c.closePath();
    c.fillStyle = /^#[0-9a-f]{6}$/i.test(color) ? g : 'transparent'; c.fill();
    c.beginPath(); eq.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
    c.strokeStyle = color; c.lineWidth = 2; c.stroke();
  }


  // ---------- Pine Script y copiar ----------
  function renderPine() {
    $('pineCode').textContent = window.EmaVwapPine.pineIndicator(Object.assign({}, params, { stopList: $('cmpStops').value }), E.CONTRACTS);
  }

  // ---------- ¿stop corto o largo? ----------
  function renderCmp() {
    const stops = parseList('cmpStops').filter(v => v > 0).slice(0, 12);
    const split = bars[Math.floor(bars.length * 0.7)].t;
    const rows = stops.map(s => {
      const r = E.backtest(bars, Object.assign({}, params, { stopMode: 'points', stopPts: s }));
      const tr = r.trades.filter(t => t.reason !== 'Fin de datos');
      return { s, st: E.stats(tr), oos: E.stats(tr.filter(t => t.entryTime >= split)) };
    });
    const best = Math.max(...rows.map(r => r.st.net));
    const pf = s => s.pf === Infinity ? '∞' : s.n ? s.pf.toFixed(2) : '—';
    $('cmpBody').innerHTML = rows.map(r => `<tr${r.st.net === best ? ' class="sel"' : ''}>
      <td><b>${r.s} pts</b></td><td>${r.st.n}</td><td>${(r.st.winRate * 100).toFixed(0)}%</td><td>${pf(r.st)}</td>
      <td class="${cls(r.st.net)}">${money(r.st.net)}</td><td class="neg">${money(-r.st.maxDD)}</td>
      <td class="${cls(r.st.expectancy)}">${money(r.st.expectancy)}</td><td class="${cls(r.oos.net)}">${money(r.oos.net)}</td></tr>`).join('');
    // Tu plan en cada sesión
    const sessions = [['ny', 'Nueva York 09:30–15:55'], ['london', 'Londres 03:00–09:30'], ['asia', 'Asia 18:00–03:00'], ['all', '24 h 18:00–16:55']];
    const srows = sessions.map(([k, name]) => {
      const tr = E.backtest(bars, Object.assign({}, params, { session: k })).trades.filter(t => t.reason !== 'Fin de datos');
      return { name, st: E.stats(tr), oos: E.stats(tr.filter(t => t.entryTime >= split)) };
    });
    const bestS = Math.max(...srows.map(r => r.st.net));
    $('sessBody').innerHTML = srows.map(r => `<tr${r.st.n && r.st.net === bestS ? ' class="sel"' : ''}>
      <td><b>${r.name}</b></td><td>${r.st.n}</td><td>${(r.st.winRate * 100).toFixed(0)}%</td><td>${pf(r.st)}</td>
      <td class="${cls(r.st.net)}">${money(r.st.net)}</td><td class="neg">${money(-r.st.maxDD)}</td>
      <td class="${cls(r.st.expectancy)}">${money(r.st.expectancy)}</td><td class="${cls(r.oos.net)}">${money(r.oos.net)}</td></tr>`).join('');
    // Recalcula el plan con los parámetros reales (backtest reescribe anotaciones de las velas)
    result = E.backtest(bars, params);
  }
  $('cmpStops').addEventListener('input', () => { clearTimeout(runTimer); runTimer = setTimeout(() => { renderCmp(); renderPine(); drawChart(); }, 250); });
  function copyText(text, okMsg) {
    const done = () => { $('copyStatus').textContent = okMsg; setTimeout(() => { $('copyStatus').textContent = ''; }, 2500); };
    const fallback = () => {
      const r = document.createRange(); r.selectNodeContents($('pineCode'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      $('copyStatus').textContent = 'Selecciona y copia el texto (Ctrl/⌘+C).';
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  $('pineCopy').addEventListener('click', () => copyText($('pineCode').textContent, 'Script copiado.'));
  $('tradesCopy').addEventListener('click', () => {
    if (!result) return;
    const rows = [['n', 'lado', 'entrada_ny', 'precio_entrada', 'salida_ny', 'precio_salida', 'motivo', 'puntos', 'pnl_usd']];
    result.trades.forEach((t, i) => rows.push([i + 1, t.side > 0 ? 'largo' : 'corto', fmtDT(t.entryTime), t.entry.toFixed(2), fmtDT(t.exitTime), t.exit.toFixed(2), t.reason, t.pts.toFixed(2), t.pnl.toFixed(2)]));
    copyText(rows.map(r => r.join(',')).join('\n'), `${result.trades.length} operaciones copiadas.`);
  });

  // ---------- optimizador ----------
    let optJob = null;
  $('optRun').addEventListener('click', () => {
    if (!bars.length) return;
    if (optJob) { optJob.cancel = true; optJob = null; $('optRun').textContent = 'Optimizar'; $('optStatus').textContent = 'Cancelado.'; return; }
    const grid = { fast: parseList('gFast'), slow: parseList('gSlow'), stopPts: parseList('gStop'), targetR: parseList('gTarget') };
    if (Object.values(grid).some(v => !v.length)) { $('optStatus').textContent = 'Rellena las cuatro listas con números separados por comas.'; return; }
    const job = E.optimize(bars, Object.assign({}, params), grid, { chunk: 8 });
    if (!job.combos.length) { $('optStatus').textContent = 'Ninguna combinación válida (la EMA rápida debe ser menor que la lenta).'; return; }
    if (job.combos.length > 3000) { $('optStatus').textContent = `${job.combos.length} combinaciones son demasiadas; reduce las listas (máx. 3000).`; return; }
    optJob = job; $('optRun').textContent = 'Cancelar';
    const tick = () => {
      if (job.cancel) return;
      const finished = job.step();
      $('optStatus').textContent = `${Math.round(job.progress * 100)} % · ${job.rows.length} de ${job.combos.length}`;
      if (!finished) { setTimeout(tick, 0); return; }
      optJob = null; $('optRun').textContent = 'Optimizar';
      $('optStatus').textContent = `${job.combos.length} combinaciones · corte en ${fmtDT(job.split)}`;
      renderOpt(job.rank().slice(0, 15));
      run();
    };
    tick();
  });
  function renderOpt(rows) {
    $('optWrap').hidden = false;
    const pf = s => s.pf === Infinity ? '∞' : s.pf.toFixed(2);
    $('optBody').innerHTML = rows.map((r, i) => `<tr>
      <td>${r.fast} / ${r.slow}</td><td>${r.stopPts || '—'}</td><td>${r.targetR || '—'}</td><td>${r.is.n} · ${r.oos.n}</td>
      <td class="${cls(r.is.net)}">${money(r.is.net)}</td><td>${pf(r.is)}</td>
      <td class="${cls(r.oos.net)}">${money(r.oos.net)}</td><td>${pf(r.oos)}</td>
      <td><button class="btn sm" data-k="${i}">Usar</button></td></tr>`).join('');
    $('optBody').querySelectorAll('button[data-k]').forEach(b => b.addEventListener('click', () => {
      const r = rows[+b.dataset.k];
      Object.assign(params, { fast: r.fast, slow: r.slow, stopPts: r.stopPts, targetR: r.targetR, stopMode: 'points' });
      fillForm(); readForm(); run();
      $('kpis').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // ---------- inicio ----------
  new ResizeObserver(() => { drawChart(); drawEquity(); }).observe($('chartWrap'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawChart(); drawEquity(); });

  fillForm();
  let saved = null;
  try { saved = JSON.parse(store.get(STORE_CSV) || 'null'); } catch (e) {}
  if (saved && saved.text) loadText(saved.text, saved.name);
  else loadDemo();
})();
