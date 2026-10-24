import { parseMontoTipeado } from './money.js';

const METODOS = {
  qr: 'QR',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  transf: 'Transferencia',
};

export function interpretarTexto(texto) {
  let t = String(texto ?? '').trim();
  let tipo = 'gasto';
  if (t.startsWith('+')) {
    tipo = 'ingreso';
    t = t.slice(1).trim();
  }
  let monto = NaN;
  let metodo = '';
  const resto = [];
  for (const palabra of t.split(/\s+/).filter(Boolean)) {
    if (Number.isNaN(monto) && /^\d[\d.,]*$/.test(palabra)) {
      const n = parseMontoTipeado(palabra);
      if (!Number.isNaN(n)) {
        monto = n;
        continue;
      }
    }
    const m = METODOS[palabra.toLowerCase()];
    if (m && metodo === '') {
      metodo = m;
      continue;
    }
    resto.push(palabra);
  }
  if (Number.isNaN(monto)) return null;
  return { tipo, descripcion: resto.join(' '), monto, metodo };
}
