// ============================================================
// Finanzas · Marcos — app principal
// ============================================================
import { configOK, sb, sesionActual, enviarMagicLink, cerrarSesion, onAuthChange,
         cargarTodo, guardarAjustes, agregarMovimiento, actualizarMovimiento, borrarMovimiento,
         actualizarPosicionIOL, actualizarPosicionCrypto, actualizarMeta, insertarMeta,
         cargarAportes, insertarAporte, borrarAporte,
         insertarRecurrente, actualizarRecurrente, borrarRecurrente, importarSeed } from './db.js';
import { SEED } from './seed.js';
import { preciosCedears, preciosCrypto, cclDelDia } from './precios.js';
import { fmtARS, fmtUSD, fmtNum, fmtPct, signo, hoyISO, mesKey, mesActualKey,
         nombreMes, ultimosMeses, fechaCorta, esc, donutSVG, barrasSVG, lineaSVG } from './utils.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');

// Categorías de SISTEMA: tienen lógica acoplada (producción, inversión, cobros).
// No se editan ni borran desde la UI para no romper los cálculos.
const CAT_FIJAS = [
  { c: 'Cobrado de pacientes', e: '🩺', tipo: 'ingreso', grupo: 'Trabajo', fija: true },
  { c: 'Domicilios hechos', e: '🛵', tipo: 'sesiones', grupo: 'Producción', fija: true },
  { c: 'Domicilios cobrados', e: '🚶', tipo: 'ingreso', grupo: 'Trabajo', fija: true },
  { c: 'Sesiones (producción)', e: '📋', tipo: 'sesiones', grupo: 'Producción', fija: true },
  { c: 'Inversión', e: '📈', tipo: 'egreso', grupo: 'Inversión', fija: true },
];

// Categorías por defecto (editables). Se usan hasta que el usuario las personaliza;
// a partir de ahí viven en ajustes.categorias (columna jsonb).
const CAT_DEFECTO = [
  { c: 'Alquiler + expensas', e: '🏠', tipo: 'egreso', grupo: 'Vivienda' },
  { c: 'Comida', e: '🛒', tipo: 'egreso', grupo: 'Comida' },
  { c: 'Uber / Transporte', e: '🚗', tipo: 'egreso', grupo: 'Transporte' },
  { c: 'Internet', e: '📶', tipo: 'egreso', grupo: 'Servicios' },
  { c: 'Luz', e: '💡', tipo: 'egreso', grupo: 'Servicios' },
  { c: 'Gas', e: '🔥', tipo: 'egreso', grupo: 'Servicios' },
  { c: 'Cuota / transferencia', e: '📱', tipo: 'egreso', grupo: 'Familia' },
  { c: 'Cuota compu', e: '💻', tipo: 'egreso', grupo: 'Familia' },
  { c: 'Suscripciones', e: '📲', tipo: 'egreso', grupo: 'Ocio' },
  { c: 'Ropa', e: '👕', tipo: 'egreso', grupo: 'Personal' },
  { c: 'Insumos / equipamiento', e: '🩺', tipo: 'egreso', grupo: 'Trabajo' },
  { c: 'Otro gasto', e: '📦', tipo: 'egreso', grupo: 'Otros' },
  { c: 'Sueldo', e: '🏦', tipo: 'ingreso', grupo: 'Trabajo' },
  { c: 'Otro ingreso', e: '➕', tipo: 'ingreso', grupo: 'Otros' },
];

const esDomicilioHecho = (c) => c === 'Domicilios hechos' || c === 'Domicilios (producción)';

// Categorías editables del usuario (las de la base, o las por defecto si todavía no tocó nada).
const catsUsuario = () => (S.datos.ajustes?.categorias?.length ? S.datos.ajustes.categorias : CAT_DEFECTO);

// Categorías que muestra la botonera de carga según el segmento elegido.
function catsSegmento(seg) {
  const user = catsUsuario();
  if (seg === 'egreso') {
    return [...user.filter((x) => x.tipo === 'egreso'), ...CAT_FIJAS.filter((x) => x.tipo === 'egreso')];
  }
  // Segmento "Ingreso": primero las fijas (cobros y producción), después las del usuario.
  return [...CAT_FIJAS.filter((x) => x.tipo !== 'egreso'), ...user.filter((x) => x.tipo === 'ingreso')];
}

const EMOJI = {};
function poblarEmoji(lista) {
  [...CAT_FIJAS, ...lista].forEach((x) => (EMOJI[x.c] = x.e));
  // alias para movimientos viejos previos a los renames
  EMOJI['Cuota celular'] = '📱';
  EMOJI['Domicilios'] = '🚶';
  EMOJI['Domicilios (producción)'] = '🛵';
}
function refrescarCategorias() {
  for (const k of Object.keys(EMOJI)) delete EMOJI[k];
  poblarEmoji(catsUsuario());
}
poblarEmoji(CAT_DEFECTO); // base inicial; se refresca con las del usuario al cargar datos

