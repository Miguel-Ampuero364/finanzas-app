import { crearApi, ErrorDeRed } from './lib/api.js';
import { normalizarTema, colorBarra } from './lib/tema.js';
import { crearCola, nuevoId, enviarPendientes, resultadoGuardado } from './lib/queue.js';
import { interpretarTexto } from './lib/parser.js';
import { sugerir, canonizar, normalizar } from './lib/suggest.js';
import { frecuentes, nombresPersonas } from './lib/frecuentes.js';
import { el, descargar } from './dom.js';
import { aCsv } from './lib/exportar.js';
import { informeDiagnostico } from './lib/diagnostico.js';
import { recogerDiagnostico } from './diagnostico.js';
import { icono } from './iconos.js';
import { iniciarResumen } from './resumen.js';
import { ajustarSaldo } from './lib/summary.js';
import { formatMonto, parseMonto, parseMontoTipeado } from './lib/money.js';
import { parseFecha } from './lib/dates.js';
import { filaNueva, conAgregado, conEdicion, conBorrado, esperadoDe } from './lib/movimientos.js';
import { fijosParaMostrar } from './lib/fijos.js';

const LIMITE_FILAS = 1000;
const NOMBRES = { miguel: 'Miguel', metalcorplex: 'METALCORPLEX' };
const ERRORES = {
  clave: 'La clave del puente no es correcta. Revísala en Ajustes.',
  categoria: 'Esa categoría ya no existe en la hoja.',
  fecha: 'Fecha inválida.',
  monto: 'Monto inválido.',
  tipo: 'Tipo inválido.',
  id: 'Identificador inválido.',
  interno: 'El puente tuvo un problema. Revisa la hoja.',
  cambio: 'La hoja cambió. Sincroniza y vuelve a intentar.',
  fila: 'Esa fila ya no existe en la hoja.',
  accion: 'El puente de este espacio es de una versión anterior y no sabe hacer eso. Hay que actualizarlo.',
};
const pad2 = (n) => String(n).padStart(2, '0');

// ---- Almacenamiento local, con respaldo en memoria ----
const memoria = new Map();
const almacen = {
  getItem(k) {
    try { return localStorage.getItem(k); } catch { return memoria.get(k) ?? null; }
  },
  setItem(k, v) {
    try { localStorage.setItem(k, v); } catch { memoria.set(k, v); }
  },
};
const leerJson = (k, defecto) => {
  try { return JSON.parse(almacen.getItem(k) ?? 'null') ?? defecto; } catch { return defecto; }
};
const guardarJson = (k, v) => almacen.setItem(k, JSON.stringify(v));

// Los últimos errores se guardan para el informe de diagnóstico.
const erroresRecientes = [];
const anotarError = (m) => { erroresRecientes.push(String(m ?? 'error').slice(0, 140)); if (erroresRecientes.length > 5) erroresRecientes.shift(); };
window.addEventListener('error', (e) => anotarError(e.message));
window.addEventListener('unhandledrejection', (e) => anotarError(e.reason?.message ?? e.reason));

// ---- Estado ----
// Un ícono por espacio: la dirección con ?espacio=metalcorplex abre directo en ese espacio.
function espacioInicial() {
  const pedido = new URLSearchParams(location.search).get('espacio');
  if (pedido === 'miguel' || pedido === 'metalcorplex') {
    almacen.setItem('espacio', pedido);
    return pedido;
  }
  return almacen.getItem('espacio') === 'metalcorplex' ? 'metalcorplex' : 'miguel';
}
const estado = {
  espacio: espacioInicial(),
  vista: 'registrar',
  config: null,
  saldo: null,
  filas: { gastos: [], ingresos: [] },
  deudas: [],
  fijos: { gastos: [], ingresos: [] },
  sinConexion: false,
};

const $ = (id) => document.getElementById(id);
const ajustes = (esp = estado.espacio) => leerJson(`ajustes:${esp}`, { url: '', token: '' });
const cola = () => crearCola(almacen, `cola:${estado.espacio}`);
const api = () => {
  const a = ajustes();
  return a.url && a.token ? crearApi({ url: a.url, token: a.token }) : null;
};

