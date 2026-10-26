// Iconos dibujados a mano: un solo trazo (1.75), puntas redondas, color heredado.
const SVG = 'http://www.w3.org/2000/svg';

const FORMAS = {
  descargar: [['path', { d: 'M12 4v11' }], ['path', { d: 'M7.5 11l4.5 4.5 4.5-4.5' }], ['path', { d: 'M5 19h14' }]],
  buscar: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l4 4' }]],
  cerrar: [['path', { d: 'M6 6l12 12' }], ['path', { d: 'M18 6L6 18' }]],
  sube: [['path', { d: 'M12 19V5' }], ['path', { d: 'M6.5 10.5L12 5l5.5 5.5' }]],
  baja: [['path', { d: 'M12 5v14' }], ['path', { d: 'M6.5 13.5L12 19l5.5-5.5' }]],
  mas: [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  grafico: [['path', { d: 'M5 20V11' }], ['path', { d: 'M12 20V4' }], ['path', { d: 'M19 20v-6' }]],
  lista: [['path', { d: 'M9 6h11' }], ['path', { d: 'M9 12h11' }], ['path', { d: 'M9 18h11' }], ['path', { d: 'M4.5 6h.01' }], ['path', { d: 'M4.5 12h.01' }], ['path', { d: 'M4.5 18h.01' }]],
  ajustes: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8' }]],
};

export function icono(nombre, tam = 18) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: tam, height: tam, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(k, v);
  for (const [tag, attrs] of FORMAS[nombre] ?? []) {
    const parte = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) parte.setAttribute(k, v);
    svg.append(parte);
  }
  return svg;
}
