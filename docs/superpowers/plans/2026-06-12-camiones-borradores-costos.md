# Camiones: borradores + Guardar/Cancelar + costos por m³ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El armador de camiones deja de auto-publicar: camiones nuevos nacen como borrador (`draft`), las ediciones de publicados van a un overlay (`pending_edits` + loads `pending`), Guardar publica todo de un golpe, Cancelar descarta, y 3 campos de costos muestran el USD/m³ con semáforo (<75 🟢 · 75–80 🟡 · >80 🔴).

**Architecture:** El camión nuevo ya se crea al instante en la DB (TrucksList → `makeEmptyTruck`) — solo pasa a nacer con `draft=true`, y como todos los consumidores derivados lo filtran, el auto-save existente se vuelve inofensivo. Para publicados, `updateTruck` (único choke point de escritura del builder, TruckBuilder.tsx:87) redirige los patches a `pendingEdits`; las cargas usan `pending='add'/'remove'`. Helpers puros en `truckTypes.ts` (TDD) + filtros de visibilidad en los 5 consumidores derivados.

**Tech Stack:** Vite + React 19 + TS · Supabase (migración aditiva, la aplica el CONTROLADOR vía MCP antes del Lote A) · vitest. Cero deps nuevas.

**Spec:** `docs/superpowers/specs/2026-06-12-camiones-borradores-costos-design.md`

**Contexto de entorno:**
- Repo: `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy` — todos los comandos desde ahí.
- Branch: `feat/camiones-borradores-costos` (creada desde origin/main, spec commiteado).
- Gates: `npm run typecheck && npm run test:run && npm run build` (+ `npm run lint` ya funciona — no introducir warnings nuevos). Commits en español. NUNCA push a main.
- Baseline de tests: 107.

**File structure:**

| Archivo | Cambio |
|---------|--------|
| (Supabase) | Migración: columnas en `trucks` y `truck_loads` — **Task 0, la corre el controlador** |
| `src/lib/truckTypes.ts` | Campos nuevos + helpers `applyTruckPending` / `effectiveTruckLoads` / `hasDraftState` / `truckCostPerM3` / `costColor` |
| `src/lib/truckTypes.test.ts` (nuevo) | Tests de los helpers |
| `src/lib/truckUtils.ts` | `makeEmptyTruck` nace draft + `discardPendingArrays` (pura) |
| `api/_lib/schemas.ts` | Campos nuevos en `TruckRowSchema` / `TruckLoadRowSchema` |
| `api/data/[entity].ts` | Mapeos GET/POST de los campos nuevos (trucks ~830-936, truck-loads ~938-1010) |
| `src/components/operations/OperationsGrid.tsx` | `truckByRef` salta drafts y loads pending='add' (~219-234) |
| `src/lib/billingTypes.ts` | `truckInfoByRef` ídem (~124-138) |
| `src/lib/agendaUtils.ts` | `trucksToEvents` salta drafts (~293-360) |
| `src/components/TodayDashboard.tsx` | Consolidados en movimiento salta drafts |
| `api/tracking.ts` | Derivación pública salta drafts y loads pending='add' |
| `src/components/trucks/TruckBuilder.tsx` | Overlay, loads pending, costos+semáforo, barra Guardar/Cancelar |
| `src/components/trucks/TrucksList.tsx` | Badges BORRADOR/CAMBIOS SIN GUARDAR, Retomar/Descartar, USD/m³ en cards |
| `src/components/trucks/TrucksManagement.tsx` | Pasar `onDeleteTruck` al builder |

---

### Task 0 (CONTROLADOR, no subagente): migración Supabase

Aplicar en el proyecto TWF (`ihpsdeoexkipxmaxsmrc`) vía MCP `apply_migration`, nombre `trucks_drafts_and_costs`:

```sql
alter table trucks
  add column if not exists draft boolean not null default false,
  add column if not exists pending_edits jsonb,
  add column if not exists cost_despacho numeric not null default 0,
  add column if not exists cost_flete numeric not null default 0,
  add column if not exists cost_carga numeric not null default 0;

alter table truck_loads
  add column if not exists pending text check (pending in ('add','remove'));
```

Inofensiva para el código en prod (defaults + null). Verificar con `list_tables` que las columnas existen.

---

### Task 1: Tipos + helpers puros (TDD)

