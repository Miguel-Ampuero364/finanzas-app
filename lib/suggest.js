export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function canonizar(valor, lista) {
  const n = normalizar(valor);
  return lista.find((x) => normalizar(x) === n) ?? null;
}

export function sugerir(descripcion, historial) {
  const d = normalizar(descripcion);
  if (!d) return null;
  for (let i = historial.length - 1; i >= 0; i--) {
    if (normalizar(historial[i].descripcion) === d) {
      return { categoria: historial[i].categoria, beneficiario: historial[i].beneficiario ?? '' };
    }
  }
  const palabras = d.split(' ').filter((p) => p.length >= 3);
  if (palabras.length === 0) return null;
  const votos = new Map();
  const ultimo = new Map();
  for (const fila of historial) {
    const propias = new Set(normalizar(fila.descripcion).split(' '));
    if (!palabras.some((p) => propias.has(p))) continue;
    const clave = normalizar(fila.categoria);
    votos.set(clave, (votos.get(clave) ?? 0) + 1);
    ultimo.set(clave, fila);
  }
  if (votos.size === 0) return null;
  const [mejor] = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
  const f = ultimo.get(mejor);
  return { categoria: f.categoria, beneficiario: f.beneficiario ?? '' };
}
