# Bloque de viabilidad + fecha única de camión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Un bloque destacado y visual arriba del panel de Operaciones con los datos de viabilidad (cuadros grandes + toggles), editable en LCL/aéreo/terrestre. (B) Un solo campo de fecha de carga/salida en el armador de camiones (escribe ambas columnas).

**Architecture:** A — componente nuevo `ViabilityBlock` que reusa el canal `commit(key,value)` del panel; 2 columnas DB nuevas (`desconsol_date`, `entrega_planta`); los campos suben al bloque y se sacan de las SECTIONS/FLAGS. B — un input único en `TruckBuilder` que escribe `loadDate=departureDate`, stepper de 3 pasos (carga y salida fusionadas), agenda y lista colapsan a una fecha. Sin migración en B.

**Tech Stack:** Vite + React 19 + TS · Tailwind 4 · Supabase (1 migración en A) · vitest. Cero deps nuevas.

**Spec:** `docs/superpowers/specs/2026-06-12-panel-viabilidad-y-fechas-camion-design.md`

**Entorno:** Repo `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy` (comandos desde ahí, ruta con espacios → comillas). Gates: `npm run typecheck && npm run test:run && npm run build && npm run lint`. Baseline 126 tests, lint 157 warnings (cero nuevos). Commits en español. NUNCA push a main.

**Branches:**
- **Parte A** → `feat/panel-bloque-viabilidad` (YA creada, spec+plan commiteados acá).
- **Parte B** → `feat/camion-fecha-unica` (crear desde main al empezar B).

---

# PARTE A — Bloque de viabilidad (branch `feat/panel-bloque-viabilidad`)

### Task A0 (CONTROLADOR, no subagente): migración Supabase

Aplicar en TWF (`ihpsdeoexkipxmaxsmrc`) vía MCP `apply_migration`, nombre `shipments_desconsol_entrega_planta`:

```sql
alter table shipments
  add column if not exists desconsol_date text,
  add column if not exists entrega_planta boolean not null default false;
```

Verificar con `list_tables` que ambas columnas existen. Inofensiva en prod.

---

### Task A1: modelo — campos, mappers, EDITABLE_FIELDS, DEPOSITOS_UY, API (TDD)

**Files:**
- Modify: `src/lib/operationsTypes.ts` (interface DbShipment ~88-131; UnifiedOperation ~134-187; dbShipmentToOperation ~252-306; fclToOperation ~202-249; EDITABLE_FIELDS ~461-495; nueva const DEPOSITOS_UY)
- Modify: `api/_lib/schemas.ts` (ShipmentRowSchema)
- Modify: `api/data/[entity].ts` (SHIPMENT_COLS whitelist ~1247 + cualquier mapper de shipments)
- Test: `src/lib/operationsTypes.test.ts`

- [ ] **Step 1: Tests que fallan**

Agregar al final de `src/lib/operationsTypes.test.ts` (ajustar imports: ya importa `dbShipmentToOperation`, `EDITABLE_FIELDS`; sumar `DEPOSITOS_UY`):

```ts
describe('viabilidad — desconsol y entregaPlanta', () => {
  it('dbShipmentToOperation mapea desconsol_date y entrega_planta', () => {
    const op = dbShipmentToOperation({
      id: 'shp-lcl-1', ref: 'LCL-1', mode: 'lcl', desconsol_date: '2026-06-18',
      entrega_planta: true,
    } as never)
    expect(op.desconsol).toBe('2026-06-18')
    expect(op.entregaPlanta).toBe(true)
  })
  it('dbShipmentToOperation: defaults vacíos sin esos campos', () => {
    const op = dbShipmentToOperation({ id: 'x', ref: 'LCL-2', mode: 'lcl' } as never)
    expect(op.desconsol).toBe('')
    expect(op.entregaPlanta).toBe(false)
  })
  it('EDITABLE_FIELDS incluye desconsol y entregaPlanta', () => {
    expect(EDITABLE_FIELDS.desconsol).toEqual({ col: 'desconsol_date', type: 'text' })
    expect(EDITABLE_FIELDS.entregaPlanta).toEqual({ col: 'entrega_planta', type: 'bool' })
  })
  it('DEPOSITOS_UY trae los conocidos', () => {
    expect(DEPOSITOS_UY).toContain('GODILCO')
    expect(DEPOSITOS_UY).toContain('TCP')
    expect(DEPOSITOS_UY).toContain('MONTECON')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación en operationsTypes.ts**

1. Interface `DbShipment`: después de `no_apilable: boolean` (línea ~120) agregar:
```ts
  desconsol_date?: string
  entrega_planta?: boolean