const ICONS = {
  inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  historial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
  portfolio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 4"/></svg>',
  metas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const S = {
  session: null,
  datos: { ajustes: null, iol: [], crypto: [], movimientos: [], metas: [], recurrentes: [] },
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

// ---------------- Alertas (no invasivas, descartables vía localStorage) ----------------
function alertaDescartada(id) { try { return localStorage.getItem('finz_alert_' + id) === '1'; } catch (e) { return false; } }
function descartarAlerta(id) { try { localStorage.setItem('finz_alert_' + id, '1'); } catch (e) {} }

function alertasActivas() {
  const out = [];
  const mes = mesActualKey();
  // 1) Gastos fijos del mes todavía sin cargar
  const FIJOS = ['Alquiler + expensas', 'Luz', 'Gas', 'Internet'];
  const delMes = S.datos.movimientos.filter((m) => mesKey(m.fecha) === mes);
  const faltan = FIJOS.filter((c) => !delMes.some((m) => m.categoria === c));
  const idFijos = 'fijos_' + mes;
  if (faltan.length && !alertaDescartada(idFijos)) {
    out.push({ id: idFijos, icono: '🗓️', texto: `Gastos fijos sin cargar este mes: ${faltan.join(', ')}.` });
  }
  // 2) Domicilios hechos hace más de 14 días sin cobrar
  const lim = new Date(); lim.setDate(lim.getDate() - 14);
  const limISO = lim.toISOString().slice(0, 10);
  const viejos = S.datos.movimientos.filter((m) => esDomicilioHecho(m.categoria) && m.fecha <= limISO);
  const idDomi = 'domi14_' + mes;
  if (viejos.length && !alertaDescartada(idDomi)) {
    const tot = viejos.reduce((a, m) => a + m.monto, 0);
    const pl = viejos.length > 1 ? 's' : '';
    out.push({ id: idDomi, icono: '⏳', texto: `Tenés ${viejos.length} domicilio${pl} hecho${pl} hace +14 días sin cobrar (${fmtARS(tot)}). Marcalos abajo cuando te transfieran.` });
  }
  return out;
}

// ---------------- Vista: Inicio ----------------
function vInicio() {
  const alertas = alertasActivas();
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

  const mesAct = mesActualKey();
  const recPendientes = (S.datos.recurrentes || []).filter((rec) => rec.activo && rec.ultimo_mes !== mesAct);

  const segs = [
    { valor: iol.total, color: 'var(--accent-text)', label: 'CEDEARs (IOL)' },
    { valor: cr.total * (S.ccl || 0), color: 'var(--pos)', label: 'Cripto (Binance)' },
    { valor: pat.efectivo * (S.ccl || 0), color: 'var(--muted)', label: 'Efectivo USD' },
  ];

  return `
    ${alertas.map((a) => `<div class="card" style="display:flex;align-items:center;gap:10px;border-color:var(--accent-text);padding:13px 16px">
      <span style="font-size:20px;flex:none">${a.icono}</span>
      <span class="s" style="flex:1">${esc(a.texto)}</span>
      <button class="borrar" data-descartar="${esc(a.id)}" title="Descartar" aria-label="Descartar aviso">✕</button>
    </div>`).join('')}

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
          <span>Entró<br><b class="pos num">${fmtARS(r.ingresos)}</b>${pendienteTotal > 0 ? `<br><span class="s num" style="color:var(--accent-text)" title="Domicilios hechos sin cobrar">⏳ +${fmtARS(pendienteTotal)}</span>` : ''}</span>
          <span>Gastos<br><b class="neg num">${fmtARS(r.gastos)}</b></span>
          <span>Invertido<br><b class="num" style="color:var(--accent-text)">${fmtARS(r.invertido)}</b></span>
          <span>Queda<br><b class="num ${signo(r.excedente)}">${fmtARS(r.excedente)}</b>${pendienteTotal > 0 ? `<br><span class="s num" style="color:var(--accent-text)" title="Incluyendo lo pendiente de cobro">≈ ${fmtARS(r.excedente + pendienteTotal)}</span>` : ''}</span>
        </div>
        ${pendienteTotal > 0 ? `<p class="muted s" style="margin:10px 0 0">⏳ Proyectado: suma ${fmtARS(pendienteTotal)} de domicilios hechos que todavía no cobraste. Los números reales no cambian hasta que toques <b>Cobrado</b>.</p>` : ''}
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

    ${recPendientes.length ? `
    <div class="card">
      <h2>Gastos recurrentes a confirmar
        <span class="s muted num" style="text-transform:none;letter-spacing:0;font-weight:600">${recPendientes.length}</span></h2>
      <div class="lista-mov">${recPendientes.map((rec) => `<div class="mov">
        <div class="icono">${EMOJI[rec.categoria] || '🔁'}</div>
        <div class="cuerpo"><div class="cat">${esc(rec.categoria)}</div><div class="det">${esc(rec.descripcion || 'gasto fijo mensual')}</div></div>
        <input class="celda-edit num" data-recmonto="${rec.id}" type="number" step="any" value="${rec.monto}" style="max-width:120px">
        <button class="btn btn-chico btn-primario" data-recconf="${rec.id}">Confirmar</button>
        <button class="borrar" data-recskip="${rec.id}" title="Saltar este mes" aria-label="Saltar este mes">✕</button>
      </div>`).join('')}</div>
      <p class="muted s" style="margin:10px 0 0">Ajustá el monto si hace falta y <b>Confirmá</b> para cargarlo como gasto del mes, o ✕ para saltarlo.</p>
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

// ---------------- Gráficos: paleta + donut con leyenda ----------------
const PALETA = ['#5b8def', '#34c79a', '#f5a524', '#ef5da8', '#9b7bf0', '#22b8cf',
  '#f06548', '#8bc34a', '#ffd23f', '#6c8cff', '#e573b5', '#4dd4ac', '#c98bf0', '#ff8a5c'];

// items: [{ label, valor }] · fmt: formateador de moneda. Devuelve donut + leyenda con % y montos.
function panelDonut(items, fmt) {
  const segs = items.filter((x) => (x.valor || 0) > 0).sort((a, b) => b.valor - a.valor);
  const total = segs.reduce((a, x) => a + x.valor, 0);
  if (total <= 0) return '<div class="vacio">Sin datos para graficar.</div>';
  const conColor = segs.map((s, i) => ({ ...s, color: PALETA[i % PALETA.length], pct: (s.valor / total) * 100 }));
  return `<div class="patrimonio-cuerpo">
    ${donutSVG(conColor.map((s) => ({ valor: s.valor, color: s.color, label: s.label,
      titulo: `${s.label} · ${fmt(s.valor)} · ${s.pct.toFixed(1)}%` })))}
    <div class="leyenda" style="flex:1;min-width:200px">
      ${conColor.map((s) => `<div class="item"><span class="punto" style="background:${s.color}"></span>${esc(s.label)}
        <b class="num" style="margin-left:auto">${fmt(s.valor)}</b>
        <span class="s muted num" style="margin-left:10px;min-width:48px;text-align:right">${s.pct.toFixed(1)}%</span></div>`).join('')}
    </div>
  </div>`;
}

// Mes seleccionado en el gráfico de gastos por categoría (Historial)
let mesGastoSel = mesActualKey();
// Filtros de la tabla de movimientos (Historial)
let filtroMov = { mes: '', tipo: '', cat: '', limite: 50 };

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
    ${cardGastosCategoria()}

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

    ${cardMovimientos()}

    <div class="card">
      <h2>Exportar</h2>
      <p class="muted s" style="margin:0 0 12px">Descargá tus movimientos en un CSV (se abre en Excel o Google Sheets), con opción de filtrar por fechas.</p>
      <button class="btn btn-fantasma" id="btn-export">⬇ Exportar a CSV</button>
    </div>
  `;
}

// Card de gastos del mes por categoría (con selector de mes)
function cardGastosCategoria() {
  const movsMes = S.datos.movimientos.filter(
    (m) => mesKey(m.fecha) === mesGastoSel && m.tipo === 'egreso' && m.categoria !== 'Inversión');
  const porCat = {};
  movsMes.forEach((m) => { porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto; });
  const items = Object.entries(porCat).map(([c, v]) => ({ label: `${EMOJI[c] || '•'} ${c}`, valor: v }));
  const total = movsMes.reduce((a, m) => a + m.monto, 0);
  const opciones = ultimosMeses(12).slice().reverse()
    .map((k) => `<option value="${k}" ${k === mesGastoSel ? 'selected' : ''}>${esc(nombreMes(k, true))}</option>`).join('');

  return `<div class="card">
    <h2>En qué se va la plata ${total > 0 ? `<span class="s muted num" style="text-transform:none;letter-spacing:0;font-weight:600">${fmtARS(total)}</span>` : ''}</h2>
    <div style="margin:0 0 14px"><select id="sel-mes-gasto" style="${SELECT_CSS};max-width:200px">${opciones}</select></div>
    ${items.length ? panelDonut(items, (v) => fmtARS(v))
      : `<div class="vacio">No hay gastos cargados en ${esc(nombreMes(mesGastoSel, true))}.</div>`}
  </div>`;
}

// Tabla de todos los movimientos con filtros (mes / tipo / categoría) y paginación
function coincideTipo(m, t) {
  if (t === 'gasto') return m.tipo === 'egreso' && m.categoria !== 'Inversión';
  if (t === 'inversion') return m.categoria === 'Inversión';
  if (t === 'ingreso') return m.tipo === 'ingreso';
  if (t === 'produccion') return m.tipo === 'sesiones';
  return true;
}

function movsFiltrados() {
  const f = filtroMov;
  return S.datos.movimientos.filter((m) =>
    (!f.mes || mesKey(m.fecha) === f.mes) &&
    (!f.tipo || coincideTipo(m, f.tipo)) &&
    (!f.cat || m.categoria === f.cat));
}

function cardMovimientos() {
  const movs = movsFiltrados();
  const visibles = movs.slice(0, filtroMov.limite);
  const restantes = movs.length - visibles.length;
  const mesesOpt = [...new Set(S.datos.movimientos.map((m) => mesKey(m.fecha)))].sort().reverse();
  const catsOpt = [...new Set(S.datos.movimientos.map((m) => m.categoria))].sort();
  const opt = (val, sel, txt) => `<option value="${esc(val)}" ${val === sel ? 'selected' : ''}>${esc(txt)}</option>`;
  const tiposLbl = { '': 'Todos los tipos', gasto: 'Gastos', ingreso: 'Ingresos', inversion: 'Inversión', produccion: 'Producción' };

  return `<div class="card">
    <h2>Todos los movimientos <span class="s muted num" style="text-transform:none;letter-spacing:0;font-weight:600">${movs.length}</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px">
      <select id="f-mov-mes" style="${SELECT_CSS};flex:1;min-width:130px">
        ${opt('', filtroMov.mes, 'Todos los meses')}${mesesOpt.map((k) => opt(k, filtroMov.mes, nombreMes(k, true))).join('')}
      </select>
      <select id="f-mov-tipo" style="${SELECT_CSS};flex:1;min-width:120px">
        ${Object.keys(tiposLbl).map((t) => opt(t, filtroMov.tipo, tiposLbl[t])).join('')}
      </select>
      <select id="f-mov-cat" style="${SELECT_CSS};flex:1;min-width:130px">
        ${opt('', filtroMov.cat, 'Todas las categorías')}${catsOpt.map((c) => opt(c, filtroMov.cat, c)).join('')}
      </select>
    </div>
    ${visibles.length ? `<div class="tabla-scroll"><table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Monto</th><th></th></tr></thead>
      <tbody>
        ${visibles.map((m) => {
          const cls = m.tipo === 'ingreso' ? 'pos' : m.tipo === 'sesiones' ? 'muted' : 'neg';
          const pref = m.tipo === 'ingreso' ? '+' : m.tipo === 'sesiones' ? '' : '−';
          return `<tr>
            <td style="white-space:nowrap">${esc(fechaCorta(m.fecha))}</td>
            <td><b>${EMOJI[m.categoria] || '•'} ${esc(m.categoria)}</b>${m.descripcion ? `<span class="sub">${esc(m.descripcion)}</span>` : ''}</td>
            <td class="num ${cls}" style="white-space:nowrap">${pref}${fmtARS(m.monto)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-chico btn-fantasma" data-editmov="${m.id}" title="Editar">✎</button>
              <button class="borrar" data-borrar="${m.id}" title="Borrar movimiento">✕</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    ${restantes > 0 ? `<button class="btn btn-fantasma" id="btn-mas-mov" style="margin-top:12px">Ver más (${restantes} restantes)</button>` : ''}`
    : `<div class="vacio">No hay movimientos con esos filtros.</div>`}
  </div>`;
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
      <div style="margin:0 0 16px">${panelDonut(iol.filas.map((p) => ({ label: p.simbolo, valor: p.valorizado })), (v) => fmtARS(v))}</div>
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
      <div style="margin:0 0 16px">${panelDonut(cr.filas.map((p) => ({ label: p.simbolo, valor: p.valorizado })), (v) => fmtUSD(v, true))}</div>
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

// Proyección de patrimonio hacia el objetivo de independencia (gráfico de línea + fecha estimada)
function panelIndependencia(objetivoUSD, actualUSD, excedentePromARS) {
  if (!S.ccl) return `<div class="pie"><span class="muted">Necesito el CCL para proyectar — probá ↻ Precios.</span></div>`;
  if (actualUSD >= objetivoUSD) return `<div class="pie"><span style="color:var(--pos)">🎉 ¡Ya alcanzaste el objetivo de independencia!</span></div>`;
  const mensualUSD = excedentePromARS / S.ccl;
  if (!(mensualUSD > 0)) {
    return `<p class="muted s" style="margin:10px 0 0">📈 Para proyectar tu camino a la independencia necesitás al menos un mes con excedente positivo. Cargá ingresos y gastos y vuelvo a estimar.</p>`;
  }
  const meses = Math.ceil((objetivoUSD - actualUSD) / mensualUSD);
  if (meses > 1200) {
    return `<p class="muted s" style="margin:10px 0 0">Al ritmo actual el objetivo está a más de 100 años — subiendo el excedente mensual la proyección se vuelve útil.</p>`;
  }
  const pasos = Math.min(meses, 48);
  const valores = [];
  for (let i = 0; i <= pasos; i++) {
    const mm = Math.round((i / pasos) * meses);
    valores.push(Math.min(objetivoUSD, actualUSD + mm * mensualUSD));
  }
  const llegada = new Date();
  llegada.setMonth(llegada.getMonth() + meses);
  const fechaTxt = llegada.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const anios = Math.floor(meses / 12), resto = meses % 12;
  const dur = anios ? `${anios} año${anios > 1 ? 's' : ''}${resto ? ` y ${resto} m` : ''}` : `${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  return `<div style="margin-top:12px">
    ${lineaSVG(valores, objetivoUSD)}
    <p class="s" style="margin:10px 0 0">A ${fmtUSD(mensualUSD)}/mes de excedente llegás a ${fmtUSD(objetivoUSD)} en
      <b style="color:var(--accent-text)">${esc(fechaTxt)}</b> <span class="muted">(~${dur})</span>.</p>
  </div>`;
}

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
              ${m.clave !== 'independencia' ? `<button class="btn btn-chico btn-fantasma" data-histaportes="${m.id}">Historial</button>` : ''}
              ${m.clave !== 'emergencia' ? `<button class="btn btn-chico btn-fantasma" data-objetivo="${m.id}" data-moneda="${m.moneda}">Editar objetivo</button>` : ''}
              <button class="btn btn-chico btn-fantasma" data-borrar-meta="${m.id}">Borrar</button>
            </span>
          </div>
          ${m.nota && m.proy ? `<div class="pie"><span>${esc(m.nota)}</span></div>` : ''}
          ${m.clave === 'independencia' ? panelIndependencia(m.objetivo, m.acumulado, excedenteProm) : ''}
        </div>`).join('')}
      <p class="muted s" style="margin:14px 0 0">La proyección usa tu excedente promedio de los últimos meses: ${fmtARS(excedenteProm)}/mes.</p>
    </div>
  `;
}

// ---------------- Eventos post-render ----------------
function postRender(vista) {
  vista.querySelectorAll('[data-descartar]').forEach((b) => (b.onclick = () => {
    descartarAlerta(b.dataset.descartar); render();
  }));

  vista.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => {
    if (!confirm('¿Borrar este movimiento?')) return;
    try {
      await borrarMovimiento(b.dataset.borrar);
      S.datos.movimientos = S.datos.movimientos.filter((m) => m.id !== b.dataset.borrar);
      render(); toast('Movimiento borrado');
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-recconf]').forEach((b) => (b.onclick = async () => {
    const rec = (S.datos.recurrentes || []).find((x) => x.id === b.dataset.recconf);
    if (!rec) return;
    const inp = vista.querySelector(`[data-recmonto="${rec.id}"]`);
    const monto = num(inp?.value) ?? rec.monto;
    if (monto == null || monto <= 0) return toast('Monto inválido', false);
    try {
      const creado = await agregarMovimiento({
        fecha: hoyISO(), tipo: 'egreso', categoria: rec.categoria,
        descripcion: rec.descripcion || '', cantidad: null, monto,
      });
      S.datos.movimientos.unshift(creado);
      await actualizarRecurrente(rec.id, { ultimo_mes: mesActualKey() });
      rec.ultimo_mes = mesActualKey();
      render(); toast(`${esc(rec.categoria)} cargado ✔`);
    } catch (e) { toast('No se pudo confirmar: ' + e.message, false); }
  }));

  vista.querySelectorAll('[data-recskip]').forEach((b) => (b.onclick = async () => {
    const rec = (S.datos.recurrentes || []).find((x) => x.id === b.dataset.recskip);
    if (!rec) return;
    try {
      await actualizarRecurrente(rec.id, { ultimo_mes: mesActualKey() });
      rec.ultimo_mes = mesActualKey();
      render(); toast('Salteado este mes');
    } catch (e) { toast('Error: ' + e.message, false); }
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

  const selMes = vista.querySelector('#sel-mes-gasto');
  if (selMes) selMes.onchange = () => { mesGastoSel = selMes.value; render(); };

  const exp = vista.querySelector('#btn-export');
  if (exp) exp.onclick = () => abrirExport();

  const fMes = vista.querySelector('#f-mov-mes');
  if (fMes) fMes.onchange = () => { filtroMov.mes = fMes.value; filtroMov.limite = 50; render(); };
  const fTipo = vista.querySelector('#f-mov-tipo');
  if (fTipo) fTipo.onchange = () => { filtroMov.tipo = fTipo.value; filtroMov.limite = 50; render(); };
  const fCat = vista.querySelector('#f-mov-cat');
  if (fCat) fCat.onchange = () => { filtroMov.cat = fCat.value; filtroMov.limite = 50; render(); };
  const masMov = vista.querySelector('#btn-mas-mov');
  if (masMov) masMov.onclick = () => { filtroMov.limite += 50; render(); };
  vista.querySelectorAll('[data-editmov]').forEach((b) => (b.onclick = () => {
    const m = S.datos.movimientos.find((x) => x.id === b.dataset.editmov);
    if (m) abrirCargaEdit(m);
  }));

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

  vista.querySelectorAll('[data-aportar]').forEach((b) => (b.onclick = () => {
    const m = S.datos.metas.find((x) => x.id === b.dataset.aportar);
    if (m) abrirAportar(m);
  }));

  vista.querySelectorAll('[data-histaportes]').forEach((b) => (b.onclick = () => {
    const m = S.datos.metas.find((x) => x.id === b.dataset.histaportes);
    if (m) abrirHistAportes(m);
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
let cargaEdit = null; // movimiento en edición, o null para alta nueva

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
  cargaEdit = null;
  cargaTipo = tipo; cargaCat = null;
  pintarCarga();
}

function abrirCargaEdit(m) {
  cargaEdit = m;
  cargaTipo = m.tipo === 'egreso' ? 'egreso' : 'ingreso'; // producción vive en el segmento Ingreso
  cargaCat = m.categoria;
  pintarCarga();
}

function pintarCarga() {
  const cats = catsSegmento(cargaTipo);
  const aj = S.datos.ajustes || {};
  const esSesiones = cargaCat === 'Sesiones (producción)';
  const esDomicilios = cargaCat === 'Domicilios cobrados' || cargaCat === 'Domicilios hechos';
  const conCantidad = esSesiones || esDomicilios;
  const unidad = esSesiones ? (aj.valor_sesion || 0) : (aj.valor_domicilio || 35000);

  abrirSheet(`
    ${cargaEdit ? `<h2 style="margin:0 0 12px;font-size:18px">Editar movimiento</h2>` : ''}
    <div class="segmentos">
      <button class="seg-egreso ${cargaTipo === 'egreso' ? 'activo' : ''}" data-seg="egreso">Gasto</button>
      <button class="seg-ingreso ${cargaTipo === 'ingreso' ? 'activo' : ''}" data-seg="ingreso">Ingreso</button>
    </div>
    <div class="botonera">
      ${cats.map((c) => `<button class="cat-btn ${cargaCat === c.c ? 'activo' : ''}" data-cat="${esc(c.c)}">
        <span class="emoji">${c.e}</span><span>${esc(c.c)}</span></button>`).join('')}
      <button class="cat-btn" id="cat-add-inline" style="border-style:dashed;opacity:.85">
        <span class="emoji">➕</span><span>Nueva</span></button>
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
      ${cargaTipo === 'egreso' && !conCantidad && !cargaEdit ? `
      <label style="display:flex;align-items:center;gap:9px;font-size:14px;cursor:pointer;color:var(--muted)">
        <input id="f-recurrente" type="checkbox" style="width:18px;height:18px;flex:none"> Repetir todos los meses (gasto fijo)</label>` : ''}
      <button class="btn btn-primario" type="submit">${cargaEdit ? 'Guardar cambios' : `Confirmar ${cargaTipo === 'egreso' ? 'gasto' : 'ingreso'}`}</button>
    </form>` : `<p class="muted s" style="text-align:center;margin:16px 0 6px">Elegí una categoría</p>`}
  `);

  document.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { cargaTipo = b.dataset.seg; cargaCat = null; pintarCarga(); }));
  document.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { cargaCat = b.dataset.cat; pintarCarga(); setTimeout(() => $('#f-monto')?.focus(), 80); }));
  $('#cat-add-inline').onclick = () => abrirFormCat(null, pintarCarga, cargaTipo);

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

  // En modo edición, precargo los valores guardados (después del recalc para que no los pise)
  if (cargaEdit && cargaCat) {
    if ($('#f-fecha')) $('#f-fecha').value = cargaEdit.fecha;
    if ($('#f-desc')) $('#f-desc').value = cargaEdit.descripcion || '';
    if ($('#f-cantidad') && cargaEdit.cantidad) {
      $('#f-cantidad').value = cargaEdit.cantidad;
      if ($('#f-unidad')) $('#f-unidad').value = cargaEdit.monto / cargaEdit.cantidad;
    }
    if ($('#f-monto')) $('#f-monto').value = cargaEdit.monto;
  }

  const form = $('#form-carga');
  if (form) form.onsubmit = async (ev) => {
    ev.preventDefault();
    const monto = num($('#f-monto').value);
    if (monto == null || monto <= 0) return toast('Ingresá un monto válido', false);
    const datos = {
      fecha: $('#f-fecha').value || hoyISO(),
      tipo: cargaCat === 'Sesiones (producción)' || cargaCat === 'Domicilios hechos' ? 'sesiones' : cargaTipo,
      categoria: cargaCat,
      descripcion: $('#f-desc').value.trim(),
      cantidad: $('#f-cantidad') ? num($('#f-cantidad').value) : null,
      monto,
    };
    try {
      if (cargaEdit) {
        await actualizarMovimiento(cargaEdit.id, datos);
        Object.assign(cargaEdit, datos);
        S.datos.movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
        cargaEdit = null;
        cerrarSheet(); render();
        toast('Movimiento actualizado ✔');
      } else {
        const creado = await agregarMovimiento(datos);
        S.datos.movimientos.unshift(creado);
        // Si marcó "repetir todos los meses", creo la definición recurrente (ya confirmada este mes)
        if (datos.tipo === 'egreso' && $('#f-recurrente')?.checked) {
          try {
            const rec = await insertarRecurrente({
              categoria: datos.categoria, monto: datos.monto,
              descripcion: datos.descripcion, ultimo_mes: mesActualKey(),
            });
            (S.datos.recurrentes = S.datos.recurrentes || []).push(rec);
          } catch (e) { toast('Gasto guardado, pero no se pudo crear el recurrente: ' + e.message, false); }
        }
        cerrarSheet(); render();
        toast(`${cargaTipo === 'egreso' ? 'Gasto' : 'Ingreso'} de ${fmtARS(monto)} registrado ✔`);
      }
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-fantasma" id="aj-cats">🏷️ Editar categorías</button>
        <button type="button" class="btn btn-fantasma" id="aj-recurrentes">🔁 Gastos recurrentes</button>
      </div>
      <button class="btn btn-primario" type="submit">Guardar ajustes</button>
    </form>
  `);
  $('#aj-cats').onclick = () => abrirCategorias();
  $('#aj-recurrentes').onclick = () => abrirRecurrentes();
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

// ---------------- Sheet: exportar CSV ----------------
function abrirExport() {
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Exportar a CSV</h2>
    <p class="muted s" style="margin:0 0 14px">Dejá las fechas vacías para exportar todos los movimientos.</p>
    <form id="form-exp" style="display:grid;gap:12px">
      <div class="campos-2">
        <div class="campo"><label>Desde</label><input id="exp-desde" type="date"></div>
        <div class="campo"><label>Hasta</label><input id="exp-hasta" type="date"></div>
      </div>
      <button class="btn btn-primario" type="submit">Descargar CSV</button>
    </form>
  `);
  $('#form-exp').onsubmit = (ev) => {
    ev.preventDefault();
    const desde = $('#exp-desde').value, hasta = $('#exp-hasta').value;
    let movs = S.datos.movimientos.slice();
    if (desde) movs = movs.filter((m) => m.fecha >= desde);
    if (hasta) movs = movs.filter((m) => m.fecha <= hasta);
    if (!movs.length) return toast('No hay movimientos en ese rango', false);
    descargarCSV(movs);
    cerrarSheet();
  };
}

