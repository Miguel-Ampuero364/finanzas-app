const dos = (n) => String(n).padStart(2, '0');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function parseFecha(texto) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  const f = new Date(anio, mes - 1, dia);
  if (f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() !== dia) return null;
  return { dia, mes, anio };
}

export function formatFecha(date) {
  return `${dos(date.getDate())}/${dos(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function claveMes(fechaTexto) {
  const f = parseFecha(fechaTexto);
  return f ? `${f.anio}-${dos(f.mes)}` : null;
}

export function claveMesDe(date) {
  return `${date.getFullYear()}-${dos(date.getMonth() + 1)}`;
}

export function moverMes(clave, delta) {
  const [anio, mes] = clave.split('-').map(Number);
  return claveMesDe(new Date(anio, mes - 1 + delta, 1));
}

export function etiquetaCorta(clave) {
  return MESES[Number(clave.split('-')[1]) - 1].slice(0, 3);
}

export function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  return `${MESES[mes - 1]} ${anio}`;
}
