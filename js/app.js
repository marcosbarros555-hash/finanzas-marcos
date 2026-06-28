// ============================================================
// Finanzas · Marcos — app principal
// ============================================================
import { configOK, sb, sesionActual, enviarMagicLink, cerrarSesion, onAuthChange,
         cargarTodo, guardarAjustes, agregarMovimiento, actualizarMovimiento, borrarMovimiento,
         actualizarPosicionIOL, actualizarPosicionCrypto, actualizarMeta, insertarMeta, importarSeed } from './db.js';
import { SEED } from './seed.js';
import { preciosCedears, preciosCrypto, cclDelDia } from './precios.js';
import { fmtARS, fmtUSD, fmtNum, fmtPct, signo, hoyISO, mesKey, mesActualKey,
         nombreMes, ultimosMeses, fechaCorta, esc, donutSVG, barrasSVG } from './utils.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');

const CAT_EGRESO = [
  { c: 'Alquiler + expensas', e: '🏠' }, { c: 'Comida', e: '🛒' }, { c: 'Uber / Transporte', e: '🚗' },
  { c: 'Internet', e: '📶' }, { c: 'Luz', e: '💡' }, { c: 'Gas', e: '🔥' },
  { c: 'Cuota / transferencia', e: '📱' }, { c: 'Cuota compu', e: '💻' }, { c: 'Suscripciones', e: '📲' },
  { c: 'Ropa', e: '👕' }, { c: 'Insumos / equipamiento', e: '🩺' }, { c: 'Inversión', e: '📈' },
  { c: 'Otro gasto', e: '📦' },
];
const CAT_INGRESO = [
  { c: 'Cobrado de pacientes', e: '🩺' }, { c: 'Sueldo', e: '🏦' },
  { c: 'Domicilios hechos', e: '🛵' }, { c: 'Domicilios cobrados', e: '🚶' },
  { c: 'Sesiones (producción)', e: '📋' }, { c: 'Otro ingreso', e: '➕' },
];
const METAS_BASE = ['emergencia', 'consultorio', 'viaje', 'independencia'];
const esDomicilioHecho = (c) => c === 'Domicilios hechos' || c === 'Domicilios (producción)';
const EMOJI = {};
[...CAT_EGRESO, ...CAT_INGRESO].forEach((x) => (EMOJI[x.c] = x.e));
// alias para movimientos viejos previos a los renames
EMOJI['Cuota celular'] = '📱';
EMOJI['Domicilios'] = '🚶';
EMOJI['Domicilios (producción)'] = '🛵';

const ICONS = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  historial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
  portfolio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 4"/></svg>',
  metas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const S = {
  session: null,
  datos: { ajustes: null, iol: [], crypto: [], movimientos: [], metas: [] },
  precios: {},        // ticker_yahoo -> { precio, cierreAnterior }
  cryptoPx: {},       // 'BTC' -> precio USD
  ccl: null,
  cclFuente: '',
  preciosAl: null,
  tab: 'inicio',
};

// ---------------- helpers UI ----------------
let toastTimer;
function toast(msg, ok = true) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2600);
}

const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

// ---------------- cálculos ----------------
function calcIOL() {
  let val = 0, costo = 0, completo = true;
  const filas = S.datos.iol.map((p) => {
    const px = p.ticker_yahoo ? (S.precios[p.ticker_yahoo]?.precio ?? null) : (p.precio_manual ?? null);
    const valorizado = px != null ? p.cantidad * px : null;
    const c = p.cantidad * p.ppc;
    if (valorizado == null) completo = false; else val += valorizado;
    costo += c;
    return { ...p, px, valorizado, costo: c,
      pnl: valorizado != null ? valorizado - c : null,
      pnlPct: valorizado != null && c > 0 ? ((valorizado - c) / c) * 100 : null };
  });
  return { filas, total: val, costo, pnl: val - costo, pnlPct: costo > 0 ? ((val - costo) / costo) * 100 : null, completo };
}

function calcCrypto() {
  let val = 0, costo = 0, completo = true;
  const filas = S.datos.crypto.map((p) => {
    const px = S.cryptoPx[p.simbolo] ?? null;
    const valorizado = px != null ? p.cantidad * px : null;
    const c = p.cantidad * p.precio_compra_usd;
    if (valorizado == null) completo = false; else val += valorizado;
    costo += c;
    return { ...p, px, valorizado, costo: c,
      pnl: valorizado != null ? valorizado - c : null,
      pnlPct: valorizado != null && c > 0 ? ((valorizado - c) / c) * 100 : null };
  });
  return { filas, total: val, costo, pnl: val - costo, pnlPct: costo > 0 ? ((val - costo) / costo) * 100 : null, completo };
}

function calcPatrimonio(iol, crypto) {
  const efectivo = S.datos.ajustes?.efectivo_usd ?? 0;
  if (!S.ccl) return { ars: null, usd: null, efectivo };
  const ars = iol.total + crypto.total * S.ccl + efectivo * S.ccl;
  return { ars, usd: ars / S.ccl, efectivo };
}

// Resumen de un mes: { ingresos, gastos, invertido, sesionesMonto, sesionesCant, cobrado, excedente }
function resumenMes(key) {
  const movs = S.datos.movimientos.filter((m) => mesKey(m.fecha) === key);
  let ingresos = 0, gastos = 0, invertido = 0, sesionesMonto = 0, sesionesCant = 0,
      domiMonto = 0, domiCant = 0, cobrado = 0;
  for (const m of movs) {
    if (m.tipo === 'ingreso') {
      ingresos += m.monto;
      if (m.categoria === 'Cobrado de pacientes') cobrado += m.monto;
    } else if (m.tipo === 'egreso') {
      if (m.categoria === 'Inversión') invertido += m.monto; else gastos += m.monto;
    } else if (m.tipo === 'sesiones') {
      if (m.categoria === 'Domicilios hechos' || m.categoria === 'Domicilios (producción)') {
        domiMonto += m.monto;
        domiCant += m.cantidad || 0;
      } else {
        sesionesMonto += m.monto;
        sesionesCant += m.cantidad || 0;
      }
    }
  }
  return { ingresos, gastos, invertido, sesionesMonto, sesionesCant, domiMonto, domiCant, cobrado,
           excedente: ingresos - gastos - invertido, movs };
}

