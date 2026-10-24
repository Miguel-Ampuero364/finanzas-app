import { parseMonto } from './money.js';
import { claveMes, parseFecha, moverMes } from './dates.js';
import { normalizar } from './suggest.js';

const redondear = (n) => Math.round(n * 100) / 100;
const monto = (fila) => {
  const m = parseMonto(fila.monto);
  return Number.isNaN(m) ? 0 : m;
};
const sumar = (filas) => redondear(filas.reduce((t, f) => t + monto(f), 0));

// El saldo viene de la hoja; los registros que aún no subieron se suman encima para que se vea al instante.
export function ajustarSaldo(saldo, pendientes) {
  if (!saldo) return null;
  let ingresos = saldo.ingresos;
  let gastos = saldo.gastos;
  for (const p of pendientes) {
    if (p.tipo === 'ingreso') ingresos += monto(p);
    else gastos += monto(p);
  }
  ingresos = redondear(ingresos);
  gastos = redondear(gastos);
  return { inicial: saldo.inicial, ingresos, gastos, actual: redondear(saldo.inicial + ingresos - gastos) };
}

export function unirMovimientos(gastos, ingresos) {
  return [
    ...gastos.map((f) => ({ ...f, tipo: 'gasto' })),
    ...ingresos.map((f) => ({ ...f, tipo: 'ingreso' })),
  ];
}

export function filtrarFilas(filas, { desde = '0000-00', hasta = '9999-99', beneficiario = '', categoria = '', texto = '' } = {}) {
  const b = normalizar(beneficiario);
  const c = normalizar(categoria);
  const t = normalizar(texto);
  return filas.filter((f) => {
    const mes = claveMes(f.fecha);
    if (!mes || mes < desde || mes > hasta) return false;
    if (b && normalizar(f.beneficiario) !== b) return false;
    if (c && normalizar(f.categoria) !== c) return false;
    if (t && !normalizar(`${f.descripcion ?? ''} ${f.categoria ?? ''} ${f.beneficiario ?? ''}`).includes(t)) return false;
    return true;
  });
}

export function ordenarFilas(filas, orden) {
  const dia = (f) => {
    const p = parseFecha(f.fecha);
    return p ? p.anio * 10000 + p.mes * 100 + p.dia : 0;
  };
  const comparar = {
    monto: (a, b) => monto(b.f) - monto(a.f) || b.i - a.i,
    'fecha-asc': (a, b) => dia(a.f) - dia(b.f) || a.i - b.i,
    fecha: (a, b) => dia(b.f) - dia(a.f) || b.i - a.i,
  }[orden] ?? ((a, b) => dia(b.f) - dia(a.f) || b.i - a.i);
  return filas.map((f, i) => ({ f, i })).sort(comparar).map((x) => x.f);
}

const cambio = (actual, anterior) => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);

// Con un beneficiario o una categoría elegidos solo se cuentan esos gastos: los ingresos no pertenecen a ninguno.
export function resumenPeriodo({ gastos, ingresos, rango, rangoAnterior, beneficiario = '', categoria = '' }) {
  const totales = (r) => {
    const g = sumar(filtrarFilas(gastos, { ...r, beneficiario, categoria }));
    const i = beneficiario || categoria ? null : sumar(filtrarFilas(ingresos, r));
    return { gastos: g, ingresos: i, balance: i === null ? null : redondear(i - g) };
  };
  const actual = totales(rango);
  const anterior = rangoAnterior ? totales(rangoAnterior) : null;
  return {
    ...actual,
    anterior,
    delta: {
      ingresos: anterior && actual.ingresos !== null ? cambio(actual.ingresos, anterior.ingresos) : null,
      gastos: anterior ? cambio(actual.gastos, anterior.gastos) : null,
    },
  };
}

export function porCategoria(gastosFiltrados, presupuestos, nMeses) {
  const porClave = new Map();
  const tomar = (nombre) => {
    const etiqueta = String(nombre ?? '').trim() || 'Sin categoría';
    const clave = normalizar(etiqueta);
    if (!porClave.has(clave)) porClave.set(clave, { categoria: etiqueta, gastado: 0, presupuesto: null });
    return porClave.get(clave);
  };
  for (const [nombre, valor] of Object.entries(presupuestos)) {
    const p = parseMonto(valor);
    tomar(nombre).presupuesto = p > 0 ? redondear(p * nMeses) : null;
  }
  for (const f of gastosFiltrados) tomar(f.categoria).gastado += monto(f);
  return [...porClave.values()]
    .filter((c) => c.gastado > 0 || c.presupuesto !== null)
    .map((c) => {
      const gastado = redondear(c.gastado);
      return {
        categoria: c.categoria,
        gastado,
        presupuesto: c.presupuesto,
        restante: c.presupuesto === null ? null : redondear(c.presupuesto - gastado),
        porcentaje: c.presupuesto === null ? null : Math.round((gastado / c.presupuesto) * 100),
      };
    })
    .sort((a, b) => b.gastado - a.gastado);
}

export function porBeneficiario(gastosFiltrados) {
  const porClave = new Map();
  for (const f of gastosFiltrados) {
    const nombre = String(f.beneficiario ?? '').trim() || 'Sin asignar';
    const clave = normalizar(nombre);
    const actual = porClave.get(clave) ?? { nombre, total: 0 };
    actual.total += monto(f);
    porClave.set(clave, actual);
  }
  return [...porClave.values()].map((b) => ({ nombre: b.nombre, total: redondear(b.total) })).sort((a, b) => b.total - a.total);
}

export function serieMensual(gastos, ingresos, hoyMes, n) {
  return Array.from({ length: n }, (_, k) => moverMes(hoyMes, k - (n - 1))).map((mes) => ({
    mes,
    ingresos: sumar(filtrarFilas(ingresos, { desde: mes, hasta: mes })),
    gastos: sumar(filtrarFilas(gastos, { desde: mes, hasta: mes })),
  }));
}

// Solo se traen las últimas `limite` filas: los meses más viejos pueden salir incompletos.
export function mesPodriaEstarIncompleto(filas, mes, limite) {
  if (filas.length < limite) return false;
  const claves = filas.map((f) => claveMes(f.fecha)).filter(Boolean).sort();
  return claves.length > 0 && mes <= claves[0];
}
