export function crearCola(almacen, clave) {
  const leer = () => {
    try {
      const datos = JSON.parse(almacen.getItem(clave) ?? '[]');
      return Array.isArray(datos) ? datos : [];
    } catch {
      return [];
    }
  };
  const guardar = (lista) => almacen.setItem(clave, JSON.stringify(lista));
  return {
    agregar(entrada) {
      const lista = leer();
      lista.push(entrada);
      guardar(lista);
    },
    lista: leer,
    pendientes: () => leer().filter((e) => !e.rechazo),
    quitar: (id) => guardar(leer().filter((e) => e.id !== id)),
    marcarRechazada: (id, motivo) =>
      guardar(leer().map((e) => (e.id === id ? { ...e, rechazo: motivo } : e))),
  };
}

export function nuevoId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// alEnviar(entrada, respuesta) se llama por cada registro que el puente aceptó.
export async function enviarPendientes(cola, api, alEnviar = null) {
  let enviados = 0;
  for (const entrada of cola.pendientes()) {
    let respuesta;
    try {
      respuesta = await api.agregar(entrada);
    } catch {
      return { enviados, error: 'red' };
    }
    if (respuesta.ok) {
      cola.quitar(entrada.id);
      enviados++;
      if (alEnviar) alEnviar(entrada, respuesta);
    } else if (respuesta.error === 'clave') {
      return { enviados, error: 'clave' };
    } else if (respuesta.error === 'interno') {
      return { enviados, error: 'puente' };
    } else {
      cola.marcarRechazada(entrada.id, respuesta.error);
    }
  }
  return { enviados, error: null };
}

// Qué pasó con un registro recién guardado, para decirle la verdad a Miguel.
export function resultadoGuardado(cola, id, envio) {
  const entrada = cola.lista().find((e) => e.id === id);
  if (!entrada) return 'enviada';
  if (entrada.rechazo) return 'rechazada';
  return envio.error === 'clave' ? 'clave' : 'pendiente';
}
