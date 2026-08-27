# Digest de Cargas a Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mail HTML automático lunes y jueves 09:00 UY a cada cliente con `digest_active`, con sus cargas activas vía Montevideo, en modo sombra (todo a Brian) hasta validar.

**Architecture:** La webapp expone `GET /api/data/client-digest` (auth admin) que devuelve por cliente sus cargas activas vía UY con shape seguro del portal + estado derivado server-side (espejo slim de `getShipmentStatus`). Un workflow n8n nuevo ("MED - Aviso Clientes") lo consume, arma un mail HTML por cliente + resumen a Brian, y manda por Gmail. Spec: `docs/superpowers/specs/2026-08-27-digest-clientes-design.md`.

**Tech Stack:** Vercel functions TS + Supabase (tabla `clients` existente, 2 columnas nuevas) · vitest · React (ClientManager) · n8n (create_workflow_from_code vía MCP).

**Convenciones del repo que aplican:** `api/` NO importa de `src/` (espejos con nota "mantener en sync") · migraciones aditivas directo en Supabase ANTES de la PR · branch `feat/digest-clientes` ya creada, spec committeada · obligatorio `npm run typecheck && npm run test:run && npm run build` antes de push · commits en español rioplatense.

---

### Task 1: Migración DB (Supabase MCP, proyecto `ihpsdeoexkipxmaxsmrc`)

**Files:** ninguno (DB remota).

- [ ] **Step 1: Aplicar migración aditiva**

Vía MCP `apply_migration`, nombre `digest_clientes_columns`:

```sql
alter table clients add column if not exists digest_active boolean not null default false;
alter table clients add column if not exists digest_emails text not null default '';
```

- [ ] **Step 2: Verificar**

Vía MCP `execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'clients' and column_name like 'digest%';
```

Esperado: 2 filas (`digest_active` boolean default false, `digest_emails` text default '').

---

### Task 2: Módulo `api/_lib/clientDigest.ts` — helpers puros (TDD)

**Files:**
- Create: `api/_lib/clientDigest.ts`
- Test: `src/lib/clientDigest.api.test.ts` (convención: los tests de api/_lib viven en src/lib como `clientShipments.api.test.ts`, importan con ruta relativa `../../api/_lib/...`)

- [ ] **Step 1: Escribir tests que fallan**

