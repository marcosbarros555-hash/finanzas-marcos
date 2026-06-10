// Precios en vivo.
// - CEDEARs: /api/precios (proxy serverless → Yahoo Finance, tickers .BA, EN PESOS)
// - Cripto:  Binance API pública (CORS habilitado, directo desde el navegador)
// - CCL:     /api/ccl (dolarapi con fallback a Binance USDT/ARS)

export async function preciosCedears(tickers) {
  if (!tickers.length) return {};
  const r = await fetch(`/api/precios?simbolos=${encodeURIComponent(tickers.join(','))}`);
  if (!r.ok) throw new Error('No se pudieron traer los precios de CEDEARs');
  const j = await r.json();
  return j.precios || {};
}

export async function preciosCrypto(simbolos) {
  if (!simbolos.length) return {};
  const pares = simbolos.map((s) => `"${s}USDT"`).join(',');
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${pares}]`);
  if (!r.ok) throw new Error('No se pudieron traer los precios de Binance');
  const arr = await r.json();
  const out = {};
  for (const it of arr) out[it.symbol.replace('USDT', '')] = Number(it.price);
  return out;
}

export async function cclDelDia() {
  const r = await fetch('/api/ccl');
  if (!r.ok) throw new Error('No se pudo obtener el CCL');
  return r.json(); // { ccl, fuente }
}
