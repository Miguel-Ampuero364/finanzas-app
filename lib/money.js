export function parseMonto(valor) {
  if (typeof valor === 'number') return valor;
  const t = String(valor ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function parseMontoTipeado(texto) {
  const t = String(texto ?? '').trim();
  if (t === '') return NaN;
  if (t.includes(',')) return parseMonto(t);
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return parseMonto(t);
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

// Para etiquetas de ejes y totales cortos: 76700 -> "76,7 mil".
export function formatCompacto(n) {
  const a = Math.abs(n);
  const signo = n < 0 ? '-' : '';
  const corto = (v) => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  if (a >= 1e6) return signo + corto(a / 1e6) + ' M';
  if (a >= 1e3) return signo + (a >= 1e5 ? Math.round(a / 1e3) : corto(a / 1e3)) + ' mil';
  return signo + Math.round(a);
}

export function formatMonto(n) {
  if (!Number.isFinite(n) || Math.abs(n) >= 1e15) return '—';
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + conMiles + ',' + decimales;
}

// Un gasto resta y un ingreso suma; un monto negativo invierte el signo (es una devolución).
export function formatMovimiento(tipo, n) {
  const suma = tipo === 'ingreso' ? n >= 0 : n < 0;
  return (suma ? '+' : '−') + 'Bs ' + formatMonto(Math.abs(n));
}