let fechaAuto = '';
let ultimaSync = 0;
function hoyIso() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
const isoAFecha = (iso) => iso.split('-').reverse().join('/');

// ---- Datos: puente con respaldo en el caché ----
function cargarCache() {
  estado.config = leerJson(`cache:${estado.espacio}:config`, null);
  estado.saldo = leerJson(`cache:${estado.espacio}:saldo`, null);
  estado.filas = leerJson(`cache:${estado.espacio}:filas`, { gastos: [], ingresos: [] });
  estado.deudas = leerJson(`cache:${estado.espacio}:deudas`, []);
  estado.fijos = leerJson(`cache:${estado.espacio}:fijos`, { gastos: [], ingresos: [] });
}

// Resultado de la última sincronización, para que guardar() pueda decir la verdad.
let ultimoEnvio = { enviados: 0, error: null };

async function sincronizar() {
  ultimaSync = Date.now();
  const esp = estado.espacio;
  const puente = api();
  if (!puente) {
    $('estado').textContent = 'Configura la conexión en Ajustes.';
    cargarCache();
    return pintar();
  }
  $('estado').textContent = 'Sincronizando…';
  const envio = await enviarPendientes(cola(), puente);
  ultimoEnvio = envio;
  try {
    // Los fijos son un extra: si el puente es viejo o falla, el resto sigue igual.
    const [cfg, filas, deudas, fijos] = await Promise.all([puente.configuracion(), puente.filas(LIMITE_FILAS), puente.deudas(), puente.fijos().catch(() => null)]);
    if (!cfg.ok) throw Object.assign(new Error(cfg.error), { codigo: cfg.error });
    // Si Miguel cambió de espacio mientras esperaba, estos datos son del otro: no se mezclan.
    guardarJson(`cache:${esp}:config`, cfg.config);
    if (cfg.saldo) guardarJson(`cache:${esp}:saldo`, cfg.saldo);
    if (filas.ok) guardarJson(`cache:${esp}:filas`, filas.rows);
    if (deudas.ok) guardarJson(`cache:${esp}:deudas`, deudas.debts);
    if (fijos?.ok) guardarJson(`cache:${esp}:fijos`, fijos.fijos);
    if (esp !== estado.espacio) return;
    cargarCache();
    estado.sinConexion = false;
    const quedan = cola().pendientes().length;
    $('estado').textContent = envio.error === 'clave' ? ERRORES.clave
      : envio.error === 'puente' ? 'El puente no respondió bien; se reintentará.'
      : quedan ? `${quedan} pendiente(s) de subir` : 'Al día';
  } catch (err) {
    if (esp !== estado.espacio) return;
    estado.sinConexion = err instanceof ErrorDeRed;
    cargarCache();
    $('estado').textContent = estado.sinConexion
      ? 'Sin conexión: se muestran los últimos datos guardados.'
      : (ERRORES[err.codigo] ?? 'No se pudo leer la hoja.');
  }
  pintar();
}

// ---- Pintar ----
function pintar() {
  document.querySelectorAll('[data-espacio]').forEach((b) => b.classList.toggle('activo', b.dataset.espacio === estado.espacio));
  document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('activo', b.dataset.vista === estado.vista));
  for (const v of ['registrar', 'resumen', 'deudas', 'ajustes']) $(`vista-${v}`).hidden = v !== estado.vista;
  pintarFormulario();
  pintarCola();
  document.querySelector('main').classList.toggle('ancho', estado.vista === 'resumen');
  if (estado.vista === 'resumen') resumen.pintar({ anim: animarResumen });
  animarResumen = false;
  pintarDeudas();
  // Ajustes se dibuja al entrar, no en cada sincronización: así no se borra lo que estás escribiendo.
  if (estado.vista === 'ajustes' && redibujarAjustes) { pintarAjustes(); redibujarAjustes = false; }
}

