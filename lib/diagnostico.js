export const VERSION_APP = '2026-10-25b';

// Sistema y navegador a partir del texto que manda el teléfono. Solo para el informe.
export function resumirUA(ua = '') {
  const texto = String(ua ?? '');
  const ios = /OS (\d+)[_.](\d+)/.exec(texto);
  const android = /Android (\d+)/.exec(texto);
  const chromeIos = /CriOS\/(\d+)/.exec(texto);
  const chrome = /Chrome\/(\d+)/.exec(texto);
  const safari = /Version\/(\d+(?:\.\d+)?).*Safari/.exec(texto);
  let sistema = /iPhone|iPad|iPod/.test(texto) && ios ? `iOS ${ios[1]}.${ios[2]}` : android ? `Android ${android[1]}` : 'desconocido';
  // Desde iOS 26 el texto del teléfono trae un número de iOS congelado (18.x): el verdadero es el de Safari.
  if (safari && sistema.startsWith('iOS') && Number(safari[1].split('.')[0]) >= 26 && Number(ios[1]) < 26) {
    sistema = `iOS ${safari[1]} (el navegador informa ${ios[1]}.${ios[2]})`;
  }
  const navegador = chromeIos ? `Chrome en iOS ${chromeIos[1]}` : chrome ? `Chrome ${chrome[1]}` : safari ? `Safari ${safari[1]}` : 'desconocido';
  return { sistema, navegador };
}

const dato = (v, vacio = '—') => (v === undefined || v === null || v === '' || Number.isNaN(v) ? vacio : String(v));
const si = (v) => (v ? 'sí' : 'NO');

// Solo se imprimen campos conocidos: aunque lleguen claves o direcciones en los datos, no salen en el informe.
export function informeDiagnostico(d = {}) {
  const p = d.pantalla ?? {};
  const m = p.margenes ?? {};
  const a = d.almacenamiento ?? {};
  const { sistema, navegador } = resumirUA(d.ua);
  const L = [];
  L.push('INFORME DE DIAGNÓSTICO · Finanzas');
  L.push(`Versión de la app: ${VERSION_APP}`);
  L.push(`Fecha: ${dato(d.fecha)} (${dato(d.zona)})`);

  L.push('', '== Dispositivo ==');
  L.push(`Sistema: ${sistema}`);
  L.push(`Navegador: ${navegador}`);
  L.push(`Se abrió como: ${d.modo === 'instalada' ? 'app instalada (pantalla de inicio)' : 'pestaña del navegador'}`);
  L.push(`Idioma: ${dato(d.idioma)}`);

  L.push('', '== Pantalla ==');
  L.push(`Área de la app: ${dato(p.ancho)} × ${dato(p.alto)} px · escala ${dato(p.dpr)}`);
  L.push(`Pantalla completa: ${dato(p.pantallaAncho)} × ${dato(p.pantallaAlto)} px · ${dato(p.orientacion)}`);
  L.push(`Márgenes de la muesca: Margen superior ${dato(m.arriba, 0)}, inferior ${dato(m.abajo, 0)}, izquierdo ${dato(m.izquierda, 0)}, derecho ${dato(m.derecha, 0)}`);
  L.push(`Modo: ${dato(p.esquema)} · reducir movimiento: ${si(p.menosMovimiento)}`);

  L.push('', '== Guardado en el teléfono ==');
  L.push(`Datos locales (localStorage): ${si(a.localStorage)} · claves guardadas: ${dato(a.claves, 0)}`);
  L.push(`Caché sin conexión: ${si(a.cache)}`);
  L.push(`Service worker: soportado ${si(a.swSoportado)} · registrado ${si(a.swRegistrado)} · controla la página ${si(a.swControla)}`);
  L.push(`Alcance del service worker: ${dato(a.swScope)}`);
  L.push(`Espacio: usado ${dato(a.usadoKB)} KB de ${dato(a.cuotaMB)} MB`);

  L.push('', '== Soporte del navegador ==');
  const soporte = Object.entries(d.soporte ?? {});
  if (soporte.length === 0) L.push('(sin datos)');
  for (const [nombre, ok] of soporte) L.push(`${nombre}: ${si(ok)}`);

  L.push('', '== Espacios ==');
  const espacios = d.espacios ?? [];
  if (espacios.length === 0) L.push('(sin datos)');
  for (const e of espacios) {
    const nombre = dato(e.nombre, 'Espacio');
    const cola = `pendientes ${dato(e.pendientes, 0)}, rechazados ${dato(e.rechazadas, 0)}`;
    const local = `en el teléfono: ${dato(e.gastos, 0)} gastos y ${dato(e.ingresos, 0)} ingresos`;
    if (!e.configurado) {
      L.push(`- ${nombre}: sin configurar · ${cola} · ${local}`);
    } else if (e.ok) {
      L.push(`- ${nombre}: conexión OK (${dato(e.ms)} ms, ${dato(e.categorias, 0)} categorías, saldo ${si(e.saldo)}) · ${cola} · ${local}`);
    } else {
      L.push(`- ${nombre}: conexión con ERROR (${dato(e.error)}, ${dato(e.ms)} ms) · ${cola} · ${local}`);
    }
  }

  L.push('', '== Estado ==');
  L.push(`Mensaje de la app: ${dato(d.estado)}`);
  const errores = d.errores ?? [];
  if (errores.length === 0) L.push('Errores recientes: ninguno');
  else {
    L.push('Errores recientes:');
    for (const e of errores) L.push(`- ${dato(e)}`);
  }
  return L.join('\n');
}
