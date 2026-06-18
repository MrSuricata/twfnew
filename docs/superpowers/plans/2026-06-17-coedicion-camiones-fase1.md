# Co-edición camiones — Fase 1 (timbre Realtime + refetch en vivo) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar task-por-task. Branch: `feat/coedicion-fase1` desde origin/main.

**Goal:** Que todo cambio GUARDADO en camiones/cargas se vea al instante entre todos los usuarios, sin tocar el modelo de edición (`pendingEdits`) ni romper nada.

**Architecture:** El backend, tras cada escritura de truck/truck_load, emite un broadcast en el canal Realtime `trucks-live` (vía la REST de Realtime, sin websocket persistente). El browser se suscribe a ese canal con un cliente Supabase mínimo (solo Realtime, no lee tablas) y, al recibir el aviso, dispara el `refreshTrucksFromDb` que ya existe (con su guarda de recencia). Si faltan las env vars del cliente, el bus es no-op y la app sigue con el refresco on-focus actual.

**Tech Stack:** `@supabase/supabase-js` (ya instalado), Supabase Realtime Broadcast, Vite (`import.meta.env`), React.

**Spec:** `docs/superpowers/specs/2026-06-17-coedicion-camiones-vivo-design.md` (Fase 1).

---

## Task 1: Resolver de config del bus (puro) + env scaffolding

**Files:**
- Create: `src/lib/realtimeBus.ts`
- Test: `src/lib/realtimeBus.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Test del resolver puro y del validador de mensajes**

`src/lib/realtimeBus.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveRealtimeConfig, isTrucksLiveMessage, TRUCKS_LIVE_CHANNEL } from './realtimeBus'

describe('resolveRealtimeConfig', () => {
  it('sin url o sin key → null (bus no-op, fallback on-focus)', () => {
    expect(resolveRealtimeConfig('', '')).toBeNull()
    expect(resolveRealtimeConfig('https://x.supabase.co', '')).toBeNull()
    expect(resolveRealtimeConfig('', 'k')).toBeNull()
  })
  it('con url y key → config', () => {
    expect(resolveRealtimeConfig('https://x.supabase.co', 'k')).toEqual({ url: 'https://x.supabase.co', key: 'k' })
  })
})

describe('isTrucksLiveMessage', () => {
  it('acepta kinds conocidos', () => {
    expect(isTrucksLiveMessage({ kind: 'truck' })).toBe(true)
    expect(isTrucksLiveMessage({ kind: 'truck_load', truckId: 'C440' })).toBe(true)
  })
  it('rechaza basura', () => {
    expect(isTrucksLiveMessage(null)).toBe(false)
    expect(isTrucksLiveMessage({})).toBe(false)
    expect(isTrucksLiveMessage({ kind: 'otra' })).toBe(false)
    expect(isTrucksLiveMessage('x')).toBe(false)
  })
  it('el canal es trucks-live', () => {
    expect(TRUCKS_LIVE_CHANNEL).toBe('trucks-live')
  })
})
```

- [ ] **Step 2: Correr el test → debe FALLAR (módulo no existe)**

Run: `npm run test:run -- realtimeBus`
Expected: FAIL (cannot find module './realtimeBus')

- [ ] **Step 3: Implementar el resolver + validador + esqueleto del bus**

`src/lib/realtimeBus.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const TRUCKS_LIVE_CHANNEL = 'trucks-live'

export type TrucksLiveKind = 'truck' | 'truck_load'
export interface TrucksLiveMessage { kind: TrucksLiveKind; truckId?: string }

/** Config del cliente Realtime SOLO si están las dos env vars. null = bus no-op. */
export function resolveRealtimeConfig(url: string | undefined, key: string | undefined): { url: string; key: string } | null {
  if (!url || !key) return null
  return { url, key }
}

/** Type-guard del payload del broadcast (defensivo contra basura/cambios de forma). */
export function isTrucksLiveMessage(x: unknown): x is TrucksLiveMessage {
  if (!x || typeof x !== 'object') return false
  const k = (x as { kind?: unknown }).kind
  return k === 'truck' || k === 'truck_load'
}