function pintarFormulario() {
  const esGasto = $('tipo').value === 'gasto';
  $('fila-gasto').hidden = !esGasto;
  const lista = estado.config ? (esGasto ? estado.config.categoriasGasto : estado.config.categoriasIngreso) : [];
  const actual = $('categoria').value;
  $('categoria').replaceChildren(...lista.map((c) => el('option', { value: c }, c.trim())));
  if (lista.includes(actual)) $('categoria').value = actual;
  // Si la hoja tiene su lista de beneficiarios, solo esos; si no, los que ya aparecen en los gastos.
  const deLaHoja = (estado.config?.beneficiarios ?? []).map((n) => String(n).trim()).filter(Boolean);
  const nombres = deLaHoja.length ? deLaHoja : nombresPersonas([], estado.filas.gastos);
  const elegido = normalizar($('beneficiario').value);
  $('benef-chips').replaceChildren(...nombres.map((n) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(elegido === normalizar(n)),
    onclick: () => { $('beneficiario').value = elegido === normalizar(n) ? '' : n; pintarFormulario(); },
  }, n)));
  $('beneficiario').hidden = deLaHoja.length > 0;
  pintarFrecuentes(esGasto);
  pintarFijos();
  document.querySelectorAll('[data-acceso="gasto"], [data-acceso="ingreso"]').forEach((b) => b.classList.toggle('activo', b.dataset.acceso === $('tipo').value));
}

function pintarFijos() {
  const items = fijosParaMostrar(estado.fijos, estado.filas, new Date());
  $('fijos-caja').hidden = items.length === 0;
  $('fijos').replaceChildren(...items.map((f) => el('button', {
    type: 'button', class: f.hecho ? 'chip fijo hecho' : 'chip fijo', onclick: () => usarFijo(f),
    'aria-label': `${f.concepto}, Bs ${formatMonto(f.monto)}${f.hecho ? ', ya registrado este mes' : ''}`,
  }, f.hecho ? icono('check', 14) : '', f.concepto, el('small', {}, formatMonto(f.monto)))));
}

// Un fijo llena el formulario (tipo, categoría, descripción, monto); solo queda revisar y guardar.
function usarFijo(f) {
  $('tipo').value = f.tipo;
  pintarFormulario();
  const lista = (f.tipo === 'gasto' ? estado.config?.categoriasGasto : estado.config?.categoriasIngreso) ?? [];
  const cat = canonizar(f.categoria, lista);
  if (cat) $('categoria').value = cat;
  $('descripcion').value = f.concepto;
  if (f.tipo === 'gasto') $('beneficiario').value = f.beneficiario;
  $('monto').value = String(f.monto).replace('.', ',');
  pintarFormulario();
  $('mensaje').textContent = f.hecho
    ? `"${f.concepto}" ya figura este mes. Si es otro pago, revisa y pulsa Guardar.`
    : `Listo: revisa "${f.concepto}" y pulsa Guardar.`;
  $('monto').focus();
  $('monto').select();
}

function pintarFrecuentes(esGasto) {
  const items = esGasto ? frecuentes(estado.filas.gastos, 6) : [];
  $('frecuentes-caja').hidden = items.length === 0;
  $('frecuentes').replaceChildren(...items.map((f) => el('button', { type: 'button', class: 'chip frecuente', onclick: () => usarFrecuente(f) },
    f.descripcion, el('small', {}, f.monto))));
}

// Un toque llena todo con el último registro igual; solo queda revisar el monto.
function usarFrecuente(f) {
  $('tipo').value = 'gasto';
  pintarFormulario();
  const cat = canonizar(f.categoria, estado.config?.categoriasGasto ?? []);
  if (cat) $('categoria').value = cat;
  $('descripcion').value = f.descripcion;
  $('beneficiario').value = f.beneficiario;
  if (f.metodo) $('metodo').value = f.metodo;
  $('monto').value = f.monto;
  pintarFormulario();
  $('mensaje').textContent = `Listo: revisa el monto de "${f.descripcion}" y pulsa Guardar.`;
  $('monto').focus();
  $('monto').select();
}

