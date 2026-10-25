import { parseFecha } from './dates.js';
import { normalizar } from './suggest.js';

// Los gastos que más repites, para registrarlos con un toque. Cada uno trae los datos de su último registro.
export function frecuentes(gastos, max = 6, minimo = 2) {
  const grupos = new Map();
  gastos.forEach((f, i) => {
    const descripcion = String(f.descripcion ?? '').trim();
    if (!descripcion) return;
    const clave = normalizar(descripcion);
    const p = parseFecha(f.fecha);
    const orden = (p ? p.anio * 10000 + p.mes * 100 + p.dia : 0) * 10000 + i;
    const grupo = grupos.get(clave) ?? { veces: 0, ultimo: null, orden: -1 };
    grupo.veces += 1;
    if (orden >= grupo.orden) {
      grupo.orden = orden;
      grupo.ultimo = f;
    }
    grupos.set(clave, grupo);
  });
  return [...grupos.values()]
    .filter((g) => g.veces >= minimo)
    .sort((a, b) => b.veces - a.veces || b.orden - a.orden)
    .slice(0, max)
    .map((g) => ({
      descripcion: String(g.ultimo.descripcion).trim(),
      categoria: g.ultimo.categoria,
      beneficiario: g.ultimo.beneficiario ?? '',
      metodo: g.ultimo.metodo ?? '',
      monto: g.ultimo.monto,
      veces: g.veces,
    }));
}

// Personas para elegir: primero la lista de la hoja, luego las que ya aparecen en los gastos.
export function nombresPersonas(lista, gastos) {
  const nombres = [];
  const vistos = new Set();
  for (const n of [...(lista ?? []), ...gastos.map((f) => f.beneficiario)]) {
    const limpio = String(n ?? '').trim();
    const clave = normalizar(limpio);
    if (limpio && !vistos.has(clave)) {
      vistos.add(clave);
      nombres.push(limpio);
    }
  }
  return nombres;
}