`src/lib/clientDigest.api.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseFechaDigest, deriveEstadoDigest, effectiveClientePattern,
  refSinA, esViaMontevideo, emailsDigest, buildClientDigest,
} from '../../api/_lib/clientDigest'

const HOY = '2026-08-27'

describe('parseFechaDigest', () => {
  it('ISO, dd/mm/yyyy y dd-mmm; basura → null', () => {
    expect(parseFechaDigest('2026-09-05')).toBe('2026-09-05')
    expect(parseFechaDigest('2026-09-05T00:00:00Z')).toBe('2026-09-05')
    expect(parseFechaDigest('05/09/2026')).toBe('2026-09-05')
    expect(parseFechaDigest('5-sep')).toBe('2026-09-05')
    expect(parseFechaDigest('CONFIRMAR')).toBe(null)
    expect(parseFechaDigest('')).toBe(null)
  })
})

describe('refSinA', () => {
  it('quita la A inicial (regla emails con clientes), conserva splits', () => {
    expect(refSinA('A7620')).toBe('7620')
    expect(refSinA('A7611 B')).toBe('7611 B')
    expect(refSinA('7620')).toBe('7620')
  })
})

describe('esViaMontevideo', () => {
  it('solo dest_country UY (case-insensitive); CL/AR/vacío afuera', () => {
    expect(esViaMontevideo({ dest_country: 'UY' })).toBe(true)
    expect(esViaMontevideo({ dest_country: 'uy ' })).toBe(true)
    expect(esViaMontevideo({ dest_country: 'CL' })).toBe(false)
    expect(esViaMontevideo({ dest_country: 'AR' })).toBe(false)
    expect(esViaMontevideo({ dest_country: '' })).toBe(false)
    expect(esViaMontevideo({})).toBe(false)
  })
})

describe('effectiveClientePattern (espejo admin-login)', () => {
  it('guardado gana; si no, derivado de name+aliases con tokens ≥4', () => {
    expect(effectiveClientePattern({ name: 'X', cliente_pattern: 'CHIAPERO' })).toBe('CHIAPERO')
    expect(effectiveClientePattern({ name: 'RDM - ABEA S.A.', aliases: 'RDM - ABEA' }))
      .toBe('RDM - ABEA S.A.,RDM - ABEA')
    expect(effectiveClientePattern({ name: 'AIT' })).toBe('')
  })
})

describe('emailsDigest', () => {
  it('digest_emails > email principal > vacío', () => {
    expect(emailsDigest({ digest_emails: 'a@x.com, b@x.com', email: 'c@x.com' })).toBe('a@x.com, b@x.com')
    expect(emailsDigest({ digest_emails: '', email: 'c@x.com' })).toBe('c@x.com')
    expect(emailsDigest({ digest_emails: '', email: '' })).toBe('')
  })
})

describe('deriveEstadoDigest (espejo slim de getShipmentStatus)', () => {
  const conOp = (op: Record<string, unknown>, eta = '2026-08-20') =>
    ({ ETA: eta, operativas: [{ SALIDA: '', ETA_FISC: '', ...op }] }) as any
  it('ETA futura → en viaje', () => {
    expect(deriveEstadoDigest({ ETA: '2026-09-05', operativas: [] } as any, HOY).code).toBe('en_transito')
  })
  it('arribada sin salida → en puerto', () => {
    expect(deriveEstadoDigest(conOp({}), HOY).code).toBe('en_puerto')
  })
  it('salida futura → salida programada con fecha', () => {
    const e = deriveEstadoDigest(conOp({ SALIDA: '2026-08-29' }), HOY)
    expect(e.code).toBe('salida_programada')
    expect(e.fecha).toBe('2026-08-29')
  })
  it('salida hoy → sale hoy', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: HOY }), HOY).code).toBe('salio_montevideo')
  })
  it('salida pasada sin fiscal → en frontera', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: '2026-08-25' }), HOY).code).toBe('en_frontera')
  })
  it('salida y fiscal pasados → en fiscal', () => {
    expect(deriveEstadoDigest(conOp({ SALIDA: '2026-08-20', ETA_FISC: '2026-08-26' }), HOY).code).toBe('llego_fiscal')
  })
  it('sin operativas y ETA pasada → en puerto', () => {
    expect(deriveEstadoDigest({ ETA: '2026-08-20', operativas: [] } as any, HOY).code).toBe('en_puerto')
  })
})

describe('buildClientDigest', () => {
  const clientes = [
    { name: 'CHIAPERO Y ASOC. S.R.L.', company: '', email: 'chiapero@x.com', aliases: '', cliente_pattern: 'CHIAPERO', digest_active: true, digest_emails: '' },
    { name: 'RDM - ABEA S.A.', company: 'Abea', email: '', aliases: 'RDM - ABEA', cliente_pattern: '', digest_active: true, digest_emails: '' },
  ]
  const filas = [
    { ref: 'A7620', cliente: 'CHIAPERO Y ASOC. S.R.L.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-09-05', eta_fiscal: '', dest_country: 'UY', buque: 'MSC ALTAIR', contenedor: 'MSCU1234567', flete: 99999, operativas: [] },
    { ref: 'A7621', cliente: 'CHIAPERO Y ASOC SRL', archived: false, source: 'web', mode: 'fcl', eta: '2026-09-01', eta_fiscal: '', dest_country: 'CL', operativas: [] },
    { ref: 'A7622', cliente: 'RDM - ABEA S.A.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-08-20', eta_fiscal: '', dest_country: 'UY', operativas: [{ SALIDA: '2026-08-29', ETA_FISC: '', DESCARGA: '' }] },
    { ref: 'A7623', cliente: 'OTRO CLIENTE S.A.', archived: false, source: 'fcl', mode: 'fcl', eta: '2026-09-02', eta_fiscal: '', dest_country: 'UY', operativas: [] },
  ]
  const digest = buildClientDigest(clientes as any, filas as any, HOY)

  it('agrupa por patrón, filtra vía UY, ignora otros clientes', () => {
    const chiapero = digest.clients.find(c => c.name.includes('CHIAPERO'))!
    expect(chiapero.cargas.map(c => c.REF)).toEqual(['7620'])   // la 7621 es vía CL
    const abea = digest.clients.find(c => c.name.includes('ABEA'))!
    expect(abea.cargas).toHaveLength(1)
    expect(abea.cargas[0].estado.code).toBe('salida_programada')
  })
  it('REF sin A y sin nombre de cliente en las cargas', () => {
    const todas = digest.clients.flatMap(c => c.cargas)
    expect(todas.every(c => !c.REF.startsWith('A'))).toBe(true)
  })
  it('JAMÁS viaja un campo financiero', () => {
    const json = JSON.stringify(digest)
    expect(json).not.toContain('99999')
    expect(json.toLowerCase()).not.toContain('flete')
  })
  it('emails con fallback y flag sinEmail', () => {
    expect(digest.clients.find(c => c.name.includes('CHIAPERO'))!.emails).toBe('chiapero@x.com')
    expect(digest.clients.find(c => c.name.includes('ABEA'))!.sinEmail).toBe(true)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/clientDigest.api.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `api/_lib/clientDigest.ts`**

```ts
// ── Digest de cargas para clientes (spec 2026-08-27) ─────────────────────
// Arma el JSON que consume el workflow n8n "MED - Aviso Clientes": por cada
// cliente con digest_active, sus cargas ACTIVAS vía Montevideo con el shape
// seguro del portal + un estado derivado server-side.
// Seguridad: reusa CLIENT_SHIPMENT_COLS / esCargaDeClienteActiva /
// rowToClientShipment (los montos no viajan; CLIENTE va vacío).