function pintarCola() {
  const items = cola().lista();
  $('lista-cola').replaceChildren(...items.map((e) =>
    el('li', {},
      `${e.tipo === 'gasto' ? 'Gasto' : 'Ingreso'} · ${e.descripcion || e.categoria.trim()} · Bs ${formatMonto(e.monto)}`,
      el('div', { class: e.rechazo ? 'rechazo' : 'pendiente' }, e.rechazo ? `Rechazado: ${ERRORES[e.rechazo] ?? e.rechazo}` : 'Pendiente de subir'),
      e.rechazo ? el('button', { type: 'button', class: 'chico', onclick: () => { cola().quitar(e.id); pintar(); } }, 'Quitar') : ''),
  ));
}

function filasConPendientes() {
  const extra = cola().pendientes().map((e) => ({
    fecha: e.fecha, categoria: e.categoria, beneficiario: e.beneficiario ?? '', descripcion: e.descripcion, monto: formatMonto(e.monto), metodo: e.metodo ?? '', tipo: e.tipo, pendiente: true,
  }));
  return {
    gastos: [...estado.filas.gastos, ...extra.filter((e) => e.tipo === 'gasto')],
    ingresos: [...estado.filas.ingresos, ...extra.filter((e) => e.tipo === 'ingreso')],
  };
}

let animarResumen = false;
let redibujarAjustes = false;
const resumen = iniciarResumen({
  limite: LIMITE_FILAS,
  alAbrir: (f) => abrirMovimiento(f),
  obtener: () => ({
    ...filasConPendientes(), config: estado.config, espacio: estado.espacio,
    saldo: ajustarSaldo(estado.saldo, cola().pendientes()),
  }),
});

function pintarDeudas() {
  const bloques = estado.deudas.map((d) => [
    el('h3', {}, d.tab),
    ...(d.filas.length === 0 ? [el('p', {}, 'Sin registros.')] : d.filas.map((f) => {
      const pendiente = d.editable && f.valores[d.estadoCol] !== d.pagado;
      return el('div', { class: 'tarjeta' },
        el('dl', {}, ...Object.entries(f.valores).flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v || '—')])),
        pendiente ? el('button', { type: 'button', class: 'chico', onclick: () => marcarDeuda(d, f) }, `Marcar como ${d.pagado}`) : '');
    })),
  ]);
  $('contenido-deudas').replaceChildren(...(bloques.length ? bloques.flat() : [el('p', {}, 'Sin datos todavía. Configura la conexión y sincroniza.')]));
}

async function marcarDeuda(d, f) {
  const puente = api();
  if (!puente) return;
  try {
    const r = await puente.marcarDeuda(d.tab, f.fila, f.valores);
    $('estado').textContent = r.ok ? 'Deuda actualizada.' : (ERRORES[r.error] ?? 'No se pudo actualizar.');
    if (r.ok) await sincronizar();
  } catch {
    $('estado').textContent = 'Necesitas conexión para marcar una deuda.';
  }
}

function pintarAjustes() {
  const bloque = (esp) => {
    const a = ajustes(esp);
    const url = el('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', value: a.url });
    const token = el('input', { type: 'password', placeholder: 'Clave secreta', value: a.token, autocomplete: 'off' });
    const salida = el('p', { class: 'estado' });
    return el('div', { class: 'tarjeta' },
      el('h3', {}, NOMBRES[esp]),
      el('label', {}, 'Dirección del puente', url),
      el('label', {}, 'Clave', token),
      el('button', { type: 'button', class: 'chico', onclick: async () => {
        guardarJson(`ajustes:${esp}`, { url: url.value.trim(), token: token.value.trim() });
        try {
          const r = await crearApi({ url: url.value.trim(), token: token.value.trim() }).configuracion();
          salida.textContent = r.ok ? 'Conexión correcta.' : (ERRORES[r.error] ?? 'El puente respondió con un error.');
        } catch { salida.textContent = 'No se pudo conectar.'; }
        if (esp === estado.espacio) sincronizar();
      } }, 'Guardar y probar'),
      salida);
  };
  $('contenido-ajustes').replaceChildren(bloque('miguel'), bloque('metalcorplex'));
}

