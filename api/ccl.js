// /api/ccl — Contado con liquidación del día.
// Fuente primaria: dolarapi.com (gratuita, sin API key).
// Fallback: USDT/ARS de Binance (dólar cripto, difiere ~1-2% del CCL real).

let cache = { valor: null, fuente: null, t: 0 };
const TTL_MS = 10 * 60 * 1000; // 10 minutos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  if (cache.valor && Date.now() - cache.t < TTL_MS) {
    return res.status(200).json({ ccl: cache.valor, fuente: cache.fuente, cacheado: true });
  }

  // 1) dolarapi — CCL real
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares/contadoconliqui');
    if (r.ok) {
      const j = await r.json();
      const valor = (Number(j.venta) + Number(j.compra)) / 2 || Number(j.venta);
      if (valor > 0) {
        cache = { valor, fuente: 'dolarapi (CCL)', t: Date.now() };
        return res.status(200).json({ ccl: valor, fuente: cache.fuente });
      }
    }
  } catch { /* sigue al fallback */ }

  // 2) Binance USDT/ARS — dólar cripto como aproximación
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTARS');
    if (r.ok) {
      const j = await r.json();
      const valor = Number(j.price);
      if (valor > 0) {
        cache = { valor, fuente: 'Binance USDT/ARS (aprox.)', t: Date.now() };
        return res.status(200).json({ ccl: valor, fuente: cache.fuente });
      }
    }
  } catch { /* sin fuente */ }

  // 3) Último valor cacheado aunque esté vencido, o error explícito
  if (cache.valor) {
    return res.status(200).json({ ccl: cache.valor, fuente: cache.fuente + ' (desactualizado)' });
  }
  return res.status(502).json({ error: 'No se pudo obtener el CCL de ninguna fuente' });
}
