// Utilidades de formato, fechas y gráficos SVG sin dependencias.

const nfARS0 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const nfARS2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const nfUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const nfUSD2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const nfNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export const fmtARS = (v, dec = false) => (v == null || isNaN(v)) ? '—' : (dec ? nfARS2 : nfARS0).format(v);
export const fmtUSD = (v, dec = false) => (v == null || isNaN(v)) ? '—' : (dec ? nfUSD2 : nfUSD).format(v);
export const fmtNum = (v) => (v == null || isNaN(v)) ? '—' : nfNum.format(v);
export const fmtPct = (v) => (v == null || isNaN(v) || !isFinite(v)) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
export const signo = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const mesKey = (fechaISO) => fechaISO.slice(0, 7); // 'AAAA-MM'
export const mesActualKey = () => hoyISO().slice(0, 7);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function nombreMes(key, largo = false) {
  const [a, m] = key.split('-').map(Number);
  const largos = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return largo ? `${largos[m - 1]} ${a}` : `${MESES[m - 1]} ${String(a).slice(2)}`;
}

// Últimos N meses como keys 'AAAA-MM', del más viejo al más nuevo
export function ultimosMeses(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export function fechaCorta(fechaISO) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

// ------------------------------------------------------------
// Donut SVG — segments: [{ valor, color, label, titulo? }]
// `titulo` (opcional) muestra un tooltip nativo al pasar el mouse por el sector.
// ------------------------------------------------------------
export function donutSVG(segments, size = 132, grosor = 16) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.valor), 0);
  if (total <= 0) return '';
  const r = (size - grosor) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.valor > 0).length > 1 ? 2 : 0; // respiro entre segmentos
  let offset = 0;
  const arcs = segments.map((s) => {
    const frac = Math.max(0, s.valor) / total;
    const dash = Math.max(frac * circ - gap, 0.5);
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${grosor}"
      stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-(offset + gap / 2)}"
      transform="rotate(-90 ${c} ${c})" stroke-linecap="butt">${s.titulo ? `<title>${esc(s.titulo)}</title>` : ''}</circle>`;
    offset += frac * circ;
    return el;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Distribución de patrimonio">${arcs.join('')}</svg>`;
}

// ------------------------------------------------------------
// Barras mensuales SVG — datos: [{ mes, ingresos, egresos }]
// Dos barras por mes, escala compartida.
// ------------------------------------------------------------
export function barrasSVG(datos, w = 640, h = 180) {
  const max = Math.max(1, ...datos.flatMap((d) => [d.ingresos, d.egresos]));
  const padB = 22, padT = 8;
  const areaH = h - padB - padT;
  const grupoW = w / datos.length;
  const barW = Math.min(16, grupoW * 0.28);
  const gap = 3;

  const barras = datos.map((d, i) => {
    const x0 = i * grupoW + grupoW / 2;
    const hi = (d.ingresos / max) * areaH;
    const he = (d.egresos / max) * areaH;
    return `
      <rect x="${x0 - barW - gap / 2}" y="${padT + areaH - hi}" width="${barW}" height="${Math.max(hi, 1)}" rx="3" class="bar-in"/>
      <rect x="${x0 + gap / 2}" y="${padT + areaH - he}" width="${barW}" height="${Math.max(he, 1)}" rx="3" class="bar-eg"/>
      <text x="${x0}" y="${h - 6}" text-anchor="middle" class="bar-label">${esc(d.mes)}</text>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" class="chart-barras" role="img" aria-label="Ingresos y gastos por mes" preserveAspectRatio="none">
    <line x1="0" y1="${padT + areaH}" x2="${w}" y2="${padT + areaH}" class="bar-eje"/>
    ${barras.join('')}
  </svg>`;
}

// ------------------------------------------------------------
// Línea SVG simple — valores: [n] (serie a graficar).
// objetivo: n | null (línea punteada de meta, opcional).
// opts.titulos: [string] — dibuja un marcador por punto con tooltip nativo.
// ------------------------------------------------------------
export function lineaSVG(valores, objetivo = null, w = 560, h = 150, opts = {}) {
  if (valores.length < 2) return '';
  const max = Math.max(objetivo ?? -Infinity, ...valores);
  const min = Math.min(0, ...valores);
  const padB = 14, padT = 10;
  const areaH = h - padB - padT;
  const rango = max - min || 1;
  const x = (i) => (i / (valores.length - 1)) * w;
  const y = (v) => padT + areaH - ((v - min) / rango) * areaH;
  const linea = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `M0 ${(padT + areaH).toFixed(1)} ` +
    valores.map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ') +
    ` L${w} ${(padT + areaH).toFixed(1)} Z`;
  const puntos = (opts.titulos || []).length === valores.length
    ? valores.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="8" fill="transparent" stroke="none"><title>${esc(opts.titulos[i])}</title></circle>
      <circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="var(--accent-text)" stroke="var(--surface)" stroke-width="2" pointer-events="none"/>`).join('')
    : '';
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(opts.label || 'Evolución')}">
    ${objetivo != null ? `<line x1="0" y1="${y(objetivo).toFixed(1)}" x2="${w}" y2="${y(objetivo).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="5 4" opacity="0.55"/>` : ''}
    <path d="${area}" fill="var(--accent-soft)" opacity="0.55"/>
    <path d="${linea}" fill="none" stroke="var(--accent-text)" stroke-width="2.5" stroke-linejoin="round"/>
    ${puntos}
  </svg>`;
}