import { matchesClientePattern } from './csvParser.js'
import { esCargaDeClienteActiva, rowToClientShipment } from './clientShipments.js'

const txt = (v: unknown): string => String(v ?? '').trim()

export interface EstadoDigest { code: string; label: string; emoji: string; orden: number; fecha: string }
export interface CargaDigest {
  REF: string; CLIENT_REF: string; CNTR: string; BUQUE: string
  ETA: string; SALIDA: string; ETA_FISC: string; FISCAL: string
  DESCRIPCION: string; PKGS: number; KG: number; M3: number
  estado: EstadoDigest
}
export interface ClienteDigest {
  name: string; displayName: string; emails: string; sinEmail: boolean; cargas: CargaDigest[]
}

const MESES: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11 }

/** Fecha en cualquiera de los formatos que trae la data (ISO, dd/mm/yyyy, dd-mmm) → 'yyyy-mm-dd' o null. */
export function parseFechaDigest(input: unknown): string | null {
  const s = txt(input)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})-([a-záéíóú]{3})/i)
  if (m) {
    const mes = MESES[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)]
    if (mes !== undefined) return `${new Date().getFullYear()}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  return null
}

/** REF para el cliente: sin la A inicial (regla de emails con clientes). */
export function refSinA(ref: unknown): string {
  return txt(ref).replace(/^A(?=\d)/, '')
}

/** Vía Montevideo = país de la operación UY (verificado en prod: CL=San Antonio/Valpo, AR=BsAs). */
export function esViaMontevideo(row: { dest_country?: string | null }): boolean {
  return txt(row.dest_country).toUpperCase() === 'UY'
}

/** Espejo de effectiveClientePattern en api/auth/admin-login.ts — mantener en sync. */
export function effectiveClientePattern(client: { name?: string; aliases?: string | null; cliente_pattern?: string | null }): string {
  const stored = (client.cliente_pattern || '').trim()
  if (stored) return stored
  const parts = [String(client.name || '').replace(/,/g, ' '), ...String(client.aliases || '').split(',')]
    .map(p => p.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter(p => p.length >= 4)
  return Array.from(new Set(parts)).join(',')
}

/** Destinatarios del digest: digest_emails, si no el email principal del cliente. */
export function emailsDigest(client: { digest_emails?: string | null; email?: string | null }): string {
  return txt(client.digest_emails) || txt(client.email)
}

const reached = (d: unknown, hoyISO: string): boolean => {
  const n = parseFechaDigest(d)
  return !!n && n <= hoyISO
}

/**
 * Estado de una carga PARA EL CLIENTE. Espejo SIMPLIFICADO del subset de
 * getShipmentStatus (src/lib/shipmentTypes.ts) que el digest necesita —
 * mantener en sync si cambian las reglas de estado del portal.
 * `parsed` es la salida de rowToClientShipment (shape ParsedShipment).
 */
export function deriveEstadoDigest(
  parsed: { ETA?: string; operativas?: Array<{ SALIDA?: string; ETA_FISC?: string }> },
  hoyISO: string,
): EstadoDigest {
  const ops = parsed.operativas || []
  const eta = parseFechaDigest(parsed.ETA)
  if (!eta || eta > hoyISO) {
    return { code: 'en_transito', label: 'En viaje a Montevideo', emoji: '🚢', orden: 1, fecha: eta || '' }
  }
  const allFiscal = ops.length > 0 && ops.every(o => reached(o.SALIDA, hoyISO) && reached(o.ETA_FISC, hoyISO))
  if (allFiscal) {
    return { code: 'llego_fiscal', label: 'En depósito fiscal', emoji: '📦', orden: 5, fecha: parseFechaDigest(ops.find(o => o.ETA_FISC)?.ETA_FISC) || '' }
  }
  const allSalieron = ops.length > 0 && ops.every(o => reached(o.SALIDA, hoyISO))
  if (allSalieron) {
    const hoySale = ops.some(o => parseFechaDigest(o.SALIDA) === hoyISO)
    if (hoySale) return { code: 'salio_montevideo', label: 'Cargando — sale hoy', emoji: '🚛', orden: 3, fecha: hoyISO }
    return { code: 'en_frontera', label: 'En viaje al depósito fiscal', emoji: '🛃', orden: 4, fecha: parseFechaDigest(ops.find(o => o.SALIDA)?.SALIDA) || '' }
  }
  const salidasFuturas = ops.map(o => parseFechaDigest(o.SALIDA)).filter((d): d is string => !!d && d > hoyISO).sort()
  if (salidasFuturas.length > 0) {
    return { code: 'salida_programada', label: 'Salida programada', emoji: '🚛', orden: 3, fecha: salidasFuturas[0] }
  }
  return { code: 'en_puerto', label: 'Arribada a Montevideo', emoji: '⚓', orden: 2, fecha: eta }
}

type Row = Record<string, unknown>

/** Núcleo del endpoint: clientes digest_active + filas de shipments → digest listo para n8n. */
export function buildClientDigest(
  clients: Array<Row>,
  shipmentRows: Array<Row>,
  hoyISO: string,
): { generatedAt: string; clients: ClienteDigest[] } {
  const out: ClienteDigest[] = []
  for (const c of clients) {
    const pattern = effectiveClientePattern(c as { name?: string; aliases?: string | null; cliente_pattern?: string | null })
    const emails = emailsDigest(c as { digest_emails?: string | null; email?: string | null })
    const cargas: CargaDigest[] = []
    for (const row of shipmentRows) {
      if (!pattern || !matchesClientePattern(txt(row.cliente), pattern)) continue
      if (!esCargaDeClienteActiva(row as { archived?: boolean; source?: string; eta?: string; eta_fiscal?: string }, hoyISO)) continue
      if (!esViaMontevideo(row as { dest_country?: string })) continue
      const parsed = rowToClientShipment(row) as Record<string, unknown> & { operativas: Array<{ SALIDA?: string; ETA_FISC?: string; FISCAL?: string; DESCRIPCION?: string }> }
      const estado = deriveEstadoDigest(parsed as { ETA?: string; operativas?: Array<{ SALIDA?: string; ETA_FISC?: string }> }, hoyISO)
      const ops = parsed.operativas || []
      cargas.push({
        REF: refSinA(parsed.REF), CLIENT_REF: txt(parsed.CLIENT_REF),
        CNTR: txt(parsed.CNTR), BUQUE: txt(parsed.BUQUE),
        ETA: txt(parsed.ETA), SALIDA: txt(ops.find(o => o.SALIDA)?.SALIDA),
        ETA_FISC: txt(ops.find(o => o.ETA_FISC)?.ETA_FISC), FISCAL: txt(ops.find(o => o.FISCAL)?.FISCAL),
        DESCRIPCION: txt(ops.find(o => o.DESCRIPCION)?.DESCRIPCION),
        PKGS: Number(parsed.calculatedN ? (parsed as Row).PKGS ?? 0 : (parsed as Row).PKGS ?? 0) || 0,
        KG: Number((parsed as Row).KG ?? 0) || 0, M3: Number((parsed as Row).M3 ?? 0) || 0,
        estado,
      })
    }
    cargas.sort((a, b) => (a.estado.orden - b.estado.orden) || a.ETA.localeCompare(b.ETA))
    out.push({
      name: txt(c.name),
      displayName: txt(c.company) || txt(c.name),
      emails, sinEmail: !emails,
      cargas,
    })
  }
  return { generatedAt: new Date().toISOString(), clients: out }
}
```