```

2. Interface `UnifiedOperation`: después de `descarga: string` (línea 169) agregar:
```ts
  desconsol: string              // fecha de desconsolidación (DB: desconsol_date · FCL: = descarga)
  entregaPlanta: boolean         // entrega en planta (sí/no)
```

3. En `EMPTY` (línea ~194): agregar `desconsol: '', entregaPlanta: false,`.

4. `fclToOperation` (después de `descarga: firstWith('DESCARGA'),` línea 240):
```ts
    desconsol: firstWith('DESCARGA'),   // misma fuente que descarga
    // entregaPlanta queda en false (viene de EMPTY) — no hay dato en el Sheet
```

5. `dbShipmentToOperation` (después de `descarga: '',` línea 288):
```ts
    desconsol: s.desconsol_date || '',
    entregaPlanta: !!s.entrega_planta,
```

6. `EDITABLE_FIELDS` (después de `seguimiento: ...` línea 485):
```ts
  desconsol: { col: 'desconsol_date', type: 'text' },
  entregaPlanta: { col: 'entrega_planta', type: 'bool' },
```

7. Nueva const exportada (cerca de MODALITY_LABELS o al final de las consts):
```ts
// Depósitos UY conocidos para el combobox del bloque de viabilidad.
// El input igual acepta uno nuevo (datalist) + se le suman los ya usados.
export const DEPOSITOS_UY = ['GODILCO', 'PLANIR', 'LOBRAUS', 'TCP', 'MONTECON', 'STL']
```

- [ ] **Step 4: API — schema + columnas**

1. `api/_lib/schemas.ts` `ShipmentRowSchema`: agregar (seguir el patrón dual camel/snake de los campos existentes tipo `no_apilable`/`noApilable` — mirar cómo están y replicar):
```ts
  desconsol_date: z.string().max(20).optional().nullable(),
  entrega_planta: z.boolean().optional(),
```
2. `api/data/[entity].ts`: en `SHIPMENT_COLS` (~1247) sumar `'desconsol_date'` y `'entrega_planta'`. Si el handler de shipments tiene un mapper explícito DB→API, sumar ambos (es el mismo patrón que `discharge_port`/`no_apilable` agregados en la PR `feat/new-shipment-fields` — buscar esos para copiar el lugar exacto). Si el GET es passthrough por columnas, alcanza con SHIPMENT_COLS.

- [ ] **Step 5: Verificar + commit**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts` (PASS) luego `npm run typecheck && npm run build`.

```bash
git add src/lib/operationsTypes.ts src/lib/operationsTypes.test.ts api/_lib/schemas.ts "api/data/[entity].ts"
git commit -m "feat(operaciones): campos desconsol_date y entrega_planta + DEPOSITOS_UY (modelo + API)"
```

---

### Task A2: componente `ViabilityBlock`

**Files:**
- Create: `src/components/operations/ViabilityBlock.tsx`

Componente UI; sin test unitario (la lógica de mapeo ya se testeó). Gate = typecheck + build (no se usa aún → sin imports rotos).

- [ ] **Step 1: Crear el componente**

