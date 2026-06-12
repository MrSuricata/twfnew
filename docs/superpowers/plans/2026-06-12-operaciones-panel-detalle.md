# Operaciones: panel de detalle + grilla angosta + performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grilla de Operaciones angosta y solo-lectura (12 columnas default) con panel lateral de detalle/edición al click en la fila, editor de contenedores por fichas, render incremental (fix del lag con 1.176 filas) y fix del chip duplicado.

**Architecture:** Componente nuevo `OperationDetailPanel` (Sheet de shadcn vendored sobre `@radix-ui/react-dialog`, ya instalado) que recibe la `UnifiedOperation` seleccionada por uid y edita con los MISMOS mapeos de siempre (`EDITABLE_FIELDS` para DB, `EDITABLE_FCL_FIELDS` para FCL espejo). La grilla pierde los editores inline (filas livianas), gana `onClick` por fila, y renderiza `sorted.slice(0, rowLimit)` con un sentinel IntersectionObserver. Parser/serializador de contenedores en `src/lib/cntrUtils.ts` (puro, TDD).

**Tech Stack:** Vite + React 19 + TS · Tailwind 4 · radix-dialog (ya instalado, cero deps nuevas) · vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-operaciones-panel-detalle-design.md`

**Contexto de entorno:**
- Repo: `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy` — todos los comandos desde ahí.
- Branch: `feat/operaciones-panel-detalle` (ya creada desde origin/main, spec commiteado).
- Gates: `npm run typecheck` && `npm run test:run` && `npm run build`. Commits en español. NUNCA push a main.
- Archivo central: `src/components/operations/OperationsGrid.tsx` (1.041 líneas hoy). `EditableCell` vive al final de ese archivo (línea ~1029). `OperationRow` ~761, `OperationCard` ~940.

**File structure:**

| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/cntrUtils.ts` (nuevo) | parse/normalize/serialize de contenedores (puro) |
| `src/lib/cntrUtils.test.ts` (nuevo) | tests |
| `src/components/ui/sheet.tsx` (nuevo) | Sheet estándar shadcn (vendored) |
| `src/components/operations/OperationDetailPanel.tsx` (nuevo) | panel de detalle/edición |
| `src/components/operations/OperationsGrid.tsx` (modif) | chip duplicado, fila clickeable solo-lectura, render incremental, wiring del panel, cards mobile, borrar EditableCell |
| `src/lib/operationsTypes.ts` (modif) | `defaultOn` y `w` de OPERATION_COLUMNS |

---

### Task 1: Fix chip "Seguimiento vencido" duplicado

**Files:**
- Modify: `src/components/operations/OperationsGrid.tsx:496-507`

- [ ] **Step 1: Borrar el bloque duplicado**

En la fila de zone chips hay DOS bloques idénticos `{segVencidos > 0 && (<button ...⏰ Seguimiento vencido...)}` — uno en líneas ~473-484 (después de "Solo activas") y otro en ~496-507 (después de "Ver archivadas"). Borrar el SEGUNDO completo (el que tiene `title="Cargas activas con 7+ días sin actualizar el seguimiento — click para ver solo esas"`). Queda solo el primero.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run build`
Expected: verde. Grep `Seguimiento vencido` en el archivo → 1 solo botón en el JSX de chips.

- [ ] **Step 3: Commit**

```bash
git add src/components/operations/OperationsGrid.tsx
git commit -m "fix(operaciones): chip Seguimiento vencido duplicado"
```

---

### Task 2: cntrUtils — parser/serializador de contenedores (TDD)

**Files:**
- Create: `src/lib/cntrUtils.ts`
- Test: `src/lib/cntrUtils.test.ts`

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/cntrUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from './cntrUtils'

describe('parseCntr', () => {
  it('separa por coma, trimea y filtra vacíos', () => {
    expect(parseCntr('CSNU7743374, FFAU3573668')).toEqual(['CSNU7743374', 'FFAU3573668'])
    expect(parseCntr(' TGBU3023284 ')).toEqual(['TGBU3023284'])
    expect(parseCntr('A, , B,')).toEqual(['A', 'B'])
    expect(parseCntr('')).toEqual([])
    expect(parseCntr(undefined as unknown as string)).toEqual([])
  })
})

describe('serializeCntr', () => {
  it('une con coma+espacio (round-trip estable)', () => {
    expect(serializeCntr(['CSNU7743374', 'FFAU3573668'])).toBe('CSNU7743374, FFAU3573668')
    expect(serializeCntr([])).toBe('')
    expect(parseCntr(serializeCntr(['A', 'B']))).toEqual(['A', 'B'])
  })
})

describe('normalizeCntr', () => {
  it('mayúsculas y sin espacios internos; vacío → null', () => {
    expect(normalizeCntr(' csnu 7743374 ')).toBe('CSNU7743374')
    expect(normalizeCntr('   ')).toBe(null)
  })
})

describe('isStandardCntr', () => {
  it('4 letras + 7 dígitos = estándar; otros formatos se toleran pero avisan', () => {
    expect(isStandardCntr('CSNU7743374')).toBe(true)
    expect(isStandardCntr('TGBU302328')).toBe(false)
    expect(isStandardCntr('PENDIENTE')).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/cntrUtils.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

Crear `src/lib/cntrUtils.ts`:

```ts
// Contenedores de una operación: el modelo guarda UN string ("CSNU7743374,
// FFAU3573668"). Estos helpers son la única vía de parse/serialización para
// que el editor de fichas del panel haga round-trip sin sorpresas.