Nota PKGS/KG/M3: `rowToClientShipment` NO expone pkgs/kg/m3 a nivel shipment (los pone en cada operativa). Si el `Number(...)` de arriba da 0 con datos reales, sumar desde `parsed.operativas` (`ops.reduce((a, o) => a + (Number(o.PKGS) || 0), 0)` y análogos KG/M3) — el test de buildClientDigest no fija estos tres campos, decidirlo al implementar mirando el shape real.

- [ ] **Step 4: Correr tests hasta verde**

Run: `npx vitest run src/lib/clientDigest.api.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/clientDigest.ts src/lib/clientDigest.api.test.ts
git commit -m "Digest clientes: helpers puros (estado, vía UY, patrón, emails) con tests"
```

---

### Task 3: Endpoint `GET /api/data/client-digest`

**Files:**
- Modify: `api/data/[entity].ts` — import arriba (junto a los de `../_lib/`), case nuevo en el switch (~línea 104, después de `case 'clients'`), handler nuevo al final de la sección Clients (~línea 385+).

- [ ] **Step 1: Import + case**

```ts
// junto a los imports de _lib:
import { buildClientDigest } from '../_lib/clientDigest.js'
import { CLIENT_SHIPMENT_COLS } from '../_lib/clientShipments.js'

// en el switch:
      case 'client-digest':
        return handleClientDigest(req, res, db)
```

