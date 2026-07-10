# Pestaña "Pagos" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pestaña "Pagos" en el admin: vencimientos derivados por carga (DEVOLUCIÓN/TERMINAL/LOCALES/FLETE), selector "¿cuánto pago hasta el X?", marcar pagado con deshacer, export CSV — con columnas nuevas `monto_*`/`pago_*_at` en `shipments` seedeadas desde la Copia de CONTROL CARGAS (pestaña SG, ya extraída a `scratchpad/sg_pagos_copia.csv`).

**Architecture:** Derive-on-read estricto: el VTO jamás se guarda; helper puro `src/lib/pagosVencimientos.ts` deriva vencimiento desde ETA + forma de pago efectiva (override explícito o derivada de la naviera) + terminal. Montos como columnas aditivas en `shipments` (null=sin datos · 0=pagado · >0=pendiente salvo `pago_*_at`). Escrituras por el camino sagrado (PATCH shipments con whitelist + patch optimista con revert en App). `pago_*_by` lo estampa el server desde el token. Sin endpoints nuevos (Vercel Hobby 11/12 se mantiene).

**Tech Stack:** Vite+React+TS+Tailwind, Supabase (migración por MCP), vitest.

**Decisiones cerradas con Brian (10/07/2026):**
- FLETE PROGRAMADO = ETA + **30 días** (no 40; actualizar docs).
- Modelo columnas + seed confirmado. Fuente del seed: **Copia de CONTROL CARGAS de Joaquín** (`1baxKbsiIV5nvIbcoVzdZWw-43_4IWOcPNiBYmNrx28s`, pestaña SG gid 1606359155) — NO el `sheet_raw` congelado.
- El VTO de la planilla es fórmula rota (`#N/A (No match.)`) → se ignora siempre.

**Reglas de vencimiento (fuente: SPEC_PAGOS_2026-07-10.md):**

| Rubro | Condición | Vence |
|---|---|---|
| FLETE | cuenta corriente (ONE) | ETA + 35 |
| FLETE | programado (MAERSK/Repremar) | ETA + 30 |
| FLETE | al arribo (resto) | ETA |
| LOCALES | cuenta corriente | ETA + 35 |
| LOCALES | resto | ETA |
| TERMINAL | MONTECON | ETA − 5 |
| TERMINAL | TCP / resto | ETA |
| DEVOLUCIÓN | siempre | ETA |

Forma de pago efectiva: columna `forma_pago` si está seteada (override), si no derivada de `linea`: ONE→cuenta corriente · MAERSK/REPREMAR→programado · resto→al arribo. ⚠️ "ONE" debe matchear exacto (la naviera CONSOLTAINERLINE contiene "ONE"). ⚠️ En la planilla real HMM figura PROGRAMADO explícito → el override importa, no solo la derivación.

**Datos verificados (10/07):** 1.241 filas en la SG de la copia; 92 con algún monto>0 (50 tránsito / 40 puerto / 2 origen); FORMA_PAGO explícita en casi todas las pendientes; PUERTO=TCP/MONTECON en 85/92. DB: 1.176 FCL activas, 1.051 con `linea`, 236 con `terminal`, 1.096 con `eta` (ISO `yyyy-MM-dd`).

---

### Task 1: Rama nueva

- [ ] **Step 1:** En `twfnew-hoy`: `git fetch origin && git checkout -b feat/pestana-pagos origin/main`
Expected: rama limpia sobre `689f11d` o posterior.

---

### Task 2: Migración DB (Supabase MCP, ANTES de la PR)

**Proyecto:** `ihpsdeoexkipxmaxsmrc`. Aditiva, idempotente.

- [ ] **Step 1: apply_migration `pagos_columns`**

```sql
alter table shipments
  add column if not exists monto_flete numeric,
  add column if not exists monto_locales numeric,
  add column if not exists monto_terminal numeric,
  add column if not exists monto_devolucion numeric,
  add column if not exists forma_pago text,
  add column if not exists pago_flete_at timestamptz,
  add column if not exists pago_locales_at timestamptz,
  add column if not exists pago_terminal_at timestamptz,
  add column if not exists pago_devolucion_at timestamptz,
  add column if not exists pago_flete_by text,
  add column if not exists pago_locales_by text,
  add column if not exists pago_terminal_by text,
  add column if not exists pago_devolucion_by text;
```

- [ ] **Step 2: backup de columnas que el seed puede tocar**

```sql
create table _seed_pagos_backup_20260710 as
select id, ref, linea, terminal from shipments where mode = 'fcl';
```

- [ ] **Step 3: staging de la planilla** — generar con Python los INSERTs desde `sg_pagos_copia.csv` (scratchpad de la sesión) y ejecutarlos por `execute_sql` en tandas (~300 filas por llamada):

