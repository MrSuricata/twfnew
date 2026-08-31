# Consolidados LCL — Etapa 1: el LCL entra al sistema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una carga LCL cargada en la webapp muestre su estado sin que nadie lo elija, y que cargar el stock cueste segundos.

**Architecture:** Estados derivados puros en una lib nueva (`src/lib/lclEstados.ts`), sin estado guardado — el mismo principio derive-on-read del resto del repo. Tres columnas nuevas en `shipments` (`stock`, `marca_cliente`, `marca_motivo`); las fechas salen de `eta` y `desconsol_date`, que ya existen. La UI cambia dentro de `src/components/trucks/`.

**Tech Stack:** Vite + React + TS + Tailwind 4 + Supabase. Tests con vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-consolidados-lcl-design.md`

**Fuera de esta etapa:** la vista de previsión por fiscal, los avisos al publicar un camión y la propuesta FCL→LCL. Cada una es su propio plan y ninguna sirve hasta que existan LCL con stock cargado, que es lo que construye esta etapa.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/lclEstados.ts` (nuevo) | Estado derivado + los dos relojes. Funciones puras, sin React ni fetch. |
| `src/lib/lclEstados.test.ts` (nuevo) | Tests de lo anterior. |
| `src/lib/operationsTypes.ts` (modificar) | `DbShipment` con los campos nuevos. |
| `api/data/[entity].ts` (modificar) | `SHIPMENT_COLS` con los campos nuevos. |
| `src/components/trucks/BandejaStock.tsx` (nuevo) | La bandeja "Aguarda stock". |
| `src/components/trucks/LclAirManager.tsx` (modificar) | Estado derivado en vez del desplegable; marca del cliente. |
| `src/components/trucks/TrucksManagement.tsx` (modificar) | Pestaña nueva para la bandeja. |

`lclEstados.ts` se mantiene sin dependencias de UI a propósito: la Etapa 2 (previsión y avisos de armado) va a consumir las mismas funciones desde otro lado.

---

### Task 1: Migración y whitelist

**Files:**
- Migración: Supabase MCP (antes de la PR, aditiva)
- Modify: `api/data/[entity].ts:2082-2090` (`SHIPMENT_COLS`)

- [ ] **Step 1: Aplicar la migración en Supabase**

Con el MCP de Supabase, proyecto `ihpsdeoexkipxmaxsmrc`:

```sql
alter table shipments add column if not exists stock         text;
alter table shipments add column if not exists marca_cliente text;
alter table shipments add column if not exists marca_motivo  text;

alter table shipments drop constraint if exists shipments_marca_cliente_check;
alter table shipments add constraint shipments_marca_cliente_check
  check (marca_cliente is null or marca_cliente in ('stand_by','prioridad'));
```

- [ ] **Step 2: Verificar que quedaron**

```sql
select column_name from information_schema.columns
where table_name = 'shipments' and column_name in ('stock','marca_cliente','marca_motivo')
order by column_name;
```

Esperado: tres filas — `marca_cliente`, `marca_motivo`, `stock`.

- [ ] **Step 3: Sumarlas a la whitelist del PATCH**

En `api/data/[entity].ts`, dentro de `SHIPMENT_COLS`, después de la línea que termina en `'origin_ref',`:

```ts
  // LCL: stock del depósito (su fecha es desconsol_date) + marca del cliente
  // (stand_by = no la saques todavía · prioridad = sacala ya), con motivo.
  'stock','marca_cliente','marca_motivo',
```

Sin esto el PATCH descarta los campos en silencio y la bandeja no guarda nada.

- [ ] **Step 4: Verificar que el typecheck sigue verde**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add api/data/\[entity\].ts
git commit -m "LCL: columnas de stock y marca del cliente en la whitelist"
```

---

### Task 2: Estado derivado

**Files:**
- Create: `src/lib/lclEstados.ts`
- Test: `src/lib/lclEstados.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/lclEstados.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estadoLcl, type CargaLcl } from './lclEstados'

const HOY = '2026-08-31'
const carga = (over: Partial<CargaLcl> = {}): CargaLcl => ({
  ref: 'LCL247', eta: '2026-08-20', stock: '', desconsol: '', ...over,
})