**Files:**
- Modify: `src/lib/truckTypes.ts` (interfaces líneas 25-57; helpers al final)
- Modify: `src/lib/truckUtils.ts` (`makeEmptyTruck` ~213-230; `discardPendingArrays` nuevo)
- Test: `src/lib/truckTypes.test.ts` (nuevo)

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/truckTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Truck, TruckLoad } from './truckTypes'
import {
  applyTruckPending, effectiveTruckLoads, hasDraftState, truckCostPerM3, costColor,
} from './truckTypes'
import { discardPendingArrays } from './truckUtils'

const truck = (over: Partial<Truck> = {}): Truck =>
  ({
    id: 't1', code: 'C450', status: 'planning', isSider: false, transport: '', driver: '',
    plate: '', loadDate: '', departureDate: '', arrivalDate: '', notes: '',
    createdAt: 0, updatedAt: 0, draft: false, pendingEdits: null,
    costDespacho: 0, costFlete: 0, costCarga: 0, ...over,
  }) as Truck

const load = (over: Partial<TruckLoad> = {}): TruckLoad =>
  ({
    id: 'l1', truckId: 't1', sourceType: 'lcl', sourceRef: 'E1', client: '', fiscal: '',
    kg: 100, m3: 10, pkgs: 1, description: '', mvdArrival: '', desconsolDate: '',
    overrides: {}, position: 0, pending: null, ...over,
  }) as TruckLoad

describe('applyTruckPending — overlay sobre publicado', () => {
  it('sin overlay devuelve el mismo camión; con overlay pisa solo lo editado', () => {
    const t = truck({ transport: 'OLAVERRY' })
    expect(applyTruckPending(t)).toBe(t)
    const edited = applyTruckPending(truck({ transport: 'OLAVERRY', pendingEdits: { transport: 'TRANSCAL', loadDate: '2026-06-15' } }))
    expect(edited.transport).toBe('TRANSCAL')
    expect(edited.loadDate).toBe('2026-06-15')
    expect(edited.code).toBe('C450')
  })
})

describe('effectiveTruckLoads — qué cargas cuentan', () => {
  const loads = [
    load({ id: 'a' }),
    load({ id: 'b', pending: 'add' }),
    load({ id: 'c', pending: 'remove' }),
    load({ id: 'x', truckId: 'OTRO' }),
  ]
  it('derivaciones (includePending=false): confirmadas + las marcadas para quitar', () => {
    expect(effectiveTruckLoads(loads, 't1', { includePending: false }).map(l => l.id)).toEqual(['a', 'c'])
  })
  it('armador (includePending=true): confirmadas + agregadas, sin las marcadas para quitar', () => {
    expect(effectiveTruckLoads(loads, 't1', { includePending: true }).map(l => l.id)).toEqual(['a', 'b'])
  })
})

describe('hasDraftState — badges', () => {
  it('draft gana; overlay o loads pending = pending; nada = null', () => {
    expect(hasDraftState(truck({ draft: true }), [])).toBe('draft')
    expect(hasDraftState(truck({ pendingEdits: { transport: 'X' } }), [])).toBe('pending')
    expect(hasDraftState(truck(), [load({ pending: 'add' })])).toBe('pending')
    expect(hasDraftState(truck(), [load()])).toBe(null)
    expect(hasDraftState(truck({ pendingEdits: {} }), [])).toBe(null)
  })
})

describe('truckCostPerM3 + costColor', () => {
  it('divide costos totales por m3 del armado (incluye pending add, excluye remove)', () => {
    const t = truck({ costDespacho: 300, costFlete: 400, costCarga: 100 })
    const loads = [load({ m3: 5 }), load({ id: 'b', m3: 5, pending: 'add' }), load({ id: 'c', m3: 99, pending: 'remove' })]
    const r = truckCostPerM3(t, loads)
    expect(r).toEqual({ total: 800, m3: 10, perM3: 80 })
  })
  it('usa el overlay de costos si existe', () => {
    const t = truck({ costDespacho: 100, pendingEdits: { costDespacho: 200 } })
    expect(truckCostPerM3(t, [load({ m3: 4 })]).perM3).toBe(50)
  })
  it('sin m3 o sin costos → perM3 null (no se muestra el semáforo)', () => {
    expect(truckCostPerM3(truck({ costFlete: 500 }), []).perM3).toBe(null)
    expect(truckCostPerM3(truck(), [load()]).perM3).toBe(null)
  })
  it('semáforo: <75 verde · 75-80 amarillo (bordes incluidos) · >80 rojo', () => {
    expect(costColor(74.99)).toBe('green')
    expect(costColor(75)).toBe('yellow')
    expect(costColor(80)).toBe('yellow')
    expect(costColor(80.01)).toBe('red')
  })
})