let _client: SupabaseClient | null = null

/**
 * Se suscribe al canal `trucks-live` y llama onMessage por cada aviso válido.
 * Devuelve una función de cleanup. Si faltan las env vars, NO crea cliente y
 * devuelve un cleanup no-op (la app sigue con el refresco on-focus).
 */
export function subscribeTrucksLive(onMessage: (msg: TrucksLiveMessage) => void): () => void {
  const cfg = resolveRealtimeConfig(
    import.meta.env.VITE_SUPABASE_URL as string | undefined,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  )
  if (!cfg) return () => {}
  try {
    if (!_client) {
      _client = createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 5 } },
      })
    }
    const channel = _client
      .channel(TRUCKS_LIVE_CHANNEL)
      .on('broadcast', { event: 'change' }, (msg: { payload?: unknown }) => {
        if (isTrucksLiveMessage(msg.payload)) onMessage(msg.payload)
      })
      .subscribe()
    return () => { try { _client?.removeChannel(channel) } catch { /* noop */ } }
  } catch {
    // Nunca romper la app por Realtime → degradar a on-focus.
    return () => {}
  }
}
```

- [ ] **Step 4: Correr el test → debe PASAR**

Run: `npm run test:run -- realtimeBus`
Expected: PASS

- [ ] **Step 5: Documentar las env vars en `.env.example`**

Agregar al final de `.env.example`:
```
# Realtime (co-edición de camiones en vivo) — claves PÚBLICAS por diseño.
# Si faltan, la app funciona igual (refresco al volver a la pestaña).
VITE_SUPABASE_URL=https://ihpsdeoexkipxmaxsmrc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

- [ ] **Step 6: typecheck + commit**

Run: `npm run typecheck`
```bash
git add src/lib/realtimeBus.ts src/lib/realtimeBus.test.ts .env.example
git commit -m "feat(coedicion): bus Realtime browser (solo canal, no-op sin env)"
```

---

## Task 2: Helper de broadcast server-side

**Files:**
- Create: `api/_lib/realtimeBroadcast.ts`

- [ ] **Step 1: Implementar el helper (REST de Realtime, sin websocket — apto serverless)**

Revisar primero cómo `api/_lib/supabase.ts` lee las env (nombres exactos de `SUPABASE_URL` y la service key). Usar esos mismos nombres.

`api/_lib/realtimeBroadcast.ts`:
```ts
// Emite un broadcast en el canal `trucks-live` vía la REST de Realtime (no abre
// websocket → ideal serverless). NUNCA tira: un broadcast fallido no debe
// romper la escritura que ya se hizo. El browser suscrito refetcha al recibirlo.
const CHANNEL = 'trucks-live'

export async function broadcastTrucksLive(kind: 'truck' | 'truck_load', truckId?: string): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) return
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: CHANNEL, event: 'change', payload: { kind, truckId } }] }),
    })
  } catch {
    /* no romper la escritura por un broadcast fallido */
  }
}
```

> Nota de impl: confirmar el shape del endpoint `/realtime/v1/api/broadcast` (topic = nombre del canal, headers apikey + Bearer) con la doc de Supabase (context7 `@supabase/supabase-js`) o un curl de prueba antes de cablearlo. Ajustar nombre exacto de la env de service key al que ya usa `api/_lib/supabase.ts`.

- [ ] **Step 2: typecheck (tsconfig.api) + commit**

Run: `npm run typecheck`
```bash
git add api/_lib/realtimeBroadcast.ts
git commit -m "feat(coedicion): helper de broadcast Realtime server-side (no-throw)"
```

---

## Task 3: Emitir broadcast tras las escrituras de camiones

**Files:**
- Modify: `api/data/[entity].ts` (handleTrucks POST+DELETE, handleTruckLoads POST+DELETE)

- [ ] **Step 1: Importar el helper**

En `api/data/[entity].ts`, junto a los otros imports de `../_lib/`:
```ts
import { broadcastTrucksLive } from '../_lib/realtimeBroadcast.js'
```