// ---- Eventos ----
function alEscribirRapido() {
  const r = interpretarTexto($('texto-rapido').value);
  if (!r) return;
  $('tipo').value = r.tipo;
  pintarFormulario();
  $('monto').value = formatMonto(r.monto);
  $('descripcion').value = r.descripcion;
  if (r.metodo) $('metodo').value = r.metodo;
  if (r.tipo === 'gasto') {
    const s = sugerir(r.descripcion, estado.filas.gastos);
    const lista = estado.config?.categoriasGasto ?? [];
    const cat = s ? canonizar(s.categoria, lista) : null;
    if (cat) $('categoria').value = cat;
    if (s?.beneficiario) $('beneficiario').value = s.beneficiario;
  }
  pintarFormulario();
}

async function guardar(ev) {
  ev.preventDefault();
  const msg = $('mensaje');
  const monto = Math.round(parseMontoTipeado($('monto').value) * 100) / 100;
  if (!(monto > 0)) { msg.textContent = 'El monto debe ser mayor que 0.'; return; }
  if (monto > 10000000) { msg.textContent = 'El monto es demasiado grande (máximo Bs 10.000.000).'; return; }
  if (!$('categoria').value) { msg.textContent = 'Elige una categoría (sincroniza si la lista está vacía).'; return; }
  const esGasto = $('tipo').value === 'gasto';
  const id = nuevoId();
  const colaDeEste = cola();
  const faltaConexion = !api();
  colaDeEste.agregar({
    id, tipo: $('tipo').value, fecha: isoAFecha($('fecha').value), categoria: $('categoria').value,
    beneficiario: esGasto ? $('beneficiario').value.trim() : '', descripcion: $('descripcion').value.trim(),
    monto, metodo: esGasto ? $('metodo').value : '',
  });
  for (const id of ['texto-rapido', 'monto', 'descripcion', 'beneficiario']) $(id).value = '';
  $('tipo').value = 'gasto';
  fechaAuto = hoyIso();
  $('fecha').value = fechaAuto;
  msg.textContent = 'Guardado. Subiendo…';
  pintar();
  await subirRegistros();
  if (faltaConexion) {
    msg.textContent = 'Guardado en el celular. Falta configurar la conexión en Ajustes para subirlo a la hoja.';
    $('texto-rapido').focus({ preventScroll: true });
    return;
  }
  const resultado = resultadoGuardado(colaDeEste, id, ultimoEnvio);
  const rechazo = colaDeEste.lista().find((e) => e.id === id)?.rechazo;
  msg.textContent = {
    enviada: 'Guardado en la hoja.',
    rechazada: `La hoja no lo aceptó. ${ERRORES[rechazo] ?? rechazo} Quítalo de la lista de pendientes y vuelve a registrarlo.`,
    clave: ERRORES.clave,
    pendiente: 'Guardado en el celular; se subirá cuando haya conexión.',
  }[resultado];
  $('texto-rapido').focus({ preventScroll: true });
}

// ---- Subir lo recién guardado sin releer toda la hoja ----
// El puente contesta con la fila y el saldo nuevos: la app los aplica a su copia y listo.
function aplicarEnviada(esp, entrada, r) {
  if (r.fila) {
    const filas = leerJson(`cache:${esp}:filas`, { gastos: [], ingresos: [] });
    guardarJson(`cache:${esp}:filas`, conAgregado(filas, entrada.tipo, filaNueva(entrada, r.fila)));
  }
  if (r.saldo) guardarJson(`cache:${esp}:saldo`, r.saldo);
}