describe('discardPendingArrays — cancelar overlay de un publicado', () => {
  it('limpia pendingEdits, borra loads add, des-marca remove', () => {
    const trucks = [truck({ pendingEdits: { transport: 'X' } }), truck({ id: 't2' })]
    const loads = [load({ id: 'a' }), load({ id: 'b', pending: 'add' }), load({ id: 'c', pending: 'remove' })]
    const r = discardPendingArrays(trucks, loads, 't1')
    expect(r.trucks.find(t => t.id === 't1')!.pendingEdits).toBe(null)
    expect(r.loads.map(l => l.id)).toEqual(['a', 'c'])
    expect(r.loads.find(l => l.id === 'c')!.pending).toBe(null)
    expect(r.deleteLoadIds).toEqual(['b'])
    expect(r.trucks.find(t => t.id === 't2')).toEqual(trucks[1])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/truckTypes.test.ts`
Expected: FAIL (helpers no existen).

- [ ] **Step 3: Implementación**

En `src/lib/truckTypes.ts`:

1. En la interface `Truck` (después de `notes: string`, antes de `createdAt`):

```ts
  // Borradores (12/06/2026): draft = camión nuevo sin publicar (invisible para
  // estados/agenda/HOY/facturación/tracking; solo reserva cargas).
  draft: boolean
  // Overlay de cambios sin guardar sobre un camión PUBLICADO (patrón web_edits).
  pendingEdits: Partial<TruckEditableFields> | null
  // Costos del flete (USD) → indicador USD/m³ con semáforo.
  costDespacho: number
  costFlete: number
  costCarga: number
```

2. En la interface `TruckLoad` (después de `position: number`):

```ts
  // 'add' = agregada en un borrador de edición · 'remove' = marcada para quitar
  // · null = confirmada. Solo aplica a camiones publicados con cambios sin guardar.
  pending: 'add' | 'remove' | null
```

3. Tipo + helpers al final del archivo:

```ts
// ── Borradores y costos (12/06/2026) ──────────────────────────────────

/** Campos del camión que pasan por el overlay al editar un publicado. */
export interface TruckEditableFields {
  status: TruckStatus
  isSider: boolean
  transport: string
  driver: string
  plate: string
  loadDate: string
  departureDate: string
  arrivalDate: string
  notes: string
  costDespacho: number
  costFlete: number
  costCarga: number
}

/** Lo que ve el ARMADOR: el camión con sus cambios sin guardar encima.
 *  Las derivaciones (agenda, estados, tracking) NUNCA llaman esto. */
export function applyTruckPending(t: Truck): Truck {
  if (!t.pendingEdits || Object.keys(t.pendingEdits).length === 0) return t
  return { ...t, ...t.pendingEdits }
}

/** Cargas de un camión según quién pregunta:
 *  - includePending=false (derivaciones): confirmadas + pending='remove'
 *    (siguen siendo del camión hasta guardar); las 'add' NO existen aún.
 *  - includePending=true (armador): confirmadas + 'add', sin las 'remove'. */
export function effectiveTruckLoads(
  loads: TruckLoad[],
  truckId: string,
  opts: { includePending: boolean }
): TruckLoad[] {
  const mine = loads.filter(l => l.truckId === truckId)
  return opts.includePending
    ? mine.filter(l => l.pending !== 'remove')
    : mine.filter(l => l.pending !== 'add')
}

/** Estado de borrador para badges: 'draft' (nuevo sin publicar) ·
 *  'pending' (publicado con cambios sin guardar) · null (limpio). */
export function hasDraftState(t: Truck, loads: TruckLoad[]): 'draft' | 'pending' | null {
  if (t.draft) return 'draft'
  if (t.pendingEdits && Object.keys(t.pendingEdits).length > 0) return 'pending'
  if (loads.some(l => l.truckId === t.id && l.pending)) return 'pending'
  return null
}

/** (despacho + flete + carga) / m³ del camión COMO SE ESTÁ ARMANDO.
 *  perM3 null si no hay m³ o no hay costos (no se muestra semáforo). */
export function truckCostPerM3(
  t: Truck,
  loads: TruckLoad[]
): { total: number; m3: number; perM3: number | null } {
  const merged = applyTruckPending(t)
  const ls = effectiveTruckLoads(loads, t.id, { includePending: true })
  const m3 = ls.reduce((a, l) => a + (l.m3 || 0), 0)
  const total = (merged.costDespacho || 0) + (merged.costFlete || 0) + (merged.costCarga || 0)
  return { total, m3, perM3: m3 > 0 && total > 0 ? total / m3 : null }
}

/** Semáforo del costo por m³ (decisión Brian 12/06): <75 verde ·
 *  75–80 amarillo (bordes incluidos) · >80 rojo. */
export function costColor(perM3: number): 'green' | 'yellow' | 'red' {
  if (perM3 > 80) return 'red'
  if (perM3 >= 75) return 'yellow'
  return 'green'
}
```

En `src/lib/truckUtils.ts`:

4. `makeEmptyTruck` (~213): el objeto devuelto suma `draft: true, pendingEdits: null, costDespacho: 0, costFlete: 0, costCarga: 0` (los camiones nuevos NACEN como borrador).
5. `makeEmptyTruckLoad` (~233): suma `pending: null` al objeto devuelto.
6. Nueva función pura al final:

```ts
/** Cancelar el overlay de un camión publicado: limpia pendingEdits, saca las
 *  cargas 'add' (van a deleteLoadIds para borrar en DB) y des-marca las 'remove'.
 *  Pura: devuelve los arrays nuevos, el caller persiste. */
export function discardPendingArrays(
  trucks: Truck[],
  loads: TruckLoad[],
  truckId: string
): { trucks: Truck[]; loads: TruckLoad[]; deleteLoadIds: string[] } {
  const deleteLoadIds = loads.filter(l => l.truckId === truckId && l.pending === 'add').map(l => l.id)
  return {
    trucks: trucks.map(t => (t.id === truckId ? { ...t, pendingEdits: null, updatedAt: Date.now() } : t)),
    loads: loads
      .filter(l => !(l.truckId === truckId && l.pending === 'add'))
      .map(l => (l.truckId === truckId && l.pending === 'remove' ? { ...l, pending: null } : l)),
    deleteLoadIds,
  }
}
```

(Import de `Truck`/`TruckLoad` ya existe en truckUtils.)

7. **Compilación del resto:** los call-sites que construyen `Truck`/`TruckLoad` literales van a fallar por los campos nuevos requeridos. Arreglar SOLO agregando los defaults (`draft: false, pendingEdits: null, costDespacho: 0, costFlete: 0, costCarga: 0` / `pending: null`) donde el typecheck lo pida (típico: factories de tests existentes en `billingTypes.test.ts`, `prefillFclFromShipment` no construye Trucks). NO usar `?` opcional en la interface — campos requeridos, defaults explícitos.

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run && npm run typecheck`
Expected: tests nuevos PASS + 107 previos PASS + typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/truckTypes.ts src/lib/truckTypes.test.ts src/lib/truckUtils.ts src/lib/billingTypes.test.ts
git commit -m "feat(camiones): tipos y helpers de borradores + costos por m3 (TDD)"
```

(Si el typecheck pidió tocar otros archivos en el paso 3.7, sumarlos al add.)

---

### Task 2: API — schemas + mapeos

**Files:**
- Modify: `api/_lib/schemas.ts` (TruckRowSchema, TruckLoadRowSchema)
- Modify: `api/data/[entity].ts` (`mapTruckRowToApi` ~830, POST trucks ~866-924, `mapTruckLoadRowToApi` ~940, POST truck-loads ~969-991)

- [ ] **Step 1: Schemas**

En `api/_lib/schemas.ts`, dentro de `TruckRowSchema` agregar (acepta camelCase y snake_case como el resto del schema — copiar el patrón de los campos existentes tipo `isSider`/`is_sider`):

```ts
  draft: z.boolean().optional(),
  pendingEdits: z.record(z.unknown()).nullable().optional(),
  pending_edits: z.record(z.unknown()).nullable().optional(),
  costDespacho: z.number().optional(),
  cost_despacho: z.number().optional(),
  costFlete: z.number().optional(),
  cost_flete: z.number().optional(),
  costCarga: z.number().optional(),
  cost_carga: z.number().optional(),
```

Y en `TruckLoadRowSchema`:

```ts
  pending: z.enum(['add', 'remove']).nullable().optional(),
```

(Ajustar a la sintaxis zod real del archivo — mirar cómo están declarados los campos existentes y replicar el patrón exacto.)

- [ ] **Step 2: Mapeos en `api/data/[entity].ts`**

1. `mapTruckRowToApi` (~830): sumar al objeto devuelto:

```ts
    draft: !!t.draft,
    pendingEdits: t.pending_edits || null,
    costDespacho: Number(t.cost_despacho) || 0,
    costFlete: Number(t.cost_flete) || 0,
    costCarga: Number(t.cost_carga) || 0,
```

2. POST trucks — donde arma la fila snake_case para upsert (~870-887), sumar:

```ts
    draft: t.draft ?? false,
    pending_edits: t.pendingEdits ?? t.pending_edits ?? null,
    cost_despacho: t.costDespacho ?? t.cost_despacho ?? 0,
    cost_flete: t.costFlete ?? t.cost_flete ?? 0,
    cost_carga: t.costCarga ?? t.cost_carga ?? 0,
```

3. `mapTruckLoadRowToApi` (~940): sumar `pending: l.pending || null`.
4. POST truck-loads (~972-987): sumar `pending: l.pending ?? null`.

- [ ] **Step 3: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde.

```bash
git add api/_lib/schemas.ts api/data/[entity].ts
git commit -m "feat(camiones): draft, pending_edits, pending y costos viajan por la API"
```

---

### Task 3: Filtros de visibilidad (la regla de oro)

**Files:**
- Modify: `src/components/operations/OperationsGrid.tsx:219-234` (truckByRef)
- Modify: `src/lib/billingTypes.ts:124-138` (truckInfoByRef)
- Modify: `src/lib/agendaUtils.ts:293-360` (trucksToEvents)
- Modify: `src/components/TodayDashboard.tsx` (consolidados en movimiento — buscar dónde itera trucks con deriveTruckDisplayInfo/Status)
- Modify: `api/tracking.ts` (derivación inline)
- Test: `src/lib/billingTypes.test.ts`, `src/lib/agendaUtils.test.ts` (si existe; si no, crear caso mínimo en billingTypes.test)

- [ ] **Step 1: Tests que fallan (billing + agenda)**

En `src/lib/billingTypes.test.ts`, agregar (adaptando las factories existentes del archivo — ya tienen `truck()`/`load()`; tras Task 1 incluyen los campos nuevos):

```ts
describe('borradores invisibles para facturación', () => {
  it('cargas en camión draft NO derivan estado de camión', () => {
    // camión entregado pero draft → la carga no se vuelve facturable por él
    const t = truck({ draft: true, arrivalDate: '2026-06-01', status: 'delivered' })
    const items = buildBillableItems(/* adaptar a la firma real usada en los tests existentes,
      con una carga DB vinculada por ref al camión draft */)
    // la carga NO debe figurar como pendiente por el camión draft
  })
  it('loads pending=add no derivan estado; pending=remove siguen contando', () => {
    // un load pending='add' en camión entregado → la carga NO es facturable
    // un load pending='remove' en camión entregado → la carga SÍ es facturable (hasta guardar)
  })
})
```

⚠️ Los dos tests de arriba son ESQUELETO de intención: completarlos con la firma real de `buildBillableItems` mirando los tests existentes del archivo (factories, parámetros y asserts reales). Deben quedar ejecutables y específicos, no comentarios.

En `src/lib/agendaUtils.test.ts` (si existe — si no, crear con el patrón del repo):

```ts
it('trucksToEvents ignora camiones draft', () => {
  const t = truck({ draft: true, loadDate: '2026-06-15' })
  expect(trucksToEvents([t], []).length).toBe(0)
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm run test:run -- src/lib/billingTypes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación de los 5 filtros**

1. **OperationsGrid `truckByRef`** (~219): dentro del loop de loads:

```ts
    for (const l of truckLoads) {
      if (l.pending === 'add') continue          // borrador: la carga aún no está en el camión
      const t = tById.get(l.truckId)
      if (!t || t.draft) continue                // camiones borrador: invisibles
      ...
```

2. **billingTypes `truckInfoByRef`** (~124): mismo patrón exacto (`l.pending === 'add'` continue; `!t || t.draft` continue).

3. **agendaUtils `trucksToEvents`** (~293): al inicio del loop de trucks: `if (t.draft) continue`. Las loads que agrega a los totales del evento: filtrar `l.pending !== 'add'` (usar `effectiveTruckLoads(truckLoads, t.id, { includePending: false })` si encaja con la forma del código).

4. **TodayDashboard**: localizar el bloque "consolidados en movimiento" (grep `deriveTruckDisplayInfo` o `CONSOLIDADOS`) y saltar `t.draft`.

5. **api/tracking.ts**: localizar la derivación inline (comentario "keep this logic in sync"); donde itera trucks/loads para derivar estado del cargo: saltar trucks con `draft` (la fila de DB es `t.draft`) y loads con `pending === 'add'`. OJO: este archivo lee filas snake_case de Supabase directo — los nombres son `draft` y `pending` igual.

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/OperationsGrid.tsx src/lib/billingTypes.ts src/lib/billingTypes.test.ts src/lib/agendaUtils.ts src/components/TodayDashboard.tsx api/tracking.ts
git commit -m "feat(camiones): borradores invisibles para estados, agenda, HOY, facturacion y tracking"
```

(Sumar `src/lib/agendaUtils.test.ts` si se creó.)

---### Task 4: TruckBuilder — overlay, costos y barra Guardar/Cancelar

**Files:**
- Modify: `src/components/trucks/TruckBuilder.tsx` (completo: lectura merged, escritura overlay, loads pending, costos, barra)
- Modify: `src/components/trucks/TrucksManagement.tsx` (prop `onDeleteTruck` al builder)

- [ ] **Step 1: Lectura merged + escritura con overlay**

En `TruckBuilder.tsx`:

1. Imports: sumar `applyTruckPending, effectiveTruckLoads, hasDraftState, truckCostPerM3, costColor` de truckTypes y `discardPendingArrays` de truckUtils.
2. Después de obtener `truck` de props:

```ts
  const isDraft = truck.draft
  // Lo que se VE y EDITA: el camión con el overlay aplicado.
  const merged = useMemo(() => applyTruckPending(truck), [truck])
```

3. TODAS las lecturas de campos del camión en el JSX y memos (status, fechas, transport, driver, plate, notes, isSider, costos) pasan de `truck.X` a `merged.X`. (`truck.id`, `truck.code`, `truck.draft` quedan como están.)
4. `updateTruck` (~87) se vuelve el router draft/overlay:

```ts
  const updateTruck = (patch: Partial<Truck>) => {
    if (isDraft) {
      const updated = { ...truck, ...patch, updatedAt: Date.now() }
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? updated : t)))
    } else {
      // Publicado: el cambio va al overlay, las columnas reales no se tocan.
      const pendingEdits = { ...(truck.pendingEdits || {}), ...patch }
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? { ...t, pendingEdits, updatedAt: Date.now() } : t)))
    }
  }