(Si `CLIENT_SHIPMENT_COLS` ya está importado para otro handler, no duplicar el import.)

- [ ] **Step 2: Handler (GET only)**

```ts
// ── Client digest (workflow n8n "MED - Aviso Clientes") ─────────────
// Solo lectura. Devuelve por cliente digest_active sus cargas activas vía
// Montevideo con shape seguro + estado. La lógica vive en _lib/clientDigest.
async function handleClientDigest(req: VercelRequest, res: VercelResponse, db: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const { data: clients, error } = await db
    .from('clients')
    .select('id, name, company, email, aliases, cliente_pattern, digest_active, digest_emails')
    .eq('digest_active', true)
  if (error) throw error
  if (!clients?.length) return res.status(200).json({ generatedAt: new Date().toISOString(), clients: [] })
  const { data: rows, error: e2 } = await db
    .from('shipments')
    .select(CLIENT_SHIPMENT_COLS)
    .eq('archived', false)
    .neq('source', 'sheet')
  if (e2) throw e2
  const hoyISO = new Date().toISOString().slice(0, 10) // corre 09:00 UY = 12:00 UTC, mismo día
  return res.status(200).json(buildClientDigest(clients, rows || [], hoyISO))
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "api/data/[entity].ts"
git commit -m "Digest clientes: endpoint GET /api/data/client-digest (auth admin)"
```

---

### Task 4: Campos digest en la API de clients

**Files:**
- Modify: `api/_lib/schemas.ts:49-67` (ClientRowSchema)
- Modify: `api/data/[entity].ts:396-427` (handleClients GET map + POST row build)

- [ ] **Step 1: Schema — agregar dentro de `ClientRowSchema` (antes del cierre `})`)**

```ts
  digestActive: z.boolean().optional(),
  digest_active: z.boolean().optional(),
  digestEmails: optTrimmed(1000),
  digest_emails: optTrimmed(1000),
```

- [ ] **Step 2: GET — en el `.map()` de handleClients agregar**

```ts
      digestActive: !!c.digest_active,
      digestEmails: c.digest_emails || '',
```

- [ ] **Step 3: POST — en `rows.map()` agregar (spread condicional: un POST viejo sin los campos NO resetea lo guardado)**

```ts
      ...(c.digestActive !== undefined || c.digest_active !== undefined
        ? { digest_active: c.digestActive ?? c.digest_active ?? false }
        : {}),
      ...(c.digestEmails !== undefined || c.digest_emails !== undefined
        ? { digest_emails: (c.digestEmails ?? c.digest_emails ?? '').trim() }
        : {}),
```

- [ ] **Step 4: Typecheck + tests + commit**

Run: `npm run typecheck && npm run test:run`
Expected: verde.

```bash
git add api/_lib/schemas.ts "api/data/[entity].ts"
git commit -m "Digest clientes: digest_active/digest_emails en la API de clients"
```

---

### Task 5: Frontend — toggle y emails en ClientManager

**Files:**
- Modify: `src/lib/quotationTypes.ts:39` (interface ClientAccount)
- Modify: `src/lib/dataClient.ts:276-293` (fetchClients)
- Modify: `src/components/ClientManager.tsx` (form state ~79-96, carga del form ~207-220, guardado ~270-276, UI del form después del bloque Aliases ~línea 645, badge en la card de la lista ~486)

- [ ] **Step 1: Tipos — en `ClientAccount` agregar campos opcionales**

```ts
  digestActive?: boolean
  digestEmails?: string
```

- [ ] **Step 2: fetchClients — agregar al `.map()`**

```ts
    digestActive: !!c.digestActive,
    digestEmails: c.digestEmails ?? '',
```

- [ ] **Step 3: ClientManager — form state**

