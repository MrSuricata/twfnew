# FCL salida/ETA por contenedor — Fase 1 (modelo + estado + panel) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Devolverle a las FCL la dimensión **por contenedor** (salida MVD + arribo fiscal + lugar de salida) que el flip colapsó, con estado derivado correcto y edición en el panel.

**Architecture:** Se guarda el array `operativas` (`OperativasRecord[]`) como columna `jsonb` en `shipments` (descolapsar). `getShipmentStatus` ya consume ese array → cero cambios en su lógica salvo una sub-etapa nueva "En [lugar]". Las columnas sueltas (`salida`/`eta_fiscal`/…) quedan como **rollup derivado** recalculado en cada escritura, para no romper grilla/agenda/billing/tracking que las leen. Backfill desde `sheet_raw.operativas` (que conserva el detalle original). El panel agrega una sección por contenedor reusando `StatBox`.

**Tech Stack:** Vite+React+TS, Supabase (Postgres + MCP `apply_migration`/`execute_sql`), Vitest, Tailwind. Migración aditiva (columna jsonb nullable). Edición de archivo `api/` existente (sin sumar serverless function — tope 12/12).

**Spec:** `docs/superpowers/specs/2026-06-16-fcl-salidas-por-contenedor-design.md`

---

## File Structure
- `src/lib/shipmentTypes.ts` — `OperativasRecord` += `LUGAR_SALIDA?`; `getShipmentStatus` sub-etapa "En [lugar]".
- `src/lib/operationsTypes.ts` — `DbShipment` += `operativas?`; `dbFclToParsedShipment` reconstruye el array; `fclColumnsStatus` usa el array; `rollupFromOperativas()` (nuevo); `fclToColumns` ya colapsa (queda igual, se reusa para rollup).
- `src/lib/operativasRollup.ts` — **(nuevo)** helper puro `rollupFromOperativas(ops)` (reusable por front y, copiado, por la API).
- `api/data/[entity].ts` — `SHIPMENT_COLS` += `operativas`; al escribir `operativas`, recomputar rollup server-side.
- `src/components/operations/ContainerDatesSection.tsx` — **(nuevo)** sección por contenedor (salida/eta_fiscal/lugar) reusando el patrón `StatBox`.
- `src/components/operations/OperationDetailPanel.tsx` — montar `ContainerDatesSection` después de `ViabilityBlock`; commit del array.
- Tests: `src/lib/shipmentTypes.test.ts`, `src/lib/operationsTypes.test.ts`, `src/lib/operativasRollup.test.ts`.
- Migración + backfill: vía Supabase MCP (no archivos).

**Convención de "lugar de salida":** por contenedor, `op.LUGAR_SALIDA ∈ {'TCP','MONTECON','GODILCO','PLANIR',''}`. Vacío = todavía en terminal de arribo. Directo = TCP/MONTECON; trasiego = GODILCO/PLANIR. El **depósito de la carga** sigue siendo uno (`deposito` columna / combobox del ViabilityBlock).

---

## Task 1: Migración — columna `operativas jsonb`

**Files:** Supabase (MCP `apply_migration`, proyecto `ihpsdeoexkipxmaxsmrc`).

- [ ] **Step 1: Inspeccionar** que la columna no exista.

Run (MCP `execute_sql`): `select column_name from information_schema.columns where table_name='shipments' and column_name='operativas';`
Expected: 0 filas.

- [ ] **Step 2: Aplicar migración aditiva**

MCP `apply_migration` name `add_operativas_jsonb`:
```sql
alter table public.shipments add column if not exists operativas jsonb;
```

- [ ] **Step 3: Verificar**

Run: `select column_name, data_type from information_schema.columns where table_name='shipments' and column_name='operativas';`
Expected: 1 fila, `jsonb`. (Aditiva, nullable → inofensiva sin desplegar código.)

---

## Task 2: Tipos — `OperativasRecord.LUGAR_SALIDA` + `DbShipment.operativas`

**Files:**
- Modify: `src/lib/shipmentTypes.ts` (interface `OperativasRecord`, línea ~1-23)
- Modify: `src/lib/operationsTypes.ts` (interface `DbShipment`)
- Test: `src/lib/operationsTypes.test.ts`

