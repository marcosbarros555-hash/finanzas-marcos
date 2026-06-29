-- ============================================================
-- TANDA 3 — Aportes a metas + Gastos recurrentes
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- Es idempotente: se puede correr más de una vez sin problema.
-- ============================================================

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

-- user_id automático en inserts (reusa la función set_user_id() del schema base)
drop trigger if exists trg_uid_aportes on aportes;
create trigger trg_uid_aportes before insert on aportes for each row execute function set_user_id();
drop trigger if exists trg_uid_recurrentes on recurrentes;
create trigger trg_uid_recurrentes before insert on recurrentes for each row execute function set_user_id();

-- Row Level Security: cada usuario ve y toca SOLO sus filas
alter table aportes enable row level security;
alter table recurrentes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['aportes','recurrentes'] loop
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
