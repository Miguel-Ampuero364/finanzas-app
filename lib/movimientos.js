import { formatMonto } from './money.js';

// Operaciones sobre las filas que la app guarda en el teléfono, para reflejar un cambio sin releer toda la hoja.
// Nunca modifican lo que reciben: devuelven filas nuevas.

const clave = (tipo) => (tipo === 'gasto' ? 'gastos' : 'ingresos');

// La fila con el mismo formato que devuelve el puente al leer la hoja.
export function filaNueva(entrada, fila) {
  const esGasto = entrada.tipo === 'gasto';
  return {
    fila,
    fecha: entrada.fecha,
    categoria: entrada.categoria,
    beneficiario: esGasto ? (entrada.beneficiario ?? '') : '',
    descripcion: entrada.descripcion ?? '',
    monto: formatMonto(entrada.monto),
    metodo: esGasto ? (entrada.metodo ?? '') : '',
  };
}

export function conAgregado(filas, tipo, nueva) {
  const k = clave(tipo);
  if (filas[k].some((f) => f.fila === nueva.fila)) return filas;
  return { ...filas, [k]: [...filas[k], nueva] };
}

export function conEdicion(filas, tipo, fila, nueva) {
  const k = clave(tipo);
  return { ...filas, [k]: filas[k].map((f) => (f.fila === fila ? nueva : f)) };
}

// Al borrar una fila de la hoja, las que estaban debajo suben una posición.
export function conBorrado(filas, tipo, fila) {
  const k = clave(tipo);
  return {
    ...filas,
    [k]: filas[k].filter((f) => f.fila !== fila).map((f) => (f.fila > fila ? { ...f, fila: f.fila - 1 } : f)),
  };
}

// Lo que el puente compara con la hoja para confirmar que la fila sigue siendo la misma.
export function esperadoDe(f) {
  return { fecha: f.fecha, categoria: f.categoria, descripcion: f.descripcion, monto: f.monto };
}