async function subirRegistros() {
  const esp = estado.espacio;
  const puente = api();
  if (!puente) return sincronizar();
  $('estado').textContent = 'Subiendo…';
  let faltaSaldo = false;
  const envio = await enviarPendientes(cola(), puente, (entrada, r) => {
    aplicarEnviada(esp, entrada, r);
    if (!r.saldo) faltaSaldo = true;
  });
  ultimoEnvio = envio;
  // Un puente viejo no devuelve el saldo: en ese caso se relee todo como antes.
  if (faltaSaldo) return sincronizar();
  if (esp !== estado.espacio) return;
  cargarCache();
  const quedan = cola().pendientes().length;
  $('estado').textContent = envio.error === 'clave' ? ERRORES.clave
    : envio.error === 'puente' ? 'El puente no respondió bien; se reintentará.'
    : envio.error === 'red' ? 'Sin conexión: se subirá cuando haya señal.'
    : quedan ? `${quedan} pendiente(s) de subir` : 'Al día';
  pintar();
}

// ---- Corregir o borrar un movimiento ----
let editando = null;
let confirmandoBorrado = false;

function llenarSelect(select, valores, actual, textoVacio = '') {
  const lista = [...valores];
  if (actual !== undefined && actual !== null && !lista.includes(actual)) lista.push(actual);
  select.replaceChildren(...lista.map((v) => el('option', { value: v }, v === '' ? textoVacio : String(v).trim())));
  select.value = actual ?? '';
}

function abrirMovimiento(f) {
  if (!estado.config) { $('estado').textContent = 'Sincroniza primero para poder editar.'; return; }
  editando = f;
  confirmandoBorrado = false;
  const esGasto = f.tipo === 'gasto';
  $('dlg-titulo').textContent = esGasto ? 'Editar gasto' : 'Editar ingreso';
  const p = parseFecha(f.fecha);
  $('m-fecha').value = p ? `${p.anio}-${pad2(p.mes)}-${pad2(p.dia)}` : '';
  const n = parseMonto(f.monto);
  $('m-monto').value = Number.isNaN(n) ? '' : String(n).replace('.', ',');
  $('m-descripcion').value = f.descripcion ?? '';
  llenarSelect($('m-categoria'), (esGasto ? estado.config.categoriasGasto : estado.config.categoriasIngreso) ?? [], f.categoria);
  $('m-gasto').hidden = !esGasto;
  const personas = (estado.config.beneficiarios ?? []).map((x) => String(x).trim()).filter(Boolean);
  llenarSelect($('m-beneficiario'), ['', ...personas], (f.beneficiario ?? '').trim(), 'Sin asignar');
  llenarSelect($('m-metodo'), ['QR', 'Efectivo', 'Tarjeta', 'Transferencia'], f.metodo || 'QR');
  $('m-mensaje').textContent = '';
  $('m-borrar').textContent = 'Borrar';
  $('dlg-mov').showModal();
}

function ocupadoMov(si) {
  for (const id of ['m-guardar', 'm-borrar', 'm-cancelar']) $(id).disabled = si;
}

// Manda el cambio al puente y, si lo acepta, lo aplica a la copia del teléfono.
async function ejecutarCambio(llamada, aplicar, exito) {
  const puente = api();
  const esp = estado.espacio;
  if (!puente) { $('m-mensaje').textContent = 'Configura la conexión en Ajustes.'; return; }
  ocupadoMov(true);
  $('m-mensaje').textContent = 'Guardando…';
  try {
    const r = await llamada(puente);
    if (r.ok) {
      const filas = aplicar(leerJson(`cache:${esp}:filas`, { gastos: [], ingresos: [] }));
      guardarJson(`cache:${esp}:filas`, filas);
      if (r.saldo) guardarJson(`cache:${esp}:saldo`, r.saldo);
      $('dlg-mov').close();
      if (esp === estado.espacio) {
        cargarCache();
        $('estado').textContent = exito;
        pintar();
      }
    } else if (r.error === 'cambio' || r.error === 'fila') {
      $('dlg-mov').close();
      $('estado').textContent = 'Esa fila cambió en la hoja. Sincronizando; vuelve a intentarlo.';
      sincronizar();
    } else {
      $('m-mensaje').textContent = ERRORES[r.error] ?? 'No se pudo guardar el cambio.';
    }
  } catch {
    $('m-mensaje').textContent = 'Necesitas conexión para corregir o borrar.';
  }
  ocupadoMov(false);
}

