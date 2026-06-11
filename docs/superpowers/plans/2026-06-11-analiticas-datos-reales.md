# Analíticas con datos reales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña Estadísticas usa datos de TODAS las cargas (FCL + LCL/aéreo/terrestre) con filtros modalidad/zona, sección Consolidados, y PDF descargable con branding Mediterránea.

**Architecture:** La lógica de agregación vive en `src/lib/analyticsUtils.ts` (funciones puras sobre `UnifiedOperation[]` construidas con el `buildOperations()` existente — mismos números que la grilla). El PDF se arma en dos capas: `buildAnalyticsReport()` (estructura de datos, testeable) + `downloadAnalyticsPdf()` (jsPDF, fina). El componente queda solo con UI.

**Tech Stack:** Vite + React 19 + TS · vitest · recharts (charts en pantalla) · jspdf + jspdf-autotable (nuevas deps, import dinámico) · sonner (toasts).

**Spec:** `docs/superpowers/specs/2026-06-11-analiticas-datos-reales-design.md`

**Contexto de entorno:**
- Repo: `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy` — **todos los comandos se corren desde ahí**.
- Branch: `feat/analiticas-datos-reales` (ya creada desde origin/main, spec commiteado).
- Comandos: `npm run typecheck` · `npm run test:run -- <archivo>` · `npm run build`.
- Commits en español rioplatense. NUNCA push a main.

**File structure:**

| Archivo | Responsabilidad |
|---------|----------------|
| `src/lib/analyticsUtils.ts` (nuevo) | Filtros + agregaciones puras (operations y camiones) |
| `src/lib/analyticsUtils.test.ts` (nuevo) | Tests de lo anterior |
| `src/lib/analyticsPdf.ts` (nuevo) | `buildAnalyticsReport` (pura) + `downloadAnalyticsPdf` (jsPDF) |
| `src/lib/analyticsPdf.test.ts` (nuevo) | Tests de `buildAnalyticsReport` |
| `src/lib/operationsTypes.ts` (modif) | Campos `terminal` y `n` en UnifiedOperation |
| `src/lib/operationsTypes.test.ts` (modif) | Test de los campos nuevos |
| `src/components/AnalyticsDashboard.tsx` (modif) | UI: props nuevas, chips, sección Consolidados, handlers |
| `src/components/DashboardEnhanced.tsx` (modif) | Pasa `dbShipments`/`trucks`/`truckLoads` |
| `src/lib/exportUtils.ts` (modif) | Borrar `exportToPDF` (queda sin consumidores) |

---

### Task 1: Campos `terminal` y `n` en UnifiedOperation

**Files:**
- Modify: `src/lib/operationsTypes.ts` (interface ~línea 184, `fclToOperation` ~línea 240, `dbShipmentToOperation` ~línea 298)
- Test: `src/lib/operationsTypes.test.ts`

- [ ] **Step 1: Escribir el test que falla**

En `src/lib/operationsTypes.test.ts`: sumar `type DbShipment` al import de `./operationsTypes` y agregar al final:

```ts
// Analíticas multi-modalidad: el dashboard necesita TERMINAL y N (cantidad de
// contenedores FCL) que antes solo vivían en ParsedShipment.
describe('UnifiedOperation — terminal y n para analíticas', () => {
  it('FCL mapea TERMINAL y N; DB queda con terminal vacío y n=0', () => {
    const out = buildOperations(
      [fcl({ TERMINAL: 'TCP', N: 3 })],
      [{ id: 'shp-lcl-1', ref: 'LCL-1', mode: 'lcl', archived: false } as unknown as DbShipment],
      new Map()
    )
    expect(out[0].terminal).toBe('TCP')
    expect(out[0].n).toBe(3)
    expect(out[1].terminal).toBe('')
    expect(out[1].n).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts`
Expected: FAIL (`terminal`/`n` undefined).

- [ ] **Step 3: Implementación mínima**

En `src/lib/operationsTypes.ts`:

1. En la interface `UnifiedOperation`, después de `tipo: string` (línea ~172):

```ts
  terminal: string               // FCL: terminal del SG (TCP/MONTECON) · DB: ''
  n: number                      // FCL: cantidad de contenedores (col N) · DB: 0
```

2. En `fclToOperation`, después de `tipo: ...` :

```ts
    terminal: s.TERMINAL || '',
    n: num(s.N),
```

3. En `dbShipmentToOperation`, después de `tipo: ...`:

```ts
    terminal: '',
    n: 0,
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/operationsTypes.test.ts`
Expected: PASS (todos, incluidos los preexistentes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/operationsTypes.ts src/lib/operationsTypes.test.ts
git commit -m "feat(analiticas): terminal y n en UnifiedOperation para el dashboard"
```

---

### Task 2: Instalar jspdf + jspdf-autotable

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Instalar**

Run: `npm install jspdf jspdf-autotable`
Expected: ambas en `dependencies` sin errores.

- [ ] **Step 2: Typecheck sano**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: jspdf + jspdf-autotable para el PDF de estadisticas"
```

---

### Task 3: analyticsUtils — fechas, zona y filterOperations

**Files:**
- Create: `src/lib/analyticsUtils.ts`
- Test: `src/lib/analyticsUtils.test.ts`

- [ ] **Step 1: Escribir tests que fallan**

Crear `src/lib/analyticsUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { UnifiedOperation } from './operationsTypes'
import { filterOperations, zoneOf, opYear } from './analyticsUtils'

// Factory mínima: solo los campos que usan las analíticas.
export const op = (over: Partial<UnifiedOperation> = {}): UnifiedOperation =>
  ({
    uid: 'u1', ref: 'A1', mode: 'fcl', source: 'fcl', cliente: '', etd: '', eta: '',
    pais: 'UY', linea: '', terminal: '', n: 0, pkgs: 0, kg: 0, m3: 0,
    operativa: '', transporte: '', fiscal: '', tipo: '', status: '',
    ...over,
  }) as UnifiedOperation

describe('zoneOf — bucket de zona', () => {
  it('UY/AR/CL pasan directo; resto (incluido vacío) es OTRO', () => {
    expect(zoneOf(op({ pais: 'UY' }))).toBe('UY')
    expect(zoneOf(op({ pais: 'CL' }))).toBe('CL')
    expect(zoneOf(op({ pais: 'OTRO' }))).toBe('OTRO')
    expect(zoneOf(op({ pais: '' }))).toBe('OTRO')
  })
})

describe('opYear — año por ETA, ambos formatos de fecha', () => {
  it('planilla D/M/YYYY y web YYYY-MM-DD', () => {
    expect(opYear(op({ eta: '15/3/2026' }))).toBe(2026)
    expect(opYear(op({ eta: '2026-03-15' }))).toBe(2026)
    expect(opYear(op({ eta: '' }))).toBe(null)
    expect(opYear(op({ eta: 'basura' }))).toBe(null)
  })
})

describe('filterOperations — año + modalidad + zona combinados', () => {
  const ops = [
    op({ uid: 'a', eta: '15/3/2026', mode: 'fcl', pais: 'UY' }),
    op({ uid: 'b', eta: '2026-04-01', mode: 'lcl', pais: 'UY' }),
    op({ uid: 'c', eta: '15/3/2026', mode: 'fcl', pais: 'CL' }),
    op({ uid: 'd', eta: '15/3/2025', mode: 'fcl', pais: 'UY' }),
    op({ uid: 'e', eta: '', mode: 'air', pais: '' }),
  ]
  it('filtra por año (sin ETA queda fuera)', () => {
    expect(filterOperations(ops, 2026, 'all', 'all').map(o => o.uid)).toEqual(['a', 'b', 'c'])
  })
  it('modalidad y zona se combinan con el año', () => {
    expect(filterOperations(ops, 2026, 'fcl', 'all').map(o => o.uid)).toEqual(['a', 'c'])
    expect(filterOperations(ops, 2026, 'all', 'UY').map(o => o.uid)).toEqual(['a', 'b'])
    expect(filterOperations(ops, 2026, 'fcl', 'CL').map(o => o.uid)).toEqual(['c'])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

Crear `src/lib/analyticsUtils.ts`:

```ts
// Agregaciones puras para la pestaña Estadísticas. Operan sobre las mismas
// UnifiedOperation que la grilla (buildOperations) → números idénticos.
import type { UnifiedOperation, Modality } from './operationsTypes'
import { MODALITY_LABELS } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'

export type ModeFilter = 'all' | Modality
export type ZoneFilter = 'all' | 'UY' | 'AR' | 'CL' | 'OTRO'

// Acepta 'D/M/YYYY' (planilla) y 'YYYY-MM-DD' (web/DB) — mismo criterio que
// parseSegDate en operationsTypes.
export function parseAnyDate(s: string): Date | null {
  const t = (s || '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return new Date(y, +m[2] - 1, +m[1])
  }
  return null
}

export function opYear(op: UnifiedOperation): number | null {
  const d = parseAnyDate(op.eta)
  return d ? d.getFullYear() : null
}

const ZONES = ['UY', 'AR', 'CL']
export function zoneOf(op: UnifiedOperation): 'UY' | 'AR' | 'CL' | 'OTRO' {
  return (ZONES.includes(op.pais) ? op.pais : 'OTRO') as 'UY' | 'AR' | 'CL' | 'OTRO'
}

export function filterOperations(
  ops: UnifiedOperation[],
  year: number,
  mode: ModeFilter,
  zone: ZoneFilter
): UnifiedOperation[] {
  return ops.filter(op => {
    if (opYear(op) !== year) return false
    if (mode !== 'all' && op.mode !== mode) return false
    if (zone !== 'all' && zoneOf(op) !== zone) return false
    return true
  })
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyticsUtils.ts src/lib/analyticsUtils.test.ts
git commit -m "feat(analiticas): filtros año/modalidad/zona sobre operaciones unificadas"
```

---

### Task 4: analyticsUtils — KPIs generales y volúmenes

**Files:**
- Modify: `src/lib/analyticsUtils.ts`
- Test: `src/lib/analyticsUtils.test.ts`

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/analyticsUtils.test.ts` (al import sumar `kpisGenerales, volumenes`):

```ts
describe('kpisGenerales', () => {
  it('cuenta cargas, contenedores FCL (n), tránsito promedio y clientes únicos', () => {
    const ops = [
      op({ cliente: 'PERETTI', n: 2, etd: '1/3/2026', eta: '31/3/2026' }),   // 30 días
      op({ cliente: 'PERETTI', n: 1, etd: '1/3/2026', eta: '21/3/2026' }),   // 20 días
      op({ cliente: 'CHIAPERO', mode: 'lcl', n: 0, etd: '', eta: '2026-04-01' }),
    ]
    const k = kpisGenerales(ops)
    expect(k.cargas).toBe(3)
    expect(k.contenedores).toBe(3)
    expect(k.transitoPromedio).toBe(25)
    expect(k.clientes).toBe(2)
  })
  it('tránsitos inválidos (negativos, >365d, sin fechas) no cuentan', () => {
    const k = kpisGenerales([
      op({ etd: '10/3/2026', eta: '1/3/2026' }),
      op({ etd: '1/1/2020', eta: '1/3/2026' }),
      op({ etd: '', eta: '1/3/2026' }),
    ])
    expect(k.transitoPromedio).toBe(0)
  })
})

describe('volumenes', () => {
  it('suma bultos/kg/m3 de todas las modalidades', () => {
    const v = volumenes([
      op({ pkgs: 10, kg: 1000, m3: 5 }),
      op({ mode: 'lcl', pkgs: 5, kg: 500, m3: 2.5 }),
    ])
    expect(v).toEqual({ pkgs: 15, kg: 1500, m3: 7.5 })
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: FAIL (exports inexistentes).

- [ ] **Step 3: Implementación**

Agregar a `src/lib/analyticsUtils.ts`:

```ts
export interface GeneralKpis {
  cargas: number
  contenedores: number       // suma de n (FCL); 0 si el filtro no incluye FCL
  transitoPromedio: number   // días ETD→ETA, solo tránsitos plausibles (0<d<365)
  clientes: number
}

export function kpisGenerales(ops: UnifiedOperation[]): GeneralKpis {
  const transits: number[] = []
  for (const o of ops) {
    const etd = parseAnyDate(o.etd)
    const eta = parseAnyDate(o.eta)
    if (!etd || !eta) continue
    const days = Math.floor((eta.getTime() - etd.getTime()) / 86400000)
    if (days > 0 && days < 365) transits.push(days)
  }
  return {
    cargas: ops.length,
    contenedores: ops.reduce((a, o) => a + (o.n || 0), 0),
    transitoPromedio: transits.length
      ? Math.round(transits.reduce((a, b) => a + b, 0) / transits.length)
      : 0,
    clientes: new Set(ops.filter(o => o.cliente).map(o => o.cliente)).size,
  }
}

export interface Volumenes { pkgs: number; kg: number; m3: number }
export function volumenes(ops: UnifiedOperation[]): Volumenes {
  return {
    pkgs: ops.reduce((a, o) => a + (o.pkgs || 0), 0),
    kg: ops.reduce((a, o) => a + (o.kg || 0), 0),
    m3: ops.reduce((a, o) => a + (o.m3 || 0), 0),
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyticsUtils.ts src/lib/analyticsUtils.test.ts
git commit -m "feat(analiticas): KPIs generales y volumenes multi-modalidad"
```

---

### Task 5: analyticsUtils — agregaciones para charts

**Files:**
- Modify: `src/lib/analyticsUtils.ts`
- Test: `src/lib/analyticsUtils.test.ts`

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/analyticsUtils.test.ts` (sumar al import: `porModalidad, porZona, topClientes, porLinea, porTerminal, porOperativa, porTransporte, porFiscal, porTipoContenedor, porMes`):

```ts
describe('agregaciones para charts', () => {
  it('porModalidad usa labels y ordena desc', () => {
    expect(porModalidad([op(), op(), op({ mode: 'lcl' })])).toEqual([
      { name: 'FCL', value: 2 },
      { name: 'LCL', value: 1 },
    ])
  })
  it('porZona agrupa con el bucket OTRO', () => {
    expect(porZona([op({ pais: 'UY' }), op({ pais: '' }), op({ pais: 'UY' })])).toEqual([
      { name: 'UY', value: 2 },
      { name: 'OTRO', value: 1 },
    ])
  })
  it('topClientes cuenta CARGAS (no contenedores) y corta en 7', () => {
    const ops = ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(c => op({ cliente: c }))
    const top = topClientes(ops)
    expect(top).toHaveLength(7)
    expect(top[0]).toEqual({ name: 'A', value: 2 })
  })
  it('vacíos no cuentan (linea/terminal/operativa/transporte/fiscal sin dato)', () => {
    expect(porLinea([op({ linea: '' })])).toEqual([])
    expect(porTerminal([op({ terminal: 'TCP' }), op({ terminal: '' })])).toEqual([
      { name: 'TCP', value: 1 },
    ])
    expect(porOperativa([op()])).toEqual([])
    expect(porTransporte([op()])).toEqual([])
    expect(porFiscal([op()])).toEqual([])
  })
  it('porTipoContenedor solo mira FCL (el tipo DB es el label de modalidad)', () => {
    expect(porTipoContenedor([op({ tipo: '40HC' }), op({ mode: 'lcl', tipo: 'LCL' })])).toEqual([
      { name: '40HC', value: 1 },
    ])
  })
  it('porFiscal trunca nombres largos a 18 chars + …', () => {
    expect(porFiscal([op({ fiscal: 'DEPOSITO FISCAL ZONA OESTE' })])).toEqual([
      { name: 'DEPOSITO FISCAL ZO…', value: 1 },
    ])
  })
})

describe('porMes', () => {
  const NOW = new Date(2026, 5, 11) // 11/06/2026
  it('agrupa por mes de ETA y no muestra meses futuros', () => {
    const data = porMes(
      [op({ eta: '5/3/2026' }), op({ eta: '20/3/2026' }), op({ eta: '1/9/2026' })],
      NOW
    )
    expect(data).toHaveLength(1)
    expect(data[0].cargas).toBe(2)
  })
  it('en años pasados muestra todos los meses con datos', () => {
    const data = porMes([op({ eta: '5/3/2025' }), op({ eta: '5/9/2025' })], NOW)
    expect(data).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Agregar a `src/lib/analyticsUtils.ts`:

```ts
export interface NameValue { name: string; value: number }

function countBy(
  ops: UnifiedOperation[],
  key: (op: UnifiedOperation) => string,
  limit?: number
): NameValue[] {
  const counts: Record<string, number> = {}
  for (const o of ops) {
    const k = key(o)
    if (k) counts[k] = (counts[k] || 0) + 1
  }
  const out = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))
  return limit ? out.slice(0, limit) : out
}

export const porModalidad = (ops: UnifiedOperation[]) =>
  countBy(ops, o => MODALITY_LABELS[o.mode] || o.mode)
export const porZona = (ops: UnifiedOperation[]) => countBy(ops, o => zoneOf(o))
export const topClientes = (ops: UnifiedOperation[]) => countBy(ops, o => o.cliente, 7)
export const porLinea = (ops: UnifiedOperation[]) => countBy(ops, o => o.linea, 6)
export const porTerminal = (ops: UnifiedOperation[]) => countBy(ops, o => o.terminal)
export const porOperativa = (ops: UnifiedOperation[]) => countBy(ops, o => o.operativa)
export const porTransporte = (ops: UnifiedOperation[]) => countBy(ops, o => o.transporte, 8)
export const porFiscal = (ops: UnifiedOperation[]) =>
  countBy(ops, o => (o.fiscal.length > 18 ? o.fiscal.slice(0, 18) + '…' : o.fiscal), 8)
export const porTipoContenedor = (ops: UnifiedOperation[]) =>
  countBy(ops.filter(o => o.mode === 'fcl'), o => o.tipo)

/** Cargas por mes de ETA. En el año en curso no muestra meses futuros
 *  (mismo criterio que el dashboard original). */
export function porMes(ops: UnifiedOperation[], now: Date): { month: string; cargas: number }[] {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const counts: Record<string, number> = {}
  for (const o of ops) {
    const d = parseAnyDate(o.eta)
    if (!d) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (key <= currentMonth) counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts)
    .sort()
    .slice(-12)
    .map(([month, cargas]) => ({
      month: new Date(month + '-01T00:00:00').toLocaleDateString('es-UY', { month: 'short' }),
      cargas,
    }))
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyticsUtils.ts src/lib/analyticsUtils.test.ts
git commit -m "feat(analiticas): agregaciones de charts (modalidad, zona, clientes, mes, fcl)"
```

---

### Task 6: analyticsUtils — consolidados (camiones)

**Files:**
- Modify: `src/lib/analyticsUtils.ts`
- Test: `src/lib/analyticsUtils.test.ts`

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/analyticsUtils.test.ts`:

```ts
import type { Truck, TruckLoad } from './truckTypes'
import { truckYear, kpisConsolidados, consolidadosPorMes, volumenPorTransportista } from './analyticsUtils'

const truck = (over: Partial<Truck> = {}): Truck =>
  ({
    id: 't1', code: 'C430', status: 'arrived', isSider: false, transport: 'OLAVERRY',
    driver: '', plate: '', loadDate: '2026-03-05', departureDate: '', arrivalDate: '',
    notes: '', createdAt: 0, updatedAt: 0, ...over,
  }) as Truck

const load = (over: Partial<TruckLoad> = {}): TruckLoad =>
  ({
    id: 'l1', truckId: 't1', sourceType: 'shipment', sourceRef: 'LCL-1', client: '',
    fiscal: '', kg: 100, m3: 1, pkgs: 2, description: '', mvdArrival: '',
    desconsolDate: '', overrides: {}, ...over,
  }) as TruckLoad

describe('consolidados', () => {
  it('truckYear usa loadDate con fallback a departureDate', () => {
    expect(truckYear(truck())).toBe(2026)
    expect(truckYear(truck({ loadDate: '', departureDate: '2025-12-20' }))).toBe(2025)
    expect(truckYear(truck({ loadDate: '', departureDate: '' }))).toBe(null)
  })
  it('kpisConsolidados suma solo cargas de camiones del año', () => {
    const trucks = [truck(), truck({ id: 't2', loadDate: '2025-03-05' })]
    const loads = [
      load(), load({ id: 'l2', kg: 200, m3: 2, pkgs: 3 }),
      load({ id: 'l3', truckId: 't2', kg: 999 }),
    ]
    const k = kpisConsolidados(trucks, loads, 2026)
    expect(k).toEqual({ camiones: 1, kg: 300, m3: 3, pkgs: 5, cargasPorCamion: 2 })
  })
  it('cargasPorCamion redondea a 1 decimal y es 0 sin camiones', () => {
    const trucks = [truck(), truck({ id: 't2' })]
    const loads = [load(), load({ id: 'l2' }), load({ id: 'l3', truckId: 't2' })]
    expect(kpisConsolidados(trucks, loads, 2026).cargasPorCamion).toBe(1.5)
    expect(kpisConsolidados([], [], 2026).cargasPorCamion).toBe(0)
  })
  it('consolidadosPorMes agrupa por mes de carga', () => {
    const data = consolidadosPorMes(
      [truck(), truck({ id: 't2', loadDate: '2026-03-20' }), truck({ id: 't3', loadDate: '2026-05-01' })],
      2026,
      new Date(2026, 5, 11)
    )
    expect(data).toHaveLength(2)
    expect(data[0].camiones).toBe(2)
  })
  it('volumenPorTransportista suma kg por transporte del camión', () => {
    const trucks = [truck(), truck({ id: 't2', transport: 'TRANSCAL' })]
    const loads = [load(), load({ id: 'l2', kg: 50 }), load({ id: 'l3', truckId: 't2', kg: 70 })]
    expect(volumenPorTransportista(trucks, loads, 2026)).toEqual([
      { name: 'OLAVERRY', value: 150 },
      { name: 'TRANSCAL', value: 70 },
    ])
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación**

Agregar a `src/lib/analyticsUtils.ts`:

```ts
// ── Consolidados (camiones) ── el año del camión es el de su fecha de carga
// (fallback: salida). Las fechas de camión son siempre 'YYYY-MM-DD'.
export function truckYear(t: Truck): number | null {
  const d = t.loadDate || t.departureDate
  if (!d) return null
  const y = parseInt(d.slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

export interface ConsolidadosKpis {
  camiones: number
  kg: number
  m3: number
  pkgs: number
  cargasPorCamion: number
}

export function kpisConsolidados(trucks: Truck[], loads: TruckLoad[], year: number): ConsolidadosKpis {
  const ts = trucks.filter(t => truckYear(t) === year)
  const ids = new Set(ts.map(t => t.id))
  const ls = loads.filter(l => ids.has(l.truckId))
  return {
    camiones: ts.length,
    kg: ls.reduce((a, l) => a + (l.kg || 0), 0),
    m3: ls.reduce((a, l) => a + (l.m3 || 0), 0),
    pkgs: ls.reduce((a, l) => a + (l.pkgs || 0), 0),
    cargasPorCamion: ts.length ? Math.round((ls.length / ts.length) * 10) / 10 : 0,
  }
}

export function consolidadosPorMes(trucks: Truck[], year: number, now: Date): { month: string; camiones: number }[] {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const counts: Record<string, number> = {}
  for (const t of trucks) {
    if (truckYear(t) !== year) continue
    const d = (t.loadDate || t.departureDate).slice(0, 7) // YYYY-MM
    if (d <= currentMonth) counts[d] = (counts[d] || 0) + 1
  }
  return Object.entries(counts)
    .sort()
    .slice(-12)
    .map(([month, camiones]) => ({
      month: new Date(month + '-01T00:00:00').toLocaleDateString('es-UY', { month: 'short' }),
      camiones,
    }))
}

export function volumenPorTransportista(trucks: Truck[], loads: TruckLoad[], year: number): NameValue[] {
  const ts = trucks.filter(t => truckYear(t) === year)
  const byId = new Map(ts.map(t => [t.id, t.transport || '—']))
  const kg: Record<string, number> = {}
  for (const l of loads) {
    const transport = byId.get(l.truckId)
    if (!transport) continue
    kg[transport] = (kg[transport] || 0) + (l.kg || 0)
  }
  return Object.entries(kg)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/analyticsUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyticsUtils.ts src/lib/analyticsUtils.test.ts
git commit -m "feat(analiticas): KPIs y charts de consolidados (camiones)"
```

---

### Task 7: analyticsPdf — buildAnalyticsReport (estructura pura)

**Files:**
- Create: `src/lib/analyticsPdf.ts`
- Test: `src/lib/analyticsPdf.test.ts`

- [ ] **Step 1: Tests que fallan**

Crear `src/lib/analyticsPdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildAnalyticsReport } from './analyticsPdf'
import { op } from './analyticsUtils.test'
import type { Truck, TruckLoad } from './truckTypes'

const NOW = new Date(2026, 5, 11)
const t1: Truck = {
  id: 't1', code: 'C430', status: 'arrived', isSider: false, transport: 'OLAVERRY',
  driver: '', plate: '', loadDate: '2026-03-05', departureDate: '', arrivalDate: '',
  notes: '', createdAt: 0, updatedAt: 0,
} as Truck
const l1: TruckLoad = {
  id: 'l1', truckId: 't1', sourceType: 'shipment', sourceRef: 'LCL-1', client: '',
  fiscal: '', kg: 100, m3: 1, pkgs: 2, description: '', mvdArrival: '',
  desconsolDate: '', overrides: {},
} as TruckLoad

describe('buildAnalyticsReport', () => {
  const ops = [
    op({ ref: 'A1', cliente: 'PERETTI', eta: '15/3/2026', n: 2, kg: 1000, pkgs: 10, m3: 5 }),
    op({ ref: 'L1', mode: 'lcl', cliente: 'CHIAPERO', eta: '2026-04-01', kg: 500, pkgs: 5, m3: 2 }),
  ]

  it('arma título, subtítulo con filtros y nombre de archivo', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.titulo).toBe('REPORTE DE OPERACIONES — 2026')
    expect(r.subtitulo).toContain('Todas las modalidades')
    expect(r.filename).toBe('reporte-mediterranea-2026.pdf')
    const filtrado = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'lcl', zone: 'UY', now: NOW })
    expect(filtrado.subtitulo).toContain('LCL')
    expect(filtrado.filename).toBe('reporte-mediterranea-2026-lcl-uy.pdf')
  })

  it('incluye KPIs y las tablas resumen', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.kpis.find(k => k.label === 'Cargas')?.value).toBe('2')
    const titles = r.resumen.map(t => t.title)
    expect(titles).toContain('Por modalidad')
    expect(titles).toContain('Consolidados')
  })

  it('detalle tiene una fila por carga con las 10 columnas', () => {
    const r = buildAnalyticsReport(ops, [], [], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.detalle.head).toHaveLength(10)
    expect(r.detalle.rows).toHaveLength(2)
    expect(r.detalle.rows[0][0]).toBe('A1')
  })

  it('con filtro FCL no incluye la tabla de consolidados', () => {
    const r = buildAnalyticsReport(ops, [t1], [l1], { year: 2026, mode: 'fcl', zone: 'all', now: NOW })
    expect(r.resumen.map(t => t.title)).not.toContain('Consolidados')
  })

  it('con 0 cargas genera el reporte igual (resumen en cero)', () => {
    const r = buildAnalyticsReport([], [], [], { year: 2026, mode: 'all', zone: 'all', now: NOW })
    expect(r.kpis.find(k => k.label === 'Cargas')?.value).toBe('0')
    expect(r.detalle.rows).toHaveLength(0)
  })
})
```

Nota: `op` se importa del test de utils — para eso la factory está exportada (`export const op = ...`, ya así en Task 3).

- [ ] **Step 2: Verificar que falla**

Run: `npm run test:run -- src/lib/analyticsPdf.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

