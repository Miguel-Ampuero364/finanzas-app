import { moverMes, etiquetaMes } from './dates.js';

// Valores del selector: "mes:2026-10", "ult:3", "todo".
export function parsePeriodo(valor) {
  const v = String(valor ?? '');
  if (v === 'todo') return { tipo: 'todo' };
  let m = /^mes:(\d{4}-\d{2})$/.exec(v);
  if (m) return { tipo: 'mes', mes: m[1] };
  m = /^ult:(\d{1,2})$/.exec(v);
  if (m && Number(m[1]) > 0) return { tipo: 'ultimos', n: Number(m[1]) };
  return null;
}

// primerMes: mes del dato más antiguo; solo lo usa "todo".
export function rangoPeriodo(periodo, hoyMes, primerMes) {
  if (periodo.tipo === 'mes') return { desde: periodo.mes, hasta: periodo.mes };
  if (periodo.tipo === 'ultimos') return { desde: moverMes(hoyMes, -(periodo.n - 1)), hasta: hoyMes };
  return { desde: primerMes && primerMes < hoyMes ? primerMes : hoyMes, hasta: hoyMes };
}

export function periodoAnterior(periodo, hoyMes) {
  if (periodo.tipo === 'todo') return null;
  const { desde } = rangoPeriodo(periodo, hoyMes);
  const n = periodo.tipo === 'mes' ? 1 : periodo.n;
  return { desde: moverMes(desde, -n), hasta: moverMes(desde, -1) };
}

export function contarMeses({ desde, hasta }) {
  const [a1, m1] = desde.split('-').map(Number);
  const [a2, m2] = hasta.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

export function opcionesPeriodo(hoyMes, mesesConDatos) {
  const pasado = moverMes(hoyMes, -1);
  const opciones = [
    { valor: `mes:${hoyMes}`, etiqueta: `Este mes (${etiquetaMes(hoyMes)})` },
    { valor: `mes:${pasado}`, etiqueta: `Mes pasado (${etiquetaMes(pasado)})` },
    { valor: 'ult:3', etiqueta: 'Últimos 3 meses' },
    { valor: 'ult:12', etiqueta: 'Últimos 12 meses' },
    { valor: 'todo', etiqueta: 'Todo el historial' },
  ];
  const otros = [...new Set(mesesConDatos)].filter((m) => m !== hoyMes && m !== pasado).sort().reverse();
  for (const m of otros) opciones.push({ valor: `mes:${m}`, etiqueta: etiquetaMes(m) });
  return opciones;
}
