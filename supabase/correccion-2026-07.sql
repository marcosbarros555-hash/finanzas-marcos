-- ============================================================
-- Corrección de datos — 2026-07
-- Pegar en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1) Efectivo en USD: se había cargado como si fuera dólares reales, pero
--    era pesos sobrantes sin convertir. Se resetea a 0 — cargá el número
--    real en Ajustes el día que efectivamente compres dólares.
update ajustes a
set efectivo_usd = 0
from auth.users u
where a.user_id = u.id
  and u.email = 'marcos.barros.555@gmail.com';

-- 2) Cripto — sobrescribe (no suma) con las tenencias reales de Binance
--    al 2026-07-27, incluida la compra de BTC/ETH de ese mes.
update portfolio_crypto p
set cantidad = 0.0118875,
    precio_compra_usd = 82561.51,   -- costo promedio real (confirmado con el usuario;
                                     -- el dato original de 64045 no cerraba con el PnL de -22,43%)
    subtipo = 'cripto_core'
from auth.users u
where p.user_id = u.id
  and u.email = 'marcos.barros.555@gmail.com'
  and p.simbolo = 'BTC';

update portfolio_crypto p
set cantidad = 0.15420677,
    precio_compra_usd = 3414.09,
    subtipo = 'cripto_core'
from auth.users u
where p.user_id = u.id
  and u.email = 'marcos.barros.555@gmail.com'
  and p.simbolo = 'ETH';
