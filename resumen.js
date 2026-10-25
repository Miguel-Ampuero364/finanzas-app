import { el } from './dom.js';
import { icono } from './iconos.js';
import { formatMonto, formatCompacto } from './lib/money.js';
import { claveMes, claveMesDe, etiquetaMes, etiquetaCorta, parseFecha } from './lib/dates.js';
import { parsePeriodo, rangoPeriodo, periodoAnterior, contarMeses, opcionesPeriodo } from './lib/periodo.js';
import {
  filtrarFilas, ordenarFilas, resumenPeriodo, porCategoria, porBeneficiario, serieMensual,
  unirMovimientos, mesPodriaEstarIncompleto,
} from './lib/summary.js';
import { geometriaSerie } from './lib/charts.js';
import { normalizar } from './lib/suggest.js';
import { aCsv, nombreArchivo } from './lib/exportar.js';
import { nombresPersonas } from './lib/frecuentes.js';

const SVG = 'http://www.w3.org/2000/svg';
const POR_PAGINA = 15;
const MAX_CATEGORIAS = 7;
const MESES_SERIE = 12;
const bs = (n) => `Bs ${formatMonto(n)}`;
const conSigno = (n) => (n < 0 ? `−${bs(-n)}` : bs(n));

function svg(tag, attrs = {}, ...hijos) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const h of hijos.flat()) if (h) e.append(h);
  return e;
}

