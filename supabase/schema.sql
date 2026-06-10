-- ============================================================
-- FINANZAS MARCOS — Schema Supabase
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Ajustes generales del usuario (una fila por usuario)
create table if not exists ajustes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  efectivo_usd numeric not null default 0,
  valor_sesion numeric not null default 0,
  valor_domicilio numeric not null default 35000,
  updated_at timestamptz not null default now()
);

-- Portfolio CEDEARs / FCI en IOL
create table if not exists portfolio_iol (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  simbolo text not null,
  nombre text not null default '',
  cantidad numeric not null default 0,
  ppc numeric not null default 0,           -- precio promedio de compra en ARS
  ticker_yahoo text,                        -- ej: 'AAPL.BA'. NULL = precio manual (FCI)
  precio_manual numeric,                    -- usado cuando ticker_yahoo es NULL
  created_at timestamptz not null default now()
);

-- Portfolio cripto en Binance
create table if not exists portfolio_crypto (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  simbolo text not null,                    -- ej: 'BTC'
  nombre text not null default '',
  cantidad numeric not null default 0,
  precio_compra_usd numeric not null default 0,
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
drop trigger if exists trg_uid_mov on movimientos;
create trigger trg_uid_mov before insert on movimientos for each row execute function set_user_id();
drop trigger if exists trg_uid_metas on metas;
create trigger trg_uid_metas before insert on metas for each row execute function set_user_id();
drop trigger if exists trg_uid_ajustes on ajustes;
create trigger trg_uid_ajustes before insert on ajustes for each row execute function set_user_id();

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y toca SOLO sus filas
-- ------------------------------------------------------------
alter table ajustes enable row level security;
alter table portfolio_iol enable row level security;
alter table portfolio_crypto enable row level security;
alter table movimientos enable row level security;
alter table metas enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ajustes','portfolio_iol','portfolio_crypto','movimientos','metas'] loop
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