function promedio3m(campo) {
  const meses = ultimosMeses(4).slice(0, 3); // 3 meses previos completos... incluye actual si hay datos
  const vals = meses.map((k) => resumenMes(k)[campo]).filter((v) => v > 0);
  if (!vals.length) {
    const actual = resumenMes(mesActualKey())[campo];
    return actual > 0 ? actual : 0;
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ---------------- precios ----------------
async function refrescarPrecios(avisar = false) {
  const tareas = [];
  tareas.push(
    cclDelDia().then((r) => { S.ccl = r.ccl; S.cclFuente = r.fuente; }).catch(() => {})
  );
  const tickers = S.datos.iol.filter((p) => p.ticker_yahoo).map((p) => p.ticker_yahoo);
  tareas.push(
    preciosCedears(tickers).then((p) => { S.precios = p; }).catch(() => {})
  );
  const simbolos = S.datos.crypto.map((p) => p.simbolo);
  tareas.push(
    preciosCrypto(simbolos).then((p) => { S.cryptoPx = p; }).catch(() => {})
  );
  await Promise.all(tareas);
  S.preciosAl = new Date();
  render();
  if (avisar) toast('Precios actualizados');
}

// ============================================================
// RENDER
// ============================================================
function render() {
  if (!configOK) return renderSetup();
  if (!S.session) return renderLogin();
  app.innerHTML = `
    <div class="shell">
      <nav class="tabbar">
        ${tabBtn('inicio', 'Inicio')}
        ${tabBtn('historial', 'Historial')}
        <button class="fab" id="fab" aria-label="Cargar movimiento">${ICONS.mas}</button>
        ${tabBtn('portfolio', 'Portfolio')}
        ${tabBtn('metas', 'Metas')}
      </nav>
      <div class="col-derecha">
        <header class="top">
          <div class="titulo">Finanzas <span>· ${esc(nombreMes(mesActualKey(), true))}</span></div>
          <div class="acciones">
            <button class="btn btn-chico btn-fantasma" id="btn-refrescar" title="Actualizar precios">↻ Precios</button>
            <button class="btn btn-chico btn-fantasma" id="btn-ajustes" title="Ajustes">⚙</button>
            <button class="btn btn-chico btn-fantasma" id="btn-salir" title="Cerrar sesión">Salir</button>
          </div>
        </header>
        <main id="vista"></main>
      </div>
    </div>
    <div class="backdrop" id="backdrop"></div>
    <div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>
  `;
  $('#fab').onclick = () => abrirCarga();
  $('#btn-refrescar').onclick = () => refrescarPrecios(true);
  $('#btn-ajustes').onclick = () => abrirAjustes();
  $('#btn-salir').onclick = async () => { await cerrarSesion(); };
  $('#backdrop').onclick = cerrarSheet;
  document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; render(); }));

  const vista = $('#vista');
  if (S.tab === 'inicio') vista.innerHTML = vInicio();
  if (S.tab === 'historial') vista.innerHTML = vHistorial();
  if (S.tab === 'portfolio') vista.innerHTML = vPortfolio();
  if (S.tab === 'metas') vista.innerHTML = vMetas();
  postRender(vista);
}

const tabBtn = (id, label) =>
  `<button class="tab ${S.tab === id ? 'activo' : ''}" data-tab="${id}">${ICONS[id]}<span>${label}</span></button>`;