Crear `src/lib/analyticsPdf.ts` (solo la parte pura; la capa jsPDF llega en Task 8):

```ts
// Reporte PDF de Estadísticas — branding Mediterránea Carghas (decisión Brian
// 11/06/2026: el reporte es documento Mediterránea, NO sigue el hostname).
// Capa 1 (esta): buildAnalyticsReport arma la estructura — pura y testeable.
// Capa 2: downloadAnalyticsPdf dibuja con jsPDF (import dinámico).
import type { UnifiedOperation } from './operationsTypes'
import { MODALITY_LABELS } from './operationsTypes'
import type { Truck, TruckLoad } from './truckTypes'
import {
  ModeFilter, ZoneFilter, zoneOf, kpisGenerales, volumenes, porModalidad, porZona,
  porMes, topClientes, porLinea, kpisConsolidados,
} from './analyticsUtils'

export const MED_BLUE = '#261c79'

export interface ReportTable { title: string; head: string[]; rows: (string | number)[][] }
export interface AnalyticsReport {
  titulo: string
  subtitulo: string
  generado: string
  kpis: { label: string; value: string }[]
  resumen: ReportTable[]
  detalle: ReportTable
  filename: string
}

export interface ReportOptions { year: number; mode: ModeFilter; zone: ZoneFilter; now: Date }

const nv = (title: string, rows: { name: string; value: number }[], head: [string, string]): ReportTable =>
  ({ title, head, rows: rows.map(r => [r.name, r.value]) })

export function buildAnalyticsReport(
  filtered: UnifiedOperation[],
  trucks: Truck[],
  loads: TruckLoad[],
  opts: ReportOptions
): AnalyticsReport {
  const { year, mode, zone, now } = opts
  const k = kpisGenerales(filtered)
  const v = volumenes(filtered)
  const cons = kpisConsolidados(trucks, loads, year)
  const incluirConsolidados = mode !== 'fcl' && mode !== 'land' && cons.camiones > 0

  const partes = [
    mode === 'all' ? 'Todas las modalidades' : MODALITY_LABELS[mode],
    zone === 'all' ? 'Todas las zonas' : zone,
  ]

  const kpis = [
    { label: 'Cargas', value: String(k.cargas) },
    { label: 'Contenedores FCL', value: String(k.contenedores) },
    { label: 'Tránsito promedio', value: `${k.transitoPromedio} días` },
    { label: 'Clientes', value: String(k.clientes) },
    { label: 'Bultos', value: v.pkgs.toLocaleString('es-UY') },
    { label: 'Peso', value: `${(v.kg / 1000).toFixed(1)} ton` },
    { label: 'Volumen', value: `${v.m3.toFixed(0)} m³` },
  ]

  const resumen: ReportTable[] = [
    nv('Por modalidad', porModalidad(filtered), ['Modalidad', 'Cargas']),
    nv('Por zona', porZona(filtered), ['Zona', 'Cargas']),
    {
      title: 'Cargas por mes',
      head: ['Mes', 'Cargas'],
      rows: porMes(filtered, now).map(m => [m.month, m.cargas]),
    },
    nv('Top clientes', topClientes(filtered), ['Cliente', 'Cargas']),
    nv('Navieras / líneas', porLinea(filtered), ['Línea', 'Cargas']),
  ]
  if (incluirConsolidados) {
    resumen.push({
      title: 'Consolidados',
      head: ['Indicador', 'Valor'],
      rows: [
        ['Camiones armados', cons.camiones],
        ['Kg transportados', cons.kg.toLocaleString('es-UY')],
        ['Volumen (m³)', cons.m3.toFixed(1)],
        ['Bultos', cons.pkgs.toLocaleString('es-UY')],
        ['Cargas por camión (prom.)', cons.cargasPorCamion],
      ],
    })
  }

  const detalle: ReportTable = {
    title: `Detalle de cargas (${filtered.length})`,
    head: ['Ref', 'Cliente', 'Modo', 'Zona', 'ETD', 'ETA', 'CNTR / Doc', 'Bultos', 'Kg', 'M³'],
    rows: filtered.map(o => [
      o.ref, o.cliente, MODALITY_LABELS[o.mode] || o.mode, zoneOf(o), o.etd, o.eta,
      o.cntr || o.docNumber, o.pkgs || '', o.kg ? Math.round(o.kg) : '', o.m3 ? o.m3.toFixed(1) : '',
    ]),
  }

  const sufijos = [mode !== 'all' ? mode : '', zone !== 'all' ? zone.toLowerCase() : '']
    .filter(Boolean)
    .map(s => `-${s}`)
    .join('')

  return {
    titulo: `REPORTE DE OPERACIONES — ${year}`,
    subtitulo: partes.join(' · '),
    generado: now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    kpis,
    resumen,
    detalle,
    filename: `reporte-mediterranea-${year}${sufijos}.pdf`,
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm run test:run -- src/lib/analyticsPdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyticsPdf.ts src/lib/analyticsPdf.test.ts
git commit -m "feat(analiticas): estructura del reporte PDF (buildAnalyticsReport)"
```