describe('estadoLcl — el estado sale de los datos, no se elige', () => {
  it('la ETA no llegó todavía → en viaje', () => {
    expect(estadoLcl(carga({ eta: '2026-09-10' }), HOY)).toBe('en_viaje')
  })

  it('llegó y no tiene stock → aguarda stock', () => {
    expect(estadoLcl(carga({ eta: '2026-08-20', stock: '' }), HOY)).toBe('aguarda_stock')
  })

  it('el día de la ETA ya cuenta como llegada', () => {
    expect(estadoLcl(carga({ eta: HOY }), HOY)).toBe('aguarda_stock')
  })

  it('con stock cargado → con stock, lista para camión', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY)).toBe('con_stock')
  })

  it('sin ETA no se inventa nada: queda en viaje', () => {
    expect(estadoLcl(carga({ eta: '' }), HOY)).toBe('en_viaje')
  })

  it('subida a un camión publicado → asignada, aunque tenga stock', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY, { enCamion: true })).toBe('asignada')
  })

  it('el camión ya salió → despachada', () => {
    expect(estadoLcl(carga({ stock: '13030' }), HOY, { enCamion: true, camionSalio: true }))
      .toBe('despachada')
  })

  it('un camión que salió manda sobre todo lo demás', () => {
    expect(estadoLcl(carga({ eta: '2026-09-10' }), HOY, { enCamion: true, camionSalio: true }))
      .toBe('despachada')
  })
})
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/lib/lclEstados.test.ts`
Expected: FAIL — `Failed to resolve import "./lclEstados"`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `src/lib/lclEstados.ts`:

```ts
/**
 * Estados de una carga LCL. Ninguno se elige: todos salen de datos que ya se
 * cargan. Reemplazan al desplegable manual `LclAirStatus`, que dejó cuatro
 * cargas congeladas en "en origen" desde junio de 2026 porque nadie lo movía.
 *
 * No hay estado "desconsolidada": desconsolidar ES recibir el stock (Brian
 * 31/08), así que sería el mismo estado con otro nombre.
 *
 * Funciones puras a propósito — la Etapa 2 (previsión y avisos de armado) las
 * consume desde otro lado.
 */

export type EstadoLcl = 'en_viaje' | 'aguarda_stock' | 'con_stock' | 'asignada' | 'despachada'

export interface CargaLcl {
  ref: string
  /** Llegada a Montevideo (columna `eta`). */
  eta?: string | null
  /** Nº de stock del depósito (columna `stock`). Vacío = todavía no lo dieron. */
  stock?: string | null
  /** Fecha de desconsolidación (columna `desconsol_date`) = cuándo dieron el stock. */
  desconsol?: string | null
}

/** Si está en un camión y si ese camión ya salió. Lo sabe el llamador, que es
 *  quien tiene los camiones cargados; la lib no consulta nada. */
export interface ContextoCamion {
  enCamion?: boolean
  camionSalio?: boolean
}

const vacio = (v: string | null | undefined): boolean => !String(v ?? '').trim()

export const ESTADO_LCL_LABEL: Record<EstadoLcl, string> = {
  en_viaje: 'En viaje',
  aguarda_stock: 'Aguarda stock',
  con_stock: 'Con stock',
  asignada: 'Asignada',
  despachada: 'Despachada',
}