- [ ] **Step 2: handleTrucks — broadcast tras upsert OK y tras delete OK**

En `handleTrucks`, después del `upsert` exitoso (POST) — tras `if (error) throw error` del upsert de trucks:
```ts
void broadcastTrucksLive('truck')
```
Y en el `DELETE` de truck, después del borrado exitoso:
```ts
void broadcastTrucksLive('truck', id)
```
(`void` = fire-and-forget; el helper no tira. No `await` para no demorar la respuesta.)

- [ ] **Step 3: handleTruckLoads — broadcast tras upsert OK y tras delete OK**

En `handleTruckLoads`, después de `const { error } = await db.from('truck_loads').upsert(...)` / `if (error) throw error`:
```ts
void broadcastTrucksLive('truck_load')
```
Y en el `DELETE` de truck_load, tras el borrado exitoso:
```ts
void broadcastTrucksLive('truck_load')
```

- [ ] **Step 4: typecheck + commit**

Run: `npm run typecheck`
```bash
git add "api/data/[entity].ts"
git commit -m "feat(coedicion): emitir broadcast trucks-live tras escribir camiones/cargas"
```

---

## Task 4: Suscribir en App y refetch en vivo (con fallback intacto)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Importar el bus**

Junto a los imports de `@/lib/...`:
```ts
import { subscribeTrucksLive } from '@/lib/realtimeBus'
```

- [ ] **Step 2: Suscribir en un useEffect (solo admin) con debounce y cleanup**

Agregar este `useEffect` cerca de donde se maneja `refreshTrucksFromDb` (que ya existe en App). Debe correr solo cuando `isAdminLoggedIn`:
```ts
useEffect(() => {
  if (!isAdminLoggedIn) return
  let timer: ReturnType<typeof setTimeout> | null = null
  // Debounce: varios avisos seguidos (carga múltiple) = un solo refetch.
  const unsub = subscribeTrucksLive(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void refreshTrucksFromDb() }, 400)
  })
  return () => { if (timer) clearTimeout(timer); unsub() }
}, [isAdminLoggedIn, refreshTrucksFromDb])
```

> `refreshTrucksFromDb` ya está envuelto en `useCallback` con dep `[isAdminLoggedIn]`, así que es estable. El refresco on-focus existente (en `TrucksManagement`) queda como está → fallback si Realtime no conecta.

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ambos verdes.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(coedicion): refetch de camiones en vivo al recibir el aviso Realtime"
```

---

## Task 5: Verificación + PR

- [ ] **Step 1: Gates completos**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: typecheck limpio · todos los tests verdes · build OK.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/coedicion-fase1
```
Link del PR a Brian.

- [ ] **Step 3: Checklist de verificación manual (post-deploy, con las env vars seteadas en Vercel)**
  - Setear en Vercel `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable key).
  - Dos navegadores/usuarios admin en Camiones. En uno: crear/editar/guardar un camión o agregar una carga.
  - En el otro: el cambio aparece en **segundos sin tocar nada** (sin esperar el focus).
  - **Sin las env vars** (o Realtime caído): la app funciona igual, refrescando al volver a la pestaña (no rompe nada).

---

## Riesgos / notas
- **Endpoint de broadcast:** confirmar shape exacto de `/realtime/v1/api/broadcast` + nombre de la env de service key (Task 2). Si difiere, ajustar el helper; el resto del plan no cambia.
- **Realtime habilitado:** el proyecto Supabase debe tener Realtime activo (Broadcast). Confirmar en el dashboard; si está off, activarlo (no requiere RLS porque es broadcast, no Postgres changes).
- **No toca `pendingEdits`:** las ediciones locales en vuelo siguen siendo locales hasta guardar (como hoy). La co-edición simultánea real es Fase 2.
- **Seguridad:** el browser solo se conecta al canal (broadcast), no lee tablas. La anon/publishable key es pública por diseño.

## Fuera de scope (Fase 2+)
- Desarmar `pendingEdits` / guardado inmediato. Presencia. Bloqueo de cabecera. Anti doble-booking.