// ---------------- Vista: Inicio ----------------
function vInicio() {
  const iol = calcIOL(), cr = calcCrypto();
  const pat = calcPatrimonio(iol, cr);
  const r = resumenMes(mesActualKey());
  const totalFlujo = r.ingresos + r.gastos + r.invertido;
  const pctIn = totalFlujo > 0 ? (r.ingresos / totalFlujo) * 100 : 0;
  const pctEg = totalFlujo > 0 ? ((r.gastos + r.invertido) / totalFlujo) * 100 : 0;
  const aCobrar = r.sesionesMonto - r.cobrado;
  const ult = S.datos.movimientos.slice(0, 6);
  const sinDatos = !S.datos.iol.length && !S.datos.crypto.length;

  const pendientes = S.datos.movimientos.filter((m) => esDomicilioHecho(m.categoria));
  const pendienteTotal = pendientes.reduce((a, m) => a + m.monto, 0);
  const pendienteCant = pendientes.reduce((a, m) => a + (m.cantidad || 0), 0);

  const segs = [
    { valor: iol.total, color: 'var(--accent-text)', label: 'CEDEARs (IOL)' },
    { valor: cr.total * (S.ccl || 0), color: 'var(--pos)', label: 'Cripto (Binance)' },
    { valor: pat.efectivo * (S.ccl || 0), color: 'var(--muted)', label: 'Efectivo USD' },
  ];

  return `
    ${sinDatos ? `<div class="card"><h2>Primera vez</h2>
      <p class="muted s" style="margin:0 0 12px">Tu portfolio todavía está vacío. Importá tus posiciones de IOL y Binance, el efectivo y las metas con un click.</p>
      <button class="btn btn-primario" id="btn-seed">Cargar mis datos iniciales</button></div>` : ''}

    <div class="grid-2">
      <div class="card">
        <h2>Patrimonio total</h2>
        <div class="metric-grande num">${fmtARS(pat.ars)}</div>
        <div class="metric-sub num">${fmtUSD(pat.usd)} · CCL ${S.ccl ? fmtARS(S.ccl) : '—'} <span class="s">(${esc(S.cclFuente || 'sin fuente')})</span></div>
        <div class="patrimonio-cuerpo" style="margin-top:14px">
          ${donutSVG(segs)}
          <div class="leyenda">
            ${segs.map((s) => `<div class="item"><span class="punto" style="background:${s.color}"></span>${s.label}<b class="num" style="margin-left:auto">${fmtARS(s.valor)}</b></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Flujo de ${esc(nombreMes(mesActualKey(), true).toLowerCase())}</h2>
        <div class="flujo-barra">
          <div class="seg-in" style="width:${pctIn}%"></div>
          <div class="seg-eg" style="width:${pctEg}%"></div>
        </div>
        <div class="flujo-tot">
          <span>Entró<br><b class="pos num">${fmtARS(r.ingresos)}</b></span>
          <span>Gastos<br><b class="neg num">${fmtARS(r.gastos)}</b></span>
          <span>Invertido<br><b class="num" style="color:var(--accent-text)">${fmtARS(r.invertido)}</b></span>
          <span>Queda<br><b class="num ${signo(r.excedente)}">${fmtARS(r.excedente)}</b></span>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Producción del mes</h2>
      <div class="fila-metricas">
        <div class="mini-metric"><div class="lbl">Sesiones</div><div class="val num">${fmtNum(r.sesionesCant)} · ${fmtARS(r.sesionesMonto)}</div></div>
        <div class="mini-metric"><div class="lbl">Domicilios hechos</div><div class="val num">${fmtNum(r.domiCant)} · ${fmtARS(r.domiMonto)}</div></div>
        <div class="mini-metric"><div class="lbl">Ya cobrado de pacientes</div><div class="val num">${fmtARS(r.cobrado)}</div></div>
        <div class="mini-metric"><div class="lbl">A cobrar a fin de mes</div><div class="val num ${signo(aCobrar)}">${fmtARS(Math.max(aCobrar, 0))}</div></div>
      </div>
    </div>

    ${pendientes.length ? `
    <div class="card">
      <h2>Pendiente de cobro · domicilios
        <span class="s muted num" style="text-transform:none;letter-spacing:0;font-weight:600">${fmtNum(pendienteCant)} · ${fmtARS(pendienteTotal)}</span></h2>
      <div class="lista-mov">${pendientes.map(filaPendiente).join('')}</div>
      <p class="muted s" style="margin:10px 0 0">Cuando te transfieran, tocá <b>Cobrado</b> y pasa solo a ingresos.</p>
    </div>` : ''}

    <div class="card">
      <h2>Últimos movimientos <button class="btn btn-chico btn-fantasma solo-mobile" id="btn-cargar-2">+ Cargar</button></h2>
      ${ult.length ? `<div class="lista-mov">${ult.map(filaMov).join('')}</div>`
        : `<div class="vacio">Todavía no cargaste movimientos este mes.<br>Tocá el botón <b>+</b> para registrar el primero.</div>`}
    </div>
  `;
}

function filaMov(m) {
  const esIngreso = m.tipo === 'ingreso';
  const esSesion = m.tipo === 'sesiones';
  const pref = esIngreso ? '+' : esSesion ? '' : '−';
  const cls = esIngreso ? 'pos' : esSesion ? 'muted' : 'neg';
  const det = [fechaCorta(m.fecha), m.cantidad ? `${fmtNum(m.cantidad)}×` : '', m.descripcion].filter(Boolean).join(' · ');
  return `<div class="mov">
    <div class="icono">${EMOJI[m.categoria] || '•'}</div>
    <div class="cuerpo"><div class="cat">${esc(m.categoria)}</div><div class="det">${esc(det)}</div></div>
    <div class="monto num ${cls}">${pref}${fmtARS(m.monto)}</div>
    <button class="borrar" data-borrar="${m.id}" title="Borrar" aria-label="Borrar movimiento">✕</button>
  </div>`;
}

function filaPendiente(m) {
  const det = [fechaCorta(m.fecha), m.cantidad ? `${fmtNum(m.cantidad)}×` : '', m.descripcion].filter(Boolean).join(' · ');
  return `<div class="mov">
    <div class="icono">${EMOJI[m.categoria] || '🛵'}</div>
    <div class="cuerpo"><div class="cat">Domicilios hechos</div><div class="det">${esc(det)}</div></div>
    <div class="monto num">${fmtARS(m.monto)}</div>
    <button class="btn btn-chico btn-fantasma" data-cobrar="${m.id}">Cobrado</button>
    <button class="borrar" data-borrar="${m.id}" title="Borrar" aria-label="Borrar movimiento">✕</button>
  </div>`;
}

// ---------------- Vista: Historial ----------------
function vHistorial() {
  const meses = ultimosMeses(12);
  const datos = meses.map((k) => ({ key: k, mes: nombreMes(k), ...resumenMes(k) }));
  const conDatos = datos.filter((d) => d.ingresos || d.gastos || d.invertido);

  return `
    <div class="card">
      <h2>Ingresos vs gastos — últimos 12 meses</h2>
      ${barrasSVG(datos.map((d) => ({ mes: d.mes, ingresos: d.ingresos, egresos: d.gastos + d.invertido })))}
      <div class="chart-leyenda">
        <span><span class="punto" style="background:var(--pos)"></span>Ingresos</span>
        <span><span class="punto" style="background:var(--neg)"></span>Gastos + inversión</span>
      </div>
    </div>
    <div class="card">
      <h2>Detalle mes a mes</h2>
      ${conDatos.length ? conDatos.slice().reverse().map((d) => `
        <div class="hist-mes">
          <span class="mes">${esc(nombreMes(d.key, true))}</span>
          <span class="dato">Entró <b class="pos num">${fmtARS(d.ingresos)}</b></span>
          <span class="dato">Gastos <b class="neg num">${fmtARS(d.gastos)}</b></span>
          <span class="dato">Invertido <b class="num">${fmtARS(d.invertido)}</b></span>
          <span class="dato">Excedente <b class="num ${signo(d.excedente)}">${fmtARS(d.excedente)}</b></span>
        </div>`).join('')
      : `<div class="vacio">El historial se va a ir armando solo a medida que cargues movimientos.</div>`}
    </div>
  `;
}

// ---------------- Vista: Portfolio ----------------
function vPortfolio() {
  const iol = calcIOL(), cr = calcCrypto();
  const pat = calcPatrimonio(iol, cr);
  const al = S.preciosAl ? S.preciosAl.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : null;

  return `
    <div class="card">
      <h2>Resumen ${al ? `<span class="s muted" style="text-transform:none;letter-spacing:0">precios de las ${al}</span>` : ''}</h2>
      <div class="fila-metricas">
        <div class="mini-metric"><div class="lbl">IOL · CEDEARs</div><div class="val num">${fmtARS(iol.total)}</div>
          <div class="s num ${signo(iol.pnl)}">${fmtARS(iol.pnl)} (${fmtPct(iol.pnlPct)})</div></div>
        <div class="mini-metric"><div class="lbl">Binance · Cripto</div><div class="val num">${fmtUSD(cr.total, true)}</div>
          <div class="s num ${signo(cr.pnl)}">${fmtUSD(cr.pnl, true)} (${fmtPct(cr.pnlPct)})</div></div>
        <div class="mini-metric"><div class="lbl">Efectivo</div><div class="val num">${fmtUSD(pat.efectivo)}</div>
          <div class="s muted">editable en ⚙ Ajustes</div></div>
        <div class="mini-metric"><div class="lbl">CCL</div><div class="val num">${S.ccl ? fmtARS(S.ccl) : '—'}</div>
          <div class="s muted">${esc(S.cclFuente || '')}</div></div>
      </div>
      ${!iol.completo || !cr.completo ? `<p class="aviso info s" style="margin:12px 0 0">Algunos precios todavía no llegaron — los activos sin precio se muestran con “—” y no suman al total. Probá ↻ Precios.</p>` : ''}
    </div>

    <div class="card solo-mobile">
      <h2>Posiciones</h2>
      <div class="lista-mov">
        ${iol.filas.map((p) => posCompacta(p.simbolo, fmtARS(p.valorizado), p.pnlPct)).join('')}
        ${cr.filas.map((p) => posCompacta(p.simbolo, fmtUSD(p.valorizado, true), p.pnlPct)).join('')}
      </div>
      <p class="muted s" style="margin:10px 0 0">Para editar cantidades y precios de compra, entrá desde la compu.</p>
    </div>

    <div class="card solo-desktop">
      <h2>IOL · CEDEARs <span class="s muted" style="text-transform:none;letter-spacing:0">cantidad y PPC editables</span></h2>
      <div class="tabla-scroll"><table>
        <thead><tr><th>Activo</th><th>Cantidad</th><th>PPC</th><th>Precio actual</th><th>Valorizado</th><th>PnL</th><th></th></tr></thead>
        <tbody>
          ${iol.filas.map((p) => `<tr>
            <td><b>${esc(p.simbolo)}</b><span class="sub">${esc(p.nombre)}</span></td>
            <td><input class="celda-edit num" data-iol="${p.id}" data-campo="cantidad" type="number" step="any" value="${p.cantidad}"></td>
            <td><input class="celda-edit num" data-iol="${p.id}" data-campo="ppc" type="number" step="any" value="${p.ppc}"></td>
            <td class="num">${p.ticker_yahoo
              ? fmtARS(p.px, true)
              : `<input class="celda-edit num" data-iol="${p.id}" data-campo="precio_manual" type="number" step="any" value="${p.precio_manual ?? ''}" placeholder="manual">`}</td>
            <td class="num">${fmtARS(p.valorizado)}</td>
            <td class="num ${signo(p.pnl)}">${fmtARS(p.pnl)}<span class="sub ${signo(p.pnl)}">${fmtPct(p.pnlPct)}</span></td>
            <td><button class="btn btn-chico btn-fantasma" data-del-iol="${p.id}" title="Borrar posición">✕</button></td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${fmtARS(iol.costo)}</td><td></td>
          <td class="num">${fmtARS(iol.total)}</td>
          <td class="num ${signo(iol.pnl)}">${fmtARS(iol.pnl)}<span class="sub ${signo(iol.pnl)}">${fmtPct(iol.pnlPct)}</span></td><td></td></tr></tfoot>
      </table></div>
      <button class="btn btn-chico btn-fantasma" id="btn-agregar-iol" style="margin-top:12px">+ Agregar CEDEAR</button>
    </div>

    <div class="card solo-desktop">
      <h2>Binance · Cripto</h2>
      <div class="tabla-scroll"><table>
        <thead><tr><th>Activo</th><th>Cantidad</th><th>Precio compra</th><th>Precio actual</th><th>Valorizado</th><th>PnL</th><th></th></tr></thead>
        <tbody>
          ${cr.filas.map((p) => `<tr>
            <td><b>${esc(p.simbolo)}</b><span class="sub">${esc(p.nombre)}</span></td>
            <td><input class="celda-edit num" data-cr="${p.id}" data-campo="cantidad" type="number" step="any" value="${p.cantidad}"></td>
            <td><input class="celda-edit num" data-cr="${p.id}" data-campo="precio_compra_usd" type="number" step="any" value="${p.precio_compra_usd}"></td>
            <td class="num">${fmtUSD(p.px, true)}</td>
            <td class="num">${fmtUSD(p.valorizado, true)}</td>
            <td class="num ${signo(p.pnl)}">${fmtUSD(p.pnl, true)}<span class="sub ${signo(p.pnl)}">${fmtPct(p.pnlPct)}</span></td>
            <td><button class="btn btn-chico btn-fantasma" data-del-cr="${p.id}" title="Borrar posición">✕</button></td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${fmtUSD(cr.costo, true)}</td><td></td>
          <td class="num">${fmtUSD(cr.total, true)}</td>
          <td class="num ${signo(cr.pnl)}">${fmtUSD(cr.pnl, true)}<span class="sub ${signo(cr.pnl)}">${fmtPct(cr.pnlPct)}</span></td><td></td></tr></tfoot>
      </table></div>
      <button class="btn btn-chico btn-fantasma" id="btn-agregar-crypto" style="margin-top:12px">+ Agregar cripto</button>
    </div>
  `;
}

const posCompacta = (sim, valTxt, pct) => `<div class="mov">
  <div class="cuerpo"><div class="cat">${esc(sim)}</div></div>
  <div class="monto num">${valTxt}</div>
  <div class="num s ${signo(pct)}" style="min-width:64px;text-align:right">${fmtPct(pct)}</div>
</div>`;

// ---------------- Vista: Metas ----------------
function vMetas() {
  const iol = calcIOL(), cr = calcCrypto();
  const pat = calcPatrimonio(iol, cr);
  const gastosProm = promedio3m('gastos');
  const excedenteProm = promedio3m('excedente');

  const metas = S.datos.metas.map((m) => {
    let objetivo = m.objetivo, acumulado = m.acumulado, nota = '';
    if (m.clave === 'emergencia') {
      objetivo = gastosProm > 0 ? gastosProm * 3 : m.objetivo;
      nota = gastosProm > 0 ? `objetivo automático: 3 × gasto promedio (${fmtARS(gastosProm)}/mes)` : 'el objetivo se calcula solo cuando haya gastos cargados';
    }
    if (m.clave === 'independencia') {
      acumulado = pat.usd ?? m.acumulado;
      nota = 'el acumulado es tu patrimonio total actual';
    }
    const pct = objetivo > 0 ? Math.min(100, (acumulado / objetivo) * 100) : 0;
    const fmt = m.moneda === 'USD' ? fmtUSD : fmtARS;
    let proy = '';
    if (objetivo > acumulado && excedenteProm > 0 && S.ccl) {
      const excedenteEnMoneda = m.moneda === 'USD' ? excedenteProm / S.ccl : excedenteProm;
      const meses = Math.ceil((objetivo - acumulado) / excedenteEnMoneda);
      proy = meses < 600 ? `≈ ${meses} ${meses === 1 ? 'mes' : 'meses'} al ritmo actual de excedente` : '';
    }
    return { ...m, objetivo, acumulado, pct, fmt, nota, proy };
  });

  return `
    <div class="card">
      <h2>Metas de ahorro <button class="btn btn-chico btn-fantasma" id="btn-nueva-meta">+ Nueva meta</button></h2>
      ${metas.map((m) => `
        <div class="meta">
          <div class="cab">
            <span class="nombre">${esc(m.nombre)}</span>
            <span class="nums num"><b>${m.fmt(m.acumulado)}</b> / ${m.fmt(m.objetivo)} · ${m.pct.toFixed(0)}%</span>
          </div>
          <div class="progreso ${m.pct >= 100 ? 'lleno' : ''}"><div style="width:${m.pct}%"></div></div>
          <div class="pie">
            <span>${esc(m.proy || m.nota)}</span>
            <span style="display:flex;gap:6px">
              ${m.clave !== 'independencia' ? `<button class="btn btn-chico btn-fantasma" data-aportar="${m.id}">Aportar</button>` : ''}
              ${m.clave !== 'emergencia' ? `<button class="btn btn-chico btn-fantasma" data-objetivo="${m.id}" data-moneda="${m.moneda}">Editar objetivo</button>` : ''}
              ${!METAS_BASE.includes(m.clave) ? `<button class="btn btn-chico btn-fantasma" data-borrar-meta="${m.id}">Borrar</button>` : ''}
            </span>
          </div>
          ${m.nota && m.proy ? `<div class="pie"><span>${esc(m.nota)}</span></div>` : ''}
        </div>`).join('')}
      <p class="muted s" style="margin:14px 0 0">La proyección usa tu excedente promedio de los últimos meses: ${fmtARS(excedenteProm)}/mes.</p>
    </div>
  `;
}

// ---------------- Eventos post-render ----------------
function postRender(vista) {
  vista.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => {
    if (!confirm('¿Borrar este movimiento?')) return;
    try {
      await borrarMovimiento(b.dataset.borrar);
      S.datos.movimientos = S.datos.movimientos.filter((m) => m.id !== b.dataset.borrar);
      render(); toast('Movimiento borrado');
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-cobrar]').forEach((b) => (b.onclick = async () => {
    const m = S.datos.movimientos.find((x) => x.id === b.dataset.cobrar);
    if (!m) return;
    if (!confirm(`¿Marcar como cobrado ${fmtARS(m.monto)} de domicilios? Pasa a ingresos con fecha de hoy.`)) return;
    const parcial = { tipo: 'ingreso', categoria: 'Domicilios cobrados', fecha: hoyISO() };
    try {
      await actualizarMovimiento(m.id, parcial);
      Object.assign(m, parcial);
      S.datos.movimientos.sort((a, c) => (a.fecha < c.fecha ? 1 : a.fecha > c.fecha ? -1 : 0));
      render(); toast(`Cobrado ${fmtARS(m.monto)} ✔ — registrado como ingreso`);
    } catch (e) { toast('No se pudo marcar: ' + e.message, false); }
  }));

  const seed = vista.querySelector('#btn-seed');
  if (seed) seed.onclick = async () => {
    seed.disabled = true; seed.textContent = 'Importando…';
    try {
      await importarSeed(SEED);
      S.datos = await cargarTodo();
      render(); toast('Datos importados ✔');
      refrescarPrecios();
    } catch (e) { toast('Error al importar: ' + e.message, false); seed.disabled = false; seed.textContent = 'Cargar mis datos iniciales'; }
  };

  const c2 = vista.querySelector('#btn-cargar-2');
  if (c2) c2.onclick = () => abrirCarga();

  vista.querySelectorAll('[data-iol]').forEach((inp) => (inp.onchange = async () => {
    const v = num(inp.value); if (v == null) return;
    try {
      await actualizarPosicionIOL(inp.dataset.iol, { [inp.dataset.campo]: v });
      const p = S.datos.iol.find((x) => x.id === inp.dataset.iol);
      if (p) p[inp.dataset.campo] = v;
      render(); toast('Guardado');
    } catch (e) { toast('Error: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-cr]').forEach((inp) => (inp.onchange = async () => {
    const v = num(inp.value); if (v == null) return;
    try {
      await actualizarPosicionCrypto(inp.dataset.cr, { [inp.dataset.campo]: v });
      const p = S.datos.crypto.find((x) => x.id === inp.dataset.cr);
      if (p) p[inp.dataset.campo] = v;
      render(); toast('Guardado');
    } catch (e) { toast('Error: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-aportar]').forEach((b) => (b.onclick = async () => {
    const m = S.datos.metas.find((x) => x.id === b.dataset.aportar);
    const v = num(prompt(`¿Cuánto aportás a "${m.nombre}" (${m.moneda})?`));
    if (v == null || v <= 0) return;
    try {
      await actualizarMeta(m.id, { acumulado: m.acumulado + v });
      m.acumulado += v;
      render(); toast('Aporte registrado');
    } catch (e) { toast('Error: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-objetivo]').forEach((b) => (b.onclick = async () => {
    const m = S.datos.metas.find((x) => x.id === b.dataset.objetivo);
    const nombre = prompt('Nombre de la meta:', m.nombre);
    if (nombre === null) return;
    const v = num(prompt(`Nuevo objetivo para "${nombre.trim() || m.nombre}" (${m.moneda}):`, m.objetivo));
    if (v == null || v <= 0) return;
    try {
      const parcial = { objetivo: v };
      if (nombre.trim()) parcial.nombre = nombre.trim();
      await actualizarMeta(m.id, parcial);
      Object.assign(m, parcial);
      render(); toast('Meta actualizada');
    } catch (e) { toast('Error: ' + e.message, false); }
  }));

  const nm = vista.querySelector('#btn-nueva-meta');
  if (nm) nm.onclick = () => abrirNuevaMeta();

  vista.querySelectorAll('[data-borrar-meta]').forEach((b) => (b.onclick = async () => {
    const m = S.datos.metas.find((x) => x.id === b.dataset.borrarMeta);
    if (!confirm(`¿Borrar la meta "${m.nombre}"?`)) return;
    try {
      const { error } = await sb.from('metas').delete().eq('id', m.id);
      if (error) throw new Error(error.message);
      S.datos.metas = S.datos.metas.filter((x) => x.id !== m.id);
      render(); toast('Meta borrada');
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));

  const addIol = vista.querySelector('#btn-agregar-iol');
  if (addIol) addIol.onclick = () => abrirAgregarIOL();

  const addCr = vista.querySelector('#btn-agregar-crypto');
  if (addCr) addCr.onclick = () => abrirAgregarCrypto();

  vista.querySelectorAll('[data-del-iol]').forEach((b) => (b.onclick = async () => {
    const p = S.datos.iol.find((x) => x.id === b.dataset.delIol);
    if (!confirm(`¿Borrar ${p.simbolo} del portfolio?`)) return;
    try {
      const { error } = await sb.from('portfolio_iol').delete().eq('id', p.id);
      if (error) throw new Error(error.message);
      S.datos.iol = S.datos.iol.filter((x) => x.id !== p.id);
      render(); toast('Posición borrada');
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-del-cr]').forEach((b) => (b.onclick = async () => {
    const p = S.datos.crypto.find((x) => x.id === b.dataset.delCr);
    if (!confirm(`¿Borrar ${p.simbolo} del portfolio?`)) return;
    try {
      const { error } = await sb.from('portfolio_crypto').delete().eq('id', p.id);
      if (error) throw new Error(error.message);
      S.datos.crypto = S.datos.crypto.filter((x) => x.id !== p.id);
      render(); toast('Posición borrada');
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));
}

// ============================================================
// Sheet: carga rápida (3 toques: categoría → monto → confirmar)
// ============================================================
let cargaTipo = 'egreso';
let cargaCat = null;

function abrirSheet(html) {
  $('#sheet').innerHTML = `<div class="manija"></div>${html}`;
  $('#sheet').classList.add('abierto');
  $('#backdrop').classList.add('abierto');
}
function cerrarSheet() {
  $('#sheet').classList.remove('abierto');
  $('#backdrop').classList.remove('abierto');
}

function abrirCarga(tipo = 'egreso') {
  cargaTipo = tipo; cargaCat = null;
  pintarCarga();
}

function pintarCarga() {
  const cats = cargaTipo === 'egreso' ? CAT_EGRESO : CAT_INGRESO;
  const aj = S.datos.ajustes || {};
  const esSesiones = cargaCat === 'Sesiones (producción)';
  const esDomicilios = cargaCat === 'Domicilios cobrados' || cargaCat === 'Domicilios hechos';
  const conCantidad = esSesiones || esDomicilios;
  const unidad = esSesiones ? (aj.valor_sesion || 0) : (aj.valor_domicilio || 35000);

  abrirSheet(`
    <div class="segmentos">
      <button class="seg-egreso ${cargaTipo === 'egreso' ? 'activo' : ''}" data-seg="egreso">Gasto</button>
      <button class="seg-ingreso ${cargaTipo === 'ingreso' ? 'activo' : ''}" data-seg="ingreso">Ingreso</button>
    </div>
    <div class="botonera">
      ${cats.map((c) => `<button class="cat-btn ${cargaCat === c.c ? 'activo' : ''}" data-cat="${esc(c.c)}">
        <span class="emoji">${c.e}</span><span>${esc(c.c)}</span></button>`).join('')}
    </div>
    ${cargaCat ? `
    <form id="form-carga">
      ${conCantidad ? `
      <div class="campos-2">
        <div class="campo"><label>Cantidad</label>
          <input id="f-cantidad" type="number" inputmode="numeric" step="any" min="0" value="1" required></div>
        <div class="campo"><label>Valor unitario</label>
          <input id="f-unidad" type="number" inputmode="decimal" step="any" min="0" value="${unidad}" ${esSesiones && !aj.valor_sesion ? 'placeholder="definí valor sesión en ⚙"' : ''}></div>
      </div>` : ''}
      <div class="campo"><label>Monto total (ARS)</label>
        <input id="f-monto" class="input-monto" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required ${conCantidad ? `value="${unidad || ''}"` : ''}></div>
      <div class="campos-2">
        <div class="campo"><label>Fecha</label><input id="f-fecha" type="date" value="${hoyISO()}" required></div>
        <div class="campo"><label>Nota (opcional)</label><input id="f-desc" type="text" maxlength="80" placeholder=""></div>
      </div>
      <button class="btn btn-primario" type="submit">Confirmar ${cargaTipo === 'egreso' ? 'gasto' : 'ingreso'}</button>
    </form>` : `<p class="muted s" style="text-align:center;margin:16px 0 6px">Elegí una categoría</p>`}
  `);

  document.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { cargaTipo = b.dataset.seg; cargaCat = null; pintarCarga(); }));
  document.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { cargaCat = b.dataset.cat; pintarCarga(); setTimeout(() => $('#f-monto')?.focus(), 80); }));

  if (conCantidad) {
    const recalc = () => {
      const c = num($('#f-cantidad').value) || 0;
      const u = num($('#f-unidad').value) || 0;
      $('#f-monto').value = c * u || '';
    };
    $('#f-cantidad').oninput = recalc;
    $('#f-unidad').oninput = recalc;
    recalc();
  }

  const form = $('#form-carga');
  if (form) form.onsubmit = async (ev) => {
    ev.preventDefault();
    const monto = num($('#f-monto').value);
    if (monto == null || monto <= 0) return toast('Ingresá un monto válido', false);
    const mov = {
      fecha: $('#f-fecha').value || hoyISO(),
      tipo: cargaCat === 'Sesiones (producción)' || cargaCat === 'Domicilios hechos' ? 'sesiones' : cargaTipo,
      categoria: cargaCat,
      descripcion: $('#f-desc').value.trim(),
      cantidad: $('#f-cantidad') ? num($('#f-cantidad').value) : null,
      monto,
    };
    try {
      const creado = await agregarMovimiento(mov);
      S.datos.movimientos.unshift(creado);
      cerrarSheet(); render();
      toast(`${cargaTipo === 'egreso' ? 'Gasto' : 'Ingreso'} de ${fmtARS(monto)} registrado ✔`);
    } catch (e) { toast('No se pudo guardar: ' + e.message, false); }
  };
}

// ---------------- Sheet: ajustes ----------------
function abrirAjustes() {
  const aj = S.datos.ajustes || {};
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Ajustes</h2>
    <p class="muted s" style="margin:0 0 14px">Valores base para la carga rápida y el patrimonio.</p>
    <form id="form-aj" style="display:grid;gap:12px">
      <div class="campo"><label>Valor por sesión (ARS)</label>
        <input id="aj-sesion" type="number" inputmode="decimal" step="any" min="0" value="${aj.valor_sesion ?? 0}"></div>
      <div class="campo"><label>Valor domicilio (ARS) — mínimo ético</label>
        <input id="aj-domicilio" type="number" inputmode="decimal" step="any" min="0" value="${aj.valor_domicilio ?? 35000}"></div>
      <div class="campo"><label>Efectivo en mano (USD)</label>
        <input id="aj-efectivo" type="number" inputmode="decimal" step="any" min="0" value="${aj.efectivo_usd ?? 0}"></div>
      <button class="btn btn-primario" type="submit">Guardar ajustes</button>
    </form>
  `);
  $('#form-aj').onsubmit = async (ev) => {
    ev.preventDefault();
    const parcial = {
      valor_sesion: num($('#aj-sesion').value) ?? 0,
      valor_domicilio: num($('#aj-domicilio').value) ?? 35000,
      efectivo_usd: num($('#aj-efectivo').value) ?? 0,
    };
    try {
      await guardarAjustes(parcial);
      S.datos.ajustes = { ...(S.datos.ajustes || {}), ...parcial };
      cerrarSheet(); render(); toast('Ajustes guardados ✔');
    } catch (e) { toast('Error: ' + e.message, false); }
  };
}

// ---------------- Sheet: nueva meta ----------------
function abrirNuevaMeta() {
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Nueva meta</h2>
    <p class="muted s" style="margin:0 0 14px">Definí qué estás ahorrando y cuánto necesitás.</p>
    <form id="form-meta" style="display:grid;gap:12px">
      <div class="campo"><label>Nombre</label>
        <input id="meta-nombre" type="text" maxlength="60" placeholder="Ej: Notebook nueva" required></div>
      <div class="campos-2">
        <div class="campo"><label>Moneda</label>
          <select id="meta-moneda" style="width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg);font-size:17px">
            <option value="ARS">ARS</option><option value="USD">USD</option>
          </select></div>
        <div class="campo"><label>Objetivo</label>
          <input id="meta-objetivo" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required></div>
      </div>
      <button class="btn btn-primario" type="submit">Crear meta</button>
    </form>
  `);
  $('#form-meta').onsubmit = async (ev) => {
    ev.preventDefault();
    const nombre = $('#meta-nombre').value.trim();
    const objetivo = num($('#meta-objetivo').value);
    if (!nombre) return toast('Ingresá un nombre', false);
    if (objetivo == null || objetivo <= 0) return toast('Ingresá un objetivo válido', false);
    const orden = Math.max(0, ...S.datos.metas.map((m) => m.orden || 0)) + 1;
    try {
      const creada = await insertarMeta({
        clave: 'meta_' + Date.now(),
        nombre,
        moneda: $('#meta-moneda').value,
        objetivo,
        acumulado: 0,
        orden,
      });
      S.datos.metas.push(creada);
      cerrarSheet(); render(); toast('Meta creada ✔');
    } catch (e) { toast('No se pudo crear: ' + e.message, false); }
  };
}

// ---------------- Sheet: agregar posición IOL ----------------
function abrirAgregarIOL() {
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Agregar CEDEAR / FCI</h2>
    <p class="muted s" style="margin:0 0 14px">Si es un FCI sin cotización en Yahoo, dejá el ticker vacío y cargá el precio manual.</p>
    <form id="form-iol" style="display:grid;gap:12px">
      <div class="campos-2">
        <div class="campo"><label>Símbolo</label>
          <input id="iol-simbolo" type="text" maxlength="12" placeholder="AAPL" required></div>
        <div class="campo"><label>Nombre</label>
          <input id="iol-nombre" type="text" maxlength="60" placeholder="Apple Inc."></div>
      </div>
      <div class="campos-2">
        <div class="campo"><label>Cantidad</label>
          <input id="iol-cantidad" type="number" inputmode="decimal" step="any" min="0" required></div>
        <div class="campo"><label>PPC (ARS)</label>
          <input id="iol-ppc" type="number" inputmode="decimal" step="any" min="0" required></div>
      </div>
      <div class="campos-2">
        <div class="campo"><label>Ticker Yahoo</label>
          <input id="iol-ticker" type="text" maxlength="20" placeholder="AAPL.BA"></div>
        <div class="campo"><label>Precio manual (sin ticker)</label>
          <input id="iol-manual" type="number" inputmode="decimal" step="any" min="0"></div>
      </div>
      <button class="btn btn-primario" type="submit">Agregar posición</button>
    </form>
  `);
  $('#form-iol').onsubmit = async (ev) => {
    ev.preventDefault();
    const simbolo = $('#iol-simbolo').value.trim().toUpperCase();
    const cantidad = num($('#iol-cantidad').value);
    const ppc = num($('#iol-ppc').value);
    if (!simbolo || cantidad == null || ppc == null) return toast('Completá símbolo, cantidad y PPC', false);
    const ticker = $('#iol-ticker').value.trim() || null;
    const pos = {
      simbolo,
      nombre: $('#iol-nombre').value.trim(),
      cantidad, ppc,
      ticker_yahoo: ticker,
      precio_manual: ticker ? null : num($('#iol-manual').value),
    };
    try {
      const { data, error } = await sb.from('portfolio_iol').insert(pos).select().single();
      if (error) throw new Error(error.message);
      S.datos.iol.push(data);
      S.datos.iol.sort((a, b) => a.simbolo.localeCompare(b.simbolo));
      cerrarSheet(); render(); toast(`${simbolo} agregado ✔`);
      if (ticker) refrescarPrecios();
    } catch (e) { toast('No se pudo agregar: ' + e.message, false); }
  };
}