---

### Task 8: analyticsPdf — downloadAnalyticsPdf (capa jsPDF)

**Files:**
- Modify: `src/lib/analyticsPdf.ts`

Capa de dibujo — sin test unitario (se verifica a mano en Task 12). El logo SVG se rasteriza a PNG vía canvas porque jsPDF no soporta SVG; si falla (offline, SVG raro), el header cae a texto.

- [ ] **Step 1: Verificar que el logo existe**

Run (PowerShell): `Test-Path "public/images/med-logo-dark.svg"`
Expected: `True`. (Si fuera `False`, usar `public/images/med-emblem-dark.svg`; si tampoco, el fallback de texto cubre.)

- [ ] **Step 2: Implementación**

Agregar al final de `src/lib/analyticsPdf.ts`:

```ts
// ── Capa jsPDF ── import dinámico para no meter ~300KB en el bundle inicial.

async function logoDataUrl(): Promise<{ png: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/images/med-logo-dark.svg')
    if (!res.ok) return null
    const svg = await res.text()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      await new Promise<void>((ok, err) => {
        img.onload = () => ok()
        img.onerror = () => err(new Error('logo'))
        img.src = url
      })
      const w = img.naturalWidth || 600
      const h = img.naturalHeight || 160
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = Math.round((h / w) * 600)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return { png: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

export async function downloadAnalyticsPdf(report: AnalyticsReport): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14

  // Header página 1: logo (o texto) + título + filtros + fecha
  const logo = await logoDataUrl()
  if (logo) {
    const w = 42
    doc.addImage(logo.png, 'PNG', margin, 12, w, (logo.h / logo.w) * w)
  } else {
    doc.setTextColor(MED_BLUE).setFontSize(14).setFont('helvetica', 'bold')
    doc.text('MEDITERRANEA CARGHAS', margin, 20)
  }
  doc.setTextColor(MED_BLUE).setFontSize(16).setFont('helvetica', 'bold')
  doc.text(report.titulo, margin, 34)
  doc.setTextColor(90).setFontSize(9).setFont('helvetica', 'normal')
  doc.text(`${report.subtitulo}  ·  Generado: ${report.generado}`, margin, 40)

  // KPIs en una fila de cajas
  const kpiW = (pageW - margin * 2) / report.kpis.length
  report.kpis.forEach((k, i) => {
    const x = margin + i * kpiW
    doc.setFillColor(243, 244, 250)
    doc.roundedRect(x + 1, 45, kpiW - 2, 16, 1.5, 1.5, 'F')
    doc.setTextColor(MED_BLUE).setFontSize(10).setFont('helvetica', 'bold')
    doc.text(k.value, x + kpiW / 2, 52, { align: 'center' })
    doc.setTextColor(110).setFontSize(6.5).setFont('helvetica', 'normal')
    doc.text(k.label, x + kpiW / 2, 57, { align: 'center' })
  })

  // Tablas resumen
  let y = 66
  for (const table of report.resumen) {
    if (table.rows.length === 0) continue
    doc.setTextColor(MED_BLUE).setFontSize(10).setFont('helvetica', 'bold')
    doc.text(table.title, margin, y)
    autoTable(doc, {
      startY: y + 2,
      head: [table.head],
      body: table.rows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: MED_BLUE, textColor: '#ffffff', fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 241, 248] },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    if (y > 250) {
      doc.addPage()
      y = 20
    }
  }

  // Detalle en página nueva
  doc.addPage()
  doc.setTextColor(MED_BLUE).setFontSize(11).setFont('helvetica', 'bold')
  doc.text(report.detalle.title, margin, 18)
  autoTable(doc, {
    startY: 22,
    head: [report.detalle.head],
    body: report.detalle.rows,
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: 'ellipsize' },
    headStyles: { fillColor: MED_BLUE, textColor: '#ffffff', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 241, 248] },
  })

  // Footer en todas las páginas
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(130).setFontSize(7).setFont('helvetica', 'normal')
    doc.text(
      `Página ${i} de ${pages} · Mediterránea Carghas — Documento confidencial`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 7,
      { align: 'center' }
    )
  }

  doc.save(report.filename)
}
```