export function estadoLcl(c: CargaLcl, hoyISO: string, ctx: ContextoCamion = {}): EstadoLcl {
  // El camión manda: una vez que salió, lo demás es historia.
  if (ctx.camionSalio) return 'despachada'
  if (ctx.enCamion) return 'asignada'
  if (!vacio(c.stock)) return 'con_stock'
  // Sin ETA no se asume que llegó: quedaría pidiendo stock de algo que sigue
  // navegando.
  if (vacio(c.eta)) return 'en_viaje'
  return String(c.eta).slice(0, 10) <= hoyISO ? 'aguarda_stock' : 'en_viaje'
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `npx vitest run src/lib/lclEstados.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lclEstados.ts src/lib/lclEstados.test.ts
git commit -m "LCL: el estado sale de los datos, no de un desplegable"
```

---

### Task 3: Los relojes de almacenaje y de espera

**Files:**
- Modify: `src/lib/lclEstados.ts`
- Test: `src/lib/lclEstados.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/lib/lclEstados.test.ts`:

```ts
import { almacenaje, diasEsperando, ALMACENAJE_DIAS } from './lclEstados'

describe('almacenaje — 30 días desde la desconsolidación', () => {
  it('sin fecha de desconsolidación no hay reloj', () => {
    expect(almacenaje({ ref: 'LCL247', desconsol: '' }, HOY)).toBeNull()
  })

  it('desconsolidada hoy → quedan los 30 días', () => {
    const a = almacenaje({ ref: 'LCL247', desconsol: HOY }, HOY)
    expect(a).toEqual({ vence: '2026-09-30', diasRestantes: 30, vencido: false })
  })

  it('desconsolidada hace 26 días → quedan 4', () => {
    const a = almacenaje({ ref: 'LCL247', desconsol: '2026-08-05' }, HOY)
    expect(a?.diasRestantes).toBe(4)
    expect(a?.vencido).toBe(false)
  })

  it('pasados los 30 días queda vencido y en negativo', () => {
    const a = almacenaje({ ref: 'LCL247', desconsol: '2026-07-01' }, HOY)
    expect(a?.vencido).toBe(true)
    expect(a!.diasRestantes).toBeLessThan(0)
  })

  it('el plazo es 30 días', () => {
    expect(ALMACENAJE_DIAS).toBe(30)
  })
})

describe('diasEsperando — hace cuánto está lista y sin salir', () => {
  it('sin stock todavía no está esperando camión', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '', desconsol: '' }, HOY)).toBeNull()
  })

  it('con stock de hace 12 días → 12', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '13030', desconsol: '2026-08-19' }, HOY)).toBe(12)
  })

  it('con stock pero sin fecha no se puede contar', () => {
    expect(diasEsperando({ ref: 'LCL247', stock: '13030', desconsol: '' }, HOY)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `npx vitest run src/lib/lclEstados.test.ts`
Expected: FAIL — `almacenaje is not a function`.

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `src/lib/lclEstados.ts`:

```ts
/** Días de almacenaje gratis desde que el depósito desconsolida. */
export const ALMACENAJE_DIAS = 30

const MS_DIA = 86_400_000

const aFecha = (iso: string): Date => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1)
}

const sumarDias = (iso: string, dias: number): string => {
  const f = aFecha(iso)
  f.setDate(f.getDate() + dias)
  const mm = String(f.getMonth() + 1).padStart(2, '0')
  const dd = String(f.getDate()).padStart(2, '0')
  return `${f.getFullYear()}-${mm}-${dd}`
}

const diasEntre = (desdeISO: string, hastaISO: string): number =>
  Math.round((aFecha(hastaISO).getTime() - aFecha(desdeISO).getTime()) / MS_DIA)

export interface Almacenaje {
  /** Último día sin cargo. */
  vence: string
  /** Negativo = ya se pasó. */
  diasRestantes: number
  vencido: boolean
}

/**
 * El reloj que hoy no mira nadie: para una FCL el vencimiento es el libre del
 * contenedor, pero una LCL no tiene contenedor que devolver, así que ese aviso
 * no existía. Corre desde la desconsolidación, que es cuando dan el stock.
 */
export function almacenaje(c: Pick<CargaLcl, 'ref' | 'desconsol'>, hoyISO: string): Almacenaje | null {
  if (vacio(c.desconsol)) return null
  const vence = sumarDias(String(c.desconsol), ALMACENAJE_DIAS)
  const diasRestantes = diasEntre(hoyISO, vence)
  return { vence, diasRestantes, vencido: diasRestantes < 0 }
}

/**
 * Hace cuántos días la carga está lista y todavía no salió. Null cuando no
 * corresponde: sin stock no está esperando camión, y sin fecha no hay cómo
 * contar.
 */
