import { parseMonto } from './money.js';

const COLUMNAS = ['Fecha', 'Tipo', 'Categoría', 'Beneficiario', 'Descripción', 'Monto (Bs)', 'Método'];

// Un texto que empieza con = + - @ lo ejecutaría Excel como fórmula: se le antepone un apóstrofo.
function texto(valor) {
  let t = String(valor ?? '').trim();
  if (/^[=+\-@]/.test(t)) t = "'" + t;
  return /[";\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function numero(valor) {
  const n = parseMonto(valor);
  return Number.isNaN(n) ? '' : n.toFixed(2).replace('.', ',');
}

// Punto y coma y coma decimal: así lo abre Excel en español sin pedir nada.
export function aCsv(filas) {
  const lineas = [COLUMNAS.join(';')];
  for (const f of filas) {
    lineas.push([
      texto(f.fecha), f.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', texto(f.categoria),
      texto(f.beneficiario), texto(f.descripcion), numero(f.monto), texto(f.metodo),
    ].join(';'));
  }
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

export function nombreArchivo(espacio, rotulo) {
  const limpio = String(rotulo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return 'finanzas-' + espacio + '-' + (limpio || 'resumen') + '.csv';
}