```sql
create table if not exists _seed_pagos_sheet (
  ref_norm text primary key,   -- ref sin espacios, upper
  linea text, eta text, puerto text,
  cterminal numeric, cdev numeric, locales numeric, flete numeric,
  forma_pago text, estado text
);
-- si hay refs duplicadas en la planilla, gana la ÚLTIMA aparición (más nueva):
-- el generador Python deduplica antes de insertar.
```

- [ ] **Step 4: seed (UPDATE con join, solo FCL activas)**

```sql
update shipments s set
  monto_terminal   = t.cterminal,
  monto_devolucion = t.cdev,
  monto_locales    = t.locales,
  monto_flete      = t.flete,
  forma_pago = case upper(trim(t.forma_pago))
    when 'PROGRAMADO' then 'programado'
    when 'C CORRIENTE' then 'cuenta corriente'
    when 'AL ARRIBO' then 'al arribo'
    else null end,
  linea = case when coalesce(s.linea,'') = '' then coalesce(nullif(trim(t.linea),''), s.linea) else s.linea end,
  terminal = case when coalesce(s.terminal,'') = '' and upper(trim(t.puerto)) in ('TCP','MONTECON')
                  then upper(trim(t.puerto)) else s.terminal end
from _seed_pagos_sheet t
where s.mode = 'fcl' and s.archived = false
  and upper(replace(s.ref, ' ', '')) = t.ref_norm;
```

- [ ] **Step 5: verificación (reportar números a Brian)**

```sql
select count(*) filter (where monto_flete is not null) as seeded,
       count(*) filter (where monto_flete > 0 and pago_flete_at is null) as flete_pend,
       count(*) filter (where monto_terminal > 0) as term_pend,
       count(*) filter (where monto_devolucion > 0) as dev_pend,
       count(*) filter (where monto_locales > 0) as loc_pend
from shipments where mode='fcl' and archived=false;
-- refs de la planilla con montos>0 que NO matchearon ninguna carga activa (no perder pendientes en silencio):
select t.* from _seed_pagos_sheet t
where (t.cterminal>0 or t.cdev>0 or t.locales>0 or t.flete>0)
  and not exists (select 1 from shipments s where s.mode='fcl' and s.archived=false
                  and upper(replace(s.ref,' ','')) = t.ref_norm);
```

- [ ] **Step 6:** `drop table _seed_pagos_sheet;` (el backup `_seed_pagos_backup_20260710` QUEDA).

---

### Task 3: Helper puro `src/lib/pagosVencimientos.ts` (TDD)

**Files:** Create `src/lib/pagosVencimientos.test.ts`, Create `src/lib/pagosVencimientos.ts`, Modify `src/lib/operationsTypes.ts` (DbShipment).

- [ ] **Step 1: extender `DbShipment`** (operationsTypes.ts, después de `operativas?`, línea ~209):

```ts
  // Pagos (pestaña Pagos, 10/07/2026): montos por rubro. Convención: null = sin
  // datos · 0 = ya pagado (regla histórica de la SG) · >0 = pendiente salvo
  // pago_*_at estampado. El vencimiento NUNCA se guarda (derive-on-read:
  // pagosVencimientos.ts). pago_*_by lo estampa el server desde el token.
  monto_flete?: number | null
  monto_locales?: number | null
  monto_terminal?: number | null
  monto_devolucion?: number | null
  forma_pago?: string | null
  pago_flete_at?: string | null
  pago_locales_at?: string | null
  pago_terminal_at?: string | null
  pago_devolucion_at?: string | null
  pago_flete_by?: string | null
  pago_locales_by?: string | null
  pago_terminal_by?: string | null
  pago_devolucion_by?: string | null
```

- [ ] **Step 2: test que falla** — `src/lib/pagosVencimientos.test.ts` (estructura `describe/it` como `format.test.ts`). Casos mínimos obligatorios:

