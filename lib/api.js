export class ErrorDeRed extends Error {}

export function crearApi({ url, token, fetchFn = (...args) => fetch(...args) }) {
  async function llamar(accion, datos = {}) {
    let respuesta;
    try {
      respuesta = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token, action: accion, ...datos }),
        redirect: 'follow',
      });
    } catch {
      throw new ErrorDeRed('sin conexión');
    }
    try {
      return await respuesta.json();
    } catch {
      throw new ErrorDeRed('respuesta inválida');
    }
  }
  return {
    configuracion: () => llamar('config'),
    filas: (limite = 400) => llamar('rows', { limit: limite }),
    agregar: (entrada) => llamar('add', { entry: entrada }),
    deudas: () => llamar('debts'),
    marcarDeuda: (tab, fila, esperado) => llamar('markDebt', { tab, fila, esperado }),
    actualizar: (tipo, fila, esperado, entrada) => llamar('update', { tipo, fila, esperado, entry: entrada }),
    borrar: (tipo, fila, esperado) => llamar('delete', { tipo, fila, esperado }),
    fijos: () => llamar('fixed'),
  };
}