```tsx
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { LockSimple } from '@phosphor-icons/react'
import type { UnifiedOperation } from '@/lib/operationsTypes'
import { DEPOSITOS_UY } from '@/lib/operationsTypes'

const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Bloque destacado arriba del panel: los datos que se miran para decidir si una
// carga es viable, en cuadros grandes + toggles. Editable solo para filas DB
// (LCL/aéreo/terrestre); FCL muestra los valores con candadito (hasta el flip).
export default function ViabilityBlock({
  op,
  editable,
  knownDepositos,
  onCommit,
}: {
  op: UnifiedOperation
  editable: boolean
  knownDepositos: string[]
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const depositoOptions = Array.from(new Set([...DEPOSITOS_UY, ...knownDepositos])).filter(Boolean)
  return (
    <section className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Datos clave de la carga</span>
        {!editable && (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <LockSimple size={11} /> de la planilla
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBox label="Peso" value={op.kg} unit="kg" kind="number" editable={editable} onCommit={v => onCommit('kg', v)} />
        <StatBox label="Volumen" value={op.m3} unit="m³" kind="number" editable={editable} onCommit={v => onCommit('m3', v)} />
        <StatBox label="Bultos" value={op.pkgs} kind="number" editable={editable} onCommit={v => onCommit('pkgs', v)} />
        <StatBox label="Fiscal (destino)" value={op.fiscal} kind="text" editable={editable} onCommit={v => onCommit('fiscal', v)} />
        <StatBox label="Depósito UY" value={op.deposito} kind="combo" options={depositoOptions} editable={editable} onCommit={v => onCommit('deposito', v)} />
        <StatBox label="Desconsolidación" value={op.desconsol} kind="date" editable={editable} onCommit={v => onCommit('desconsol', v)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Apilable es la NEGACIÓN de noApilable: togglear Apilable invierte noApilable */}
        <Toggle label="Apilable" on={!op.noApilable} editable={editable} onToggle={() => onCommit('noApilable', !op.noApilable)} />
        <Toggle label="Madera" on={op.wood} editable={editable} onToggle={() => onCommit('wood', !op.wood)} />
        <Toggle label="Entrega en planta" on={op.entregaPlanta} editable={editable} onToggle={() => onCommit('entregaPlanta', !op.entregaPlanta)} />
      </div>
    </section>
  )
}

// Cuadro grande editable: número / texto / fecha / combo (datalist).
function StatBox({
  label, value, unit, kind, options, editable, onCommit,
}: {
  label: string
  value: string | number
  unit?: string
  kind: 'number' | 'text' | 'date' | 'combo'
  options?: string[]
  editable: boolean
  onCommit: (v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const display = kind === 'number'
    ? (Number(value) ? NUM_FMT.format(Number(value)) : '—')
    : (String(value ?? '') || '—')

  const start = () => {
    if (!editable) return
    setDraft(String(value ?? ''))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    if (kind === 'number') {
      if (draft.trim() === '') { onCommit(null); return }
      const n = parseFloat(draft.replace(',', '.'))
      if (!isFinite(n)) return
      if (String(value ?? '') !== String(n)) onCommit(n)
      return
    }
    const v = draft.trim()
    if (String(value ?? '') !== String(v)) onCommit(v)
  }

  const listId = `dep-${label}`
  return (
    <div className="rounded-lg border bg-background p-2.5 min-w-0">
      <div className="text-[11px] text-muted-foreground leading-none mb-1">{label}</div>
      {editing ? (
        <>
          <Input
            autoFocus
            list={kind === 'combo' ? listId : undefined}
            type={kind === 'date' ? 'date' : 'text'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            className="h-8 text-sm px-1.5"
          />
          {kind === 'combo' && (
            <datalist id={listId}>
              {(options || []).map(o => <option key={o} value={o} />)}
            </datalist>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!editable}
          className={`text-left w-full leading-tight ${editable ? 'cursor-text hover:opacity-70' : 'cursor-default'}`}
          title={editable ? 'Click para editar' : 'Solo lectura (viene de la planilla)'}
        >
          <span className={`text-[22px] font-medium ${display === '—' ? 'text-muted-foreground' : ''}`}>{display}</span>
          {unit && display !== '—' && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
        </button>
      )}
    </div>
  )
}

// Toggle grande Sí/No: el seleccionado en azul institucional (texto blanco).
function Toggle({
  label, on, editable, onToggle,
}: {
  label: string
  on: boolean
  editable: boolean
  onToggle: () => void
}) {
  const seg = (active: boolean, isYes: boolean) => {
    const base = 'flex-1 h-9 text-sm rounded-md border transition-colors'
    if (active) return `${base} bg-[#1e3a8a] border-[#1e3a8a] text-white font-medium`
    return `${base} bg-background border-border text-muted-foreground ${editable ? 'hover:bg-muted' : ''}`
  }
  return (
    <div>
      <div className="text-[11px] text-muted-foreground text-center mb-1 truncate" title={label}>{label}</div>
      <div className="flex gap-1">
        <button type="button" disabled={!editable || on} onClick={() => { if (!on) onToggle() }} className={seg(on, true)}>Sí</button>
        <button type="button" disabled={!editable || !on} onClick={() => { if (on) onToggle() }} className={seg(!on, false)}>No</button>
      </div>
    </div>
  )
}
```

⚠️ **Limpiar la línea fea del toggle Apilable** en el render: `onToggle={() => onCommit('noApilable', !op.noApilable)}` es lo correcto (apilable = !noApilable; togglear apilable invierte noApilable). Reemplazar la expresión enredada del Step por exactamente:
```tsx
        <Toggle label="Apilable" on={!op.noApilable} editable={editable} onToggle={() => onCommit('noApilable', !op.noApilable)} />
