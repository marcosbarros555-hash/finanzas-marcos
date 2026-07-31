-- ============================================================
-- FINANZAS MARCOS — Schema Supabase
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Ajustes generales del usuario (una fila por usuario)
create table if not exists ajustes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  efectivo_usd numeric not null default 0,
  efectivo_ars numeric not null default 0,  -- pesos en mano/caja (pilar Liquidez)
  valor_sesion numeric not null default 0,
  valor_domicilio numeric not null default 35000,
  categorias jsonb,                         -- categorías de ingreso/egreso editables por el usuario
  -- objetivos de asignación por clase de activo (%, deberían sumar 100)
  target_liquidez numeric not null default 15,
  target_renta_fija numeric not null default 30,
  target_renta_variable numeric not null default 35,
  target_cripto numeric not null default 20,
  updated_at timestamptz not null default now()
);
-- Para bases ya creadas (idempotente): agrega columnas si todavía no existen
alter table ajustes add column if not exists categorias jsonb;
alter table ajustes add column if not exists efectivo_ars numeric not null default 0;
alter table ajustes add column if not exists target_liquidez numeric not null default 15;
alter table ajustes add column if not exists target_renta_fija numeric not null default 30;
alter table ajustes add column if not exists target_renta_variable numeric not null default 35;
alter table ajustes add column if not exists target_cripto numeric not null default 20;

-- Portfolio CEDEARs / FCI en IOL — clase de activo: Renta Variable
create table if not exists portfolio_iol (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  simbolo text not null,
  nombre text not null default '',
  cantidad numeric not null default 0,
  ppc numeric not null default 0,           -- precio promedio de compra en ARS
  ticker_yahoo text,                        -- ej: 'AAPL.BA'. NULL = precio manual (FCI)
  precio_manual numeric,                    -- usado cuando ticker_yahoo es NULL
  subtipo text not null default 'cedear' check (subtipo in ('cedear','fci')),
  created_at timestamptz not null default now()
);
alter table portfolio_iol add column if not exists subtipo text not null default 'cedear';

-- Portfolio cripto en Binance — clase de activo: Cripto
create table if not exists portfolio_crypto (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  simbolo text not null,                    -- ej: 'BTC'
  nombre text not null default '',
  cantidad numeric not null default 0,
  precio_compra_usd numeric not null default 0,
  subtipo text not null default 'cripto_satelite' check (subtipo in ('cripto_core','cripto_satelite')),
  created_at timestamptz not null default now()
);
alter table portfolio_crypto add column if not exists subtipo text not null default 'cripto_satelite';

-- Portfolio renta fija (ONs y similares) — clase de activo: Renta Fija
-- Sin cotización en vivo: el valorizado se actualiza a mano (mark-to-market manual).
create table if not exists portfolio_rf (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  nombre text not null default '',
  subtipo text not null default 'on',       -- 'on' (obligación negociable) por ahora
  nominales numeric not null default 0,
  costo_ars numeric not null default 0,     -- lo pagado (para PnL)
  valorizado_ars numeric not null default 0,-- valor actual, carga manual
  fecha_compra date,
  vencimiento date,
  tasa_cupon numeric,                       -- % anual
  amortizacion text default 'bullet' check (amortizacion in ('bullet','amortizable')),
  nota text not null default '',
  created_at timestamptz not null default now()
);

-- Movimientos individuales (la unidad atómica del flujo mensual)
-- tipo: 'ingreso' = plata que entra | 'egreso' = plata que sale
--       'sesiones' = producción del mes (NO es cash; sirve para proyectar sueldo)
create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('ingreso','egreso','sesiones')),
  categoria text not null,
  descripcion text not null default '',
  cantidad numeric,                         -- p/ sesiones o domicilios
  monto numeric not null,                   -- siempre en ARS
  created_at timestamptz not null default now()
);
create index if not exists movimientos_user_fecha on movimientos (user_id, fecha desc);

-- Metas de ahorro
-- clave 'emergencia' tiene objetivo auto-calculado (3 meses de gastos promedio)
create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clave text not null,                      -- 'emergencia' | 'consultorio' | 'viaje' | 'independencia' | libre
  nombre text not null,
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  objetivo numeric not null default 0,
  acumulado numeric not null default 0,
  orden int not null default 0,
  created_at timestamptz not null default now()
);

-- Aportes individuales a cada meta (historial de ahorro)
create table if not exists aportes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meta_id uuid not null references metas (id) on delete cascade,
  monto numeric not null,
  fecha date not null default current_date,
  nota text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists aportes_meta on aportes (meta_id, fecha desc);

-- Definiciones de gastos recurrentes mensuales
create table if not exists recurrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  categoria text not null,
  monto numeric not null default 0,
  descripcion text not null default '',
  ultimo_mes text,                          -- 'AAAA-MM' del último mes confirmado
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Snapshot mensual del patrimonio (para el gráfico de evolución)
create table if not exists patrimonio_hist (
  user_id uuid not null references auth.users (id) on delete cascade,
  mes text not null,                        -- 'AAAA-MM'
  ars numeric not null,
  usd numeric not null,
  ccl numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, mes)
);

-- ------------------------------------------------------------
-- user_id automático en inserts (el cliente no necesita mandarlo)
-- ------------------------------------------------------------
create or replace function set_user_id()
returns trigger language plpgsql security definer as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_uid_iol on portfolio_iol;
create trigger trg_uid_iol before insert on portfolio_iol for each row execute function set_user_id();
drop trigger if exists trg_uid_crypto on portfolio_crypto;
create trigger trg_uid_crypto before insert on portfolio_crypto for each row execute function set_user_id();
drop trigger if exists trg_uid_rf on portfolio_rf;
create trigger trg_uid_rf before insert on portfolio_rf for each row execute function set_user_id();
drop trigger if exists trg_uid_mov on movimientos;
create trigger trg_uid_mov before insert on movimientos for each row execute function set_user_id();
drop trigger if exists trg_uid_metas on metas;
create trigger trg_uid_metas before insert on metas for each row execute function set_user_id();
drop trigger if exists trg_uid_ajustes on ajustes;
create trigger trg_uid_ajustes before insert on ajustes for each row execute function set_user_id();
drop trigger if exists trg_uid_aportes on aportes;
create trigger trg_uid_aportes before insert on aportes for each row execute function set_user_id();
drop trigger if exists trg_uid_recurrentes on recurrentes;
create trigger trg_uid_recurrentes before insert on recurrentes for each row execute function set_user_id();
drop trigger if exists trg_uid_pathist on patrimonio_hist;
create trigger trg_uid_pathist before insert on patrimonio_hist for each row execute function set_user_id();

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca SOLO sus filas
-- ------------------------------------------------------------
alter table ajustes enable row level security;
alter table portfolio_iol enable row level security;
alter table portfolio_crypto enable row level security;
alter table portfolio_rf enable row level security;
alter table movimientos enable row level security;
alter table metas enable row level security;
alter table aportes enable row level security;
alter table recurrentes enable row level security;
alter table patrimonio_hist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ajustes','portfolio_iol','portfolio_crypto','portfolio_rf','movimientos','metas','aportes','recurrentes','patrimonio_hist'] loop
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