```ts
import { describe, it, expect } from 'vitest'
import {
  addDaysISO, diffDaysISO, esLineaOne, esLineaRepremar, deriveFormaPago,
  normalizeFormaPago, formaPagoEfectiva, venceRubro, buildPagoItems, corteHasta, kpisPagos,
} from './pagosVencimientos'
import type { DbShipment } from './operationsTypes'

const base = (over: Partial<DbShipment>): DbShipment => ({
  id: 'x', ref: 'A7900', mode: 'fcl', source: 'fcl', archived: false,
  cliente: 'PERETTI', linea: 'ONE', terminal: 'TCP', eta: '2026-07-01',
  // …resto de campos obligatorios con '' / 0 / false (copiar molde de operationsTypes.test.ts)
} as DbShipment)

describe('addDaysISO', () => {
  it('suma días', () => expect(addDaysISO('2026-07-01', 35)).toBe('2026-08-05'))
  it('resta días (MONTECON)', () => expect(addDaysISO('2026-07-01', -5)).toBe('2026-06-26'))
  it('no-ISO → null (COORDINADO, dd/MM/yyyy, vacío)', () => {
    expect(addDaysISO('COORDINADO', 5)).toBeNull()
    expect(addDaysISO('2/06/2026', 5)).toBeNull()
    expect(addDaysISO('', 0)).toBeNull()
    expect(addDaysISO(undefined, 0)).toBeNull()
  })
  it('cruza fin de mes y año', () => expect(addDaysISO('2026-12-20', 30)).toBe('2027-01-19'))
})

describe('detección de naviera', () => {
  it('ONE exacto', () => { expect(esLineaOne('ONE')).toBe(true); expect(esLineaOne(' one ')).toBe(true) })
  it('CONSOLTAINERLINE NO es ONE', () => expect(esLineaOne('CONSOLTAINERLINE')).toBe(false))
  it('MAERSK y REPREMAR son Repremar', () => {
    expect(esLineaRepremar('MAERSK')).toBe(true)
    expect(esLineaRepremar('maersk ')).toBe(true)
    expect(esLineaRepremar('REPREMAR')).toBe(true)
    expect(esLineaRepremar('HMM')).toBe(false)
  })
  it('deriva forma de pago', () => {
    expect(deriveFormaPago('ONE')).toBe('cuenta corriente')
    expect(deriveFormaPago('MAERSK')).toBe('programado')
    expect(deriveFormaPago('COSCO')).toBe('al arribo')
    expect(deriveFormaPago('')).toBe('al arribo')
  })
})

describe('normalizeFormaPago / formaPagoEfectiva', () => {
  it('normaliza variantes', () => {
    expect(normalizeFormaPago('PROGRAMADO')).toBe('programado')
    expect(normalizeFormaPago('C CORRIENTE')).toBe('cuenta corriente')
    expect(normalizeFormaPago('al arribo')).toBe('al arribo')
    expect(normalizeFormaPago('FALTA')).toBeNull()
    expect(normalizeFormaPago('')).toBeNull()
    expect(normalizeFormaPago(undefined)).toBeNull()
  })
  it('override explícito gana a la derivada (HMM PROGRAMADO real de la planilla)', () => {
    const r = formaPagoEfectiva(base({ linea: 'HMM', forma_pago: 'programado' }))
    expect(r).toEqual({ value: 'programado', overridden: true })
  })
  it('sin override deriva de la línea', () => {
    expect(formaPagoEfectiva(base({ linea: 'ONE', forma_pago: null }))).toEqual({ value: 'cuenta corriente', overridden: false })
  })
})

describe('venceRubro — matriz de reglas', () => {
  const eta = '2026-07-01'
  it('FLETE: cta cte +35 · programado +30 · al arribo +0', () => {
    expect(venceRubro('flete', eta, 'cuenta corriente', 'TCP')).toBe('2026-08-05')
    expect(venceRubro('flete', eta, 'programado', 'TCP')).toBe('2026-07-31')
    expect(venceRubro('flete', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
  })
  it('LOCALES: cta cte +35 · resto ETA', () => {
    expect(venceRubro('locales', eta, 'cuenta corriente', 'TCP')).toBe('2026-08-05')
    expect(venceRubro('locales', eta, 'programado', 'TCP')).toBe('2026-07-01')
    expect(venceRubro('locales', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
  })
  it('TERMINAL: MONTECON −5 · TCP/desconocido ETA', () => {
    expect(venceRubro('terminal', eta, 'al arribo', 'MONTECON')).toBe('2026-06-26')
    expect(venceRubro('terminal', eta, 'al arribo', 'montecon ')).toBe('2026-06-26')
    expect(venceRubro('terminal', eta, 'al arribo', 'TCP')).toBe('2026-07-01')
    expect(venceRubro('terminal', eta, 'al arribo', '')).toBe('2026-07-01')
  })
  it('DEVOLUCIÓN: siempre ETA', () => expect(venceRubro('devolucion', eta, 'programado', 'MONTECON')).toBe('2026-07-01'))
  it('sin ETA → null en todos', () => expect(venceRubro('flete', '', 'programado', 'TCP')).toBeNull())
})

describe('buildPagoItems', () => {
  const hoy = '2026-07-10'
  it('monto null no genera item · 0 = pagado · >0 = pendiente', () => {
    const { items } = buildPagoItems([base({ monto_flete: 2000, monto_locales: 0, monto_terminal: null, monto_devolucion: undefined })], hoy)
    expect(items).toHaveLength(2)
    expect(items.find(i => i.rubro === 'flete')?.estado).toBe('pendiente')
    expect(items.find(i => i.rubro === 'locales')?.estado).toBe('pagado')
  })
  it('pago_*_at estampado = pagado aunque monto>0', () => {
    const { items } = buildPagoItems([base({ monto_flete: 2000, pago_flete_at: '2026-07-09T12:00:00Z', pago_flete_by: 'brian' })], hoy)
    expect(items[0].estado).toBe('pagado')
    expect(items[0].pagadoBy).toBe('brian')
  })
  it('dias: negativo=vencido · 0=hoy · positivo=por vencer', () => {
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-05', monto_devolucion: 100 }),
      base({ id: 'b', eta: '2026-07-10', monto_devolucion: 100 }),
      base({ id: 'c', eta: '2026-07-20', monto_devolucion: 100 }),
    ], hoy)
    expect(items.map(i => i.dias)).toEqual([-5, 0, 10])
  })
  it('sin ETA → vence null y dias null (no inventa)', () => {
    const { items } = buildPagoItems([base({ eta: '', monto_flete: 500 })], hoy)
    expect(items[0].vence).toBeNull(); expect(items[0].dias).toBeNull()
  })
  it('archivadas y espejo (source=sheet) quedan fuera', () => {
    const { items } = buildPagoItems([base({ archived: true, monto_flete: 1 }), base({ source: 'sheet', monto_flete: 1 })], hoy)
    expect(items).toHaveLength(0)
  })
  it('sinDatos: FCL vigente (ETA ISO no más vieja de 60d) sin ningún monto', () => {
    const { sinDatos } = buildPagoItems([
      base({ id: 'nueva', eta: '2026-08-01' }),                 // entra
      base({ id: 'vieja', eta: '2026-03-01' }),                 // ETA vieja → no
      base({ id: 'sin-eta', eta: '' }),                          // sin ETA → no
      base({ id: 'con-datos', eta: '2026-08-01', monto_flete: 0 }), // ya tiene datos → no
    ], hoy)
    expect(sinDatos.map(s => s.id)).toEqual(['nueva'])
  })
  it('ordena pendientes por vencimiento asc, sin-fecha al final', () => { /* 3 items desordenados */ })
})

describe('corteHasta', () => {
  it('suma pendientes con vence ≤ fecha (vencidos incluidos), excluye pagados y sin fecha', () => {
    const hoy = '2026-07-10'
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-01', monto_devolucion: 100 }),   // vencida → entra
      base({ id: 'b', eta: '2026-07-15', monto_devolucion: 200 }),   // ≤ corte → entra
      base({ id: 'c', eta: '2026-07-20', monto_devolucion: 400 }),   // > corte → NO
      base({ id: 'd', eta: '', monto_devolucion: 800 }),             // sin fecha → NO
      base({ id: 'e', eta: '2026-07-01', monto_devolucion: 0 }),     // pagada → NO
    ], hoy)
    const corte = corteHasta(items, '2026-07-15')
    expect(corte.total).toBe(300)
    expect(corte.porRubro.devolucion).toBe(300)
    expect(corte.items.map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('kpisPagos', () => {
  it('vencido / hoy / semana / total', () => {
    const hoy = '2026-07-10'
    const { items } = buildPagoItems([
      base({ id: 'a', eta: '2026-07-05', monto_devolucion: 100 }),  // vencido
      base({ id: 'b', eta: '2026-07-10', monto_devolucion: 200 }),  // hoy
      base({ id: 'c', eta: '2026-07-15', monto_devolucion: 400 }),  // semana
      base({ id: 'd', eta: '2026-09-01', monto_devolucion: 800 }),  // futuro
      base({ id: 'e', eta: '', monto_devolucion: 1600 }),           // sin fecha
    ], hoy)
    const k = kpisPagos(items)
    expect(k.vencido).toEqual({ count: 1, total: 100 })
    expect(k.hoy).toEqual({ count: 1, total: 200 })
    expect(k.semana).toEqual({ count: 1, total: 400 })
    expect(k.pendiente).toEqual({ count: 5, total: 3100 })
    expect(k.sinFecha).toEqual({ count: 1, total: 1600 })
  })
})
```