function descargarCSV(movs) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = movs.slice()
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .map((m) => [m.fecha, m.tipo, m.categoria, m.monto, m.descripcion || '']);
  const csv = [['fecha', 'tipo', 'categoria', 'monto_ars', 'nota'], ...filas]
    .map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `finanzas-${hoyISO()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('CSV descargado ✔');
}

// ---------------- Sheet: categorías ----------------
const SELECT_CSS = 'width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg);font-size:17px';
const grupoHdr = (g) => `<div class="s muted" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin:12px 0 2px">${esc(g)}</div>`;
let catSeg = 'egreso';

function abrirCategorias() { pintarCategorias(); }

function filaCat(c) {
  return `<div class="mov">
    <div class="icono">${c.e || '•'}</div>
    <div class="cuerpo"><div class="cat">${esc(c.c)}</div><div class="det">${esc(c.grupo || 'Sin rubro')}</div></div>
    <button class="btn btn-chico btn-fantasma" data-cat-edit="${esc(c.c)}">Editar</button>
    <button class="borrar" data-cat-del="${esc(c.c)}" title="Borrar" aria-label="Borrar categoría">✕</button>
  </div>`;
}

function pintarCategorias() {
  const user = catsUsuario();
  const delSeg = user.filter((x) => x.tipo === catSeg);
  const fijasSeg = CAT_FIJAS.filter((x) => (catSeg === 'egreso' ? x.tipo === 'egreso' : x.tipo !== 'egreso'));
  const grupos = {};
  delSeg.forEach((c) => { (grupos[c.grupo || 'Sin rubro'] = grupos[c.grupo || 'Sin rubro'] || []).push(c); });

  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Categorías</h2>
    <p class="muted s" style="margin:0 0 12px">Agregá, renombrá o borrá tus categorías y agrupalas por rubro. Los movimientos ya cargados no se tocan.</p>
    <div class="segmentos">
      <button class="seg-egreso ${catSeg === 'egreso' ? 'activo' : ''}" data-catseg="egreso">Gastos</button>
      <button class="seg-ingreso ${catSeg === 'ingreso' ? 'activo' : ''}" data-catseg="ingreso">Ingresos</button>
    </div>
    <div class="lista-mov" style="margin-top:6px">
      ${Object.keys(grupos).sort().map((g) => grupoHdr(g) + grupos[g].map(filaCat).join('')).join('')
        || `<div class="vacio">Todavía no tenés categorías propias de este tipo.</div>`}
      ${fijasSeg.length ? grupoHdr('Fijas del sistema') + fijasSeg.map((c) => `<div class="mov" style="opacity:.55">
        <div class="icono">${c.e}</div>
        <div class="cuerpo"><div class="cat">${esc(c.c)}</div><div class="det">${esc(c.grupo || '')} · no editable</div></div>
      </div>`).join('') : ''}
    </div>
    <button class="btn btn-primario" id="cat-nueva" style="margin-top:14px">+ Nueva categoría</button>
  `);

  document.querySelectorAll('[data-catseg]').forEach((b) => (b.onclick = () => { catSeg = b.dataset.catseg; pintarCategorias(); }));
  $('#cat-nueva').onclick = () => abrirFormCat(null);
  document.querySelectorAll('[data-cat-edit]').forEach((b) => (b.onclick = () => abrirFormCat(b.dataset.catEdit)));
  document.querySelectorAll('[data-cat-del]').forEach((b) => (b.onclick = () => borrarCategoria(b.dataset.catDel)));
}

function abrirFormCat(nombre, volver = pintarCategorias, tipoInicial = catSeg) {
  const user = catsUsuario();
  const cat = nombre ? user.find((x) => x.c === nombre) : null;
  const editar = !!cat;
  const tipo = cat ? cat.tipo : tipoInicial;
  const rubros = [...new Set([...CAT_FIJAS, ...user].map((x) => x.grupo).filter(Boolean))].sort();

  abrirSheet(`
    <h2 style="margin:0 0 14px;font-size:18px">${editar ? 'Editar categoría' : 'Nueva categoría'}</h2>
    <form id="form-cat" style="display:grid;gap:12px">
      <div class="campos-2">
        <div class="campo"><label>Emoji</label>
          <input id="cat-emoji" type="text" maxlength="4" value="${cat ? esc(cat.e) : ''}" placeholder="🛒"></div>
        <div class="campo"><label>Tipo</label>
          <select id="cat-tipo" style="${SELECT_CSS}">
            <option value="egreso" ${tipo === 'egreso' ? 'selected' : ''}>Gasto</option>
            <option value="ingreso" ${tipo === 'ingreso' ? 'selected' : ''}>Ingreso</option>
          </select></div>
      </div>
      <div class="campo"><label>Nombre</label>
        <input id="cat-nombre" type="text" maxlength="40" value="${cat ? esc(cat.c) : ''}" placeholder="Ej: Farmacia" required></div>
      <div class="campo"><label>Rubro (grupo grande)</label>
        <input id="cat-grupo" type="text" maxlength="30" list="rubros-list" value="${cat ? esc(cat.grupo || '') : ''}" placeholder="Ej: Salud">
        <datalist id="rubros-list">${rubros.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist></div>
      <button class="btn btn-primario" type="submit">${editar ? 'Guardar cambios' : 'Crear categoría'}</button>
      <button type="button" class="btn btn-fantasma" id="cat-volver" style="justify-self:start">← Volver</button>
    </form>
  `);

  $('#cat-volver').onclick = volver;
  $('#form-cat').onsubmit = async (ev) => {
    ev.preventDefault();
    const nuevo = {
      c: $('#cat-nombre').value.trim(),
      e: $('#cat-emoji').value.trim() || '•',
      tipo: $('#cat-tipo').value,
      grupo: $('#cat-grupo').value.trim(),
    };
    if (!nuevo.c) return toast('Poné un nombre', false);
    const lista = catsUsuario().slice();
    const choca = [...CAT_FIJAS, ...lista].some(
      (x) => x.c.toLowerCase() === nuevo.c.toLowerCase() && (!cat || x.c !== cat.c));
    if (choca) return toast('Ya existe una categoría con ese nombre', false);
    const nuevaLista = editar ? lista.map((x) => (x.c === cat.c ? nuevo : x)) : [...lista, nuevo];
    await guardarCats(nuevaLista, editar ? 'Categoría actualizada ✔' : 'Categoría creada ✔', volver);
  };
}

async function borrarCategoria(nombre) {
  if (!confirm(`¿Borrar la categoría "${nombre}"? Los movimientos ya cargados no se tocan.`)) return;
  const nuevaLista = catsUsuario().filter((x) => x.c !== nombre);
  await guardarCats(nuevaLista, 'Categoría borrada');
}

async function guardarCats(lista, msg, volver = pintarCategorias) {
  try {
    await guardarAjustes({ categorias: lista });
    S.datos.ajustes = { ...(S.datos.ajustes || {}), categorias: lista };
    refrescarCategorias();
    render();  // refresca emojis / botonera en las vistas
    volver();  // y vuelve a la pantalla de origen (gestor o carga)
    toast(msg);
  } catch (e) { toast('No se pudo guardar: ' + e.message, false); }
}

// ---------------- Sheet: gestor de gastos recurrentes ----------------
function pintarRecurrentes() {
  const recs = S.datos.recurrentes || [];
  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Gastos recurrentes</h2>
    <p class="muted s" style="margin:0 0 12px">Gastos fijos que se repiten cada mes. Al inicio de cada mes aparecen en Inicio para confirmar.</p>
    <div class="lista-mov">
      ${recs.length ? recs.map((rec) => `<div class="mov">
        <div class="icono">${EMOJI[rec.categoria] || '🔁'}</div>
        <div class="cuerpo"><div class="cat">${esc(rec.categoria)} ${rec.activo ? '' : '<span class="s muted">(pausado)</span>'}</div>
          <div class="det">${esc([fmtARS(rec.monto), rec.descripcion].filter(Boolean).join(' · '))}</div></div>
        <button class="btn btn-chico btn-fantasma" data-rec-edit="${rec.id}">Editar</button>
        <button class="borrar" data-rec-del="${rec.id}" title="Borrar" aria-label="Borrar recurrente">✕</button>
      </div>`).join('') : `<div class="vacio">Todavía no definiste gastos recurrentes. Creá uno o tildá "Repetir todos los meses" al cargar un gasto.</div>`}
    </div>
    <button class="btn btn-primario" id="rec-nuevo" style="margin-top:14px">+ Nuevo recurrente</button>
  `);
  $('#rec-nuevo').onclick = () => abrirFormRec(null);
  document.querySelectorAll('[data-rec-edit]').forEach((b) => (b.onclick = () => abrirFormRec(b.dataset.recEdit)));
  document.querySelectorAll('[data-rec-del]').forEach((b) => (b.onclick = () => borrarRec(b.dataset.recDel)));
}

