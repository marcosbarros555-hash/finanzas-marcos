-- ============================================================
-- TANDA 4 — Evolución del patrimonio (+ columna categorias pendiente)
-- Pegar completo en: Supabase Dashboard → SQL Editor → Run
-- Es idempotente: se puede correr más de una vez sin problema.
-- ============================================================

-- Pendiente de la tanda de categorías editables (si ya la corriste, no hace nada)
alter table ajustes add column if not exists categorias jsonb;

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

-- user_id automático en inserts (reusa la función set_user_id() del schema base)
drop trigger if exists trg_uid_pathist on patrimonio_hist;
create trigger trg_uid_pathist before insert on patrimonio_hist for each row execute function set_user_id();

-- Row Level Security: cada usuario ve y toca SOLO sus filas
alter table patrimonio_hist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['patrimonio_hist'] loop
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
