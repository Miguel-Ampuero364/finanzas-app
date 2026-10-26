import { parseFecha } from './dates.js';
import { normalizar } from './suggest.js';

// Los gastos e ingresos fijos de la hoja, con una marca de cuáles ya están registrados este mes.
// Primero los que faltan (por día del mes) y al final los que ya están hechos.
export function fijosParaMostrar(fijos, filas, hoy = new Date()) {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;
  const hechoEn = (lista, concepto) => (lista ?? []).some((f) => {
    const p = parseFecha(f.fecha);
    return p && p.anio === anio && p.mes === mes && normalizar(f.descripcion) === normalizar(concepto);
  });
  const armar = (lista, tipo, delTipo) => (lista ?? []).map((f, i) => ({
    tipo, concepto: f.concepto, categoria: f.categoria ?? '', beneficiario: f.beneficiario ?? '', monto: f.monto, dia: f.dia ?? 0,
    hecho: hechoEn(delTipo, f.concepto), orden: i,
  }));
  const todos = [
    ...armar(fijos?.gastos, 'gasto', filas?.gastos),
    ...armar(fijos?.ingresos, 'ingreso', filas?.ingresos),
  ];
  return todos
    .sort((a, b) => Number(a.hecho) - Number(b.hecho) || a.dia - b.dia || a.orden - b.orden)
    .map(({ orden, ...f }) => f);
}
