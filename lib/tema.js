// Tema de la app: 'auto' sigue el modo del teléfono; 'claro' y 'oscuro' lo fijan.
export const TEMAS = ['auto', 'claro', 'oscuro'];
export const COLOR_CLARO = '#eeede6';
export const COLOR_OSCURO = '#0e0f0d';

export function normalizarTema(valor) {
  return TEMAS.includes(valor) ? valor : 'auto';
}

// Color de la barra del navegador para un tema dado (en 'auto' depende del modo del sistema).
export function colorBarra(tema, sistemaOscuro) {
  const oscuro = tema === 'oscuro' || (tema === 'auto' && Boolean(sistemaOscuro));
  return oscuro ? COLOR_OSCURO : COLOR_CLARO;
}