```

- [ ] **Step 2: Verificar + commit**

Run: `npm run typecheck && npm run build`

```bash
git add src/components/operations/ViabilityBlock.tsx
git commit -m "feat(operaciones): componente ViabilityBlock (cuadros grandes + toggles)"
```

---

### Task A3: integrar en el panel + sacar campos de las secciones

**Files:**
- Modify: `src/components/operations/OperationDetailPanel.tsx`
- Modify: `src/components/operations/OperationsGrid.tsx` (pasar knownDepositos al panel)

- [ ] **Step 1: Pasar knownDepositos**

En `OperationsGrid.tsx`, cerca de los otros memos (después de `operations`):
```ts
  // Depósitos UY ya usados → alimentan el combobox del bloque de viabilidad.
  const knownDepositos = useMemo(
    () => Array.from(new Set(operations.map(o => o.deposito).filter(Boolean))),
    [operations]
  )
```
Y en el render de `<OperationDetailPanel ... />` agregar la prop `knownDepositos={knownDepositos}`.

- [ ] **Step 2: Panel — prop + render del bloque**

En `OperationDetailPanel.tsx`:
1. Import: `import ViabilityBlock from './ViabilityBlock'`.
2. Agregar `knownDepositos` a las props del componente (tipo `string[]`, default `[]`).
3. Después del bloque "Operativo asignado" (línea ~222, antes de la sección Contenedores), renderizar:
```tsx
          <ViabilityBlock
            op={op}
            editable={op.source === 'db' && !!op.dbId && !op.readOnly}
            knownDepositos={knownDepositos}
            onCommit={commit}
          />
```

- [ ] **Step 3: Sacar del SECTIONS/FLAGS lo que subió al bloque**

En `SECTIONS`:
- Sección **Carga**: quitar `pkgs`, `kg`, `m3`. Quedan `descripcion`, `tipo`.
- Sección **Operativa**: quitar `deposito` y `fiscal`. Quedan `operativa`, `transporte`, `camion`, `despacho`, `dev`.
- Sección **Fechas**: quitar `descarga` (es la desconsolidación, ya está en el bloque). Quedan etd, eta, salida, etaFisc, libre, seguimiento.

En `FLAGS`: quitar `wood` y `noApilable` (pasan a toggles del bloque). Quedan tlx, oog, imo, seguro, certi, impresa.

⚠️ La fila de "Indicadores" sigue colgada de la sección Carga (condición `sec.title === 'Carga'`). Como Carga ahora solo tiene descripcion+tipo, los chips siguen apareciendo ahí — OK.

- [ ] **Step 4: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`
Expected: verde, 130 tests (126 + 4 de A1), sin warnings nuevos.

```bash
git add src/components/operations/OperationDetailPanel.tsx src/components/operations/OperationsGrid.tsx
git commit -m "feat(operaciones): bloque de viabilidad arriba del panel + campos movidos del detalle"
```

---

### Task A4: gates finales + push + PR (Parte A)

- [ ] Suite completa (`typecheck && test:run && build && lint`) → push `feat/panel-bloque-viabilidad` → link de PR a Brian.