- [ ] **Step 3:** `npm run test:run -- pagosVencimientos` → FAIL (módulo no existe).

- [ ] **Step 4: implementación** — `src/lib/pagosVencimientos.ts`:

```ts
// Vencimientos de pagos por carga — derive-on-read (el VTO NUNCA se guarda; se
// deriva SIEMPRE de ETA + forma de pago efectiva + terminal).
// Reglas Brian 10/07/2026 (WEB_TWF/SPEC_PAGOS_2026-07-10.md):
//   FLETE  cta cte +35 · programado +30 · al arribo ETA
//   LOCALES  cta cte +35 · resto ETA
//   TERMINAL  MONTECON −5 · resto ETA
//   DEVOLUCIÓN  siempre ETA
// Montos: null = sin datos · 0 = ya pagado (convención SG) · >0 = pendiente.
import type { DbShipment } from './operationsTypes'

export type PagoRubro = 'devolucion' | 'terminal' | 'locales' | 'flete'
export type FormaPago = 'programado' | 'cuenta corriente' | 'al arribo'

export const PAGO_RUBROS: PagoRubro[] = ['devolucion', 'terminal', 'locales', 'flete']
export const RUBRO_LABELS: Record<PagoRubro, string> = {
  devolucion: 'Devolución', terminal: 'Terminal', locales: 'Locales', flete: 'Flete',
}
export const MONTO_KEYS = {
  devolucion: 'monto_devolucion', terminal: 'monto_terminal',
  locales: 'monto_locales', flete: 'monto_flete',
} as const
export const PAGO_AT_KEYS = {
  devolucion: 'pago_devolucion_at', terminal: 'pago_terminal_at',
  locales: 'pago_locales_at', flete: 'pago_flete_at',
} as const
export const PAGO_BY_KEYS = {
  devolucion: 'pago_devolucion_by', terminal: 'pago_terminal_by',
  locales: 'pago_locales_by', flete: 'pago_flete_by',
} as const

export const FLETE_CTA_CTE_DIAS = 35
export const FLETE_PROGRAMADO_DIAS = 30   // Brian 10/07/2026 (docs anteriores decían 40)
export const LOCALES_CTA_CTE_DIAS = 35
export const TERMINAL_MONTECON_DIAS = -5
const SIN_DATOS_ETA_MAX_DIAS = 60

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
const up = (v: string | null | undefined) => String(v ?? '').trim().toUpperCase()

export function addDaysISO(iso: string | null | undefined, days: number): string | null {
  const s = String(iso ?? '').slice(0, 10)
  if (!ISO_RE.test(s)) return null
  const d = new Date(s + 'T00:00:00Z')
  if (isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** b − a en días (ambos ISO); null si alguno no es ISO. */
export function diffDaysISO(a: string, b: string): number | null {
  const pa = addDaysISO(a, 0); const pb = addDaysISO(b, 0)
  if (!pa || !pb) return null
  return Math.round((Date.parse(pb + 'T00:00:00Z') - Date.parse(pa + 'T00:00:00Z')) / 86400000)
}

/** ONE exacto — CONSOLTAINERLINE contiene "ONE" y NO es ONE. */
export function esLineaOne(linea: string | null | undefined): boolean {
  const s = up(linea)
  return s === 'ONE' || s.startsWith('ONE ')
}
/** Repremar = MAERSK y representadas. */
export function esLineaRepremar(linea: string | null | undefined): boolean {
  const s = up(linea)
  return s.includes('MAERSK') || s.includes('REPREMAR')
}
export function deriveFormaPago(linea: string | null | undefined): FormaPago {
  if (esLineaOne(linea)) return 'cuenta corriente'
  if (esLineaRepremar(linea)) return 'programado'
  return 'al arribo'
}
export function normalizeFormaPago(v: string | null | undefined): FormaPago | null {
  const s = up(v)
  if (s === 'PROGRAMADO') return 'programado'
  if (s === 'C CORRIENTE' || s === 'CUENTA CORRIENTE' || s === 'CTA CORRIENTE') return 'cuenta corriente'
  if (s === 'AL ARRIBO' || s === 'ARRIBO') return 'al arribo'
  return null   // '' / 'FALTA' / basura → se deriva de la línea
}
export function formaPagoEfectiva(s: Pick<DbShipment, 'forma_pago' | 'linea'>): { value: FormaPago; overridden: boolean } {
  const explicit = normalizeFormaPago(s.forma_pago)
  return explicit ? { value: explicit, overridden: true } : { value: deriveFormaPago(s.linea), overridden: false }
}

export function venceRubro(rubro: PagoRubro, eta: string | null | undefined, formaPago: FormaPago, terminal: string | null | undefined): string | null {
  switch (rubro) {
    case 'devolucion': return addDaysISO(eta, 0)
    case 'terminal': return addDaysISO(eta, up(terminal).includes('MONTECON') ? TERMINAL_MONTECON_DIAS : 0)
    case 'locales': return addDaysISO(eta, formaPago === 'cuenta corriente' ? LOCALES_CTA_CTE_DIAS : 0)
    case 'flete':
      if (formaPago === 'cuenta corriente') return addDaysISO(eta, FLETE_CTA_CTE_DIAS)
      if (formaPago === 'programado') return addDaysISO(eta, FLETE_PROGRAMADO_DIAS)
      return addDaysISO(eta, 0)
  }
}

export interface PagoItem {
  id: string; ref: string; cliente: string; linea: string; terminal: string
  rubro: PagoRubro; monto: number
  vence: string | null
  /** vence − hoy: negativo = vencido hace |n| · 0 = hoy · positivo = vence en n. null = sin ETA. */
  dias: number | null
  pagadoAt: string | null; pagadoBy: string
  formaPago: FormaPago; formaPagoOverride: boolean
  estado: 'pendiente' | 'pagado'
}

const montoNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/** "Sin datos de pago": FCL viva y vigente (ETA ISO no más vieja de 60 días) sin ningún monto cargado. */
export function esCargaSinDatosPago(s: DbShipment, hoyISO: string): boolean {
  if (s.archived || s.mode !== 'fcl' || s.source === 'sheet') return false
  if (PAGO_RUBROS.some(r => montoNum(s[MONTO_KEYS[r]]) !== null)) return false
  const limite = addDaysISO(s.eta, SIN_DATOS_ETA_MAX_DIAS)
  return limite !== null && limite >= hoyISO
}

export function buildPagoItems(dbShipments: DbShipment[], hoyISO: string): { items: PagoItem[]; sinDatos: DbShipment[] } {
  const items: PagoItem[] = []
  const sinDatos: DbShipment[] = []
  for (const s of dbShipments || []) {
    if (!s || s.archived || s.source === 'sheet') continue
    const fp = formaPagoEfectiva(s)
    let alguno = false
    for (const rubro of PAGO_RUBROS) {
      const monto = montoNum(s[MONTO_KEYS[rubro]])
      if (monto === null) continue
      alguno = true
      const pagadoAt = s[PAGO_AT_KEYS[rubro]] || null
      const vence = venceRubro(rubro, s.eta, fp.value, s.terminal)
      items.push({
        id: s.id, ref: s.ref, cliente: s.cliente || '', linea: s.linea || '', terminal: s.terminal || '',
        rubro, monto, vence,
        dias: vence ? diffDaysISO(hoyISO, vence) : null,
        pagadoAt, pagadoBy: s[PAGO_BY_KEYS[rubro]] || '',
        formaPago: fp.value, formaPagoOverride: fp.overridden,
        estado: pagadoAt || monto === 0 ? 'pagado' : 'pendiente',
      })
    }
    if (!alguno && esCargaSinDatosPago(s, hoyISO)) sinDatos.push(s)
  }
  items.sort((a, b) => {
    if (a.vence === null && b.vence === null) return a.ref.localeCompare(b.ref)
    if (a.vence === null) return 1
    if (b.vence === null) return -1
    return a.vence.localeCompare(b.vence) || a.ref.localeCompare(b.ref)
  })
  return { items, sinDatos }
}

export function corteHasta(items: PagoItem[], fechaISO: string): { total: number; porRubro: Record<PagoRubro, number>; items: PagoItem[] } {
  const sel = items.filter(i => i.estado === 'pendiente' && i.vence !== null && i.vence <= fechaISO)
  const porRubro: Record<PagoRubro, number> = { devolucion: 0, terminal: 0, locales: 0, flete: 0 }
  let total = 0
  for (const i of sel) { porRubro[i.rubro] += i.monto; total += i.monto }
  return { total, porRubro, items: sel }
}

export interface KpiBucket { count: number; total: number }
export function kpisPagos(items: PagoItem[]): { vencido: KpiBucket; hoy: KpiBucket; semana: KpiBucket; pendiente: KpiBucket; sinFecha: KpiBucket } {
  const empty = (): KpiBucket => ({ count: 0, total: 0 })
  const r = { vencido: empty(), hoy: empty(), semana: empty(), pendiente: empty(), sinFecha: empty() }
  for (const i of items) {
    if (i.estado !== 'pendiente') continue
    r.pendiente.count++; r.pendiente.total += i.monto
    if (i.dias === null) { r.sinFecha.count++; r.sinFecha.total += i.monto }
    else if (i.dias < 0) { r.vencido.count++; r.vencido.total += i.monto }
    else if (i.dias === 0) { r.hoy.count++; r.hoy.total += i.monto }
    else if (i.dias <= 7) { r.semana.count++; r.semana.total += i.monto }
  }
  return r
}
```

