// /api/precios — Proxy serverless a Yahoo Finance.
// Los CEDEARs cotizan en BYMA con sufijo .BA y Yahoo los devuelve EN PESOS.
// El navegador no puede pegarle a Yahoo por CORS; este endpoint sí (corre en el server de Vercel).
// Uso: /api/precios?simbolos=AAPL.BA,NVDA.BA,SPY.BA

const cache = new Map(); // simbolo -> { precio, cierreAnterior, t }
const TTL_MS = 5 * 60 * 1000; // 5 minutos

async function precioYahoo(simbolo) {
  const hit = cache.get(simbolo);
  if (hit && Date.now() - hit.t < TTL_MS) return hit;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=1d`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const j = await r.json();
  const meta = j?.chart?.result?.[0]?.meta;
  const out = {
    precio: meta?.regularMarketPrice ?? null,
    cierreAnterior: meta?.chartPreviousClose ?? meta?.previousClose ?? null,
    moneda: meta?.currency ?? null,
    t: Date.now(),
  };
  if (out.precio != null) cache.set(simbolo, out);
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const simbolos = String(req.query.simbolos || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (simbolos.length === 0) {
    return res.status(400).json({ error: 'Falta el parámetro simbolos' });
  }

  const precios = {};
  await Promise.all(
    simbolos.map(async (s) => {
      try {
        const { precio, cierreAnterior, moneda } = await precioYahoo(s);
        precios[s] = { precio, cierreAnterior, moneda };
      } catch {
        precios[s] = { precio: null, cierreAnterior: null, moneda: null };
      }
    })
  );

  return res.status(200).json({ precios, actualizado: new Date().toISOString() });
}
