# Finanzas · Marcos

App de finanzas personales: flujo mensual de ingresos/egresos, portfolio IOL (CEDEARs) + Binance (cripto) con precios en vivo, metas de ahorro con proyección. Mobile-first, modo oscuro automático, datos persistidos en Supabase con autenticación.

## Arquitectura

```
index.html + css/ + js/      → frontend estático (sin build, sin dependencias)
api/precios.js               → función serverless Vercel: proxy a Yahoo Finance
                               (CEDEARs cotizan en BYMA con sufijo .BA → precio EN PESOS)
api/ccl.js                   → función serverless: CCL vía dolarapi, fallback Binance USDT/ARS
supabase/schema.sql          → tablas + Row Level Security + triggers
config.js                    → tus credenciales de Supabase (editás esto una vez)
```

**Por qué así:** sin build step nada se rompe nunca en deploy, Claude Code puede iterar archivos sueltos, y las funciones serverless resuelven el CORS que bloqueaba Yahoo Finance desde el navegador. La cripto va directo a la API pública de Binance (CORS habilitado). La seguridad de los datos la garantiza RLS en Supabase: cada fila tiene `user_id` y solo vos podés leer/escribir las tuyas, aunque la URL sea pública.

---

## Setup — 4 pasos, una sola vez

### 1. Supabase (~5 min)

1. Entrá a [supabase.com](https://supabase.com) → **New project** (podés usar la misma organización que KFD, pero proyecto separado — no mezcles las bases).
2. Cuando el proyecto esté listo: **SQL Editor** → pegá el contenido completo de `supabase/schema.sql` → **Run**. Tiene que decir "Success".
3. **Authentication → Sign In / Up**: verificá que **Email** esté habilitado (viene por defecto).
4. **Authentication → URL Configuration**: en **Site URL** poné la URL que te dé Vercel en el paso 3 (podés volver a este paso después del deploy). Esto es para que el magic link te redirija a la app y no a localhost.
5. **Project Settings → API**: copiá la **Project URL** y la **anon public key**.

### 2. Configurar credenciales

Abrí `config.js` y pegá los dos valores del paso anterior:

```js
window.FINZ_CONFIG = {
  SUPABASE_URL: 'https://xxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
};
```

> La anon key es pública por diseño — la protección real es RLS. No subas nunca la `service_role` key.

### 3. Deploy en Vercel (~3 min)

Mismo flujo que KFD:

1. Subí esta carpeta a un repo de GitHub (`finanzas-marcos`).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importá el repo.
3. Framework Preset: **Other**. No hay build command ni output directory — dejá todo por defecto y **Deploy**.
4. Copiá la URL final (ej. `finanzas-marcos.vercel.app`) y pegala como **Site URL** en Supabase (paso 1.4).

Las funciones de `/api` se deployan solas; no hay nada que configurar.

### 4. Primer ingreso

1. Abrí la URL desde el celular → ingresá tu email → te llega el magic link → tocás y entrás.
2. En **Inicio** vas a ver el botón **"Cargar mis datos iniciales"** → un click e importa todo tu portfolio IOL, Binance, efectivo y las 4 metas.
3. Andá a **⚙ Ajustes** y completá tu **valor por sesión** actual (lo usa la carga rápida de producción) y verificá el valor de domicilio.
4. Agregá la app a la pantalla de inicio del celular (Compartir → "Agregar a inicio") y queda como una app más.

---

## Cómo se usa día a día

- **Botón +** → Gasto o Ingreso → categoría (botones grandes) → monto → Confirmar. Tres toques.
- **Sesiones (producción)**: registrás cantidad de sesiones; no cuenta como plata que entró, pero alimenta la tarjeta "A cobrar a fin de mes = producción − ya cobrado de pacientes".
- **Inversión** es una categoría de egreso propia: sale del flujo pero se muestra separada de los gastos en Inicio e Historial.
- **Portfolio**: en celular ves el resumen; desde la compu editás cantidades y PPC inline (se guarda al salir del campo). El precio de IOLPORA es manual (los FCI no cotizan en Yahoo) — actualizalo cada tanto desde la tabla.
- **Metas**: el fondo de emergencia calcula su objetivo solo (3 × gasto promedio de los últimos meses); la independencia financiera usa tu patrimonio total como acumulado automáticamente.

## Detalles técnicos a saber

- Los precios de CEDEARs se cachean **5 minutos** en el servidor; el CCL, 10. Con mercado cerrado, Yahoo devuelve el último cierre.
- Si un precio no llega, la app muestra **"—"** y ese activo no suma al total — nunca números inventados.
- El historial carga los últimos 13 meses de movimientos; todo queda guardado en Supabase sin límite.
- Para desarrollo local con las funciones `/api` andando: `npm i -g vercel && vercel dev`.

## Ideas para iterar después (con Claude Code)

- Registrar aportes a metas como movimientos automáticos.
- Snapshot mensual del patrimonio para graficar su evolución.
- Exportar el flujo mensual a Excel.
- Notificación/recordatorio de fin de mes para cerrar el flujo.