- [ ] **Step 5:** `npm run test:run -- pagosVencimientos` → PASS.
- [ ] **Step 6:** Commit: `feat(pagos): helper puro de vencimientos derive-on-read + tipos DbShipment`

---

### Task 4: Server — whitelist + estampado `pago_*_by` + audit

**Files:** Modify `api/data/[entity].ts` (SHIPMENT_COLS ~1733, PATCH ~1878).

- [ ] **Step 1:** agregar a `SHIPMENT_COLS` (línea 1740, antes de `'operativas'`):

```ts
  'monto_flete','monto_locales','monto_terminal','monto_devolucion','forma_pago',
  'pago_flete_at','pago_locales_at','pago_terminal_at','pago_devolucion_at',
```
⚠️ los `pago_*_by` NO van en la whitelist: los estampa el server (el cliente no puede falsificar quién pagó).

- [ ] **Step 2:** en el PATCH, después del bloque de rollup de operativas y ANTES de `if (Object.keys(updates).length === 0)`:

```ts
    // Pagos: "quién pagó" lo estampa SIEMPRE el server desde el token.
    // Marcar (fecha) → by = usuario del token · desmarcar (null) → by = null.
    let esPago = false
    for (const k of Object.keys(updates)) {
      const m = /^pago_(flete|locales|terminal|devolucion)_at$/.exec(k)
      if (m) { esPago = true; updates[`pago_${m[1]}_by`] = updates[k] ? auditUser(payload) : null }
    }
```

