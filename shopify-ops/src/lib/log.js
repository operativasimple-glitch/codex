const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', grey: '\x1b[90m',
};
const on = process.stdout.isTTY && !process.env.NO_COLOR;
const p = (c, s) => (on ? c + s + C.reset : s);

export const log = {
  info: (...a) => console.log(p(C.cyan, '›'), ...a),
  ok: (...a) => console.log(p(C.green, '✓'), ...a),
  warn: (...a) => console.log(p(C.yellow, '!'), ...a),
  err: (...a) => console.error(p(C.red, '✗'), ...a),
  step: (...a) => console.log('\n' + p(C.bold, a.join(' '))),
  dim: (...a) => console.log(p(C.grey, a.join(' '))),
  json: (o) => console.log(JSON.stringify(o, null, 2)),
};

export const money = (n, cur = process.env.CURRENCY || 'EUR') =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur }).format(Number(n) || 0);

export const pct = (n) => `${(Number(n) * 100).toFixed(1)}%`;

/** Tabla de texto plano, sin dependencias. */
export function table(rows, cols) {
  if (!rows.length) return log.dim('  (sin datos)');
  const head = cols.map((c) => c.label);
  const body = rows.map((r) => cols.map((c) => String(c.get(r) ?? '')));
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => ('  ' + cells.map((c, i) => c.padEnd(w[i])).join('  ')).trimEnd();
  // Una tabla de pares clave/valor no lleva cabecera: seria una fila en blanco.
  if (head.some((h) => h !== '')) {
    console.log(p(C.bold, line(head)));
    console.log(p(C.grey, '  ' + w.map((n) => '─'.repeat(n)).join('  ')));
  }
  body.forEach((b) => console.log(line(b)));
}