export function diasEsperando(
  c: Pick<CargaLcl, 'ref' | 'stock' | 'desconsol'>,
  hoyISO: string,
): number | null {
  if (vacio(c.stock) || vacio(c.desconsol)) return null
  return diasEntre(String(c.desconsol), hoyISO)
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `npx vitest run src/lib/lclEstados.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lclEstados.ts src/lib/lclEstados.test.ts
git commit -m "LCL: reloj de almacenaje (30 días) y días esperando camión"
```

---

### Task 4: Los campos nuevos en el modelo

**Files:**
- Modify: `src/lib/operationsTypes.ts` (interfaz `DbShipment` ~línea 215, `EDITABLE_FIELDS` ~línea 845)

- [ ] **Step 1: Sumar los campos a `DbShipment`**

En `src/lib/operationsTypes.ts`, junto a `desconsol_date?: string`:

```ts
  desconsol_date?: string
  /** LCL: nº de stock del depósito. Su fecha es `desconsol_date`. */
  stock?: string | null
  /** LCL: 'stand_by' (el cliente pide que no salga) · 'prioridad' (la quiere ya). */
  marca_cliente?: 'stand_by' | 'prioridad' | null
  marca_motivo?: string | null
```

**No se tocan `EDITABLE_FIELDS` ni `UnifiedOperation`**: esas claves tienen que existir
en `UnifiedOperation` y son para la edición en línea de la grilla de Operaciones, que
en esta etapa no toca estos campos. La bandeja y el formulario guardan por PATCH
directo contra las columnas, que ya están en la whitelist (Task 1).

- [ ] **Step 2: Verificar que compila**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Correr toda la suite**

Run: `npm run test:run`
Expected: todos los tests en verde (no debería cambiar ninguno: los campos son opcionales).

- [ ] **Step 4: Commit**

```bash
git add src/lib/operationsTypes.ts
git commit -m "LCL: stock y marca del cliente en el modelo de carga"
```

---

### Task 5: Bandeja "Aguarda stock"

**Files:**
- Create: `src/components/trucks/BandejaStock.tsx`
- Modify: `src/components/trucks/TrucksManagement.tsx:81-115`

- [ ] **Step 1: Crear el componente**

Crear `src/components/trucks/BandejaStock.tsx`:

```tsx
/**
 * Las LCL que llegaron y todavía no tienen stock, con un campo por fila para
 * tipear varios seguidos: el depósito manda la tanda y se cargan todas juntas.
 *
 * Es el único lugar donde se carga el stock. Que sea rápido es lo que decide si
 * esto se usa o se abandona como el desplegable manual que reemplaza.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Package } from '@phosphor-icons/react'
import type { DbShipment } from '@/lib/operationsTypes'
import { estadoLcl } from '@/lib/lclEstados'
import { fmtDateDMY } from '@/lib/format'

interface BandejaStockProps {
  dbShipments: DbShipment[]
  /** Refs que ya viajan en un camión: no entran a la bandeja. */
  refsEnCamion: Set<string>
  onGuardarStock: (id: string, stock: string) => Promise<void>
}

export default function BandejaStock({ dbShipments, refsEnCamion, onGuardarStock }: BandejaStockProps) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const esperando = useMemo(() => dbShipments
    .filter(s => s.mode === 'lcl' && !s.archived)
    .filter(s => !refsEnCamion.has(String(s.ref || '').trim().toUpperCase()))
    .filter(s => estadoLcl(
      { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date },
      hoy,
    ) === 'aguarda_stock')
    // La que llegó primero es la que más tiempo lleva sin stock.
    .sort((a, b) => String(a.eta || '').localeCompare(String(b.eta || ''))),
    [dbShipments, refsEnCamion, hoy])

  const guardar = async (s: DbShipment) => {
    const valor = (borradores[s.id] || '').trim()
    if (!valor) { toast.error('Escribí el número de stock'); return }
    setGuardando(s.id)
    try {
      await onGuardarStock(s.id, valor)
      setBorradores(prev => { const { [s.id]: _, ...resto } = prev; return resto })
      toast.success(`${s.ref}: stock ${valor}`)
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el stock')
    } finally {
      setGuardando(null)
    }
  }

  if (esperando.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <Package size={32} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm text-muted-foreground">
          No hay cargas esperando stock. Cuando llegue una LCL sin stock, aparece acá.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Aguarda stock · {esperando.length}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Llegaron y el depósito todavía no dio el stock. Al cargarlo quedan listas para camión.
        </p>
      </div>
      <div className="divide-y divide-border">
        {esperando.map(s => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-[7rem]">
              <div className="text-sm font-semibold">{s.ref}</div>
              <div className="text-[11px] text-muted-foreground">{s.cliente || '—'}</div>
            </div>
            <div className="text-xs text-muted-foreground min-w-[6.5rem]">
              llegó {fmtDateDMY(s.eta || '') || '—'}
            </div>
            <div className="text-xs text-muted-foreground min-w-[6rem]">
              {s.fiscal || 'sin fiscal'}
            </div>
            <Input
              value={borradores[s.id] ?? ''}
              onChange={e => setBorradores(prev => ({ ...prev, [s.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') void guardar(s) }}
              placeholder="nº de stock"
              className="h-9 w-40 text-sm"
            />
            <Button
              size="sm"
              onClick={() => void guardar(s)}
              disabled={guardando === s.id || !(borradores[s.id] || '').trim()}
            >
              {guardando === s.id ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Montarla como pestaña**

En `src/components/trucks/TrucksManagement.tsx`, cambiar el tipo del sub-tab y agregar la pestaña. El `value` del `Tabs` pasa de `'trucks' | 'lcl-air'` a incluir `'stock'`:

```tsx
      <Tabs value={subTab} onValueChange={v => setSubTab(v as 'trucks' | 'lcl-air' | 'stock')} className="space-y-4">
```

Agregar el `TabsTrigger` después del de `lcl-air`:

```tsx
          <TabsTrigger value="stock" className="gap-1.5">
            <Package size={14} />
            Aguarda stock
          </TabsTrigger>
```

Y el contenido después del `TabsContent` de `lcl-air`:

```tsx
        <TabsContent value="stock">
          <BandejaStock
            dbShipments={dbShipments}
            refsEnCamion={refsEnCamion}
            onGuardarStock={onGuardarStock}
          />
        </TabsContent>
```

Agregar el import arriba: `import BandejaStock from './BandejaStock'` y `Package` al import de `@phosphor-icons/react`. Las props `dbShipments`, `refsEnCamion` y `onGuardarStock` se agregan a `TrucksManagementProps` y se pasan desde donde se monta el componente; `onGuardarStock` llama al `handlePatchShipment` que ya existe en `src/App.tsx` con `{ stock }`.

- [ ] **Step 3: Verificar que compila y que la suite sigue verde**

Run: `npm run typecheck && npm run test:run`
Expected: sin errores, todos los tests en verde.

- [ ] **Step 4: Verificar a mano con datos reales**

Levantar el preview y entrar a Camiones → Aguarda stock. Con las cuatro LCL de junio (E208, E147, A7757B, LCL00365UY) las tres que tienen ETA pasada deben aparecer; A7757B no, porque no tiene ETA.

Cargar un stock en una y confirmar que desaparece de la bandeja.

- [ ] **Step 5: Commit**

```bash
git add src/components/trucks/BandejaStock.tsx src/components/trucks/TrucksManagement.tsx
git commit -m "LCL: bandeja para cargar el stock de a varias"
```

---

### Task 6: La pantalla de LCL pasa a leer la tabla real

**Files:**
- Modify: `src/components/trucks/LclAirManager.tsx` (props, filtros, lista, formulario)
- Modify: `src/components/trucks/TrucksManagement.tsx:111-117`

**Por qué esta tarea existe:** `LclAirManager` recibe `lclAir: LclAirShipment[]`, que es el registro viejo `lcl_air_shipments` — **una sola fila, de mayo**. Las cuatro LCL reales viven en `shipments` con `mode='lcl'` y esa pantalla no las ve. El armador de camiones sí las ve (`AvailableLoadsPanel` ya recibe `dbShipments`). O sea que el LCL se migró a la tabla unificada y esta pantalla quedó apuntando a la vieja: por eso la sección se ve vacía.

**Mapeo de campos** (viejo → nuevo):

| `LclAirShipment` | `DbShipment` |
|---|---|
| `ref` | `ref` |
| `modality` | `mode` (`'lcl'` o `'air'`) |
| `client` | `cliente` |
| `origin` | `origin` |
| `mblHbl` | `hbl` (si está vacío, `doc_number`) |
| `etaMvd` | `eta` |
| `desconsolDate` | `desconsol_date` |
| `pkgs` `kg` `m3` `fiscal` `wood` | iguales |
| `description` | `observacion` |
| `notes` | `notes` |
| `status` | *se borra* — lo reemplaza `estadoLcl()` |
| — | `stock`, `marca_cliente`, `marca_motivo` (nuevos) |

- [ ] **Step 1: Cambiar las props**

En `src/components/trucks/LclAirManager.tsx`, reemplazar la interfaz:

```tsx
interface LclAirManagerProps {
  /** Las LCL/aéreo de la tabla unificada (`shipments`, mode lcl|air). */
  dbShipments: DbShipment[]
  /** Refs que ya viajan en un camión publicado, en MAYÚSCULAS. */
  refsEnCamion: Set<string>
  /** Refs cuyo camión ya salió. */
  refsDespachadas: Set<string>
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onCrear: () => void
  onBorrar: (id: string) => void
}

export default function LclAirManager({
  dbShipments, refsEnCamion, refsDespachadas, onPatch, onCrear, onBorrar,
}: LclAirManagerProps) {
```

Import: `import type { DbShipment } from '@/lib/operationsTypes'` y `import { estadoLcl, ESTADO_LCL_LABEL, type EstadoLcl } from '@/lib/lclEstados'`. Se borran los imports de `LclAirShipment` y `LclAirStatus`.

- [ ] **Step 2: Cambiar la fuente de la lista**

Reemplazar el `useMemo` que filtra `lclAir` por uno sobre `dbShipments`:

```tsx
  const hoy = new Date().toISOString().slice(0, 10)

  const filas = useMemo(() => dbShipments
    .filter(s => (s.mode === 'lcl' || s.mode === 'air') && !s.archived)
    .map(s => {
      const REF = String(s.ref || '').trim().toUpperCase()
      return {
        s,
        estado: estadoLcl(
          { ref: s.ref, eta: s.eta, stock: s.stock, desconsol: s.desconsol_date },
          hoy,
          { enCamion: refsEnCamion.has(REF), camionSalio: refsDespachadas.has(REF) },
        ),
      }
    })
    .filter(({ s, estado }) => {
      if (modalityFilter !== 'all' && s.mode !== modalityFilter) return false
      if (statusFilter !== 'all' && estado !== statusFilter) return false
      if (search.trim()) {
        const blob = `${s.ref} ${s.cliente} ${s.fiscal} ${s.observacion} ${s.stock || ''}`.toLowerCase()
        if (!blob.includes(search.trim().toLowerCase())) return false
      }
      return true
    })
    .sort((a, b) => String(a.s.eta || '').localeCompare(String(b.s.eta || ''))),
    [dbShipments, refsEnCamion, refsDespachadas, modalityFilter, statusFilter, search, hoy])
```

Y el tipo del filtro: `type StatusFilter = 'all' | EstadoLcl`.

- [ ] **Step 3: Cambiar las opciones del filtro de estado**

Las cinco del estado derivado, en el orden del recorrido:

```tsx
<SelectContent>
  <SelectItem value="all">Todos los estados</SelectItem>
  {(['en_viaje','aguarda_stock','con_stock','asignada','despachada'] as EstadoLcl[]).map(e => (
    <SelectItem key={e} value={e}>{ESTADO_LCL_LABEL[e]}</SelectItem>
  ))}
</SelectContent>
```

- [ ] **Step 4: Cambiar el badge de la lista**

Donde hoy dice `LCL_AIR_STATUS_LABELS[s.status]`:

```tsx
<Badge variant="outline" className="text-[10px]">{ESTADO_LCL_LABEL[estado]}</Badge>
```

- [ ] **Step 5: Borrar el desplegable de estado del formulario y poner el stock**

Borrar el bloque del `Select` de `draft.status` (~línea 343) y en su lugar:

```tsx
<div className="space-y-1.5">
  <Label>Stock del depósito</Label>
  <Input
    value={draft.stock || ''}
    onChange={e => update({ stock: e.target.value })}
    placeholder="nº de stock"
  />
  <p className="text-[11px] text-muted-foreground">
    Al cargarlo la carga pasa a "Con stock" y queda lista para subir a un camión.
  </p>
</div>
```

El guardado del formulario pasa a llamar `onPatch(s.id, { ... })` en vez de `onUpdateLclAir`.

- [ ] **Step 6: Actualizar el montaje**

En `TrucksManagement.tsx`, reemplazar el `TabsContent` de `lcl-air`:

```tsx
        <TabsContent value="lcl-air">
          <LclAirManager
            dbShipments={props.dbShipments}
            refsEnCamion={props.refsEnCamion}
            refsDespachadas={props.refsDespachadas}
            onPatch={props.onPatchShipment}
            onCrear={props.onCrearCarga}
            onBorrar={props.onBorrarCarga}
          />
        </TabsContent>
```

`refsEnCamion` y `refsDespachadas` se calculan una sola vez donde se monta `TrucksManagement`:

```tsx
const refsEnCamion = useMemo(() => {
  const set = new Set<string>()
  for (const t of trucks) {
    if (t.draft || !(t.loadDate || t.departureDate)) continue
    for (const l of truckLoads) {
      if (l.truckId !== t.id || l.pending === 'add') continue
      const r = String(l.sourceRef || '').trim().toUpperCase()
      if (r) set.add(r)
    }
  }
  return set
}, [trucks, truckLoads])

const refsDespachadas = useMemo(() => {
  const set = new Set<string>()
  for (const t of trucks) {
    if (t.draft || !t.departureDate) continue
    for (const l of truckLoads) {
      if (l.truckId !== t.id || l.pending === 'add') continue
      const r = String(l.sourceRef || '').trim().toUpperCase()
      if (r) set.add(r)
    }
  }
  return set
}, [trucks, truckLoads])
```

Mismo criterio que usan `AvailableLoadsPanel` y el `ADAPTA_WEBAPP` de n8n: camión no borrador, con fecha, y cargas que no estén marcadas como `pending: 'add'`.

- [ ] **Step 7: Verificar que compila y que la suite sigue verde**

Run: `npm run typecheck && npm run test:run`
Expected: sin errores, todos los tests en verde.

- [ ] **Step 8: Verificar a mano — esta es la prueba de toda la etapa**

En Camiones → LCL/Aéreo tienen que aparecer **las cuatro cargas reales**: E208 (Veicolo), E147 (Intento Inflexible), A7757B (Tool Shop) y LCL00365UY (Pellacani). Hoy no aparece ninguna.

Las tres con ETA de junio deben decir **Aguarda stock**; A7757B, que no tiene ETA, **En viaje**. Sin haber tocado nada.

- [ ] **Step 9: Commit**

```bash
git add src/components/trucks/LclAirManager.tsx src/components/trucks/TrucksManagement.tsx
git commit -m "LCL: la pantalla lee la tabla real y el estado sale de los datos"
```

---


### Task 7: Marca del cliente

**Files:**
- Modify: `src/components/trucks/LclAirManager.tsx` (formulario de edición)

- [ ] **Step 1: Agregar los dos botones y el motivo**

En el formulario, debajo del campo de stock:

```tsx
<div className="space-y-1.5">
  <Label>Marca del cliente</Label>
  <div className="flex gap-2">
    {([
      { v: null, t: 'Sin marca' },
      { v: 'stand_by' as const, t: 'Stand by' },
      { v: 'prioridad' as const, t: 'Prioridad' },
    ]).map(o => (
      <button
        key={o.t}
        type="button"
        onClick={() => update({ marca_cliente: o.v, marca_motivo: o.v ? draft.marca_motivo : '' })}
        className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-colors ${
          (draft.marca_cliente ?? null) === o.v
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:bg-muted/50'
        }`}
      >
        {o.t}
      </button>
    ))}
  </div>
  {draft.marca_cliente && (
    <Input
      value={draft.marca_motivo || ''}
      onChange={e => update({ marca_motivo: e.target.value })}
      placeholder={draft.marca_cliente === 'stand_by' ? 'por qué no sale' : 'por qué es prioridad'}
    />
  )}
  <p className="text-[11px] text-muted-foreground">
    Stand by la saca de las candidatas a camión. Prioridad la pone primera.
  </p>
</div>
```

- [ ] **Step 2: Mostrar la marca en la lista**

Junto al badge de estado:

```tsx
{s.marca_cliente === 'stand_by' && (
  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700" title={s.marca_motivo || ''}>
    Stand by
  </Badge>
)}
{s.marca_cliente === 'prioridad' && (
  <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-700" title={s.marca_motivo || ''}>
    Prioridad
  </Badge>
)}
```

- [ ] **Step 3: Verificar que compila y que la suite sigue verde**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: sin errores, todos los tests en verde, build OK.

- [ ] **Step 4: Verificar a mano**

Marcar una carga como stand by con motivo, guardar, recargar la página y confirmar que la marca y el motivo siguen ahí.

- [ ] **Step 5: Commit y PR**

```bash
git add src/components/trucks/LclAirManager.tsx
git commit -m "LCL: marca del cliente — stand by y prioridad, con motivo"
git push -u origin feat/lcl-estados-y-stock
```

Abrir la PR con `gh pr create`, base `main`.

---

## Verificación de la etapa

- Las cuatro LCL de junio muestran su estado correcto **sin tocarles nada**: las tres con ETA pasada en "Aguarda stock", A7757B (sin ETA) en "En viaje".
- Cargar el stock de una la mueve a "Con stock" y la hace aparecer como candidata en el armador de camiones.
- El desplegable manual de estado ya no existe en ninguna pantalla.
- El armador sigue funcionando igual para FCL: nada de esta etapa toca su circuito.
- `npm run typecheck && npm run test:run && npm run build` en verde.
