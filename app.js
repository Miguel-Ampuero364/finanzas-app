import { crearApi, ErrorDeRed } from './lib/api.js';
import { crearCola, nuevoId, enviarPendientes, resultadoGuardado } from './lib/queue.js';
import { interpretarTexto } from './lib/parser.js';
import { sugerir, canonizar, normalizar } from './lib/suggest.js';
import { frecuentes, nombresPersonas } from './lib/frecuentes.js';
import { el } from './dom.js';
import { icono } from './iconos.js';
import { iniciarResumen } from './resumen.js';
import { ajustarSaldo } from './lib/summary.js';
import { formatMonto, parseMontoTipeado } from './lib/money.js';

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
};

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
}

// Resultado de la última sincronización, para que guardar() pueda decir la verdad.
let ultimoEnvio = { enviados: 0, error: null };

async function sincronizar() {
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
    const [cfg, filas, deudas] = await Promise.all([puente.configuracion(), puente.filas(LIMITE_FILAS), puente.deudas()]);
    if (!cfg.ok) throw Object.assign(new Error(cfg.error), { codigo: cfg.error });
    // Si Miguel cambió de espacio mientras esperaba, estos datos son del otro: no se mezclan.
    guardarJson(`cache:${esp}:config`, cfg.config);
    if (cfg.saldo) guardarJson(`cache:${esp}:saldo`, cfg.saldo);
    if (filas.ok) guardarJson(`cache:${esp}:filas`, filas.rows);
    if (deudas.ok) guardarJson(`cache:${esp}:deudas`, deudas.debts);
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
  if (estado.vista === 'ajustes') pintarAjustes();
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
const resumen = iniciarResumen({
  limite: LIMITE_FILAS,
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
  if (!$('categoria').value) { msg.textContent = 'Elige una categoría (sincroniza si la lista está vacía).'; return; }
  const esGasto = $('tipo').value === 'gasto';
  const id = nuevoId();
  cola().agregar({
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
  await sincronizar();
  const resultado = resultadoGuardado(cola(), id, ultimoEnvio);
  const rechazo = cola().lista().find((e) => e.id === id)?.rechazo;
  msg.textContent = {
    enviada: 'Guardado en la hoja.',
    rechazada: `La hoja no lo aceptó. ${ERRORES[rechazo] ?? rechazo} Quítalo de la lista de pendientes y vuelve a registrarlo.`,
    clave: ERRORES.clave,
    pendiente: 'Guardado en el celular; se subirá cuando haya conexión.',
  }[resultado];
  $('texto-rapido').focus({ preventScroll: true });
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
    pintar();
    if (estado.vista === 'registrar') $('texto-rapido').focus({ preventScroll: true });
  }));
  $('texto-rapido').addEventListener('input', alEscribirRapido);
  $('tipo').addEventListener('change', pintarFormulario);
  $('form-registro').addEventListener('submit', guardar);
  window.addEventListener('online', sincronizar);
  // Si dejas la app abierta de un día para otro, la fecha se actualiza sola (salvo que la hayas cambiado a mano).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const hoy = hoyIso();
    if ($('fecha').value === fechaAuto && hoy !== fechaAuto) {
      $('fecha').value = hoy;
      fechaAuto = hoy;
    }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  cargarCache();
  sincronizar();
  if (estado.vista === 'registrar') $('texto-rapido').focus({ preventScroll: true });
}
iniciar();