Checklist manual (preview Vercel):
1. Abrir una LCL → arriba se ve el bloque con 6 cuadros + 3 toggles; editar kg, depósito (combobox sugiere GODILCO/TCP/… y deja escribir uno nuevo), desconsolidación, togglear Apilable/Madera/Entrega en planta.
2. Esos campos ya NO aparecen duplicados abajo.
3. Abrir un FCL → el bloque se ve igual pero read-only (candadito).
4. Toggle azul institucional con texto blanco en el seleccionado.

---

# PARTE B — Fecha única de camión (branch `feat/camion-fecha-unica`, desde main)

### Task B1: TruckBuilder — un solo campo de fecha + stepper de 3 pasos

**Files:**
- Modify: `src/components/trucks/TruckBuilder.tsx` (setStatusWithDate ~124-131; stepper ~372-393; inputs de fecha ~419-433)

- [ ] **Step 1: Input único de fecha**

Reemplazar los DOS `<FieldDate>` "Fecha de carga" + "Fecha de salida" (líneas 419-428) por UNO:
```tsx
                <FieldDate
                  label="Fecha de carga / salida"
                  value={merged.departureDate || merged.loadDate}
                  onChange={v => updateTruck({ loadDate: v, departureDate: v })}
                />
```
(El "Arribo a fiscal" queda igual.)

- [ ] **Step 2: Stepper de 3 pasos (carga y salida fusionadas)**

Reemplazar el `.map` de estados (línea 374) por un array de 3 pasos; el paso "Cargado / Salió" usa `in_transit` y matchea también `loaded` (datos viejos):
```tsx
                {([
                  { key: 'planning', label: 'Planificando' },
                  { key: 'in_transit', label: 'Cargado / Salió' },
                  { key: 'delivered', label: 'Entregado' },
                ] as { key: TruckStatus; label: string }[]).map(step => {
                  const active = step.key === 'in_transit'
                    ? (derivedStatus === 'in_transit' || derivedStatus === 'loaded')
                    : derivedStatus === step.key
                  return (
                    <Button
                      key={step.key}
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setStatusWithDate(step.key)}
                      className="h-7 text-xs"
                    >
                      {step.label}
                    </Button>
                  )
                })}
```

- [ ] **Step 3: setStatusWithDate escribe la fecha única**

Reemplazar `setStatusWithDate` (124-131):
```ts
  const setStatusWithDate = (st: TruckStatus) => {
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
    const patch: Partial<Truck> = { status: st }
    // Carga y salida son el mismo día en consolidados → una sola fecha.
    if (st === 'in_transit' && !merged.departureDate) { patch.loadDate = iso; patch.departureDate = iso }
    if (st === 'delivered' && !merged.arrivalDate) patch.arrivalDate = iso
    updateTruck(patch)
  }
```

- [ ] **Step 4: Texto de ayuda**

El `<p>` de ayuda (~394) cambiar "al pasar la **fecha de salida**…" para que hable de una sola fecha:
```tsx
                ⚡ Automático: al pasar la <strong>fecha de carga/salida</strong> el camión (y sus cargas) pasan a En Ruta solos; al pasar el <strong>arribo a fiscal</strong>, a Entregado — y las cargas entran a Facturación. Tocar un estado completa la fecha de hoy.
```

- [ ] **Step 5: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`

```bash
git add src/components/trucks/TruckBuilder.tsx
git commit -m "feat(camiones): un solo campo fecha de carga/salida + stepper de 3 pasos"
```

---

### Task B2: agenda — un solo evento cuando carga = salida (TDD)

**Files:**
- Modify: `src/lib/agendaUtils.ts` (`trucksToEvents` ~351-358)
- Test: `src/lib/agendaUtils.test.ts`

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/agendaUtils.test.ts` (usa la factory `truck()` que ya existe ahí):
```ts
it('trucksToEvents: carga == salida → un solo evento', () => {
  const t = truck({ loadDate: '2026-06-15', departureDate: '2026-06-15' })
  expect(trucksToEvents([t], [])).toHaveLength(1)
})
it('trucksToEvents: fechas distintas (camión viejo) → dos eventos', () => {
  const t = truck({ loadDate: '2026-06-15', departureDate: '2026-06-16' })
  expect(trucksToEvents([t], [])).toHaveLength(2)
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/agendaUtils.test.ts`
Expected: FAIL (hoy emite 2 eventos cuando son iguales).

- [ ] **Step 3: Implementación**

