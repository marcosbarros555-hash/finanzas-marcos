// Capa de datos — Supabase (auth + CRUD). Toda la app habla con la DB a través de este módulo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.FINZ_CONFIG || {};
export const configOK =
  cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('TU-PROYECTO') &&
  cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes('TU-ANON');

export const sb = configOK ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

// ---------------- Auth ----------------
export async function sesionActual() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function enviarMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function cerrarSesion() {
  await sb.auth.signOut();
}

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_ev, session) => cb(session));
}

// ---------------- Lecturas ----------------
function lanza(error) {
  if (error) throw new Error(error.message);
}

export async function cargarTodo() {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 13);
  const desdeISO = desde.toISOString().slice(0, 10);

  const [aj, iol, cr, mov, metas] = await Promise.all([
    sb.from('ajustes').select('*').maybeSingle(),
    sb.from('portfolio_iol').select('*').order('simbolo'),
    sb.from('portfolio_crypto').select('*').order('simbolo'),
    sb.from('movimientos').select('*').gte('fecha', desdeISO).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('metas').select('*').order('orden'),
  ]);
  [aj, iol, cr, mov, metas].forEach((r) => lanza(r.error));

  return {
    ajustes: aj.data,
    iol: iol.data || [],
    crypto: cr.data || [],
    movimientos: mov.data || [],
    metas: metas.data || [],
  };
}

// ---------------- Escrituras ----------------
export async function guardarAjustes(parcial) {
  const { data: s } = await sb.auth.getSession();
  const user_id = s.session.user.id;
  const { error } = await sb.from('ajustes').upsert({ user_id, ...parcial, updated_at: new Date().toISOString() });
  lanza(error);
}

export async function agregarMovimiento(mov) {
  const { data, error } = await sb.from('movimientos').insert(mov).select().single();
  lanza(error);
  return data;
}

export async function borrarMovimiento(id) {
  const { error } = await sb.from('movimientos').delete().eq('id', id);
  lanza(error);
}

export async function actualizarPosicionIOL(id, parcial) {
  const { error } = await sb.from('portfolio_iol').update(parcial).eq('id', id);
  lanza(error);
}

export async function actualizarPosicionCrypto(id, parcial) {
  const { error } = await sb.from('portfolio_crypto').update(parcial).eq('id', id);
  lanza(error);
}

export async function actualizarMeta(id, parcial) {
  const { error } = await sb.from('metas').update(parcial).eq('id', id);
  lanza(error);
}

// ---------------- Importación inicial ----------------
export async function importarSeed(SEED) {
  await guardarAjustes(SEED.ajustes);
  const r1 = await sb.from('portfolio_iol').insert(SEED.iol.map((x) => ({ ...x })));
  lanza(r1.error);
  const r2 = await sb.from('portfolio_crypto').insert(SEED.crypto.map((x) => ({ ...x })));
  lanza(r2.error);
  const r3 = await sb.from('metas').insert(SEED.metas.map((x) => ({ ...x })));
  lanza(r3.error);
}
