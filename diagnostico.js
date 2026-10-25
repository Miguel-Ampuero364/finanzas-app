// Mide lo que solo se puede saber en el propio teléfono. No lee claves ni datos de las hojas: solo cantidades y tiempos.
const css = (regla) => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports(regla);

function margenesSeguros() {
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(sonda);
  const e = getComputedStyle(sonda);
  const px = (v) => Math.round(parseFloat(v) || 0);
  const m = { arriba: px(e.paddingTop), derecha: px(e.paddingRight), abajo: px(e.paddingBottom), izquierda: px(e.paddingLeft) };
  sonda.remove();
  return m;
}

function localStorageSirve() {
  try {
    localStorage.setItem('__diagnostico', '1');
    const ok = localStorage.getItem('__diagnostico') === '1';
    localStorage.removeItem('__diagnostico');
    return ok;
  } catch {
    return false;
  }
}

function soporteDeFunciones() {
  const fecha = document.createElement('input');
  fecha.type = 'date';
  let compartirArchivos = false;
  try {
    compartirArchivos = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'a.csv', { type: 'text/csv' })] });
  } catch {
    compartirArchivos = false;
  }
  return {
    ':has()': css('selector(:has(a))'),
    'color-mix': css('color: color-mix(in srgb, red 50%, blue)'),
    'backdrop-filter': css('backdrop-filter: blur(1px)') || css('-webkit-backdrop-filter: blur(1px)'),
    'márgenes de la muesca (env)': css('padding: env(safe-area-inset-bottom)'),
    'campo de fecha nativo': fecha.type === 'date',
    'replaceChildren': typeof Element.prototype.replaceChildren === 'function',
    'ResizeObserver': typeof ResizeObserver === 'function',
    'descargar archivos (Blob + enlace)': typeof URL?.createObjectURL === 'function' && typeof Blob === 'function',
    'compartir archivos': compartirArchivos,
    'portapapeles': typeof navigator.clipboard?.writeText === 'function',
    'IndexedDB': 'indexedDB' in window,
    'visualViewport': Boolean(window.visualViewport),
  };
}

// espacios: [{ nombre, api|null, pendientes, rechazadas, gastos, ingresos }]
export async function recogerDiagnostico({ espacios, estadoTexto, errores }) {
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const modoInstalada = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

  let registro = null;
  let almacenamiento = null;
  try { registro = await navigator.serviceWorker?.getRegistration(); } catch { registro = null; }
  try { almacenamiento = await navigator.storage?.estimate?.(); } catch { almacenamiento = null; }
  let hayCache = false;
  try { hayCache = typeof caches !== 'undefined' && (await caches.keys()).length > 0; } catch { hayCache = false; }

  const filas = [];
  for (const e of espacios) {
    const r = { nombre: e.nombre, configurado: Boolean(e.api), pendientes: e.pendientes, rechazadas: e.rechazadas, gastos: e.gastos, ingresos: e.ingresos };
    if (e.api) {
      const inicio = performance.now();
      try {
        const respuesta = await e.api.configuracion();
        r.ok = Boolean(respuesta.ok);
        r.error = respuesta.ok ? null : respuesta.error;
        r.categorias = respuesta.config?.categoriasGasto?.length ?? 0;
        r.saldo = Boolean(respuesta.saldo);
      } catch (err) {
        r.ok = false;
        r.error = err?.name === 'ErrorDeRed' || err instanceof TypeError ? 'sin respuesta' : 'excepción';
      }
      r.ms = Math.round(performance.now() - inicio);
    }
    filas.push(r);
  }

  return {
    fecha: `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}`,
    zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent,
    idioma: navigator.language,
    modo: modoInstalada ? 'instalada' : 'navegador',
    pantalla: {
      ancho: window.innerWidth, alto: window.innerHeight, dpr: window.devicePixelRatio,
      pantallaAncho: window.screen?.width, pantallaAlto: window.screen?.height,
      orientacion: window.innerWidth > window.innerHeight ? 'horizontal' : 'vertical',
      esquema: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro',
      menosMovimiento: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      margenes: margenesSeguros(),
    },
    almacenamiento: {
      localStorage: localStorageSirve(),
      cache: hayCache,
      swSoportado: 'serviceWorker' in navigator,
      swRegistrado: Boolean(registro),
      swControla: Boolean(navigator.serviceWorker?.controller),
      swScope: registro?.scope,
      cuotaMB: almacenamiento?.quota ? Math.round(almacenamiento.quota / 1048576) : undefined,
      usadoKB: almacenamiento?.usage ? Math.round(almacenamiento.usage / 1024) : undefined,
      claves: (() => { try { return localStorage.length; } catch { return 0; } })(),
    },
    soporte: soporteDeFunciones(),
    espacios: filas,
    estado: estadoTexto,
    errores,
  };
}