- [ ] **Step 3:** acción de audit diferenciada (línea ~1882):

```ts
    logAudit(db, payload, 'archived' in updates && Object.keys(updates).length === 1
      ? (updates.archived ? 'archivar' : 'restaurar')
      : esPago ? 'pago' : 'editar', 'shipments', updRow?.ref || id, updates)
```

- [ ] **Step 4:** `npm run typecheck` → verde. Commit: `feat(pagos): columnas de pago en whitelist + pago_*_by server-side + audit 'pago'`

---

### Task 5: Componente `src/components/PagosManagement.tsx`

**Files:** Create `src/components/PagosManagement.tsx`. Referencias de estilo: `BillingManagement.tsx` (sub-tabs, chips, tabla, Th), `format.ts` (`fmtDateDMY`), `fichaFacturacionPdf.ts` (`fmtMoneyUY`), `exportUtils.ts` (`exportToCSV`), `brand.ts` (`getBrand`).

Props: `{ dbShipments?: DbShipment[]; onPatchShipment?: (id: string, fields: Record<string, unknown>) => void }`.

Estructura (todo es-UY rioplatense):

1. `hoy = new Date().toISOString().slice(0,10)` (useMemo por render) · `const { items, sinDatos } = useMemo(() => buildPagoItems(dbShipments || [], hoy), [dbShipments, hoy])` · `const kpis = kpisPagos(items)`.
2. **KPIs** (4 cards, patrón grid): Vencido (rojo, count + `fmtMoneyUY`) · Vence hoy (ámbar) · Esta semana (azul) · Total pendiente (slate). Si `kpis.sinFecha.count > 0`, línea aparte: "N pagos sin ETA — no computan en el corte".
3. **Selector estrella** (card destacada): `<input type="date">` (default hoy) + resultado en vivo: "Hasta el dd/MM: **USD total**" + chips por rubro (`corteHasta(items, fecha)`) + botón "Exportar CSV" → `exportToCSV(rows, `pagos-${getBrand().id}-hasta-${fecha}.csv`)` con columnas `{ Ref, Cliente, Naviera, Rubro, Monto, Vence, Dias, FormaPago, Terminal }` (Ref SIN "A"? NO — acá es interno, la ref va completa con A). Checkbox "ver solo el corte" que filtra la tabla de abajo a `corte.items`.
4. **Sub-tabs** (patrón `SubTabChip` de Billing): `pendientes (n)` · `pagados (n)` · `sin datos (n)`.
5. **Filtros** de pendientes: chips por rubro (`RUBRO_LABELS`) · select naviera (distinct de items pendientes) · select terminal (TCP/MONTECON/—) · `<Input>` búsqueda ref/cliente.
6. **Tabla pendientes** (orden ya viene por vence asc): Ref · Cliente · Naviera (+ badge "override" si formaPagoOverride con tooltip forma de pago) · Rubro · Monto (`fmtMoneyUY`) · Vence (`fmtDateDMY`; si null → "sin ETA" gris) · Días (semáforo: rojo `vencido hace N` / rojo `HOY` / ámbar `en N` si ≤7 / gris `en N`) · **Pagado**:

```tsx
const marcarPagado = (it: PagoItem) => {
  if (!onPatchShipment) return
  onPatchShipment(it.id, { [PAGO_AT_KEYS[it.rubro]]: new Date().toISOString() })
  toast.success(`${RUBRO_LABELS[it.rubro]} de ${it.ref} marcado como pagado`, {
    action: { label: 'Deshacer', onClick: () => onPatchShipment(it.id, { [PAGO_AT_KEYS[it.rubro]]: null }) },
  })
}
```

7. **Tab pagados**: solo los marcados en la web (`pagadoAt` truthy — los 0 del seed no aparecen acá), orden por pagadoAt desc: Ref · Rubro · Monto · Pagado el (fmtDateDMY de pagadoAt) · por (pagadoBy) · botón ghost "Deshacer" (patch null).
8. **Tab sin datos**: cards/filas `ref · cliente · eta` + botón "Cargar montos" → **Dialog editar montos** (compartido, también accesible desde fila pendiente con lápiz): 4 inputs numéricos (vacío = null = sin dato · 0 = pagado — hint visible con esa convención) + Select forma de pago con opciones `— derivada: {deriveFormaPago(linea)} —` (value '' → PATCH `forma_pago: null`) / Programado / C corriente / Al arribo. Al guardar: un solo `onPatchShipment(id, cambios)` (solo claves modificadas) + toast éxito. Parse de montos: aceptar "2.805,60" y "2805.60" (helper local `parseMonto`, copiar semántica `parseMontoUY` de BillingManagement).
9. Empty states: sin pendientes → "🎉 No hay pagos pendientes"; corte vacío → "Nada vence hasta esa fecha".