```

(`setStatusWithDate` ya llama a `updateTruck` → hereda el comportamiento solo.)
5. `loads` memo (~60): usar `effectiveTruckLoads(truckLoads, truck.id, { includePending: true })` PERO el builder también debe MOSTRAR las `pending='remove'` tachadas — entonces: `const allMine = truckLoads.filter(l => l.truckId === truck.id).sort(...)` para la tabla, y `loads` (efectivas para totals) = `allMine.filter(l => l.pending !== 'remove')`. `computeTruckTotals(merged, loads)`.
6. Alta de loads — en `addFcl`/`addLclAir`/`addDb` (~119-185), el load nuevo lleva `pending: isDraft ? null : 'add'` (y `makeEmptyTruckLoad` ya pone null — setear explícito en los 3).
7. Baja de loads — el botón Remove (~211):

```ts
  const removeLoad = (l: TruckLoad) => {
    if (isDraft || l.pending === 'add') { onDeleteTruckLoad(l.id); return }
    // Publicado: marcar para quitar (se concreta al Guardar)
    onUpdateTruckLoads(truckLoads.map(x => (x.id === l.id ? { ...x, pending: 'remove' as const } : x)))
  }
```

8. En la tabla de loads: fila con `pending='remove'` → `opacity-50 line-through` + botón "Deshacer" (`pending: null`); fila con `pending='add'` → badge chiquito "NUEVA". 

- [ ] **Step 2: Sección de costos + semáforo**

En la card de metadata del camión (después de las fechas, ~400), agregar:

```tsx
      {/* Costos del flete → USD por m³ del camión armado */}
      <div className="border-t pt-3 mt-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Costos del flete (USD)</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['costDespacho', 'Despacho'],
            ['costFlete', 'Flete terrestre'],
            ['costCarga', 'Carga s/ camión'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <div className="text-[10px] text-muted-foreground">{label}</div>
              <Input
                type="number"
                min={0}
                value={merged[key] || ''}
                onChange={e => updateTruck({ [key]: parseFloat(e.target.value) || 0 })}
                className="h-8 text-sm"
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <CostPerM3Indicator truck={truck} truckLoads={truckLoads} />
      </div>
```

Y el componente (en el mismo archivo, abajo):

```tsx
const COST_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-green-50 border-green-300 text-green-700',
  yellow: 'bg-amber-50 border-amber-300 text-amber-700',
  red: 'bg-red-50 border-red-300 text-red-700',
}