- [ ] **Step 3: Typecheck + tests**

Run: `npm run typecheck` y `npm run test:run`
Expected: ambos verdes (la capa nueva no rompe nada).

- [ ] **Step 4: Commit**

```bash
git add src/lib/analyticsPdf.ts
git commit -m "feat(analiticas): generacion del PDF con jsPDF y branding Mediterranea"
```

---

### Task 9: AnalyticsDashboard — props nuevas, operations y filtros

**Files:**
- Modify: `src/components/AnalyticsDashboard.tsx`

Refactor del componente: pasa de `ParsedShipment[]` a `UnifiedOperation[]`. Los getters internos (`getShipmentsPerMonth`, `getTopClients`, `getByShippingLine`, `getByTerminal`, `getAverageTransitTime`, `getByOperationType`, `getByTransport`, `getByFiscal`, `getByContainerType`, `getTotalVolumes`, `getYearFromDate`) **se borran** — los reemplazan las utils.

- [ ] **Step 1: Reemplazar imports, props y derivación de datos**

Reemplazar la cabecera del archivo (imports + interface + inicio del componente, líneas 1–253 del archivo actual — todo lo anterior al `return`) por:

```tsx
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FilePdf, FileXls, Boat, Package, Clock, Users, Truck as TruckIcon, Warehouse, Cube, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { buildOperations, DbShipment, MODALITY_LABELS } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import {
  ModeFilter, ZoneFilter, filterOperations, zoneOf, opYear, kpisGenerales, volumenes,
  porModalidad, porZona, porMes, topClientes, porLinea, porTerminal, porOperativa,
  porTransporte, porFiscal, porTipoContenedor, truckYear, kpisConsolidados,
  consolidadosPorMes, volumenPorTransportista,
} from '@/lib/analyticsUtils'
import { buildAnalyticsReport, downloadAnalyticsPdf } from '@/lib/analyticsPdf'
import { exportToCSV } from '@/lib/exportUtils'
import { toast } from 'sonner'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface AnalyticsDashboardProps {
  shipments: ParsedShipment[]
  dbShipments?: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
}

// Paleta de charts — referencia las CSS custom properties de src/index.css.
const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'oklch(0.55 0.12 30)',
  'oklch(0.50 0.08 200)',
]

const CHART_PRIMARY = 'var(--chart-1)'
const CHART_SECONDARY = 'var(--chart-2)'
const CHART_TERTIARY = 'var(--chart-3)'

const MODE_CHIPS: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
  { value: 'air', label: 'Aéreo' },
  { value: 'land', label: 'Terrestre' },
]
const ZONE_CHIPS: { value: ZoneFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'UY', label: '🇺🇾 UY' },
  { value: 'AR', label: '🇦🇷 AR' },
  { value: 'CL', label: '🇨🇱 CL' },
  { value: 'OTRO', label: 'Otros' },
]

export default function AnalyticsDashboard({ shipments, dbShipments = [], trucks = [], truckLoads = [] }: AnalyticsDashboardProps) {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all')

  // Misma fuente que la grilla de Operaciones → mismos números. Archivadas
  // incluidas: las estadísticas son historia, no operación viva.
  const operations = useMemo(
    () => buildOperations(shipments, dbShipments, new Map(), true),
    [shipments, dbShipments]
  )

  const filtered = useMemo(
    () => filterOperations(operations, selectedYear, modeFilter, zoneFilter),
    [operations, selectedYear, modeFilter, zoneFilter]
  )

  // Años con datos (cargas por ETA + camiones por fecha de carga) + año actual.
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    operations.forEach(o => { const y = opYear(o); if (y) years.add(y) })
    trucks.forEach(t => { const y = truckYear(t); if (y) years.add(y) })
    years.add(now.getFullYear())
    return Array.from(years).sort()
  }, [operations, trucks])

  const kpis = useMemo(() => kpisGenerales(filtered), [filtered])
  const vols = useMemo(() => volumenes(filtered), [filtered])
  const dataModalidad = useMemo(() => porModalidad(filtered), [filtered])
  const dataZona = useMemo(() => porZona(filtered), [filtered])
  const shipmentsPerMonth = useMemo(() => porMes(filtered, now), [filtered])
  const dataClientes = useMemo(() => topClientes(filtered), [filtered])
  const byLine = useMemo(() => porLinea(filtered), [filtered])
  const byTerminal = useMemo(() => porTerminal(filtered), [filtered])
  const byOperationType = useMemo(() => porOperativa(filtered), [filtered])
  const byTransport = useMemo(() => porTransporte(filtered), [filtered])
  const byFiscal = useMemo(() => porFiscal(filtered), [filtered])
  const byContainerType = useMemo(() => porTipoContenedor(filtered), [filtered])

  // Consolidados: por año (no dependen de modalidad/zona); ocultos si el
  // filtro es FCL o Terrestre (consolidados = LCL/aéreo).
  const showConsolidados = modeFilter !== 'fcl' && modeFilter !== 'land'
  const consKpis = useMemo(() => kpisConsolidados(trucks, truckLoads, selectedYear), [trucks, truckLoads, selectedYear])
  const consPorMes = useMemo(() => consolidadosPorMes(trucks, selectedYear, now), [trucks, selectedYear])
  const consTransportistas = useMemo(() => volumenPorTransportista(trucks, truckLoads, selectedYear), [trucks, truckLoads, selectedYear])

  const handleExportPDF = async () => {
    try {
      const report = buildAnalyticsReport(filtered, trucks, truckLoads, {
        year: selectedYear, mode: modeFilter, zone: zoneFilter, now,
      })
      await downloadAnalyticsPdf(report)
    } catch {
      toast.error('No se pudo generar el PDF. Probá de nuevo.')
    }
  }

  const handleExportExcel = () => {
    const data = filtered.map(o => ({
      REF: o.ref, CLIENTE: o.cliente, MODO: MODALITY_LABELS[o.mode] || o.mode,
      ZONA: zoneOf(o), ETD: o.etd, ETA: o.eta, 'CNTR/DOC': o.cntr || o.docNumber,
      BULTOS: o.pkgs, KG: o.kg, M3: o.m3, ESTADO: o.status,
    }))
    exportToCSV(data, `cargas-${selectedYear}.csv`)
  }
```