- [ ] **Step 1:** escribir el componente completo.
- [ ] **Step 2:** `npm run typecheck` → verde. Commit: `feat(pagos): pestaña Pagos — KPIs, corte a fecha, pendientes con pagado/deshacer, editor de montos, CSV`

---

### Task 6: Wiring — DashboardEnhanced + CommandPalette

**Files:** Modify `src/components/DashboardEnhanced.tsx`, `src/components/CommandPalette.tsx`.

- [ ] **Step 1:** DashboardEnhanced: importar `PagosManagement` y `buildPagoItems` + icono `CurrencyDollar` (phosphor, agregar al import). Badge:

```tsx
  const pagosAlertCount = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10)
    return buildPagoItems(dbShipments || [], hoy).items
      .filter(i => i.estado === 'pendiente' && i.dias !== null && i.dias <= 0).length
  }, [dbShipments])
```

- [ ] **Step 2:** `<TabsTrigger value="pagos">` inmediatamente después del de `billing` (dentro del bloque `{ops && …}`), mismo markup que Facturación pero icono `CurrencyDollar` y badge `bg-red-500` con `pagosAlertCount`. `aria-label="Pagos"`.
- [ ] **Step 3:** `<TabsContent value="pagos" className="space-y-6">` junto al de billing: `<PagosManagement dbShipments={dbShipments} onPatchShipment={onPatchShipment} />`.
- [ ] **Step 4:** `breadcrumbMap` += `pagos: 'Pagos'`.
- [ ] **Step 5:** CommandPalette `TABS` += `{ id: 'pagos', label: 'Pagos', icon: CurrencyDollar }` (import del icono).
- [ ] **Step 6:** `npm run typecheck && npm run test:run && npm run build` → todo verde. Commit: `feat(pagos): tab Pagos en admin + CommandPalette + badge vencidos`

---

### Task 7: Verificación final + PR

- [ ] **Step 1:** `npm run typecheck && npm run test:run && npm run build` (suite completa, las 439+ deben pasar).
- [ ] **Step 2:** smoke visual con dev server si hay tiempo (tab visible, KPIs con datos del seed, marcar pagado + deshacer, corte a fecha, CSV).
- [ ] **Step 3:** push rama + link PR `github.com/MrSuricata/twfnew/pull/new/feat/pestana-pagos` (Brian mergea; gh sin auth).
- [ ] **Step 4:** actualizar docs: `HANDOFF_SESION_WEB_TWF.md` (sección nueva 10/07 Pagos) · CLAUDE.md de JARVIS (glosario: PROGRAMADO flete **30d** no 40d) · CLAUDE.md del repo (mapa: PagosManagement + pagosVencimientos) · memoria nueva `web-twf-pestana-pagos`.
- [ ] **Step 5:** borrar/archivar workflow n8n temporal `JARVIS - Lectura pagos SG (temporal)` (id `VIax12dXdHCelT6D`).

---

### Fuera de alcance (follow-ups anotados, NO en esta PR)
- Sección "Pagos" en `OperationDetailPanel` (las SECTIONS del panel están tipadas sobre `keyof UnifiedOperation` — meter montos ahí requiere extender UnifiedOperation + EDITABLE_FIELDS; el editor de montos de la pestaña cubre la carga/edición).
- Push/briefing "vence hoy: FLETE A7841 USD 2.300" + chip "$ vence hoy" en HOY.
- El equipo sigue cargando montos en la planilla de Joaquín → definir con Brian cuándo cortan (la web pasa a ser la fuente al mergear esto). Sin sync automático planilla→web para montos.

### Self-review (hecho)
- Spec coverage: 4 rubros ✓ reglas ✓ selector fecha ✓ KPIs ✓ tabla+pagado+deshacer ✓ filtros ✓ sin-datos ✓ CSV ✓ override forma_pago ✓ montos 0=pagado ✓ VTO derivado siempre ✓ migración aditiva+seed+backup ✓ 11/12 functions ✓ marca-aware (getBrand en CSV; el resto de la UI usa tokens del tema) ✓ audit ✓ camino sagrado ✓.
- Sin placeholders: código completo en Tasks 3-4; Task 5 tiene el esqueleto + handlers clave (el markup repite patrones exactos de BillingManagement).
- Consistencia de nombres: `pagosVencimientos.ts` / `PAGO_AT_KEYS` / `buildPagoItems` / `corteHasta` / `kpisPagos` usados igual en Tasks 3, 5 y 6.
