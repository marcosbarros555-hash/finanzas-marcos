-- ============================================================
-- Cargar MGCNO (Pampa Energía ON Clase 22) en portfolio_rf
-- Pegar en: Supabase Dashboard → SQL Editor → Run
-- Requiere haber corrido antes migracion-tanda5.sql (crea portfolio_rf)
-- ============================================================
insert into portfolio_rf (
  user_id, ticker, nombre, subtipo, nominales,
  costo_ars, valorizado_ars, fecha_compra, vencimiento,
  tasa_cupon, amortizacion, nota
)
select
  id,
  'MGCNO',
  'Pampa Energía Clase 22',
  'on',
  372,
  588913.20,
  588913.20,
  '2026-07-27',
  '2028-10-04',
  5.75,  -- tasa real confirmada (Cohen / cbonds): 5,75% anual semestral. No era 7,5%.
  'bullet',
  'orden #183223236 · USD hard-dollar · ISIN AR0765746752'
from auth.users
where email = 'marcos.barros.555@gmail.com';