Reemplazar el bloque de emisión de eventos (351-358):
```ts
    const ld = t.loadDate || ''
    const dd = t.departureDate || ''
    if (ld && dd && ld === dd) {
      // Consolidado: carga y salida el mismo día → un solo evento.
      const ev = make('salida', dd)
      if (ev) events.push(ev)
    } else {
      const carga = make('carga', ld)
      if (carga) events.push(carga)
      const salida = make('salida', dd)
      if (salida) events.push(salida)
      if (!carga && !salida) {
        const arribo = make('eta_fisc', t.arrivalDate || '')
        if (arribo) events.push(arribo)
      }
    }
```

- [ ] **Step 4: Verificar + commit**

Run: `npm run test:run -- src/lib/agendaUtils.test.ts` (PASS) + `npm run typecheck && npm run build`

```bash
git add src/lib/agendaUtils.ts src/lib/agendaUtils.test.ts
git commit -m "feat(camiones): la agenda muestra un solo hito cuando carga y salida coinciden"
```

---

### Task B3: TrucksList — colapsar el display de fechas

**Files:**
- Modify: `src/components/trucks/TrucksList.tsx` (~331-340)

- [ ] **Step 1: Colapsar**

Reemplazar el bloque de fechas (331-340) por:
```tsx
                  {(t.loadDate || t.departureDate || t.arrivalDate) && (
                    <div className="flex items-start gap-1.5">
                      <CalendarBlank size={12} className="mt-0.5 shrink-0" />
                      <span className="truncate">
                        {(() => {
                          const ld = t.loadDate, dd = t.departureDate
                          const same = ld && dd && ld === dd
                          const cargaSale = same
                            ? `Carga/Sale ${formatDateShort(ld)}`
                            : [ld && `Carga ${formatDateShort(ld)}`, dd && `Sale ${formatDateShort(dd)}`].filter(Boolean).join(' · ')
                          return [cargaSale, t.arrivalDate && `Arribo ${formatDateShort(t.arrivalDate)}`].filter(Boolean).join(' · ')
                        })()}
                      </span>
                    </div>
                  )}
```

- [ ] **Step 2: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build && npm run lint`

```bash
git add src/components/trucks/TrucksList.tsx
git commit -m "feat(camiones): la lista colapsa carga/salida cuando coinciden"
```

---

### Task B4: gates finales + push + PR (Parte B)

- [ ] Suite completa → push `feat/camion-fecha-unica` → link de PR a Brian.

Checklist manual:
1. Armar un camión → un solo campo "Fecha de carga / salida"; al setearlo, la agenda muestra UN evento.
2. Stepper de 3 pasos (Planificando · Cargado/Salió · Entregado); tocar "Cargado/Salió" pone la fecha de hoy y el camión queda en ruta.
3. Lista: "Carga/Sale 15 Jun · Arribo 18 Jun".
4. Camión viejo con fechas distintas: sigue mostrando las dos y dos eventos (no se rompe el histórico).

---

## Notas para el ejecutor

- **A y B son independientes** — distintas branches, distintas PRs. Hacer A completa, push; después B desde main.
- A: el bloque solo edita filas DB (FCL read-only por ahora); `editable = op.source === 'db' && op.dbId && !op.readOnly`. NO agregar campos a EDITABLE_FCL_FIELDS (eso llega con el flip).
- A: `commit` del panel ya enruta DB→onPatch / FCL→onPatchFcl; como desconsol/entregaPlanta se agregan a EDITABLE_FIELDS, el commit los maneja para DB. En FCL no son editables (no están en EDITABLE_FCL_FIELDS) → el bloque ya está en modo read-only para FCL, así que nunca se intenta commitear.
- B: NO se borra ninguna columna de la base. El motor de estados (`deriveTruckDisplayStatus`, `deriveTruckCargoStatus`, billing, tracking) NO se toca — sigue leyendo ambas columnas, que ahora se escriben iguales.
- B: el stepper de 3 pasos es solo presentación; las funciones derive siguen soportando los 4 estados (camiones viejos con 'loaded' se muestran bajo "Cargado/Salió").
- Si `npm run lint` marca algo pre-existente no relacionado, reportar sin arreglar.