function abrirRecurrentes() { pintarRecurrentes(); }

function abrirFormRec(id) {
  const rec = id ? (S.datos.recurrentes || []).find((x) => x.id === id) : null;
  const editar = !!rec;
  const egresos = catsSegmento('egreso');
  abrirSheet(`
    <h2 style="margin:0 0 14px;font-size:18px">${editar ? 'Editar recurrente' : 'Nuevo recurrente'}</h2>
    <form id="form-rec" style="display:grid;gap:12px">
      <div class="campo"><label>Categoría</label>
        <select id="rec-cat" style="${SELECT_CSS}">
          ${egresos.map((c) => `<option value="${esc(c.c)}" ${rec && rec.categoria === c.c ? 'selected' : ''}>${c.e} ${esc(c.c)}</option>`).join('')}
        </select></div>
      <div class="campos-2">
        <div class="campo"><label>Monto (ARS)</label>
          <input id="rec-monto" type="number" inputmode="decimal" step="any" min="0" value="${rec ? rec.monto : ''}" placeholder="0" required></div>
        <div class="campo"><label>Nota (opcional)</label>
          <input id="rec-desc" type="text" maxlength="80" value="${rec ? esc(rec.descripcion || '') : ''}"></div>
      </div>
      ${editar ? `<label style="display:flex;align-items:center;gap:9px;font-size:14px;cursor:pointer;color:var(--muted)">
        <input id="rec-activo" type="checkbox" style="width:18px;height:18px;flex:none" ${rec.activo ? 'checked' : ''}> Activo (aparece para confirmar cada mes)</label>` : ''}
      <button class="btn btn-primario" type="submit">${editar ? 'Guardar cambios' : 'Crear recurrente'}</button>
      <button type="button" class="btn btn-fantasma" id="rec-volver" style="justify-self:start">← Volver</button>
    </form>
  `);
  $('#rec-volver').onclick = () => pintarRecurrentes();
  $('#form-rec').onsubmit = async (ev) => {
    ev.preventDefault();
    const monto = num($('#rec-monto').value);
    if (monto == null || monto <= 0) return toast('Ingresá un monto válido', false);
    const datos = { categoria: $('#rec-cat').value, monto, descripcion: $('#rec-desc').value.trim() };
    try {
      if (editar) {
        datos.activo = $('#rec-activo').checked;
        await actualizarRecurrente(rec.id, datos);
        Object.assign(rec, datos);
        toast('Recurrente actualizado ✔');
      } else {
        const creado = await insertarRecurrente({ ...datos, ultimo_mes: null });
        (S.datos.recurrentes = S.datos.recurrentes || []).push(creado);
        toast('Recurrente creado ✔');
      }
      render(); pintarRecurrentes();
    } catch (e) { toast('No se pudo guardar: ' + e.message, false); }
  };
}

