-- ============================================================
-- TANDA 5 — Reestructuración por clase de activo (4 pilares) + ONs
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- Es idempotente: se puede correr más de una vez sin problema.
-- ============================================================

-- Ajustes: efectivo en pesos + objetivos de asignación por pilar (%)
alter table ajustes add column if not exists efectivo_ars numeric not null default 0;
alter table ajustes add column if not exists target_liquidez numeric not null default 15;
alter table ajustes add column if not exists target_renta_fija numeric not null default 30;
alter table ajustes add column if not exists target_renta_variable numeric not null default 35;
alter table ajustes add column if not exists target_cripto numeric not null default 20;

-- Subtipo dentro de Renta Variable (CEDEAR vs FCI)
alter table portfolio_iol add column if not exists subtipo text not null default 'cedear';

-- Subtipo dentro de Cripto (core BTC/ETH vs satélite altcoins)
alter table portfolio_crypto add column if not exists subtipo text not null default 'cripto_satelite';

-- Renta Fija (ONs y similares) — sin cotización en vivo, valorizado a mano
create table if not exists portfolio_rf (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  nombre text not null default '',
  subtipo text not null default 'on',
  nominales numeric not null default 0,
  costo_ars numeric not null default 0,
  valorizado_ars numeric not null default 0,
  fecha_compra date,
  vencimiento date,
  tasa_cupon numeric,
  amortizacion text default 'bullet' check (amortizacion in ('bullet','amortizable')),
  nota text not null default '',
  created_at timestamptz not null default now()
);

drop trigger if exists trg_uid_rf on portfolio_rf;
create trigger trg_uid_rf before insert on portfolio_rf for each row execute function set_user_id();

alter table portfolio_rf enable row level security;

do $$
declare t text;
begin
  foreach t in array array['portfolio_rf'] loop
    execute format('drop policy if exists "propietario_select" on %I', t);
    execute format('drop policy if exists "propietario_insert" on %I', t);
    execute format('drop policy if exists "propietario_update" on %I', t);
    execute format('drop policy if exists "propietario_delete" on %I', t);
    execute format('create policy "propietario_select" on %I for select using (auth.uid() = user_id)', t);
    execute format('create policy "propietario_insert" on %I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "propietario_update" on %I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "propietario_delete" on %I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;