- [ ] **Step 1: Test que el tipo compila con el campo** (test de presencia, en `operationsTypes.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { dbFclToParsedShipment } from './operationsTypes'

describe('operativas array model', () => {
  it('dbFclToParsedShipment expone operativas[] con LUGAR_SALIDA', () => {
    const row: any = {
      id: 'x', ref: 'A1', mode: 'fcl', source: 'fcl',
      operativas: [{ CNTR_OP: 'AAAU1111111', SALIDA: '2026-06-16', ETA_FISC: '2026-06-18', LUGAR_SALIDA: 'GODILCO' }],
    }
    const p = dbFclToParsedShipment(row)
    expect(p.operativas?.[0].CNTR_OP).toBe('AAAU1111111')
    expect(p.operativas?.[0].LUGAR_SALIDA).toBe('GODILCO')
  })
})
```

- [ ] **Step 2: Run → falla** (campo/comportamiento aún no existe)

Run: `npm run test:run -- src/lib/operationsTypes.test.ts -t "operativas array model"`
Expected: FAIL.

- [ ] **Step 3: Agregar `LUGAR_SALIDA?` a `OperativasRecord`** (`shipmentTypes.ts`, después de `HORARIO: string`):

```ts
  HORARIO: string        // Schedule
  LUGAR_SALIDA?: string  // Por contenedor: TCP | MONTECON | GODILCO | PLANIR | '' (vacío = en terminal de arribo)
```

- [ ] **Step 4: Agregar `operativas?` a `DbShipment`** (`operationsTypes.ts`, en la interface `DbShipment`, junto a los demás campos jsonb como `sheet_raw`/`web_edits`):

```ts
  operativas?: import('./shipmentTypes').OperativasRecord[] | null
```
(Si ya hay `import type { OperativasRecord }`, usar `OperativasRecord[] | null` directo.)

- [ ] **Step 5: Implementar el reconstructor de array en `dbFclToParsedShipment`** → ver Task 4 (este test pasa cuando Task 4 esté hecho; dejar el test rojo hasta Task 4 o implementar el mínimo ahora). Implementar mínimo ahora en `dbFclToParsedShipment`: si `d.operativas?.length`, mapear esos; ver Task 4 para la versión completa.

- [ ] **Step 6: Run → pasa**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts -t "operativas array model"`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add src/lib/shipmentTypes.ts src/lib/operationsTypes.ts src/lib/operationsTypes.test.ts
git commit -m "feat(fcl): modelo operativas[] por contenedor + LUGAR_SALIDA"
```

---

## Task 3: `getShipmentStatus` — sub-etapa "En [lugar]"

**Files:**
- Modify: `src/lib/shipmentTypes.ts` (`getShipmentStatus`, línea ~230-296; insertar la rama nueva ANTES del bloque "Has operativas but no SALIDA → en_puerto", línea ~285)
- Test: `src/lib/shipmentTypes.test.ts`

- [ ] **Step 1: Tests de la nueva etapa**

```ts
import { describe, it, expect } from 'vitest'
import { getShipmentStatus } from './shipmentTypes'

const base = (ops: any[]) => ({ REF: 'A1', ETA: '2020-01-01', operativas: ops } as any)

describe('getShipmentStatus — En [lugar]', () => {
  it('arribado + LUGAR_SALIDA marcado + sin SALIDA → En [lugar]', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', ETA_FISC: '', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En GODILCO')
    expect(s.code).toBe('en_puerto')
  })
  it('directo desde terminal (TCP) sin SALIDA → En TCP', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', LUGAR_SALIDA: 'TCP' }]))
    expect(s.label).toBe('En TCP')
  })
  it('con SALIDA alcanzada → NO usa LUGAR_SALIDA (sigue a frontera)', () => {
    const s = getShipmentStatus(base([{ SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En Frontera')
  })
  it('mezcla: uno en depósito, otro ya salió → parcial', () => {
    const s = getShipmentStatus(base([
      { SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' },
      { SALIDA: '', LUGAR_SALIDA: 'GODILCO' },
    ]))
    expect(s.label).toBe('Parcialmente en Frontera')
  })
})
```

- [ ] **Step 2: Run → falla**

Run: `npm run test:run -- src/lib/shipmentTypes.test.ts -t "En \[lugar\]"`
Expected: FAIL ("En Terminal"/"En Puerto" en vez de "En GODILCO").

- [ ] **Step 3: Insertar la rama** en `getShipmentStatus`, JUSTO ANTES de `// Has operativas but no SALIDA → in port/terminal` (línea ~285). Reemplazar ese bloque final de operativas por:

```ts
  // Llegó pero ningún contenedor salió aún:
  if (ops.length > 0) {
    // Si TODOS tienen un lugar de salida marcado (depósito/terminal) → "En [lugar]".
    const lugares = ops.map(o => (o.LUGAR_SALIDA || '').trim().toUpperCase()).filter(Boolean)
    if (lugares.length === ops.length && new Set(lugares).size === 1) {
      return { code: 'en_puerto', label: `En ${lugares[0]}`, color: 'yellow', progress: 30 }
    }
    if (lugares.length > 0) {
      return { code: 'en_puerto', label: 'En depósito (parcial)', color: 'yellow', progress: 28 }
    }
    // Sin lugar marcado → en el terminal de arribo (con nombre si lo hay).
    return { code: 'en_puerto', label: 'En Terminal', color: 'yellow', progress: 25 }
  }
```
(Nota: la rama `someSalieron`/`allSalieron` de arriba NO cambia — sigue ganando cuando hay SALIDA. Esta rama solo aplica cuando NADIE salió.)

- [ ] **Step 4: Run → pasa** (y no rompe los tests viejos del archivo)

Run: `npm run test:run -- src/lib/shipmentTypes.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**
```bash
git add src/lib/shipmentTypes.ts src/lib/shipmentTypes.test.ts
git commit -m "feat(fcl): estado En [lugar] (TCP/MONTECON/GODILCO/PLANIR) por lugar de salida"
```

---

## Task 4: `dbFclToParsedShipment` — reconstruir el array real

**Files:**
- Modify: `src/lib/operationsTypes.ts` (`dbFclToParsedShipment`, ~341-364)
- Test: `src/lib/operationsTypes.test.ts`

- [ ] **Step 1: Test**

```ts
it('dbFclToParsedShipment usa operativas[] si existe; fallback al op colapsado', () => {
  const multi: any = { id: 'x', ref: 'A1', mode: 'fcl', source: 'fcl',
    operativas: [
      { CNTR_OP: 'A111', SALIDA: '2026-06-16', LUGAR_SALIDA: 'GODILCO' },
      { CNTR_OP: 'B222', SALIDA: '', LUGAR_SALIDA: 'GODILCO' },
    ] }
  expect(dbFclToParsedShipment(multi).operativas).toHaveLength(2)

  const legacy: any = { id: 'y', ref: 'A2', mode: 'fcl', source: 'fcl',
    salida: '2026-06-16', eta_fiscal: '2026-06-18', deposito: 'GODILCO', operativa: 'TRASIEGO' }
  const p = dbFclToParsedShipment(legacy)
  expect(p.operativas).toHaveLength(1)
  expect(p.operativas?.[0].SALIDA).toBe('2026-06-16')
})
```

- [ ] **Step 2: Run → falla**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts -t "usa operativas"`
Expected: FAIL (hoy siempre arma 1 op colapsado).

- [ ] **Step 3: Implementar.** En `dbFclToParsedShipment`, reemplazar el armado de `operativas` por:

```ts
  // Si la fila tiene el array por contenedor (post Fase 1), usarlo tal cual;
  // si no (legacy/colapsado), reconstruir 1 operativa desde las columnas.
  const ops: OperativasRecord[] = Array.isArray(d.operativas) && d.operativas.length
    ? d.operativas.map(o => ({
        REF: d.ref, TLX: '', DEPOSITO: o.DEPOSITO || d.deposito || '', ETA_OP: o.ETA_OP || '',
        SALIDA: o.SALIDA || '', ETA_FISC: o.ETA_FISC || '', LIBRE: o.LIBRE || d.libre || '',
        OPERATIVA: o.OPERATIVA || d.operativa || '', CNTR_OP: o.CNTR_OP || '',
        PKGS: o.PKGS || 0, KG: o.KG || 0, M3: o.M3 || 0, DESCRIPCION: o.DESCRIPCION || '',
        FISCAL: o.FISCAL || d.fiscal || '', DESCARGA: o.DESCARGA || '', DEV: o.DEV || '',
        CLIENTE_OP: o.CLIENTE_OP || d.cliente || '', TIPO: o.TIPO || d.tipo || '',
        WOOD: o.WOOD || '', TRANSPORTE: o.TRANSPORTE || d.transporte || '', HORARIO: '',
        LUGAR_SALIDA: o.LUGAR_SALIDA || '',
      }))
    : (hasOp ? [op] : [])
  return { /* …igual que hoy… */ operativas: ops, __dbId: d.id }
```
(Mantener el `op`/`hasOp` actuales para el fallback. NO romper la firma.)

- [ ] **Step 4: Run → pasa**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/operationsTypes.ts src/lib/operationsTypes.test.ts
git commit -m "feat(fcl): dbFclToParsedShipment reconstruye operativas[] por contenedor"
```

---

## Task 5: `rollupFromOperativas` + `fclColumnsStatus` por array

**Files:**
- Create: `src/lib/operativasRollup.ts`
- Modify: `src/lib/operationsTypes.ts` (`fclColumnsStatus` ~326-335 usa el array)
- Test: `src/lib/operativasRollup.test.ts`

- [ ] **Step 1: Test del rollup**

```ts
import { describe, it, expect } from 'vitest'
import { rollupFromOperativas } from './operativasRollup'

describe('rollupFromOperativas', () => {
  it('salida = más temprana, eta_fiscal = más tardía, varias=flag', () => {
    const r = rollupFromOperativas([
      { SALIDA: '2026-06-18', ETA_FISC: '2026-06-20' } as any,
      { SALIDA: '2026-06-16', ETA_FISC: '2026-06-22' } as any,
    ])
    expect(r.salida).toBe('2026-06-16')
    expect(r.eta_fiscal).toBe('2026-06-22')
    expect(r.salidaVaria).toBe(true)
  })
  it('vacío → strings vacíos', () => {
    expect(rollupFromOperativas([]).salida).toBe('')
  })
})
```

- [ ] **Step 2: Run → falla** (módulo no existe)

Run: `npm run test:run -- src/lib/operativasRollup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear `src/lib/operativasRollup.ts`**

```ts
import type { OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'

const firstWith = (ops: OperativasRecord[], k: keyof OperativasRecord) =>
  (ops.find(o => o[k])?.[k] as string) || ''
const datesOf = (ops: OperativasRecord[], k: 'SALIDA' | 'ETA_FISC') =>
  ops.map(o => o[k]).filter(Boolean).map(s => ({ s, d: parseLocalDate(s) })).filter(x => x.d) as { s: string; d: Date }[]

/** Resumen colapsado del array por contenedor para las columnas sueltas que leen
 *  grilla/agenda/billing/tracking. salida = más temprana · eta_fiscal = más tardía. */
export function rollupFromOperativas(ops: OperativasRecord[]) {
  const sal = datesOf(ops, 'SALIDA').sort((a, b) => a.d.getTime() - b.d.getTime())
  const fisc = datesOf(ops, 'ETA_FISC').sort((a, b) => a.d.getTime() - b.d.getTime())
  return {
    salida: sal[0]?.s || firstWith(ops, 'SALIDA'),
    eta_fiscal: fisc[fisc.length - 1]?.s || firstWith(ops, 'ETA_FISC'),
    deposito: firstWith(ops, 'DEPOSITO'),
    operativa: firstWith(ops, 'OPERATIVA'),
    descarga: firstWith(ops, 'DESCARGA'),
    dev: firstWith(ops, 'DEV'),
    contenedor: ops.map(o => o.CNTR_OP).filter(Boolean).join(', '),
    salidaVaria: new Set(sal.map(x => x.s)).size > 1,
    etaFiscalVaria: new Set(fisc.map(x => x.s)).size > 1,
  }
}
```

- [ ] **Step 4: `fclColumnsStatus` usa el array si está** (`operationsTypes.ts` ~326): si `s.operativas?.length`, pasar esas a `getShipmentStatus`; si no, el op sintético actual.

```ts
function fclColumnsStatus(s: DbShipment): string {
  if (Array.isArray(s.operativas) && s.operativas.length) {
    return getShipmentStatus({ REF: s.ref, ETD: s.etd, ETA: s.eta, operativas: s.operativas } as any).label
  }
  // …fallback colapsado actual…
}
```

- [ ] **Step 5: Run → pasa**

Run: `npm run test:run -- src/lib/operativasRollup.test.ts src/lib/operationsTypes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/operativasRollup.ts src/lib/operativasRollup.test.ts src/lib/operationsTypes.ts
git commit -m "feat(fcl): rollup derivado desde operativas[] + estado por array"
```

---

## Task 6: API — whitelist `operativas` + recomputar rollup al escribir

**Files:**
- Modify: `api/data/[entity].ts` (`SHIPMENT_COLS` ~1423; `handleShipments` write path ~1505-1515)

- [ ] **Step 1:** En `SHIPMENT_COLS` (Set ~1423), agregar `'operativas'`.

- [ ] **Step 2: Recomputar rollup server-side.** En el armado de `updates` (donde hace `if (SHIPMENT_COLS.has(k)) updates[k] = v`, ~1513), después del loop, si `updates.operativas` está presente y es array, recomputar las columnas sueltas. Copiar la lógica de `rollupFromOperativas` a `api/_lib/` (los `api/` no importan `src/lib`), o duplicar la función inline (es pura, ~15 líneas). Setear:
```ts
if (Array.isArray(updates.operativas)) {
  const r = rollupFromOperativasApi(updates.operativas) // copia en api/_lib/operativasRollup.ts
  updates.salida = r.salida; updates.eta_fiscal = r.eta_fiscal
  updates.deposito = r.deposito; updates.operativa = r.operativa
  updates.descarga = r.descarga; updates.dev = r.dev; updates.contenedor = r.contenedor
}
```

- [ ] **Step 3: Crear `api/_lib/operativasRollup.ts`** (copia pura de la función de Task 5, sin imports de `src/`; reimplementar `parseLocalDate` inline o importar de un util común de `api/_lib`).

- [ ] **Step 4: Verificar typecheck de api**

Run: `npm run typecheck`
Expected: sin errores (cubre `src/` y `api/` vía `tsconfig.api.json`).

- [ ] **Step 5: Commit**
```bash
git add "api/data/[entity].ts" api/_lib/operativasRollup.ts
git commit -m "feat(fcl): API acepta operativas[] y recomputa rollup de columnas"
```

---

## Task 7: Backfill desde `sheet_raw.operativas`

**Files:** Supabase MCP (`execute_sql`). Idempotente.

- [ ] **Step 1: Dry-run (read-only)** — cuántas FCL tienen `sheet_raw.operativas` con ≥1 fila y `operativas` aún nulo.

Run: `select count(*) from shipments where source='fcl' and not archived and operativas is null and sheet_raw ? 'operativas' and jsonb_array_length(sheet_raw->'operativas') >= 1;`
Expected: ~1100+.

- [ ] **Step 2: Backfill.** Copiar `sheet_raw->'operativas'` a `operativas` (solo donde está nulo, para no pisar ediciones nuevas). Las columnas sueltas ya reflejan el estado actual (incl. el refresh de hoy) → el array hereda lo del sheet_raw pero el rollup/estado se deriva del array; reconciliación: tras copiar, **pisar en la 1ª op del array** los valores de las columnas sueltas si difieren (las columnas son la última verdad post-flip). Hacerlo en 2 pasos:

```sql
-- 2a: sembrar el array desde sheet_raw donde falte
update shipments
set operativas = sheet_raw->'operativas'
where source='fcl' and not archived and operativas is null
  and sheet_raw ? 'operativas' and jsonb_array_length(sheet_raw->'operativas') >= 1;

-- 2b: para FCL sin sheet_raw.operativas, sembrar 1 op desde las columnas
update shipments
set operativas = jsonb_build_array(jsonb_build_object(
  'CNTR_OP', contenedor, 'SALIDA', salida, 'ETA_FISC', eta_fiscal,
  'DEPOSITO', deposito, 'OPERATIVA', operativa, 'DESCARGA', descarga, 'DEV', dev,
  'LUGAR_SALIDA', ''))
where source='fcl' and not archived and operativas is null;
```

- [ ] **Step 3: Reconciliar la 1ª op con las columnas** (las columnas tienen el refresh de hoy; el sheet_raw está congelado al flip). Para las 9 refs tocadas hoy + cualquier drift, pisar SALIDA/ETA_FISC/DEPOSITO/OPERATIVA/DESCARGA/DEV de `operativas[0]` con el valor de columna si difiere:

```sql
update shipments s
set operativas = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
    operativas,
    '{0,SALIDA}',   to_jsonb(coalesce(salida,'')) ),
    '{0,ETA_FISC}', to_jsonb(coalesce(eta_fiscal,'')) ),
    '{0,DEPOSITO}', to_jsonb(coalesce(deposito,'')) ),
    '{0,OPERATIVA}',to_jsonb(coalesce(operativa,'')) ),
    '{0,DESCARGA}', to_jsonb(coalesce(descarga,'')) ),
    '{0,DEV}',      to_jsonb(coalesce(dev,'')) )
where source='fcl' and not archived and jsonb_array_length(operativas) >= 1
  and (operativas->0->>'SALIDA' is distinct from coalesce(salida,'')
       or operativas->0->>'ETA_FISC' is distinct from coalesce(eta_fiscal,''));
```
(Nota: esto solo reconcilia la op 0. Para multi-contenedor con drift en op>0 no hay dato de columna — queda lo del sheet_raw, que es correcto.)

- [ ] **Step 4: Verificar** una muestra (A7941 debe tener 3 ops; A7814 op0 con SALIDA 2026-06-16):

Run: `select ref, jsonb_array_length(operativas) n, operativas->0->>'SALIDA' s0 from shipments where ref in ('A7941','A7814','A7813') and source='fcl' and not archived;`
Expected: A7941 n=3; A7814 s0='2026-06-16'.

---

## Task 8: Panel — sección "Salidas por contenedor"

**Files:**
- Create: `src/components/operations/ContainerDatesSection.tsx`
- Modify: `src/components/operations/OperationDetailPanel.tsx` (montar la sección tras `ViabilityBlock`; commit del array vía `onPatch(dbId, { operativas })`)
- Modify: `src/lib/operationsTypes.ts` — exponer `cntr → operativas` helper si hace falta para parsear contenedores.

- [ ] **Step 1: Crear `ContainerDatesSection.tsx`** — una fila por contenedor (de `op` reconstruido o de `parseCntr(op.cntr)` cruzado con el array). Reusar el patrón `StatBox`/`Input type=date` de `ViabilityBlock`. Selector de lugar = `<select>` con TCP/MONTECON/GODILCO/PLANIR. Micro-estado por contenedor con un helper `containerMicroStatus(op)` (deriva con `getShipmentStatus` sobre `[op]`). Editable = misma condición que ViabilityBlock (`op.source` DB/FCL horneada + `!readOnly`). `onChange` arma el nuevo array y llama `onCommitOperativas(nextArray)`.

(Estructura visual aprobada — ver mockup del spec. Encabezados: Contenedor · Salida MVD · Arribo fiscal · Lugar · Estado.)

- [ ] **Step 2: Montar en `OperationDetailPanel.tsx`** entre `ViabilityBlock` (~272) y la sección "Contenedores" (~274):
```tsx
<ContainerDatesSection
  op={op}
  editable={op.source !== undefined && !!op.dbId && !op.readOnly}
  onCommitOperativas={next => onPatch?.(op.dbId!, { operativas: next })}
/>
```

- [ ] **Step 3: Verificar build/preview** (los date-pickers escriben, el estado de la carga refleja la mezcla). Run: `npm run typecheck && npm run build`. Verificación visual en preview de Vercel (dev local no levanta APIs).

- [ ] **Step 4: Commit**
```bash
git add src/components/operations/ContainerDatesSection.tsx src/components/operations/OperationDetailPanel.tsx src/lib/operationsTypes.ts
git commit -m "feat(fcl): sección de salidas/arribos por contenedor en el panel"
```

---

## Task 9: Verificación final + PR

- [ ] **Step 1:** `npm run typecheck` (src+api) → sin errores.
- [ ] **Step 2:** `npm run test:run` → 146 existentes + nuevos, todos verdes.
- [ ] **Step 3:** `npm run build` → verde.
- [ ] **Step 4:** Push branch `feat/fcl-salidas-por-contenedor` + pasarle a Brian el link `https://github.com/MrSuricata/twfnew/pull/new/feat/fcl-salidas-por-contenedor` (él mergea).
- [ ] **Step 5:** Checklist manual (preview): abrir una FCL multi-contenedor (A7941), ver 3 filas; cargar salida solo a 1 → estado "Parcialmente en Frontera"; marcar lugar GODILCO sin salida → "En GODILCO"; grilla muestra la salida más temprana.

---

## Self-review (hecho)
- **Cobertura spec:** modelo array ✓ (T1,T2,T4), estado En [lugar] ✓ (T3), rollup ✓ (T5,T6), backfill desde sheet_raw ✓ (T7), panel por contenedor ✓ (T8). DnD y Agenda/HOY = Fases 2/3 (fuera de este plan).
- **Sin placeholders:** código real en T1-T7; T8 (UI) referencia el patrón `StatBox` real ya leído — el subagente lee `ViabilityBlock.tsx` para copiar el estilo exacto.
- **Consistencia de tipos:** `OperativasRecord.LUGAR_SALIDA?`, `DbShipment.operativas?`, `rollupFromOperativas` usados igual en T2/T4/T5/T6.
- **Riesgo:** la reconciliación del backfill (T7 step3) solo cubre op0 — documentado; multi-contenedor con drift en op>0 mantiene el dato de sheet_raw (correcto, era el original).