export function parseCntr(cntr: string): string[] {
  return String(cntr || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export function serializeCntr(list: string[]): string {
  return list.join(', ')
}

/** MAYÚSCULAS y sin espacios internos. Devuelve null si queda vacío. */
export function normalizeCntr(raw: string): string | null {
  const c = String(raw || '').toUpperCase().replace(/\s+/g, '')
  return c || null
}

/** Formato ISO 6346 superficial: 4 letras + 7 dígitos. Lo no-estándar se
 *  acepta igual (la planilla trae valores irregulares) — esto es solo aviso. */
export function isStandardCntr(c: string): boolean {
  return /^[A-Z]{4}\d{7}$/.test(c)
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/cntrUtils.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cntrUtils.ts src/lib/cntrUtils.test.ts
git commit -m "feat(operaciones): helpers de contenedores (parse/serialize/normalize)"
```

---

### Task 3: Componente Sheet (shadcn vendored)

**Files:**
- Create: `src/components/ui/sheet.tsx`

Sin test unitario (componente UI estándar); gate = typecheck + build.

- [ ] **Step 1: Crear el componente**

Crear `src/components/ui/sheet.tsx` (shadcn estándar sobre `@radix-ui/react-dialog`, que ya está en package.json; `cn` viene de `@/lib/utils` como en los demás ui/):

```tsx
import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-0 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-full sm:w-[480px] sm:max-w-[90vw] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        left:
          "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
      },
    },
    defaultVariants: { side: "right" },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X size={18} />
        <span className="sr-only">Cerrar</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-4 pb-2", className)} {...props} />
)
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription }
```

Nota: si otros componentes en `src/components/ui/` usan una convención distinta para `cn` o para los iconos (lucide vs phosphor), seguir la convención del archivo `dialog.tsx` existente y adaptar el import del ícono X.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/sheet.tsx
git commit -m "feat(ui): componente Sheet (drawer lateral, shadcn vendored)"
```

---

### Task 4: Columnas default v2 (12 esenciales + documental)

**Files:**
- Modify: `src/lib/operationsTypes.ts:405-449` (OPERATION_COLUMNS)
- Modify: `src/components/operations/OperationsGrid.tsx:79` (key de localStorage)

- [ ] **Step 1: Cambiar defaults y anchos en OPERATION_COLUMNS**

En `src/lib/operationsTypes.ts`, ajustar SOLO `defaultOn` (y `w` donde se indica) — sin tocar keys/labels/orden:

Quedan `defaultOn: true` (12): `ref`, `operator`, `cliente`, `docNumber`, `deposito`, `eta`, `cntr`, `kg`, `fiscal`, `camion`, `status`, `seguimiento` (este último hoy está en false → pasa a true).

Pasan a `defaultOn: false` (9): `origin`, `dischargePort`, `pais`, `pkgs`, `m3`, `destPort`, `tipo`, `wood`, `transporte`.