En la interface del form y en `DEFAULT_FORM`:

```ts
  digestActive: boolean   // interface
  digestEmails: string
  // DEFAULT_FORM:
  digestActive: false,
  digestEmails: '',
```

Al cargar un cliente al form (donde se setean razonSocial/aliases, ~línea 210):

```ts
      digestActive: client.digestActive ?? false,
      digestEmails: client.digestEmails || '',
```

En el objeto que arma `handleSave` (~línea 270, junto a aliases/clientePattern):

```ts
        digestActive: form.digestActive,
        digestEmails: form.digestEmails.split(',').map(e => e.trim()).filter(Boolean).join(', '),
```

- [ ] **Step 4: UI del form** — después del bloque Aliases (~línea 645), antes de "Avanzado":

```tsx
            {/* Digest lunes/jueves (spec 2026-08-27) */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5 pr-3">
                <Label htmlFor="client-digest-active">📬 Digest lunes/jueves</Label>
                <p className="text-xs text-muted-foreground">Mail automático con el estado de sus cargas vía Montevideo</p>
              </div>
              <Switch
                id="client-digest-active"
                checked={form.digestActive}
                onCheckedChange={v => setForm(prev => ({ ...prev, digestActive: v }))}
              />
            </div>
            {form.digestActive && (
              <div className="grid gap-2">
                <Label htmlFor="client-digest-emails">Emails para el digest</Label>
                <Input
                  id="client-digest-emails"
                  value={form.digestEmails}
                  onChange={e => setForm(prev => ({ ...prev, digestEmails: e.target.value }))}
                  placeholder="Separados por coma — si queda vacío usa el email principal"
                />
              </div>
            )}
```

(`Switch`, `Label`, `Input` ya están importados en el archivo.)

- [ ] **Step 5: Badge en la lista** — en la card del cliente (~línea 486), junto al nombre:

```tsx
              {client.digestActive && <span title="Recibe el digest lunes/jueves">📬</span>}
```

- [ ] **Step 6: Gates + commit**

Run: `npm run typecheck && npm run test:run && npm run build`
Expected: todo verde.

```bash
git add src/lib/quotationTypes.ts src/lib/dataClient.ts src/components/ClientManager.tsx
git commit -m "Digest clientes: toggle + emails en el gestor de clientes"
```

---

### Task 6: Push + PR

- [ ] **Step 1: Push**

```bash
git push -u origin feat/digest-clientes
```

- [ ] **Step 2: Pasar a Brian el link de PR** (gh CLI no autenticado — regla del repo):
`https://github.com/MrSuricata/twfnew/pull/new/feat/digest-clientes`

---

### Task 7: Activar CHIAPERO y ABEA (sombra) — tras el merge/deploy

- [ ] **Step 1: Marcar digest_active** (vía MCP `execute_sql`; la UI queda para el día a día):

```sql
update clients set digest_active = true
where name in ('CHIAPERO Y ASOC. S.R.L.', 'RDM - ABEA S.A.');
```

Esperado: 2 filas afectadas.

- [ ] **Step 2: Probar el endpoint desplegado** (mismo login que usa n8n): GET
`https://mediterraneacarghas.vercel.app/api/data/client-digest` con Bearer del admin-login.
Esperado: JSON con 2 clientes y cargas de cada uno (ABEA con `sinEmail: true`).

---

### Task 8: Workflow n8n "MED - Aviso Clientes"

**Preparación (obligatoria por el server MCP de n8n):** `get_workflow_sdk_reference` + `get_workflow_best_practices` (técnica "scheduling") + `search_nodes`/`get_node_types` para `scheduleTrigger`, `httpRequest`, `code`, `gmail`. Credencial Gmail: la misma de los nodos MAIL de "Prevision Operativa MED - v2" (id `txuZ9eCOg4TpAmZu`, sacarla con `get_workflow_details` full). Timezone: mirar `settings.timezone` de ese workflow; sus crons están en UTC (8/13/16 UTC = 5/10/13 UY) → usar cron `0 12 * * 1,4` (= lun y jue 09:00 UY) salvo que el instance tenga timezone América/Montevideo.

**Nodos y flujo:**

```
SCHEDULE (lun/jue 09:00 UY) → LOGIN_WEBAPP (POST /api/auth/admin-login, igual a Previsión)
→ TOMA_DIGEST (GET /api/data/client-digest, Bearer {{ $json.token }})
→ ARMA_MAILS (code) → MAIL_CLIENTE (gmail, sendTo={{ $json.to }}, subject={{ $json.subject }}, message={{ $json.html }}, appendAttribution:false)
ARMA_MAILS → (2ª salida vía item con flag) RESUMEN_BRIAN (code) → MAIL_RESUMEN (gmail a bridvanovich@twf.uy)
```

