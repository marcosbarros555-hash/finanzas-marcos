// Datos iniciales — se importan una sola vez con el botón "Cargar mis datos iniciales".
// Después de importados, la fuente de verdad es Supabase.

export const SEED = {
  ajustes: {
    efectivo_usd: 1000,
    valor_sesion: 0, // completalo en Ajustes con tu valor por sesión actual
    valor_domicilio: 35000,
  },

  iol: [
    { simbolo: 'AAPL',    nombre: 'Apple Inc.',            cantidad: 4,         ppc: 16217.50, ticker_yahoo: 'AAPL.BA' },
    { simbolo: 'AMZN',    nombre: 'Amazon',                cantidad: 32,        ppc: 2246.13,  ticker_yahoo: 'AMZN.BA' },
    { simbolo: 'ASML',    nombre: 'ASML Holding',          cantidad: 3,         ppc: 7830.00,  ticker_yahoo: 'ASML.BA' },
    { simbolo: 'BRKB',    nombre: 'Berkshire Hathaway',    cantidad: 3,         ppc: 31155.00, ticker_yahoo: 'BRKB.BA' },
    { simbolo: 'GOOGL',   nombre: 'Alphabet',              cantidad: 12,        ppc: 6525.00,  ticker_yahoo: 'GOOGL.BA' },
    { simbolo: 'IOLPORA', nombre: 'IOL Portafolio Potenciado', cantidad: 28536.89, ppc: 1.50, ticker_yahoo: null, precio_manual: 1.50 },
    { simbolo: 'JNJ',     nombre: 'Johnson & Johnson',     cantidad: 5,         ppc: 17760.00, ticker_yahoo: 'JNJ.BA' },
    { simbolo: 'KO',      nombre: 'Coca-Cola',             cantidad: 3,         ppc: 19668.33, ticker_yahoo: 'KO.BA' },
    { simbolo: 'MSFT',    nombre: 'Microsoft',             cantidad: 4,         ppc: 23851.25, ticker_yahoo: 'MSFT.BA' },
    { simbolo: 'NVDA',    nombre: 'Nvidia',                cantidad: 21,        ppc: 11687.66, ticker_yahoo: 'NVDA.BA' },
    { simbolo: 'SPY',     nombre: 'SPDR S&P 500',          cantidad: 15,        ppc: 17893.33, ticker_yahoo: 'SPY.BA' },
    { simbolo: 'XOM',     nombre: 'Exxon Mobil',           cantidad: 6,         ppc: 19076.67, ticker_yahoo: 'XOM.BA' },
  ],

  crypto: [
    { simbolo: 'BTC',  nombre: 'Bitcoin',   cantidad: 0.00883367,   precio_compra_usd: 89593.07 },
    { simbolo: 'ETH',  nombre: 'Ethereum',  cantidad: 0.11783221,   precio_compra_usd: 3930.57 },
    { simbolo: 'SOL',  nombre: 'Solana',    cantidad: 1.27641112,   precio_compra_usd: 200.92 },
    { simbolo: 'AVAX', nombre: 'Avalanche', cantidad: 4.38046097,   precio_compra_usd: 26.45 },
    { simbolo: 'ADA',  nombre: 'Cardano',   cantidad: 128.82510521, precio_compra_usd: 0.8326 },
    { simbolo: 'XRP',  nombre: 'XRP',       cantidad: 22.37415512,  precio_compra_usd: 3.08 },
    { simbolo: 'POL',  nombre: 'Polygon',   cantidad: 206.59091183, precio_compra_usd: 0.2499 },
    { simbolo: 'LINK', nombre: 'Chainlink', cantidad: 1.28601484,   precio_compra_usd: 22.18 },
  ],

  metas: [
    { clave: 'emergencia',    nombre: 'Fondo de emergencia',     moneda: 'ARS', objetivo: 0,        acumulado: 0, orden: 1 },
    { clave: 'consultorio',   nombre: 'Consultorio propio',      moneda: 'ARS', objetivo: 15000000, acumulado: 0, orden: 2 },
    { clave: 'viaje',         nombre: 'Viaje largo',             moneda: 'ARS', objetivo: 5000000,  acumulado: 0, orden: 3 },
    { clave: 'independencia', nombre: 'Independencia financiera', moneda: 'USD', objetivo: 100000,  acumulado: 0, orden: 4 },
  ],
};