Anchos de las 12 visibles (ajustar `w`): ref `max-w-[92px]` (igual) · cliente `max-w-[150px]` · docNumber `max-w-[110px]` · deposito `max-w-[90px]` · eta `max-w-[84px]` (igual) · cntr `max-w-[130px]` · fiscal `max-w-[100px]` · camion `max-w-[72px]` · status `max-w-[130px]` (igual) · seguimiento `max-w-[92px]` (igual).

- [ ] **Step 2: Versionar la key de visibilidad**

En `OperationsGrid.tsx` línea 79:

```ts
const COLS_STORAGE_KEY = 'twf-ops-columns-v2'  // v2: default angosto 12 cols (12/06/2026)
```

(El orden `twf-ops-col-order` NO cambia.)

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde (los tests de operationsTypes no dependen de defaultOn).

- [ ] **Step 4: Commit**

```bash
git add src/lib/operationsTypes.ts src/components/operations/OperationsGrid.tsx
git commit -m "feat(operaciones): grilla angosta - 12 columnas default + key v2"
```

---

### Task 5: OperationDetailPanel

**Files:**
- Create: `src/components/operations/OperationDetailPanel.tsx`

Componente completo. Sin test unitario propio (es UI declarativa sobre helpers ya testeados); la editabilidad usa los mapeos existentes. Gate = typecheck + build (la integración llega en Task 6).

- [ ] **Step 1: Crear el componente**