async function borrarRec(id) {
  const rec = (S.datos.recurrentes || []).find((x) => x.id === id);
  if (!rec || !confirm(`¿Borrar el recurrente "${rec.categoria}"? Los gastos ya cargados no se tocan.`)) return;
  try {
    await borrarRecurrente(id);
    S.datos.recurrentes = S.datos.recurrentes.filter((x) => x.id !== id);
    render(); pintarRecurrentes(); toast('Recurrente borrado');
  } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
}

// ---------------- Sheet: aportar a meta ----------------
function abrirAportar(m) {
  abrirSheet(`
    <h2 style="margin:0 0 14px;font-size:18px">Aportar a "${esc(m.nombre)}"</h2>
    <form id="form-aporte" style="display:grid;gap:12px">
      <div class="campo"><label>Monto (${esc(m.moneda)})</label>
        <input id="ap-monto" class="input-monto" type="number" inputmode="decimal" step="any" min="0" placeholder="0" required></div>
      <div class="campos-2">
        <div class="campo"><label>Fecha</label><input id="ap-fecha" type="date" value="${hoyISO()}" required></div>
        <div class="campo"><label>Nota (opcional)</label><input id="ap-nota" type="text" maxlength="80"></div>
      </div>
      <button class="btn btn-primario" type="submit">Registrar aporte</button>
    </form>
  `);
  setTimeout(() => $('#ap-monto')?.focus(), 80);
  $('#form-aporte').onsubmit = async (ev) => {
    ev.preventDefault();
    const monto = num($('#ap-monto').value);
    if (monto == null || monto <= 0) return toast('Ingresá un monto válido', false);
    try {
      const aporte = await insertarAporte({ meta_id: m.id, monto, fecha: $('#ap-fecha').value || hoyISO(), nota: $('#ap-nota').value.trim() });
      await actualizarMeta(m.id, { acumulado: m.acumulado + monto });
      m.acumulado += monto;
      if (!S.aportes) S.aportes = {};
      if (S.aportes[m.id]) S.aportes[m.id].unshift(aporte);
      cerrarSheet(); render(); toast('Aporte registrado ✔');
    } catch (e) { toast('No se pudo guardar: ' + e.message, false); }
  };
}