// ---------------- Sheet: agregar posición cripto ----------------
function abrirAgregarCrypto() {
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Agregar cripto</h2>
    <p class="muted s" style="margin:0 0 14px">El precio actual se busca solo a partir del símbolo (ej: BTC).</p>
    <form id="form-crypto" style="display:grid;gap:12px">
      <div class="campos-2">
        <div class="campo"><label>Símbolo</label>
          <input id="cr-simbolo" type="text" maxlength="12" placeholder="BTC" required></div>
        <div class="campo"><label>Nombre</label>
          <input id="cr-nombre" type="text" maxlength="60" placeholder="Bitcoin"></div>
      </div>
      <div class="campos-2">
        <div class="campo"><label>Cantidad</label>
          <input id="cr-cantidad" type="number" inputmode="decimal" step="any" min="0" required></div>
        <div class="campo"><label>Precio compra (USD)</label>
          <input id="cr-precio" type="number" inputmode="decimal" step="any" min="0" required></div>
      </div>
      <button class="btn btn-primario" type="submit">Agregar posición</button>
    </form>
  `);
  $('#form-crypto').onsubmit = async (ev) => {
    ev.preventDefault();
    const simbolo = $('#cr-simbolo').value.trim().toUpperCase();
    const cantidad = num($('#cr-cantidad').value);
    const precio = num($('#cr-precio').value);
    if (!simbolo || cantidad == null || precio == null) return toast('Completá símbolo, cantidad y precio', false);
    const pos = {
      simbolo,
      nombre: $('#cr-nombre').value.trim(),
      cantidad,
      precio_compra_usd: precio,
    };
    try {
      const { data, error } = await sb.from('portfolio_crypto').insert(pos).select().single();
      if (error) throw new Error(error.message);
      S.datos.crypto.push(data);
      S.datos.crypto.sort((a, b) => a.simbolo.localeCompare(b.simbolo));
      cerrarSheet(); render(); toast(`${simbolo} agregado ✔`);
      refrescarPrecios();
    } catch (e) { toast('No se pudo agregar: ' + e.message, false); }
  };
}

// ============================================================
// Setup / Login / Arranque
// ============================================================
function renderSetup() {
  app.innerHTML = `
    <div class="login"><div class="login-card">
      <h1>Falta configurar Supabase</h1>
      <p>Abrí el archivo <b>config.js</b> en la raíz del proyecto y completá <b>SUPABASE_URL</b> y <b>SUPABASE_ANON_KEY</b> (los encontrás en Supabase → Project Settings → API). Después corré el <b>schema.sql</b> en el SQL Editor. El paso a paso completo está en el README.</p>
    </div></div>`;
}

function renderLogin() {
  app.innerHTML = `
    <div class="login"><div class="login-card">
      <h1>Finanzas</h1>
      <p>Ingresá tu email y te llega un link mágico para entrar. Sin contraseñas.</p>
      <form id="form-login">
        <input id="login-email" type="email" placeholder="tu@email.com" required autocomplete="email">
        <button class="btn btn-primario" type="submit">Enviarme el link</button>
      </form>
      <p id="login-msg" class="s" style="margin-top:12px"></p>
    </div></div>`;
  $('#form-login').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await enviarMagicLink($('#login-email').value.trim());
      $('#login-msg').textContent = '✔ Listo. Revisá tu casilla y tocá el link para entrar.';
      $('#login-msg').style.color = 'var(--pos)';
    } catch (e) {
      $('#login-msg').textContent = 'Error: ' + e.message;
      $('#login-msg').style.color = 'var(--neg)';
    }
    btn.disabled = false; btn.textContent = 'Enviarme el link';
  };
}

async function boot() {
  try {
    S.datos = await cargarTodo();
  } catch (e) {
    app.innerHTML = `<div class="login"><div class="login-card">
      <h1>No se pudieron cargar tus datos</h1>
      <p>${esc(e.message)}. Verificá que hayas corrido <b>schema.sql</b> en Supabase y recargá la página.</p>
    </div></div>`;
    return;
  }
  render();
  refrescarPrecios();
}

async function init() {
  if (!configOK) return renderSetup();
  S.session = await sesionActual();
  onAuthChange((session) => {
    const antes = !!S.session;
    S.session = session;
    if (session && !antes) boot();
    if (!session) renderLogin();
  });
  if (S.session) boot(); else renderLogin();
}

init();