- [ ] **Step 2: Header + chips de filtros en el JSX**

En el `return`, dentro del bloque Header existente, actualizar el subtítulo y agregar los chips. El `<p>` del header pasa a:

```tsx
            <p className="text-sm text-muted-foreground">{filtered.length} cargas en {selectedYear}</p>
```

Inmediatamente después del `div` del Header (el que cierra tras los botones PDF/Excel), agregar:

```tsx
      {/* Filtros: modalidad + zona (combinables con el año) */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          {MODE_CHIPS.map(c => (
            <Button
              key={c.value}
              size="sm"
              variant={modeFilter === c.value ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setModeFilter(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {ZONE_CHIPS.map(c => (
            <Button
              key={c.value}
              size="sm"
              variant={zoneFilter === c.value ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setZoneFilter(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>
```

- [ ] **Step 3: Adaptar KPI cards y charts existentes al nuevo modelo**

En el JSX existente, reemplazos puntuales:

1. KPI "Operaciones": `{shipments.length}` → `{kpis.cargas}` y label `Operaciones` → `Cargas`.
2. KPI "Contenedores": `{totalContainers}` → `{kpis.contenedores}` y label → `Contenedores FCL`.
3. KPI "Tránsito Promedio": `{avgTransit}` → `{kpis.transitoPromedio}`.
4. KPI "Clientes": `{uniqueClients}` → `{kpis.clientes}`.
5. Fila de KPIs operativos: la condición `hasOperativas && (` pasa a `(vols.pkgs > 0 || vols.kg > 0) && (`; `{volumes.totalPkgs.toLocaleString()}` → `{vols.pkgs.toLocaleString()}`; `{(volumes.totalKg / 1000).toFixed(0)}` → `{(vols.kg / 1000).toFixed(0)}`; `{volumes.totalM3.toFixed(0)}` → `{vols.m3.toFixed(0)}`; el KPI "Transportistas" usa `{new Set(filtered.filter(o => o.transporte).map(o => o.transporte)).size}`.
6. Chart "Top Clientes por Volumen" → título `Top Clientes`, data `dataClientes`, `<YAxis dataKey="name" .../>` y `<Bar dataKey="value" ... name="Cargas" />`.
7. Sección "Analíticas Operativas": la condición `hasOperativas && (` pasa a `(byOperationType.length > 0 || byTransport.length > 0 || byFiscal.length > 0) && (`. Los charts ya usan `byOperationType`/`byTransport`/`byFiscal`/`byContainerType` — solo cambia de dónde salen (utils), el JSX queda igual.
8. El icono `Truck` de phosphor pasa a llamarse `TruckIcon` (renombrado en el import para no chocar con el tipo `Truck` de truckTypes): actualizar sus 2 usos en JSX (`<Truck size={22} ...>` → `<TruckIcon size={22} ...>`).