// ---------------- Sheet: historial de aportes ----------------
async function abrirHistAportes(m) {
  abrirSheet(`<div class="vacio">Cargando aportes…</div>`);
  let aportes;
  try {
    aportes = await cargarAportes(m.id);
    S.aportes = S.aportes || {}; S.aportes[m.id] = aportes;
  } catch (e) {
    return abrirSheet(`<h2 style="margin:0 0 8px;font-size:18px">Historial</h2>
      <p class="aviso info s">No se pudieron cargar los aportes: ${esc(e.message)}. ¿Corriste el SQL de la Tanda 3 en Supabase?</p>`);
  }

  const fmt = m.moneda === 'USD' ? fmtUSD : fmtARS;
  const total = aportes.reduce((a, x) => a + x.monto, 0);
  const meses = new Set(aportes.map((x) => mesKey(x.fecha))).size;
  const promMensual = meses ? total / meses : 0;
  let objetivo = m.objetivo;
  if (m.clave === 'emergencia') { const gp = promedio3m('gastos'); objetivo = gp > 0 ? gp * 3 : m.objetivo; }
  const falta = objetivo - m.acumulado;
  let estimado = '—';
  if (promMensual > 0 && falta > 0) {
    const n = Math.ceil(falta / promMensual);
    if (n <= 1200) {
      const d = new Date(); d.setMonth(d.getMonth() + n);
      estimado = `${d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })} (~${n} ${n === 1 ? 'mes' : 'meses'})`;
    }
  } else if (falta <= 0) estimado = '¡objetivo alcanzado! 🎉';

  abrirSheet(`
    <h2 style="margin:0 0 4px;font-size:18px">Aportes · ${esc(m.nombre)}</h2>
    <div class="fila-metricas" style="margin:6px 0 14px">
      <div class="mini-metric"><div class="lbl">Total aportado</div><div class="val num">${fmt(total)}</div></div>
      <div class="mini-metric"><div class="lbl">Promedio mensual</div><div class="val num">${fmt(promMensual)}</div></div>
      <div class="mini-metric"><div class="lbl">Llegada estimada</div><div class="val s">${esc(estimado)}</div></div>
    </div>
    ${aportes.length ? `<div class="lista-mov">${aportes.map((x) => `<div class="mov">
      <div class="cuerpo"><div class="cat">${fmt(x.monto)}</div><div class="det">${esc([fechaCorta(x.fecha), x.nota].filter(Boolean).join(' · '))}</div></div>
      <button class="borrar" data-delaporte="${x.id}" title="Borrar aporte" aria-label="Borrar aporte">✕</button>
    </div>`).join('')}</div>`
      : `<div class="vacio">Todavía no registraste aportes a esta meta.</div>`}
  `);

  document.querySelectorAll('[data-delaporte]').forEach((b) => (b.onclick = async () => {
    const ap = aportes.find((x) => x.id === b.dataset.delaporte);
    if (!ap || !confirm(`¿Borrar este aporte de ${fmt(ap.monto)}?`)) return;
    try {
      await borrarAporte(ap.id);
      await actualizarMeta(m.id, { acumulado: m.acumulado - ap.monto });
      m.acumulado -= ap.monto;
      if (S.aportes) delete S.aportes[m.id];
      render(); abrirHistAportes(m);
    } catch (e) { toast('No se pudo borrar: ' + e.message, false); }
  }));
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
    refrescarCategorias();
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