async function guardarMovimiento(ev) {
  ev.preventDefault();
  const f = editando;
  if (!f) return;
  const msg = $('m-mensaje');
  const monto = Math.round(parseMontoTipeado($('m-monto').value) * 100) / 100;
  if (!(monto > 0)) { msg.textContent = 'El monto debe ser mayor que 0.'; return; }
  if (monto > 10000000) { msg.textContent = 'El monto es demasiado grande (máximo Bs 10.000.000).'; return; }
  if (!$('m-fecha').value) { msg.textContent = 'Elige una fecha.'; return; }
  if (!$('m-categoria').value) { msg.textContent = 'Elige una categoría.'; return; }
  const esGasto = f.tipo === 'gasto';
  const entrada = {
    tipo: f.tipo, fecha: isoAFecha($('m-fecha').value), categoria: $('m-categoria').value,
    beneficiario: esGasto ? $('m-beneficiario').value : '', descripcion: $('m-descripcion').value.trim(),
    monto, metodo: esGasto ? $('m-metodo').value : '',
  };
  await ejecutarCambio(
    (puente) => puente.actualizar(f.tipo, f.fila, esperadoDe(f), entrada),
    (filas) => conEdicion(filas, f.tipo, f.fila, filaNueva(entrada, f.fila)),
    'Movimiento corregido.',
  );
}

async function borrarMovimiento() {
  const f = editando;
  if (!f) return;
  if (!confirmandoBorrado) {
    confirmandoBorrado = true;
    $('m-borrar').textContent = 'Toca otra vez para borrar';
    $('m-mensaje').textContent = 'Se borra la fila de tu hoja de Google. Esto no se puede deshacer desde la app.';
    return;
  }
  await ejecutarCambio(
    (puente) => puente.borrar(f.tipo, f.fila, esperadoDe(f)),
    (filas) => conBorrado(filas, f.tipo, f.fila),
    'Movimiento borrado.',
  );
}

// Accesos rápidos de la pantalla Registrar.
function usarAcceso(que) {
  if (que === 'gasto' || que === 'ingreso') {
    $('tipo').value = que;
    pintarFormulario();
    $('monto').focus();
    return;
  }
  document.querySelector(`nav [data-vista="${que}"]`).click();
}

// ---- Tema (claro, oscuro o el del teléfono) ----
function temaGuardado() {
  try { return normalizarTema(localStorage.getItem('tema')); } catch { return 'auto'; }
}

function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'auto') delete raiz.dataset.tema; else raiz.dataset.tema = tema;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.content = tema === 'auto' ? colorBarra('auto', m.media.includes('dark')) : colorBarra(tema, false);
  });
  document.querySelectorAll('#temas [data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === tema)));
}

function elegirTema(tema) {
  try { localStorage.setItem('tema', tema); } catch { /* sin almacenamiento: vale solo hasta cerrar */ }
  aplicarTema(tema);
}

// ---- Diagnóstico del teléfono ----
let informeTexto = '';

async function ejecutarDiagnostico() {
  const boton = $('btn-diagnostico');
  boton.disabled = true;
  $('msg-diagnostico').textContent = 'Revisando… puede tardar unos segundos.';
  try {
    const espacios = ['miguel', 'metalcorplex'].map((nombre) => {
      const a = ajustes(nombre);
      const c = crearCola(almacen, `cola:${nombre}`);
      const filas = leerJson(`cache:${nombre}:filas`, { gastos: [], ingresos: [] });
      return {
        nombre: NOMBRES[nombre],
        api: a.url && a.token ? crearApi({ url: a.url, token: a.token }) : null,
        pendientes: c.pendientes().length,
        rechazadas: c.lista().filter((e) => e.rechazo).length,
        gastos: filas.gastos.length,
        ingresos: filas.ingresos.length,
      };
    });
    informeTexto = informeDiagnostico(await recogerDiagnostico({ espacios, estadoTexto: $('estado').textContent, errores: erroresRecientes }));
    $('informe').textContent = informeTexto;
    $('informe').hidden = false;
    $('acciones-informe').hidden = false;
    $('msg-diagnostico').textContent = 'Listo. Toca "Copiar informe" y pégalo en el chat.';
  } catch (err) {
    $('msg-diagnostico').textContent = `No se pudo armar el informe: ${err?.message ?? 'error desconocido'}`;
  }
  boton.disabled = false;
}