Más simple: ARMA_MAILS emite N items de cliente + 1 item resumen con `esResumen: true`; un nodo IF los separa hacia MAIL_CLIENTE / MAIL_RESUMEN.

- [ ] **Step 1: Crear workflow inactivo** con `create_workflow_from_code`. Código del nodo ARMA_MAILS:

```js
// =======================================
// DIGEST CLIENTES — arma un mail por cliente + resumen a Brian
// TEST_MODE=true (SOMBRA): todo va a Brian con asunto [SOMBRA – cliente]
// =======================================
const TEST_MODE = true;
const BRIAN = 'bridvanovich@twf.uy';
const PORTAL_URL = 'https://mediterraneacarghas.vercel.app/portal';

const data = $input.first().json;
const clientes = data.clients || [];

const AZUL_CLARO = '#DBEAFE', AZUL_BORDE = '#93C5FD', NARANJA_CLARO = '#FFEDD5', NARANJA_BORDE = '#FDBA74';
const baseCell = 'padding:6px 9px;border-bottom:1px solid #e5e5ea;font-size:12px;';
const headCell = 'padding:8px 9px;background:' + AZUL_CLARO + ';border-bottom:2px solid ' + AZUL_BORDE + ';font-size:11px;font-weight:700;text-align:left;';

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3] + '/' + m[2]) : String(iso);
};
const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const hoy = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Montevideo' });

const out = [];
const resumen = [];

for (const cli of clientes) {
  const cargas = cli.cargas || [];
  if (!cargas.length) { resumen.push('⚪ ' + cli.name + ': sin cargas activas vía MVD — no se manda'); continue; }
  if (!TEST_MODE && cli.sinEmail) { resumen.push('🔴 ' + cli.name + ': SIN EMAIL cargado — no se manda (' + cargas.length + ' cargas)'); continue; }

  // Agrupar por estado (vienen ordenadas por orden de viaje desde el server)
  const grupos = {};
  for (const c of cargas) {
    const k = c.estado.orden + '|' + c.estado.emoji + ' ' + c.estado.label;
    (grupos[k] = grupos[k] || []).push(c);
  }

  let cuerpo = '';
  for (const k of Object.keys(grupos).sort()) {
    const titulo = k.split('|')[1];
    const filas = grupos[k];
    cuerpo += '<tr><td colspan="9" style="padding:10px 9px;background:' + NARANJA_CLARO + ';font-weight:800;border-top:2px solid ' + NARANJA_BORDE + ';font-size:13px;">' + titulo + ' (' + filas.length + ')</td></tr>';
    for (const c of filas) {
      cuerpo += '<tr>'
        + '<td style="' + baseCell + 'font-weight:700;">' + esc(c.REF) + (c.CLIENT_REF ? '<br><span style="color:#888;font-size:10px;">Su ref: ' + esc(c.CLIENT_REF) + '</span>' : '') + '</td>'
        + '<td style="' + baseCell + 'font-size:11px;">' + esc(c.CNTR) + '</td>'
        + '<td style="' + baseCell + '">' + esc(c.BUQUE) + '</td>'
        + '<td style="' + baseCell + 'text-align:center;">' + fmtFecha(c.ETA) + '</td>'
        + '<td style="' + baseCell + 'text-align:center;">' + fmtFecha(c.estado.code === 'salida_programada' || c.estado.code === 'en_frontera' || c.estado.code === 'salio_montevideo' ? (c.SALIDA || c.estado.fecha) : c.SALIDA) + '</td>'
        + '<td style="' + baseCell + '">' + esc(c.FISCAL) + '</td>'
        + '<td style="' + baseCell + '">' + esc(c.DESCRIPCION) + '</td>'
        + '<td style="' + baseCell + 'text-align:center;">' + (c.PKGS || '') + '</td>'
        + '<td style="' + baseCell + 'text-align:center;">' + (c.KG || '') + '</td>'
        + '</tr>';
    }
  }

  const html = '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:860px;">'
    + '<p style="font-size:14px;">Estimados <b>' + esc(cli.displayName) + '</b>, buen día.</p>'
    + '<p style="font-size:13px;">Les compartimos el estado de sus cargas en curso vía <b>Montevideo</b> al ' + hoy + ':</p>'
    + '<table style="border-collapse:collapse;width:100%;background:#fff;border:1px solid #e5e5ea;">'
    + '<tr><th style="' + headCell + '">Ref</th><th style="' + headCell + '">Contenedor</th><th style="' + headCell + '">Buque</th><th style="' + headCell + '">ETA MVD</th><th style="' + headCell + '">Salida</th><th style="' + headCell + '">Fiscal destino</th><th style="' + headCell + '">Mercadería</th><th style="' + headCell + '">Bultos</th><th style="' + headCell + '">Kg</th></tr>'
    + cuerpo
    + '</table>'
    + '<div style="margin-top:18px;background:#0e5b75;border-radius:8px;padding:16px 20px;text-align:center;">'
    + '<div style="color:#fff;font-size:15px;font-weight:800;">🚀 Nueva web de Mediterránea Carghas</div>'
    + '<div style="color:#dbeafe;font-size:12px;margin-top:2px;">Seguí tus cargas online, cuando quieras</div>'
    + '<a href="' + PORTAL_URL + '" style="display:inline-block;margin-top:10px;background:#fff;color:#0e5b75;border-radius:6px;padding:7px 20px;font-weight:700;font-size:13px;text-decoration:none;">Ver mis cargas →</a>'
    + '<div style="color:#dbeafe;font-size:11px;margin-top:8px;">¿Todavía no tenés usuario? Respondé este mail y te lo creamos.</div>'
    + '</div>'
    + '<p style="font-size:11px;color:#888;margin-top:14px;">Este resumen se envía lunes y jueves. Ante cualquier consulta, respondan este correo.</p>'
    + '</div>';

  const fechaCorta = new Date().toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', timeZone: 'America/Montevideo' });
  out.push({ json: {
    esResumen: false,
    to: TEST_MODE ? BRIAN : cli.emails,
    subject: (TEST_MODE ? '[SOMBRA – ' + cli.name + '] ' : '') + 'Estado de sus cargas – Mediterránea Carghas – ' + fechaCorta,
    html,
  } });
  resumen.push((TEST_MODE ? '🕶️ ' : '🟢 ') + cli.name + ': ' + cargas.length + ' cargas → ' + (TEST_MODE ? BRIAN + ' (sombra)' : cli.emails) + (cli.sinEmail ? ' ⚠️ sin email real cargado' : ''));
}

const htmlResumen = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;">'
  + '<p><b>Digest clientes — resumen de la corrida</b> (TEST_MODE=' + TEST_MODE + ')</p>'
  + '<ul>' + resumen.map(r => '<li>' + r + '</li>').join('') + '</ul></div>';
out.push({ json: { esResumen: true, to: BRIAN, subject: '📬 Digest clientes – resumen – ' + new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo' }), html: htmlResumen } });

return out;
```