```tsx
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { LockSimple, Truck as TruckIcon, Archive, ArrowCounterClockwise, Trash, Plus, X, PencilSimple } from '@phosphor-icons/react'
import type { Operator, UnifiedOperation } from '@/lib/operationsTypes'
import {
  EDITABLE_FIELDS, EDITABLE_FCL_FIELDS, MODALITY_COLORS, MODALITY_LABELS,
  STATUS_LABEL, STATUS_OPTIONS, operatorsForMode, isSeguimientoVencido,
} from '@/lib/operationsTypes'
import { parseCntr, serializeCntr, normalizeCntr, isStandardCntr } from '@/lib/cntrUtils'

interface TruckRefInfo { truckCode: string; status: string }

const PAIS_LABEL: Record<string, string> = { UY: '🇺🇾 UY', AR: '🇦🇷 AR', CL: '🇨🇱 CL', OTRO: '—' }
const NUM_FMT = new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 })

// Secciones del panel: declarativas. type bool → toggle; number → input numérico.
const SECTIONS: { title: string; fields: { key: keyof UnifiedOperation; label: string; kind?: 'bool' | 'number' }[] }[] = [
  {
    title: 'Documental',
    fields: [
      { key: 'docNumber', label: 'BL / MAWB / CRT' },
      { key: 'tlx', label: 'Telex' },
      { key: 'buque', label: 'Buque' },
      { key: 'linea', label: 'Línea' },
    ],
  },
  {
    title: 'Ruta',
    fields: [
      { key: 'origin', label: 'Origen' },
      { key: 'dischargePort', label: 'Pto. descarga' },
      { key: 'destPort', label: 'Destino' },
      { key: 'pais', label: 'País' },
    ],
  },
  {
    title: 'Fechas',
    fields: [
      { key: 'etd', label: 'ETD' },
      { key: 'eta', label: 'ETA' },
      { key: 'salida', label: 'Salida' },
      { key: 'etaFisc', label: 'ETA fiscal' },
      { key: 'libre', label: 'LIBRE' },
      { key: 'seguimiento', label: 'Seguimiento' },
      { key: 'descarga', label: 'Descarga' },
    ],
  },
  {
    title: 'Carga',
    fields: [
      { key: 'pkgs', label: 'Bultos', kind: 'number' },
      { key: 'kg', label: 'Kg', kind: 'number' },
      { key: 'm3', label: 'M³', kind: 'number' },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'wood', label: 'Wood', kind: 'bool' },
      { key: 'oog', label: 'OOG', kind: 'bool' },
      { key: 'imo', label: 'IMO', kind: 'bool' },
      { key: 'noApilable', label: 'No apilable', kind: 'bool' },
      { key: 'seguro', label: 'Seguro', kind: 'bool' },
      { key: 'certi', label: 'Certificada', kind: 'bool' },
      { key: 'impresa', label: 'Impresa', kind: 'bool' },
    ],
  },
  {
    title: 'Operativa',
    fields: [
      { key: 'deposito', label: 'Depósito' },
      { key: 'operativa', label: 'Operativa' },
      { key: 'fiscal', label: 'Fiscal' },
      { key: 'transporte', label: 'Transporte' },
      { key: 'camion', label: 'Camión' },
      { key: 'despacho', label: 'Despacho' },
      { key: 'dev', label: 'DEV' },
    ],
  },
]

// Cómo se edita un campo para esta operación (mismas reglas que la grilla vieja):
// DB → EDITABLE_FIELDS (col física + tipo) · FCL espejo → EDITABLE_FCL_FIELDS
// (overlay web_edits) · si no, solo lectura.
type EditMode =
  | { kind: 'db'; col: string; type: 'text' | 'number' | 'bool' | 'select'; options?: { value: string; label: string }[] }
  | { kind: 'fcl' }
  | null

function editModeFor(op: UnifiedOperation, key: keyof UnifiedOperation): EditMode {
  if (op.source === 'db' && op.dbId && !op.readOnly) {
    const ef = EDITABLE_FIELDS[key]
    return ef ? { kind: 'db', col: ef.col, type: ef.type, options: ef.options } : null
  }
  if (op.source === 'fcl' && op.dbId && EDITABLE_FCL_FIELDS[key]) return { kind: 'fcl' }
  return null
}

export default function OperationDetailPanel({
  op,
  truckStatus,
  operators,
  operatorById,
  hoy,
  onAssign,
  onPatch,
  onPatchFcl,
  onRequestDelete,
  onClose,
}: {
  op: UnifiedOperation | null
  truckStatus?: TruckRefInfo
  operators: Operator[]
  operatorById: Map<string, Operator>
  hoy: Date
  onAssign: (op: UnifiedOperation, operatorId: string | null) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onPatchFcl?: (dbId: string, edits: Record<string, unknown>) => void
  onRequestDelete?: (op: UnifiedOperation) => void
  onClose: () => void
}) {
  const [newCntr, setNewCntr] = useState('')

  if (!op) return <Sheet open={false}><SheetContent side="right" /></Sheet>

  const commit = (key: keyof UnifiedOperation, v: unknown) => {
    const mode = editModeFor(op, key)
    if (!mode || !op.dbId) return
    if (mode.kind === 'db') onPatch(op.dbId, { [mode.col]: v })
    else onPatchFcl?.(op.dbId, { [EDITABLE_FCL_FIELDS[key]!]: v })
  }

  // ── Contenedores ──
  const cntrs = parseCntr(op.cntr)
  const cntrEditable = !!editModeFor(op, 'cntr')
  const removeCntr = (i: number) => commit('cntr', serializeCntr(cntrs.filter((_, j) => j !== i)))
  const addCntr = () => {
    const c = normalizeCntr(newCntr)
    if (!c) return
    commit('cntr', serializeCntr([...cntrs, c]))
    setNewCntr('')
  }

  const assigned = op.operatorId ? operatorById.get(op.operatorId) : null
  const eligible = operatorsForMode(operators, op.mode)
  const statusEditable = op.source === 'db' && !!op.dbId && !truckStatus
  const segVencido = isSeguimientoVencido(op, truckStatus?.status, hoy)

  return (
    <Sheet open={!!op} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 flex-wrap pr-8">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: MODALITY_COLORS[op.mode] }} />
            {op.ref || '(sin ref)'}
            {op.readOnly && <LockSimple size={14} className="text-muted-foreground" />}
            {op.webEdited && op.webEdited.length > 0 && (
              <span title={`Editada en la web: ${op.webEdited.join(', ')} (pisa a la planilla)`} className="text-sm">✏️</span>
            )}
          </SheetTitle>
          <SheetDescription className="text-left">{op.cliente || '—'}</SheetDescription>
          <div className="flex items-center gap-1.5 flex-wrap pb-1">
            <Badge variant="outline" className="h-5 text-[9px]">{op.tipo || MODALITY_LABELS[op.mode]}</Badge>
            {op.pais && <Badge variant="outline" className="h-5 text-[9px]">{PAIS_LABEL[op.pais] || op.pais}</Badge>}
            {truckStatus ? (
              <Badge variant="outline" className="h-5 text-[9px] gap-1" title={`Estado controlado por el camión ${truckStatus.truckCode}`}>
                <TruckIcon size={10} weight="fill" className="text-primary" />
                {truckStatus.truckCode} · {STATUS_LABEL[truckStatus.status] || truckStatus.status}
              </Badge>
            ) : statusEditable ? (
              <select
                value={op.status || ''}
                onChange={e => onPatch(op.dbId!, { status: e.target.value })}
                className="h-6 text-xs rounded border border-border bg-card px-1"
              >
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              op.status && <Badge variant="outline" className="h-5 text-[9px]">{op.status}</Badge>
            )}
            {op.archived && <Badge variant="outline" className="h-5 text-[9px] text-amber-700 border-amber-300">ARCHIVADA</Badge>}
          </div>
        </SheetHeader>

        <div className="p-4 space-y-5 text-sm">
          {/* Operativo asignado */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-24 shrink-0">Operativo</span>
            <select
              value={op.operatorId || ''}
              onChange={e => onAssign(op, e.target.value || null)}
              className="h-7 flex-1 text-xs rounded border border-border bg-card px-1.5"
              style={assigned ? { color: assigned.color || undefined } : undefined}
            >
              <option value="">— sin asignar —</option>
              {eligible.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {/* Contenedores */}
          <section>
            <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Contenedores ({cntrs.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {cntrs.length === 0 && !cntrEditable && <span className="text-muted-foreground">—</span>}
              {cntrs.map((c, i) => (
                <span key={`${c}-${i}`} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-mono ${isStandardCntr(c) ? 'bg-muted/50' : 'bg-amber-50 border-amber-300 text-amber-800'}`} title={isStandardCntr(c) ? c : `${c} — formato no estándar`}>
                  {c}
                  {cntrEditable && (
                    <button type="button" onClick={() => removeCntr(i)} title="Quitar contenedor" className="text-muted-foreground hover:text-red-600">
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              {cntrEditable && (
                <span className="inline-flex items-center gap-1">
                  <Input
                    value={newCntr}
                    onChange={e => setNewCntr(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCntr() }}
                    placeholder="AGREGAR…"
                    className="h-6 w-32 text-xs font-mono"
                  />
                  <button type="button" onClick={addCntr} title="Agregar contenedor" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5">
                    <Plus size={13} />
                  </button>
                </span>
              )}
            </div>
          </section>

          {/* Secciones de campos */}
          {SECTIONS.map(sec => (
            <section key={sec.title}>
              <h4 className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 border-b pb-1">{sec.title}</h4>
              <div className="space-y-0.5">
                {sec.fields.map(f => (
                  <FieldRow
                    key={f.key}
                    label={f.label}
                    op={op}
                    fieldKey={f.key}
                    kind={f.kind}
                    segVencido={f.key === 'seguimiento' && segVencido}
                    onCommit={commit}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Acciones (solo filas DB) */}
          {op.source === 'db' && op.dbId && (
            <section className="flex items-center gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => onPatch(op.dbId!, { archived: !op.archived })}
                className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 text-muted-foreground hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50"
              >
                {op.archived ? <><ArrowCounterClockwise size={13} /> Restaurar</> : <><Archive size={13} /> Archivar</>}
              </button>
              {onRequestDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(op)}
                  className="inline-flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-1.5 text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50"
                >
                  <Trash size={13} /> Eliminar…
                </button>
              )}
            </section>
          )}

          {op.source === 'fcl' && (
            <p className="text-[11px] text-muted-foreground border-t pt-3 flex items-center gap-1.5">
              <LockSimple size={11} /> FCL espejo de la planilla: los campos con lápiz se editan acá (✏️ pisa a la planilla);
              salida / ETA fiscal / LIBRE siguen viniendo de la planilla hasta el flip.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Una fila label+valor del panel; editable según editModeFor ──
function FieldRow({
  label,
  op,
  fieldKey,
  kind,
  segVencido,
  onCommit,
}: {
  label: string
  op: UnifiedOperation
  fieldKey: keyof UnifiedOperation
  kind?: 'bool' | 'number'
  segVencido?: boolean
  onCommit: (key: keyof UnifiedOperation, v: unknown) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const mode = editModeFor(op, fieldKey)
  const raw = (op as unknown as Record<string, unknown>)[fieldKey]

  // Bool: toggle inmediato si es editable, badge si no.
  if (kind === 'bool' || typeof raw === 'boolean') {
    const val = !!raw
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-[11px] text-muted-foreground w-24 shrink-0">{label}</span>
        {mode ? (
          <button
            type="button"
            onClick={() => onCommit(fieldKey, !val)}
            className={`text-xs rounded px-2 py-0.5 border ${val ? 'bg-green-50 border-green-300 text-green-700 font-semibold' : 'bg-card border-border text-muted-foreground'}`}
          >
            {val ? 'SI' : '—'}
          </button>
        ) : (
          <span className={`text-xs ${val ? 'text-green-700 font-semibold' : 'text-muted-foreground'}`}>{val ? 'SI' : '—'}</span>
        )}
      </div>
    )
  }

  const display = kind === 'number'
    ? (Number(raw) ? NUM_FMT.format(Number(raw)) : '—')
    : (String(raw ?? '') || '—')

  const startEdit = () => {
    if (!mode) return
    setDraft(String(raw ?? ''))
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    const v = kind === 'number' ? (parseFloat(draft.replace(',', '.')) || 0) : draft.trim()
    if (String(raw ?? '') !== String(v)) onCommit(fieldKey, v)
  }

  return (
    <div className="flex items-center gap-2 py-0.5 group">
      <span className="text-[11px] text-muted-foreground w-24 shrink-0">{label}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          className="h-6 text-xs flex-1"
          inputMode={kind === 'number' ? 'decimal' : undefined}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!mode}
          className={`flex-1 text-left text-xs rounded px-1 py-0.5 break-words ${segVencido ? 'bg-red-50 text-red-700 font-semibold' : ''} ${mode ? 'hover:bg-primary/5 cursor-text' : 'cursor-default'}`}
          title={mode ? 'Click para editar (Enter guarda · Esc cancela)' : 'Solo lectura (viene de la planilla)'}
        >
          {display}
          {mode && <PencilSimple size={10} className="inline ml-1.5 opacity-0 group-hover:opacity-40" />}
        </button>
      )}
    </div>
  )
}
```

Notas para el implementer:
- `EDITABLE_FIELDS[key].options` existe para selects (ej. status no está acá — el status se maneja en el header). Si `mode.type === 'select'` cae en FieldRow para algún campo con options, tratarlo como texto está mal — verificar qué campos de SECTIONS tienen `type: 'select'` en EDITABLE_FIELDS (revisar el mapa real); si alguno lo es, renderizar un `<select>` con esas options en lugar del Input. Si ninguno de los campos de SECTIONS es select, no hace falta rama extra.
- `tlx` en DB es bool (`telex`) pero en UnifiedOperation es string `'SI'|''` para FCL — para filas FCL es solo-lectura (no está en EDITABLE_FCL_FIELDS), para DB es bool: el `typeof raw === 'boolean'` no aplica (es string en UnifiedOperation: `s.telex ? 'SI' : ''`). Tratarlo con `kind: 'bool'` explícito en SECTIONS y al togglear DB enviar `!isSi` donde `isSi = op.tlx === 'SI'`. Ajustar FieldRow: si `kind === 'bool'` y el raw es string, `val = raw === 'SI' || raw === true`.

- [ ] **Step 2: Verificar**

Run: `npm run typecheck && npm run build`
Expected: verde (el componente aún no se usa — sin imports rotos).

- [ ] **Step 3: Commit**

```bash
git add src/components/operations/OperationDetailPanel.tsx
git commit -m "feat(operaciones): panel de detalle con edicion y fichas de contenedores"
```

---

### Task 6: Integración — fila clickeable solo-lectura + panel + cards mobile

**Files:**
- Modify: `src/components/operations/OperationsGrid.tsx`

- [ ] **Step 1: Estado del panel + hoy memoizado**

En `OperationsGrid` (cerca de los otros useState, ~línea 140):

```tsx
  // Panel de detalle: guarda el uid; la op se busca fresca en cada render
  // (derive-on-read: un patch refresca el panel solo).
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const selectedOp = useMemo(
    () => (selectedUid ? operations.find(o => o.uid === selectedUid) ?? null : null),
    [operations, selectedUid]
  )
  // "Hoy" una sola vez por montaje (antes se creaba un Date POR FILA por render).
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
```

Import: `import OperationDetailPanel from './OperationDetailPanel'`.

- [ ] **Step 2: Render del panel**

Antes del cierre del `div` raíz (junto a los otros diálogos, ~línea 754):

```tsx
      <OperationDetailPanel
        op={selectedOp}
        truckStatus={selectedOp ? truckByRef.get(selectedOp.ref) : undefined}
        operators={operators}
        operatorById={operatorById}
        hoy={hoy}
        onAssign={assignOp}
        onPatch={onPatchShipment}
        onPatchFcl={onPatchFclField}
        onRequestDelete={onDeleteShipment ? requestDelete : undefined}
        onClose={() => setSelectedUid(null)}
      />
```

- [ ] **Step 3: OperationRow solo lectura + clickeable**

En `OperationRow`:
1. Prop nueva `onOpen: (uid: string) => void` y prop `hoy: Date` (reemplaza el `new Date()` interno: borrar `const hoyRow = new Date(); hoyRow.setHours(0,0,0,0)` y usar `hoy` en `isSeguimientoVencido(op, truckStatus?.status, hoy)`).
2. `<tr>` pasa a `<tr onClick={() => onOpen(op.uid)} className="bg-card even:bg-muted/30 hover:bg-primary/5 cursor-pointer">`.
3. BORRAR los dos branches de edición (el bloque `if (ef) {...}` con EditableCell y el bloque `const ffKey = ...; if (ffKey) {...}`) y las consts `editable`/`fclEditable`. Toda celda usa el camino de presentación (`cell(c.key)`).
4. El `<select>` de operator (case 'operator' en `cell()`): agregar `onClick={e => e.stopPropagation()}` al select.
5. Botones archivar/eliminar de la última celda: agregar `e.stopPropagation()` al inicio de sus onClick (`onClick={(e) => { e.stopPropagation(); onPatch(...) }}` y `onClick={(e) => { e.stopPropagation(); onDelete(op) }}`).
6. En el call-site (tbody): pasar `onOpen={setSelectedUid}` y `hoy={hoy}`.
7. El candadito FCL en la ref: la condición `{op.readOnly && !fclEditable && <LockSimple .../>}` pierde `fclEditable` (ya no existe) → dejar `{op.readOnly && <LockSimple size={11} className="text-muted-foreground" />}`.

- [ ] **Step 4: OperationCard mobile — tap abre el panel, sin edición inline**

En `OperationCard`:
1. Prop nueva `onOpen: (uid: string) => void`.
2. El `div` raíz: `onClick={() => onOpen(op.uid)}` + `cursor-pointer` en el className.
3. `renderVal`: borrar el branch `if (ef) { return <EditableCell .../> }` y la const `editable` — siempre el `<span>` de presentación.
4. El `<select>` de status del header: BORRARLO (la edición de estado pasa al panel) — queda: badge de camión si `truckStatus`, badge de status si hay, nada si no.
5. El `<select>` de operativo: se mantiene, con `onClick={e => e.stopPropagation()}`.
6. Call-site (sección mobile): pasar `onOpen={setSelectedUid}`.

- [ ] **Step 5: Borrar EditableCell + leyenda**

1. Borrar la función `EditableCell` completa (final del archivo, ~línea 1029 en adelante).
2. Limpiar imports muertos: `EDITABLE_FIELDS`, `EDITABLE_FCL_FIELDS` si ya no se usan en el archivo (verificar con grep), `STATUS_OPTIONS` si ya no se usa (el select de status de la card se fue; el panel tiene el suyo).
3. La leyenda al pie (línea ~690) pasa a:

```tsx
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <LockSimple size={12} /> <strong>Click en una fila</strong> para ver y editar el detalle. FCL: se editan los datos del buque/ruta (✏️ = pisa a la planilla); salida/fiscal/LIBRE siguen viniendo de la planilla hasta el flip. La REF no se edita.
      </p>
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde, sin referencias colgadas a EditableCell/editable/fclEditable/hoyRow.

- [ ] **Step 7: Commit**

```bash
git add src/components/operations/OperationsGrid.tsx
git commit -m "feat(operaciones): fila abre panel de detalle - grilla solo lectura"
```

---

### Task 7: Render incremental (fix del lag)

**Files:**
- Modify: `src/components/operations/OperationsGrid.tsx`

- [ ] **Step 1: Estado rowLimit + reset al cambiar filtros**

Cerca de los otros useState:

```tsx
  // Render incremental: con 1.176 filas montar todo el DOM congela el cambio
  // de filtros. Se montan ROWS_STEP y el sentinel agrega más al scrollear.
  // Totales/CSV siguen usando sorted/filtered COMPLETOS.
  const ROWS_STEP = 150
  const [rowLimit, setRowLimit] = useState(ROWS_STEP)
  useEffect(() => {
    setRowLimit(ROWS_STEP)
  }, [search, modeFilter, zonaFilter, originFilter, destFilter, kgMin, kgMax, m3Min, m3Max, segFilter, operatorFilter, activeOnly, showArchived, sort])
```

Y el slice (después del memo de `sorted`):

```tsx
  const visibleRows = useMemo(() => sorted.slice(0, rowLimit), [sorted, rowLimit])
  const hasMore = sorted.length > rowLimit
```

- [ ] **Step 2: Sentinel con IntersectionObserver**

```tsx
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setRowLimit(n => n + ROWS_STEP) },
      { rootMargin: '600px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, rowLimit])
```

(Agregar `useRef` al import de react.)

- [ ] **Step 3: Usar visibleRows en tabla y cards + sentinel compartido**

1. Tabla: `sorted.map((op) => (` → `visibleRows.map((op) => (` (el empty-state sigue chequeando `sorted.length === 0`).
2. Cards mobile: ídem `sorted.map(op => (` → `visibleRows.map(op => (`.
3. DESPUÉS del div de cards mobile y ANTES de los totales, un único sentinel compartido (sirve a ambas vistas — solo una está montada según el breakpoint... ambas están en el DOM con `hidden`, así que un div común al final funciona):

```tsx
      {hasMore && (
        <div ref={sentinelRef} className="text-center py-3 text-xs text-muted-foreground">
          Mostrando {visibleRows.length.toLocaleString('es-UY')} de {sorted.length.toLocaleString('es-UY')} — desplazate para ver más
        </div>
      )}
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/OperationsGrid.tsx
git commit -m "perf(operaciones): render incremental de filas (150 + scroll) - chau lag al filtrar"
```

---

### Task 8: Gates finales + push + PR

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde (tests totales: 103 previos + 4 de cntrUtils = 107).

- [ ] **Step 2: Push**

```bash
git push -u origin feat/operaciones-panel-detalle
```

- [ ] **Step 3: Link de PR a Brian**

`https://github.com/MrSuricata/twfnew/pull/new/feat/operaciones-panel-detalle`

Checklist de verificación manual en el preview de Vercel (para Brian o con browser tools):
1. Click en fila abre el panel al instante; Esc / click afuera cierra.
2. Editar un campo DB (ej. depósito de una LCL) y un campo FCL (ej. buque — aparece ✏️, sobrevive a Refrescar).
3. A6787: fichas CSNU7743374 y FFAU3573668 visibles; quitar una y agregarla de vuelta.
4. Chips de modalidad sin lag con "Todas" (1.176).
5. Scroll: "Mostrando 150 de X" → carga más al bajar; totales del pie NO cambian.
6. Chip "Seguimiento vencido" aparece UNA vez.
7. Grilla angosta (12 columnas) sin scroll horizontal en desktop; botón Columnas re-agrega.
8. Mobile: tap en tarjeta abre panel full-width.

---

## Notas para el ejecutor

- La fila NO debe abrir el panel cuando el click viene del select de operativo o de los botones de acciones — `stopPropagation` en esos handlers.
- `selectedOp` se deriva de `operations` (no de `sorted`): el panel queda abierto aunque el filtro saque la fila de la vista, y un patch refresca el panel solo (derive-on-read).
- El delete desde el panel reusa `requestDelete` → el Dialog de confirmación existente (tipear la ref). No duplicar ese flujo.
- NO tocar: chips de filtros (salvo el duplicado), búsqueda, sort, drag de columnas, exportCsv, pegado masivo, NewShipmentDialog, Auto-asignar, tracking, backend.
- Si `npm run test:run` falla por algo pre-existente no relacionado, reportarlo sin arreglarlo.