function descargar(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// obtener() -> { gastos, ingresos, config, espacio, hayDatosGuardados }; limite = filas que trae el puente.
export function iniciarResumen({ obtener, limite }) {
  const $ = (id) => document.getElementById(id);
  const hoyMes = () => claveMesDe(new Date());
  const inicial = () => ({ periodo: `mes:${hoyMes()}`, benef: '', cat: '', texto: '', orden: 'fecha', pagina: 1, todasCat: false });
  let S = inicial();
  let anchoSerie = 0;

  // ---- Contexto del período elegido ----
  function contexto() {
    const { gastos, ingresos, config, espacio, saldo } = obtener();
    const hoy = hoyMes();
    const meses = [...gastos, ...ingresos].map((f) => claveMes(f.fecha)).filter(Boolean);
    const elegido = parsePeriodo(S.periodo);
    if (!elegido) S.periodo = `mes:${hoy}`;
    const periodo = parsePeriodo(S.periodo);
    const opciones = opcionesPeriodo(hoy, periodo.tipo === 'mes' ? [...meses, periodo.mes] : meses);
    const primerMes = meses.length ? meses.reduce((a, b) => (a < b ? a : b)) : hoy;
    const rango = rangoPeriodo(periodo, hoy, primerMes);
    return {
      gastos, ingresos, config, espacio, saldo, hoy, periodo, opciones, rango,
      rangoAnt: periodoAnterior(periodo, hoy),
      rotulo: periodo.tipo === 'mes' ? etiquetaMes(periodo.mes) : periodo.tipo === 'ultimos' ? `Últimos ${periodo.n} meses` : 'Todo el historial',
      rotuloAnt: periodo.tipo === 'mes' ? (periodoAnterior(periodo, hoy) && etiquetaMes(periodoAnterior(periodo, hoy).desde)) : periodo.tipo === 'ultimos' ? `los ${periodo.n} meses anteriores` : '',
      presupuestos: config?.presupuestos ?? {},
      hayFiltros: Boolean(S.benef || S.cat || S.texto),
    };
  }

  const filtroTexto = (c) => ({ ...c.rango, beneficiario: S.benef, categoria: S.cat, texto: S.texto });

  // ---- Filtros ----
  function pintarFiltros(c) {
    const sel = $('f-periodo');
    sel.replaceChildren(...c.opciones.map((o) => el('option', { value: o.valor, selected: o.valor === S.periodo }, o.etiqueta)));
    sel.value = S.periodo;

    const nombres = nombresPersonas(c.config?.beneficiarios, c.gastos);
    const chips = $('f-personas');
    chips.hidden = nombres.length === 0;
    chips.replaceChildren(...['', ...nombres].map((n) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(normalizar(S.benef) === normalizar(n)),
        onclick: () => { S.benef = n; S.pagina = 1; pintarTodo({ anim: true }); },
      }, n || 'Todos')));

    const activos = $('f-activos');
    const quitar = (etiqueta, accion) => el('button', { type: 'button', class: 'etiqueta-activa', 'aria-label': `Quitar filtro ${etiqueta}`, onclick: accion }, etiqueta, icono('cerrar', 14));
    const lista = [];
    if (S.cat) lista.push(quitar(`Categoría: ${S.cat}`, () => { S.cat = ''; S.pagina = 1; pintarTodo({ anim: true }); }));
    if (S.texto) lista.push(quitar(`Búsqueda: ${S.texto}`, () => { S.texto = ''; $('f-texto').value = ''; S.pagina = 1; pintarTodo({ anim: false }); }));
    activos.hidden = lista.length === 0;
    activos.replaceChildren(...lista);
  }

  // ---- Saldo actual: todo el historial, no depende del período ni de los filtros ----
  function pintarSaldo(c) {
    const s = c.saldo;
    const seccion = $('res-saldo');
    seccion.hidden = !s;
    if (!s) return;
    seccion.replaceChildren(
      el('h2', { class: 'kpi-titulo' }, 'Saldo actual'),
      el('p', { class: `num cifra ${s.actual < 0 ? 'negativo' : 'positivo'}` }, conSigno(s.actual)),
      el('p', { class: 'nota num' }, `Saldo inicial ${bs(s.inicial)} + ingresos ${bs(s.ingresos)} − gastos ${bs(s.gastos)}`),
      el('p', { class: 'nota' }, 'Todo el historial: no cambia con el período ni con los filtros.'),
    );
  }

  // ---- Tarjeta de totales ----
  function chipDelta(delta, subeEsBueno) {
    if (delta === null) return null;
    if (delta === 0) return el('span', { class: 'delta' }, 'sin cambio');
    const bueno = (delta > 0) === subeEsBueno;
    return el('span', { class: `delta ${bueno ? 'bien' : 'mal'}`, 'aria-label': `${delta > 0 ? 'subió' : 'bajó'} ${Math.abs(delta)} por ciento` },
      icono(delta > 0 ? 'sube' : 'baja', 13), `${Math.abs(delta)}%`);
  }

  function pintarKpi(c) {
    const r = resumenPeriodo({ gastos: c.gastos, ingresos: c.ingresos, rango: c.rango, rangoAnterior: c.rangoAnt, beneficiario: S.benef, categoria: S.cat });
    const soloGastos = r.balance === null;
    const mayor = Math.max(r.ingresos ?? 0, r.gastos, 1);
    const fila = (nombre, valor, delta, subeEsBueno, clase) => el('div', { class: 'kpi-fila' },
      el('div', { class: 'kpi-linea' },
        el('span', { class: 'kpi-nombre' }, nombre),
        el('span', { class: 'num kpi-valor' }, bs(valor)),
        chipDelta(delta, subeEsBueno)),
      el('div', { class: 'pista' }, el('div', { class: `relleno ${clase}`, style: `--w:${((valor / mayor) * 100).toFixed(1)}%` })));
    const cifra = soloGastos ? r.gastos : r.balance;
    $('res-kpi').replaceChildren(
      el('h2', { class: 'kpi-titulo' }, soloGastos ? `Gastos · ${c.rotulo}` : `Balance · ${c.rotulo}`),
      el('p', { class: `num cifra ${soloGastos ? '' : cifra < 0 ? 'negativo' : 'positivo'}` }, soloGastos ? bs(cifra) : conSigno(cifra)),
      !soloGastos && fila('Ingresos', r.ingresos, r.delta.ingresos, true, 'ingreso'),
      fila('Gastos', r.gastos, r.delta.gastos, false, 'gasto'),
      r.anterior && c.rotuloAnt ? el('p', { class: 'nota' }, `Cambio frente a ${c.rotuloAnt}`) : null,
    );
  }

  // ---- Filas de barras (categorías y personas) ----
  function filaBarra({ nombre, valor, escala, presupuesto, porcentaje, activo, alPulsar, etiquetaAccion }) {
    const excede = presupuesto !== null && presupuesto !== undefined && valor > presupuesto;
    return el('li', {},
      el('button', { type: 'button', class: 'fila-barra', 'aria-pressed': String(activo), 'aria-label': `${etiquetaAccion} ${nombre}: ${bs(valor)}`, onclick: alPulsar },
        el('span', { class: 'fila-arriba' },
          el('span', { class: 'fila-nombre' }, nombre),
          el('span', { class: 'num fila-valor' }, bs(valor))),
        el('span', { class: 'pista' },
          el('span', { class: `relleno ${excede ? 'gasto' : 'marca'}`, style: `--w:${Math.min(100, (valor / escala) * 100).toFixed(1)}%` }),
          presupuesto ? el('span', { class: 'tope', style: `left:${Math.min(100, (presupuesto / escala) * 100).toFixed(1)}%`, 'aria-hidden': 'true' }) : null),
        presupuesto ? el('span', { class: `fila-pie ${excede ? 'excede' : ''}` }, `de ${bs(presupuesto)} · ${porcentaje}%`) : null));
  }

  function pintarCategorias(c) {
    const datos = porCategoria(filtrarFilas(c.gastos, { ...c.rango, beneficiario: S.benef }), c.presupuestos, contarMeses(c.rango));
    const visibles = S.todasCat ? datos : datos.slice(0, MAX_CATEGORIAS);
    const escala = Math.max(1, ...datos.map((d) => Math.max(d.gastado, d.presupuesto ?? 0)));
    $('res-cat').replaceChildren(
      el('h2', { id: 't-cat' }, 'Gastos por categoría'),
      datos.length === 0
        ? el('p', { class: 'vacio' }, 'Sin gastos en este período.')
        : el('ul', { class: 'barras' }, visibles.map((d) => filaBarra({
          nombre: d.categoria, valor: d.gastado, escala, presupuesto: d.presupuesto, porcentaje: d.porcentaje,
          activo: normalizar(S.cat) === normalizar(d.categoria), etiquetaAccion: 'Filtrar por',
          alPulsar: () => { S.cat = normalizar(S.cat) === normalizar(d.categoria) ? '' : d.categoria; S.pagina = 1; pintarTodo({ anim: false }); },
        }))),
      datos.length > MAX_CATEGORIAS
        ? el('button', { type: 'button', class: 'btn ancho-total', onclick: () => { S.todasCat = !S.todasCat; pintarCategorias(c); } },
          S.todasCat ? 'Ver menos' : `Ver todas (${datos.length})`)
        : null,
    );
  }

  function pintarPersonas(c) {
    const datos = porBeneficiario(filtrarFilas(c.gastos, { ...c.rango, categoria: S.cat })).filter((d) => d.total > 0);
    const seccion = $('res-ben');
    seccion.hidden = datos.length === 0;
    const escala = Math.max(1, ...datos.map((d) => d.total));
    seccion.replaceChildren(
      el('h2', { id: 't-ben' }, 'Gastos por persona'),
      el('ul', { class: 'barras' }, datos.map((d) => filaBarra({
        nombre: d.nombre, valor: d.total, escala, presupuesto: null, porcentaje: null,
        activo: normalizar(S.benef) === normalizar(d.nombre), etiquetaAccion: 'Filtrar por',
        alPulsar: () => { S.benef = normalizar(S.benef) === normalizar(d.nombre) ? '' : d.nombre; S.pagina = 1; pintarTodo({ anim: false }); },
      }))),
    );
  }

  // ---- Gráfico de 12 meses ----
  function pintarSerie(c) {
    const soloGastos = Boolean(S.benef || S.cat);
    const gastos = filtrarFilas(c.gastos, { beneficiario: S.benef, categoria: S.cat });
    // Tantos meses como historial haya, entre 6 y 12, para que el gráfico no se vea vacío.
    const primer = [...c.gastos, ...c.ingresos].map((f) => claveMes(f.fecha)).filter(Boolean).sort()[0] ?? c.hoy;
    const nMeses = Math.min(MESES_SERIE, Math.max(6, contarMeses({ desde: primer, hasta: c.hoy })));
    const serie = serieMensual(gastos, soloGastos ? [] : c.ingresos, c.hoy, nMeses);
    anchoSerie = $('res-serie').clientWidth;
    const ancho = Math.max(300, anchoSerie - 36);
    const alto = ancho > 560 ? 250 : 190;
    const g = geometriaSerie(serie, ancho, alto);
    const porMes = new Map(serie.map((s) => [s.mes, s]));
    const lectura = el('p', { class: 'lectura num', 'aria-live': 'polite' });
    const mostrar = (mes) => {
      const s = porMes.get(mes);
      lectura.replaceChildren(
        el('strong', {}, etiquetaMes(mes)),
        soloGastos ? null : ` · Ingresos ${bs(s.ingresos)}`,
        ` · Gastos ${bs(s.gastos)}`);
    };
    const mesInicial = c.periodo.tipo === 'mes' && porMes.has(c.periodo.mes) ? c.periodo.mes : serie[serie.length - 1].mes;
    mostrar(mesInicial);

    const enRango = (mes) => mes >= c.rango.desde && mes <= c.rango.hasta;
    const dibujo = svg('svg', { viewBox: `0 0 ${ancho} ${alto}`, width: '100%', role: 'group', 'aria-label': `Ingresos y gastos de los últimos ${nMeses} meses`, class: 'grafico' },
      g.ticks.map((t) => svg('g', {},
        svg('line', { x1: g.izq, x2: g.derecha, y1: t.y, y2: t.y, class: 'rejilla' }),
        (() => { const x = svg('text', { x: g.izq - 6, y: t.y + 3, class: 'eje', 'text-anchor': 'end' }); x.textContent = formatCompacto(t.valor); return x; })())),
      g.barras.filter((b) => !(soloGastos && b.tipo === 'ingresos')).map((b, i) => {
        const h = b.valor > 0 ? Math.max(b.h, 1.5) : 0;
        return svg('rect', { x: b.x, y: b.y + (b.h - h), width: b.w, height: h, rx: 2.5, class: `barra ${b.tipo === 'ingresos' ? 'ingreso' : 'gasto'}${enRango(b.mes) ? '' : ' tenue'}`, style: `--i:${i}` });
      }),
      g.grupos.map((gr) => {
        const t = svg('text', { x: gr.x + gr.ancho / 2, y: alto - 6, class: `eje mes${enRango(gr.mes) ? ' activo' : ''}`, 'text-anchor': 'middle' });
        t.textContent = etiquetaCorta(gr.mes);
        return t;
      }),
      g.grupos.map((gr) => {
        const s = porMes.get(gr.mes);
        const zona = svg('rect', { x: gr.x, y: 0, width: gr.ancho, height: alto, class: 'zona', tabindex: 0, role: 'button',
          'aria-label': `${etiquetaMes(gr.mes)}: ${soloGastos ? '' : `ingresos ${bs(s.ingresos)}, `}gastos ${bs(s.gastos)}. Ver este mes` });
        const elegir = () => { S.periodo = `mes:${gr.mes}`; S.pagina = 1; pintarTodo({ anim: true }); };
        zona.addEventListener('click', elegir);
        zona.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
        zona.addEventListener('pointerenter', () => mostrar(gr.mes));
        zona.addEventListener('focus', () => mostrar(gr.mes));
        return zona;
      }),
    );

    $('res-serie').replaceChildren(
      el('div', { class: 'serie-cabecera' },
        el('h2', { id: 't-serie' }, `Últimos ${nMeses} meses`),
        el('span', { class: 'leyenda' },
          soloGastos ? null : el('span', {}, el('i', { class: 'punto ingreso' }), 'Ingresos'),
          el('span', {}, el('i', { class: 'punto gasto' }), 'Gastos'))),
      dibujo,
      lectura,
    );
  }

  // ---- Movimientos ----
  function filasMov(c) {
    return ordenarFilas(filtrarFilas(unirMovimientos(c.gastos, c.ingresos), filtroTexto(c)), S.orden);
  }

  function fechaCorta(texto) {
    const p = parseFecha(texto);
    if (!p) return { dia: '–', mes: '' };
    const mes = etiquetaCorta(`${p.anio}-${String(p.mes).padStart(2, '0')}`);
    return { dia: String(p.dia), mes: p.anio === new Date().getFullYear() ? mes : `${mes} ${String(p.anio).slice(2)}` };
  }

  function pintarMov(c) {
    const filas = filasMov(c);
    const visibles = filas.slice(0, S.pagina * POR_PAGINA);
    $('mov-cuenta').textContent = filas.length === 1 ? '1 movimiento' : `${filas.length} movimientos`;
    $('lista-mov').replaceChildren(...(filas.length === 0
      ? [el('li', { class: 'vacio' }, c.hayFiltros ? 'Ningún movimiento coincide con los filtros.' : 'Sin movimientos en este período.')]
      : visibles.map((f) => {
        const fecha = fechaCorta(f.fecha);
        const m = Number(String(f.monto).replace(/\./g, '').replace(',', '.')) || 0;
        const detalle = [String(f.categoria ?? '').trim(), String(f.beneficiario ?? '').trim(), f.tipo === 'gasto' ? String(f.metodo ?? '').trim() : ''].filter(Boolean).join(' · ');
        return el('li', { class: 'mov-fila' },
          el('span', { class: 'mov-fecha num' }, el('b', {}, fecha.dia), fecha.mes),
          el('span', { class: 'mov-texto' },
            el('span', { class: 'mov-desc' }, String(f.descripcion ?? '').trim() || String(f.categoria ?? '').trim() || 'Sin descripción',
              f.pendiente ? el('em', { class: 'etiqueta-pend' }, 'Pendiente') : null),
            el('span', { class: 'mov-detalle' }, detalle)),
          el('span', { class: `num mov-monto ${f.tipo}` }, f.tipo === 'ingreso' ? `+${bs(m)}` : `−${bs(m)}`));
      })));
    const quedan = filas.length - visibles.length;
    const mas = $('mov-mas');
    mas.hidden = quedan <= 0;
    mas.textContent = `Ver más (${quedan})`;
  }

  // ---- Todo junto ----
  function pintarTodo({ anim = true } = {}) {
    const c = contexto();
    const hayDatos = c.gastos.length + c.ingresos.length > 0;
    $('res-vacio').hidden = hayDatos;
    $('res-rejilla').hidden = !hayDatos;
    $('btn-exportar').disabled = !hayDatos;
    const contenedor = $('vista-resumen');
    contenedor.classList.remove('anima');
    if (anim) { void contenedor.offsetWidth; contenedor.classList.add('anima'); }
    pintarFiltros(c);
    if (!hayDatos) return;
    pintarSaldo(c);
    pintarKpi(c);
    pintarCategorias(c);
    pintarPersonas(c);
    pintarSerie(c);
    pintarMov(c);
    $('res-aviso').textContent = mesPodriaEstarIncompleto(c.gastos, c.rango.desde, limite) || mesPodriaEstarIncompleto(c.ingresos, c.rango.desde, limite)
      ? 'La app solo trae los últimos movimientos de la hoja: los meses más antiguos pueden salir incompletos.' : '';
  }

  // ---- Eventos fijos ----
  const exportar = $('btn-exportar');
  exportar.replaceChildren(icono('descargar', 18), el('span', {}, 'Exportar'));
  $('f-periodo').addEventListener('change', (e) => { S.periodo = e.target.value; S.pagina = 1; pintarTodo({ anim: true }); });
  $('f-orden').addEventListener('change', (e) => { S.orden = e.target.value; S.pagina = 1; pintarMov(contexto()); });
  $('f-texto').addEventListener('input', (e) => { S.texto = e.target.value.trim(); S.pagina = 1; pintarFiltros(contexto()); pintarMov(contexto()); });
  $('mov-mas').addEventListener('click', () => { S.pagina += 1; pintarMov(contexto()); });
  exportar.addEventListener('click', () => {
    const c = contexto();
    const filas = filasMov(c);
    const rotulo = [c.rotulo, S.benef, S.cat, S.texto].filter(Boolean).join(' ');
    const nombre = nombreArchivo(c.espacio, rotulo);
    descargar(nombre, aCsv(filas));
    $('res-aviso').textContent = `Exportado: ${nombre} (${filas.length} movimientos)`;
  });
  document.querySelector('label.busca').prepend(icono('buscar', 18));
  // El gráfico se dibuja al ancho real de la tarjeta: si cambia (girar el celular, ventana), se redibuja.
  new ResizeObserver(() => {
    const ancho = $('res-serie').clientWidth;
    if (ancho > 0 && Math.abs(ancho - anchoSerie) > 24 && !$('vista-resumen').hidden) pintarSerie(contexto());
  }).observe($('res-serie'));

  return {
    pintar: (opciones) => pintarTodo({ anim: true, ...opciones }),
    reiniciar: () => { S = inicial(); $('f-texto').value = ''; $('f-orden').value = 'fecha'; },
  };
}