async function copiarInforme() {
  try {
    await navigator.clipboard.writeText(informeTexto);
    $('msg-diagnostico').textContent = 'Copiado. Pégalo en el chat.';
  } catch {
    const rango = document.createRange();
    rango.selectNodeContents($('informe'));
    const seleccion = getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    $('msg-diagnostico').textContent = 'No pude copiarlo solo: el texto quedó seleccionado. Mantén pulsado y elige Copiar.';
  }
}

function probarDescarga() {
  descargar('prueba-diagnostico.csv', aCsv([{ tipo: 'gasto', fecha: '25/10/2026', categoria: 'Prueba', beneficiario: 'Yo', descripcion: 'Archivo de prueba', monto: '1,00', metodo: 'QR' }]));
  $('msg-diagnostico').textContent = 'Intenté descargar "prueba-diagnostico.csv". Dime si se abrió, se guardó o no pasó nada.';
}

function iniciar() {
  fechaAuto = hoyIso();
  $('fecha').value = fechaAuto;
  const iconosNav = { registrar: 'mas', resumen: 'grafico', deudas: 'lista', ajustes: 'ajustes' };
  document.querySelectorAll('nav [data-vista]').forEach((b) => b.prepend(icono(iconosNav[b.dataset.vista], 22)));
  document.querySelectorAll('[data-espacio]').forEach((b) => b.addEventListener('click', () => {
    estado.espacio = b.dataset.espacio;
    almacen.setItem('espacio', estado.espacio);
    resumen.reiniciar();
    cargarCache();
    pintar();
    sincronizar();
  }));
  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    estado.vista = b.dataset.vista;
    animarResumen = true;
    redibujarAjustes = true;
    pintar();
    if (estado.vista === 'registrar') $('texto-rapido').focus({ preventScroll: true });
  }));
  document.querySelectorAll('.acceso-icono').forEach((c) => c.append(icono(c.dataset.icono, 22)));
  document.querySelectorAll('[data-acceso]').forEach((b) => b.addEventListener('click', () => usarAcceso(b.dataset.acceso)));
  $('form-mov').addEventListener('submit', guardarMovimiento);
  $('m-borrar').addEventListener('click', borrarMovimiento);
  $('m-cancelar').addEventListener('click', () => $('dlg-mov').close());
  $('dlg-mov').addEventListener('click', (e) => { if (e.target === $('dlg-mov')) $('dlg-mov').close(); });
  $('texto-rapido').addEventListener('input', alEscribirRapido);
  $('tipo').addEventListener('change', pintarFormulario);
  $('form-registro').addEventListener('submit', guardar);
  aplicarTema(temaGuardado());
  document.querySelectorAll('#temas [data-tema]').forEach((b) => b.addEventListener('click', () => elegirTema(b.dataset.tema)));
  $('btn-diagnostico').addEventListener('click', ejecutarDiagnostico);
  $('btn-copiar').addEventListener('click', copiarInforme);
  $('btn-probar-descarga').addEventListener('click', probarDescarga);
  window.addEventListener('online', sincronizar);
  // Si dejas la app abierta de un día para otro, la fecha se actualiza sola (salvo que la hayas cambiado a mano).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const hoy = hoyIso();
    if ($('fecha').value === fechaAuto && hoy !== fechaAuto) {
      $('fecha').value = hoy;
      fechaAuto = hoy;
    }
    resumen.alVolver();
    if (Date.now() - ultimaSync > 60000) sincronizar();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  cargarCache();
  sincronizar();
  if (estado.vista === 'registrar') $('texto-rapido').focus({ preventScroll: true });
}
iniciar();