function CostPerM3Indicator({ truck, truckLoads }: { truck: Truck; truckLoads: TruckLoad[] }) {
  const { total, m3, perM3 } = truckCostPerM3(truck, truckLoads)
  if (perM3 === null) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        {total > 0 ? 'Agregá cargas con m³ para ver el costo por m³.' : 'Cargá los costos para ver el USD/m³.'}
      </p>
    )
  }
  return (
    <div className={`mt-2 rounded-lg border px-3 py-2 flex items-baseline justify-between ${COST_STYLES[costColor(perM3)]}`}>
      <span className="text-lg font-bold tabular-nums">
        USD {perM3.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / m³
      </span>
      <span className="text-xs">
        {total.toLocaleString('es-UY')} USD ÷ {m3.toLocaleString('es-UY', { maximumFractionDigits: 1 })} m³
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Barra Guardar/Cancelar + estado**

1. `TrucksManagement.tsx`: pasar `onDeleteTruck` (ya lo recibe de App para la lista) también a `<TruckBuilder onDeleteTruck={...}>`. Agregar la prop a `TruckBuilderProps`.
2. Handlers en el builder:

```ts
  const draftState = hasDraftState(truck, truckLoads)

  const handleSave = () => {
    const effLoads = effectiveTruckLoads(truckLoads, truck.id, { includePending: true })
    if (effLoads.length === 0) {
      toast.error('El camión necesita al menos una carga para guardarse')
      return
    }
    if (isDraft) {
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? { ...t, draft: false, updatedAt: Date.now() } : t)))
    } else {
      const final = { ...applyTruckPending(truck), pendingEdits: null, updatedAt: Date.now() }
      onUpdateTrucks(trucks.map(t => (t.id === truck.id ? final : t)))
      const removes = truckLoads.filter(l => l.truckId === truck.id && l.pending === 'remove')
      const hasAdds = truckLoads.some(l => l.truckId === truck.id && l.pending === 'add')
      if (hasAdds) onUpdateTruckLoads(truckLoads.map(l => (l.truckId === truck.id && l.pending === 'add' ? { ...l, pending: null } : l)))
      removes.forEach(r => onDeleteTruckLoad(r.id))
    }
    toast.success(`Camión ${truck.code} guardado`)
  }

  const handleCancel = () => {
    if (isDraft) {
      // Cancelar un borrador nuevo = borrar el camión entero (las cargas se liberan).
      if (!window.confirm(`¿Descartar el borrador ${truck.code}? Se borra el camión y se liberan sus cargas.`)) return
      onDeleteTruck(truck.id)
      onBack()
      return
    }
    const r = discardPendingArrays(trucks, truckLoads, truck.id)
    onUpdateTrucks(r.trucks)
    onUpdateTruckLoads(r.loads)
    r.deleteLoadIds.forEach(id => onDeleteTruckLoad(id))
    toast.info('Cambios descartados')
  }
```

(Para confirmar se puede usar el patrón Dialog del repo en lugar de window.confirm si el archivo ya usa Dialogs — replicar el estilo existente.)
3. Barra inferior fija (antes del cierre del contenedor principal del builder):

```tsx
      {/* Barra de estado + acciones del borrador */}
      <div className="sticky bottom-0 z-10 mt-4 -mx-1 rounded-lg border bg-card/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <span className="text-xs font-medium">
          {draftState === 'draft' && <span className="text-amber-700">🟡 BORRADOR — no publicado</span>}
          {draftState === 'pending' && <span className="text-orange-700">🟠 CAMBIOS SIN GUARDAR</span>}
          {!draftState && <span className="text-green-700">✓ Guardado</span>}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={!draftState}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!draftState} className="gap-1.5">
            💾 Guardar camión
          </Button>
        </div>
      </div>
```

4. Header del builder: junto al código, badge del estado (`draftState === 'draft'` → Badge ámbar "BORRADOR"; `'pending'` → "CAMBIOS SIN GUARDAR").
5. El export PDF (~215): pasarle `merged` y las loads del armador (no las crudas).

- [ ] **Step 4: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`
Expected: verde, sin warnings nuevos de lint.

```bash
git add src/components/trucks/TruckBuilder.tsx src/components/trucks/TrucksManagement.tsx
git commit -m "feat(camiones): armador con guardar/cancelar, overlay de cambios y costos por m3 con semaforo"
```

---

### Task 5: TrucksList — badges, Retomar/Descartar, USD/m³

**Files:**
- Modify: `src/components/trucks/TrucksList.tsx`

- [ ] **Step 1: Badges + acciones**

1. Import: `hasDraftState, truckCostPerM3, costColor` + `discardPendingArrays`.
2. En cada card: `const ds = hasDraftState(t, truckLoads)`:
   - Badge junto al estado: `ds === 'draft'` → Badge ámbar `BORRADOR` · `ds === 'pending'` → Badge naranja `CAMBIOS SIN GUARDAR`.
   - Si `ds`: el botón de abrir pasa a decir **Retomar** (mismo `onOpenBuilder(t.id)`), y se agrega botón **Descartar**:

```tsx
  const handleDiscard = (t: Truck) => {
    const ds = hasDraftState(t, truckLoads)
    if (ds === 'draft') {
      if (!window.confirm(`¿Descartar el borrador ${t.code}? Se borra el camión y se liberan sus cargas.`)) return
      onDeleteTruck(t.id)
    } else if (ds === 'pending') {
      if (!window.confirm(`¿Descartar los cambios sin guardar de ${t.code}?`)) return
      const r = discardPendingArrays(trucks, truckLoads, t.id)
      onUpdateTrucks(r.trucks)
      onUpdateTruckLoads(r.loads)
      r.deleteLoadIds.forEach(id => onDeleteTruckLoad(id))
    }
  }
```

   (TrucksList necesita las props `truckLoads` ✓ ya la tiene, `onUpdateTruckLoads` y `onDeleteTruckLoad` — agregarlas a TrucksListProps y pasarlas desde TrucksManagement.)
3. USD/m³ en la card (junto a los totales kg/m³ existentes):

```tsx
  {(() => {
    const { perM3 } = truckCostPerM3(t, truckLoads)
    if (perM3 === null) return null
    const c = costColor(perM3)
    return (
      <span className={`text-xs font-semibold tabular-nums rounded px-1.5 py-0.5 border ${COST_STYLES[c]}`}>
        USD {perM3.toFixed(2)}/m³
      </span>
    )
  })()}
```

   (Exportar `COST_STYLES` desde TruckBuilder o duplicar el mapa de 3 clases en TrucksList — preferible: mover `COST_STYLES` y `CostPerM3Indicator` a un archivo `src/components/trucks/CostIndicator.tsx` compartido si queda más limpio; decisión del implementer, sin duplicar lógica de color.)
4. El sort de la lista: camiones con `ds` (borradores/pendientes) primero, después el orden actual (activos → updatedAt desc).

- [ ] **Step 2: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`
Expected: verde.

```bash
git add src/components/trucks/TrucksList.tsx src/components/trucks/TrucksManagement.tsx
git commit -m "feat(camiones): lista con badges de borrador, retomar/descartar y costo por m3"
```

(Sumar `CostIndicator.tsx` si se creó.)

---

### Task 6: Gates finales + push + PR

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`
Expected: todo verde (tests: 107 + ~12 nuevos).

- [ ] **Step 2: Push**

```bash
git push -u origin feat/camiones-borradores-costos
```

- [ ] **Step 3: Link de PR a Brian**

`https://github.com/MrSuricata/twfnew/pull/new/feat/camiones-borradores-costos`

Checklist de verificación manual en prod (post-merge):
1. "Nuevo camión" → armar a medias → cerrar pestaña → el camión NO aparece en agenda/HOY ni cambia estados de cargas; en la lista figura BORRADOR.
2. Retomar el borrador desde el iPhone (o segunda pestaña) → Guardar → recién ahí aparece en agenda/estados.
3. Cancelar un borrador → se borra, las cargas vuelven a estar disponibles.
4. Editar un camión publicado: cambiar fecha + agregar carga → la grilla/agenda siguen mostrando lo viejo → Guardar → se actualiza todo. Cancelar → vuelve a lo guardado.
5. Carga en borrador de edición (pending add) NO disponible para otro camión.
6. Costos: cargar 300/400/100 con 10 m³ → USD 80,00/m³ en amarillo; subir a 81 → rojo; bajar a <75 → verde.
7. Tracking público de una carga en camión borrador → no muestra estado de camión.

---

## Notas para el ejecutor

- **Las ediciones de DATOS de una carga confirmada (kg/m³/bultos/descripción inline en el builder) en un camión publicado siguen siendo DIRECTAS** — el overlay protege la estructura del camión (qué cargas, fechas, costos), no las correcciones de datos. Decisión registrada; no intentar overlay para eso.
- `assignedElsewhere` en AvailableLoadsPanel ya cuenta TODOS los truck_loads → las cargas de borradores quedan reservadas sin tocar nada. NO "arreglar" eso.
- Los handlers de App.tsx (handleUpdateTrucks etc.) NO cambian.
- `nextTruckCode` se consume al crear el borrador; cancelar deja hueco (decisión aceptada).
- En `api/tracking.ts` las filas son snake_case crudas de Supabase — no usar los helpers del cliente ahí.
- Si `npm run lint` marca algo pre-existente no relacionado, reportar sin arreglar.
