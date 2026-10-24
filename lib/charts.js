// Geometría de los gráficos: números puros, el dibujo lo hace app.js.
export function techoLimpio(max) {
  if (!(max > 0)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  const f = max / potencia;
  const paso = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return paso * potencia;
}

export function geometriaSerie(serie, ancho, alto, margen = { sup: 8, der: 4, inf: 22, izq: 34 }) {
  const m = margen;
  const anchoUtil = ancho - m.izq - m.der;
  const altoUtil = alto - m.sup - m.inf;
  const techo = techoLimpio(Math.max(0, ...serie.flatMap((s) => [s.ingresos ?? 0, s.gastos ?? 0])));
  const anchoGrupo = anchoUtil / serie.length;
  const anchoBarra = anchoGrupo * 0.3;
  const separacion = anchoGrupo * 0.04;
  const y = (v) => m.sup + altoUtil - (v / techo) * altoUtil;
  const barras = [];
  const grupos = [];
  serie.forEach((s, i) => {
    const x0 = m.izq + i * anchoGrupo;
    const centro = x0 + anchoGrupo / 2;
    grupos.push({ mes: s.mes, x: x0, ancho: anchoGrupo });
    for (const [tipo, valor, dx] of [
      ['ingresos', s.ingresos ?? 0, -anchoBarra - separacion / 2],
      ['gastos', s.gastos ?? 0, separacion / 2],
    ]) {
      barras.push({ mes: s.mes, tipo, valor, x: centro + dx, y: y(valor), w: anchoBarra, h: (valor / techo) * altoUtil });
    }
  });
  const ticks = [0, 0.5, 1].map((f) => ({ valor: techo * f, y: y(techo * f) }));
  return { barras, grupos, ticks, techo, base: y(0), izq: m.izq, derecha: ancho - m.der };
}