- [ ] **Step 4: Charts nuevos (modalidad + zona)**

Dentro del grid principal de charts (el `div.grid` que arranca con "Arribos por Mes"), agregar al principio estas dos cards:

```tsx
        {/* Por modalidad */}
        <Card className="animate-in slide-in-from-left duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por Modalidad</CardTitle>
          </CardHeader>
          <CardContent>
            {dataModalidad.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dataModalidad} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {dataModalidad.map((_entry, index) => (
                      <Cell key={`cell-mod-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
            )}
          </CardContent>
        </Card>

        {/* Por zona */}
        <Card className="animate-in slide-in-from-right duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por Zona</CardTitle>
          </CardHeader>
          <CardContent>
            {dataZona.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dataZona} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {dataZona.map((_entry, index) => (
                      <Cell key={`cell-zona-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
            )}
          </CardContent>
        </Card>
```

- [ ] **Step 5: Sección Consolidados**

Antes del cierre del `div` raíz (después de la sección "Analíticas Operativas"), agregar:

```tsx
      {/* Consolidados (camiones) — por año; ocultos si el filtro es FCL/Terrestre */}
      {showConsolidados && consKpis.camiones > 0 && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TruckIcon size={22} className="text-accent" />
              Consolidados
            </h3>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <TruckIcon size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.camiones}</div>
                    <div className="text-xs text-muted-foreground">Camiones Armados</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Cube size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(consKpis.kg / 1000).toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">ton</span></div>
                    <div className="text-xs text-muted-foreground">Peso Transportado</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Warehouse size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.m3.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">m³</span></div>
                    <div className="text-xs text-muted-foreground">Volumen Transportado</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Package size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.cargasPorCamion}</div>
                    <div className="text-xs text-muted-foreground">Cargas por Camión</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Camiones por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                {consPorMes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={consPorMes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="camiones" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} name="Camiones" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Kg por Transportista</CardTitle>
              </CardHeader>
              <CardContent>
                {consTransportistas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={consTransportistas} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="value" fill={CHART_SECONDARY} radius={[0, 4, 4, 0]} name="Kg" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
```

- [ ] **Step 6: Typecheck + tests + build**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: todo verde. Errores típicos a revisar: referencias colgadas a los getters borrados, `Truck` vs `TruckIcon`.

- [ ] **Step 7: Commit**

```bash
git add src/components/AnalyticsDashboard.tsx
git commit -m "feat(analiticas): dashboard multi-modalidad con filtros, consolidados y PDF Mediterranea"
```

---

### Task 10: DashboardEnhanced pasa las props + limpiar exportToPDF

**Files:**
- Modify: `src/components/DashboardEnhanced.tsx:341`
- Modify: `src/lib/exportUtils.ts` (borrar `exportToPDF`, líneas 84–164)

- [ ] **Step 1: Pasar props**

En `src/components/DashboardEnhanced.tsx` línea 341, reemplazar:

```tsx
            <AnalyticsDashboard shipments={shipments || []} />
```

por:

```tsx
            <AnalyticsDashboard
              shipments={shipments || []}
              dbShipments={dbShipments}
              trucks={trucks}
              truckLoads={truckLoads}
            />
```

(`trucks`, `truckLoads` y `dbShipments` ya están en scope con default `[]`.)

- [ ] **Step 2: Borrar exportToPDF**

En `src/lib/exportUtils.ts`, eliminar la función completa `export async function exportToPDF(...)` (líneas 84–164). Su único consumidor era el dashboard viejo (verificado por grep 11/06/2026).

- [ ] **Step 3: Typecheck + tests + build**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: todo verde, sin imports rotos de `exportToPDF`.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardEnhanced.tsx src/lib/exportUtils.ts
git commit -m "feat(analiticas): datos de todas las cargas al dashboard + chau exportToPDF viejo"
```

---

### Task 11: Verificación visual con datos reales

**Files:** ninguno (verificación manual)

- [ ] **Step 1: Levantar dev server**

Run: `npm run dev` (puerto 5000)

- [ ] **Step 2: Verificar en el browser** (Claude in Chrome o Playwright si están conectados; si no, pedirle a Brian)

Checklist:
1. Pestaña Estadísticas carga sin errores en consola.
2. Los chips Modalidad/Zona filtran y los KPIs cambian.
3. Con filtro LCL aparecen cargas (las 105 LCL importadas) — antes no aparecía ninguna.
4. La sección Consolidados aparece si hay camiones en el año.
5. Botón PDF descarga `reporte-mediterranea-2026.pdf` con logo Med, KPIs, tablas resumen y detalle.
6. Botón Excel descarga el CSV con la columna MODO.

- [ ] **Step 3: Resultado**

Si algo falla → systematic-debugging antes de tocar código. Si pasa → seguir.

---

### Task 12: Push + PR

- [ ] **Step 1: Suite completa una vez más**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: verde (obligatorio pre-push según CLAUDE.md del repo).

- [ ] **Step 2: Push**

```bash
git push -u origin feat/analiticas-datos-reales
```

- [ ] **Step 3: Pasarle a Brian el link de la PR**

`https://github.com/MrSuricata/twfnew/pull/new/feat/analiticas-datos-reales`

(Brian mergea — gh CLI no autenticado. NUNCA push a main.)

---

## Notas para el ejecutor

- El comportamiento del filtro de año cambia sutilmente a propósito: el KPI "Cargas" ahora muestra las del período filtrado (antes mostraba `shipments.length` total, un bug menor).
- `buildAnalyticsReport` recibe las operations YA filtradas — no filtra adentro (el dashboard es el dueño del filtro).
- Los consolidados NO se filtran por zona/modalidad (un camión no tiene zona); solo por año, y la sección se oculta con filtro FCL/Terrestre.
- jsPDF y autotable se importan dinámicamente — no agregarlos a imports estáticos del componente.
- `analyticsUtils.test.ts` exporta la factory `op` (la importa `analyticsPdf.test.ts`). Vitest no corre los archivos `.test.ts` importados dos veces — es seguro.