Después de ARMA_MAILS un IF por `esResumen` es innecesario: los dos gmail quedan en uno solo (`MAIL_DIGEST`) porque destino/asunto/cuerpo ya vienen por item. Un solo nodo gmail: `sendTo={{ $json.to }}`, `subject={{ $json.subject }}`, `message={{ $json.html }}`, `appendAttribution:false`.

- [ ] **Step 2: Corrida de prueba** (`test_workflow` o ejecutar manual) con la webapp ya deployada.
Esperado: a Brian le llegan 2 mails `[SOMBRA – …]` + 1 resumen. Revisar formato en Gmail real.

- [ ] **Step 3: Activar el schedule** (`publish_workflow` / activar) — sigue en TEST_MODE hasta que Brian valide.

---

### Task 9: Salida de sombra (cuando Brian diga)

- [ ] Brian carga `digest_emails` reales de CHIAPERO y ABEA en el gestor (o los pasa y se cargan por SQL).
- [ ] Editar ARMA_MAILS: `TEST_MODE = false`. Guardar y publicar.
- [ ] Próximo lunes/jueves: verificar en el mail resumen que fue a las casillas reales.

## Self-review (hecho al escribir)

- Cobertura spec: migración ✓ (T1) · endpoint ✓ (T2-T3) · API clients ✓ (T4) · UI ✓ (T5) · PR ✓ (T6) · activación sombra ✓ (T7) · workflow + banner + resumen ✓ (T8) · salida de sombra ✓ (T9).
- Tipos consistentes entre tasks (EstadoDigest/CargaDigest/ClienteDigest definidos en T2, usados en T3; campos camel/snake en T4-T5 espejando el patrón existente).
- Sin placeholders; única decisión diferida y explícita: PKGS/KG/M3 a nivel shipment vs suma de operativas (nota en T2 Step 3 con las dos variantes).
