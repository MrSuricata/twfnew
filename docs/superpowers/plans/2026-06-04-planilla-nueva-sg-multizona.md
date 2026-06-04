# Planilla nueva SG multizona — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la ingesta FCL al SG nuevo (gid 1606359155) — todas las cargas (UY/Chile/BA), ruta POL→POD, país por POD, filtros nuevos — sin tocar LCL/aéreo/terrestre ni el estado/operativo manejados por la app.

**Architecture:** El parser server-side (`api/_lib/csvParser.ts`) pasa a leer el SG nuevo (header-driven, columna 0 = Ref sin header) en vez del viejo, deja de excluir Chile/BA, deriva el país desde el POD, y suma campos (POL, POD, PAIS, SEGUIMIENTO, TIPO; BOOKING→MBL; NOMBRE BUQUE→BUQUE). Operativas (gid 1133111465) se cruza por Ref igual que hoy. El front mapea los campos nuevos a la grilla y agrega filtros por zona/origen/destino.

**Tech Stack:** TypeScript, Vitest, Vercel functions, React + Tailwind, Supabase cache.

**Dependencia de merge:** este plan asume `main` como base. Si la PR `feat/new-shipment-fields` (que agrega `dischargePort`, `seguimiento`, etc. a `UnifiedOperation`) se mergea antes, reusar esos campos en vez de duplicarlos (ver Task 6, nota).

**Datos reales de referencia (pub CSV, ya verificada):**
- Base: `https://docs.google.com/spreadsheets/d/e/2PACX-1vR1L0gDUbrXqFW_33bLA-0Gsb73x2hItsyNwUFZTHdjTlGnxO0AuE8ojBrdrtvjp0frdl8v45xCGYFM/pub?output=csv`
- SG nuevo `&gid=1606359155`, header: `,CONSIGNEE,NOTA,SEGUIMIENTO,BOOKING,LINEA,POL,POD,ETD,ETA,CONTS,N,TIPO,ESTADO,OPERATIVO,NOMBRE BUQUE,OPERATIVA,PUERTO,CTERMINAL,CDEV,LOCALES,FLETE,FORMA_PAGO,VTO,CR,BL,AD,AT`
- Fila ej.: `A6644,TP SRL ADD,,15/08/2025,6416381990,COSCO ,YANTIAN,MONTEVIDEO ,5/09/2025,18/06/2025,,1,40HQ,Puerto,,,,,"0,00",...`

---

## FASE 1 — Ingesta (backend)

### Task 1: País desde POD (`zonaFromPOD`)

**Files:**
- Modify: `api/_lib/csvParser.ts` (agregar export `zonaFromPOD` + tabla)
- Test: `api/_lib/csvParser.test.ts`

- [ ] **Step 1: Test que falla**

Agregar a `api/_lib/csvParser.test.ts`:
```typescript
import { zonaFromPOD } from './csvParser.js'

describe('zonaFromPOD', () => {
  it('Montevideo → UY', () => { expect(zonaFromPOD('MONTEVIDEO ')).toBe('UY') })
  it('Buenos Aires → AR', () => { expect(zonaFromPOD('Buenos Aires')).toBe('AR') })
  it('puertos chilenos → CL', () => {
    expect(zonaFromPOD('VALPARAISO')).toBe('CL')
    expect(zonaFromPOD('San Antonio')).toBe('CL')
  })
  it('vacío/desconocido → OTRO', () => {
    expect(zonaFromPOD('')).toBe('OTRO')
    expect(zonaFromPOD('LISBOA')).toBe('OTRO')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: FAIL ("zonaFromPOD is not a function").

- [ ] **Step 3: Implementar**

En `api/_lib/csvParser.ts` (cerca del top, exportado):
```typescript
// Mapa puerto de descarga → país/zona. Editable: ampliar acá.
export const POD_ZONA: Record<string, 'UY' | 'AR' | 'CL'> = {
  MONTEVIDEO: 'UY', MVD: 'UY',
  'BUENOS AIRES': 'AR', BSAS: 'AR', BA: 'AR',
  VALPARAISO: 'CL', 'SAN ANTONIO': 'CL', IQUIQUE: 'CL', 'SAN VICENTE': 'CL', CALLAO: 'CL',
}
export function zonaFromPOD(pod: string): 'UY' | 'AR' | 'CL' | 'OTRO' {
  const k = (pod || '').trim().toUpperCase()
  return POD_ZONA[k] || 'OTRO'
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/csvParser.test.ts api/_lib/csvParser.ts
git commit -m "feat(sg): zonaFromPOD — país/zona derivado del puerto de descarga"
```

---

### Task 2: Campos nuevos en el modelo (ShipmentRecord/ParsedShipment)

**Files:**
- Modify: `src/lib/shipmentTypes.ts` (ShipmentRecord + processShipmentRecord)
- Modify: `api/_lib/csvParser.ts` (copia de los tipos si está duplicada)
- Test: `src/lib/shipmentTypes.test.ts` (crear si no existe) o `api/_lib/csvParser.test.ts`

- [ ] **Step 1: Agregar campos al tipo**

En `src/lib/shipmentTypes.ts`, en `interface ShipmentRecord` agregar:
```typescript
  POL: string          // puerto de carga (origen)
  POD: string          // puerto de descarga
  PAIS: 'UY' | 'AR' | 'CL' | 'OTRO'
  SEGUIMIENTO: string  // fecha de seguimiento (SG nuevo)
  TIPO: string         // tipo de contenedor (40HQ, 20GP…)
```
Y replicar el mismo bloque en la copia del tipo dentro de `api/_lib/csvParser.ts` (si existe duplicada — verificar con grep `interface ShipmentRecord` en api/).

- [ ] **Step 2: Defaults en processShipmentRecord**

En `processShipmentRecord` (src/lib/shipmentTypes.ts) agregar al objeto de retorno:
```typescript
    POL: record.POL || '',
    POD: record.POD || '',
    PAIS: (record.PAIS as ShipmentRecord['PAIS']) || 'OTRO',
    SEGUIMIENTO: record.SEGUIMIENTO || '',
    TIPO: record.TIPO || '',
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: PASS (errores guían si falta replicar el tipo en otra copia).

- [ ] **Step 4: Commit**

```bash
git add src/lib/shipmentTypes.ts api/_lib/csvParser.ts
git commit -m "feat(sg): campos POL/POD/PAIS/SEGUIMIENTO/TIPO en el modelo de carga"
```

---

### Task 3: Parser del SG nuevo (header-driven + Ref col 0 + país)

**Files:**
- Modify: `api/_lib/csvParser.ts` (`parseMainSheetCSV`)
- Test: `api/_lib/csvParser.test.ts`

- [ ] **Step 1: Test que falla (parsea un CSV del SG nuevo)**

```typescript
import { parseMainSheetCSV } from './csvParser.js'

describe('parseMainSheetCSV — SG nuevo', () => {
  const csv = [
    ',CONSIGNEE,NOTA,SEGUIMIENTO,BOOKING,LINEA,POL,POD,ETD,ETA,CONTS,N,TIPO,ESTADO,OPERATIVO,NOMBRE BUQUE,OPERATIVA,PUERTO,CTERMINAL,CDEV,LOCALES,FLETE,FORMA_PAGO,VTO,CR,BL,AD,AT',
    'A6644,TP SRL ADD,,15/08/2025,6416381990,COSCO ,YANTIAN,MONTEVIDEO ,5/09/2025,18/06/2025,MSCU1,1,40HQ,Puerto,DOR,EVER GIVEN,,TCP,"0,00","0,00","0,00","0,00",PROGRAMADO,1/01/2026,TRUE,TRUE,TRUE,TRUE',
  ].join('\n')
  const rows = parseMainSheetCSV(csv)
  it('mapea Ref (col 0 sin header)', () => { expect(rows[0].REF).toBe('A6644') })
  it('CONSIGNEE→CLIENTE, BOOKING→MBL, POL/POD, NOMBRE BUQUE→BUQUE, CONTS→CNTR, TIPO', () => {
    expect(rows[0].CLIENTE).toBe('TP SRL ADD')
    expect(rows[0].MBL).toBe('6416381990')
    expect(rows[0].POL).toBe('YANTIAN')
    expect(rows[0].POD?.trim()).toBe('MONTEVIDEO')
    expect(rows[0].BUQUE).toBe('EVER GIVEN')
    expect(rows[0].CNTR).toBe('MSCU1')
    expect(rows[0].TIPO).toBe('40HQ')
    expect(rows[0].PAIS).toBe('UY')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: FAIL (REF vacío / campos undefined).

- [ ] **Step 3: Extender el header-mapping de parseMainSheetCSV**

En `parseMainSheetCSV`, donde normaliza headers y mapea por `switch`:
1. Al construir el índice de headers, tratar **header vacío en posición 0 como `REF`**:
```typescript
const norm = (h: string, i: number) => {
  const n = h.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/°/g, '')
  return n === '' && i === 0 ? 'REF' : n
}
```
2. Agregar/asegurar estos casos en el switch (canónico ← aliases):
```typescript
case 'CONSIGNEE': record.CLIENTE = value; break
case 'BOOKING': record.MBL = value; break        // sin MBL en SG nuevo → booking
case 'POL': case 'ORIGEN': record.POL = value; break
case 'POD': case 'PUERTO_DESCARGA': record.POD = value; break
case 'CONTS': record.CNTR = value; break
case 'NOMBRE_BUQUE': case 'NOMBRE': record.BUQUE = value; break
case 'SEGUIMIENTO': record.SEGUIMIENTO = value; break
case 'TIPO': record.TIPO = value; break
// ESTADO y OPERATIVO: no mapear (la app maneja estado/operativo)
```
(Mantener los casos existentes: LINEA, ETD, ETA, N, PUERTO→TERMINAL, CTERMINAL, CDEV, LOCALES, FLETE, FORMA_PAGO, VTO, CR/BL/AD/AT.)
3. Tras armar `record`, derivar país: `record.PAIS = zonaFromPOD(record.POD || '')`.
4. **Validación de fila:** incluir si `record.REF` existe (CLIENTE deja de ser obligatorio):
```typescript
if (record.REF) records.push(record)
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/csvParser.ts api/_lib/csvParser.test.ts
git commit -m "feat(sg): parser header-driven del SG nuevo (Ref col0, POL/POD/booking/buque/país)"
```

---

### Task 4: Apuntar el main al SG nuevo + dejar de excluir Chile/BA

**Files:**
- Modify: `api/_lib/csvParser.ts` (`buildCsvUrl`, `filterShipments`)
- Test: `api/_lib/csvParser.test.ts`

- [ ] **Step 1: Test de filterShipments (ya NO excluye Chile/BA)**

```typescript
import { filterShipments } from './csvParser.js'
describe('filterShipments — incluye Chile/BA', () => {
  const mk = (REF: string, PAIS: any, POD: string) => ({ REF, PAIS, POD, TERMINAL: POD, operativas: [] } as any)
  const out = filterShipments([mk('A1','CL','VALPARAISO'), mk('A2','AR','BUENOS AIRES'), mk('A3','UY','MONTEVIDEO')])
  it('mantiene las 3 zonas', () => { expect(out.map(s => s.REF).sort()).toEqual(['A1','A2','A3']) })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: FAIL (hoy excluye CHILE/BUENOS AIRES).

- [ ] **Step 3: Cambios**

1. `buildCsvUrl`: apuntar el main al SG nuevo. Agregar `const SG_GID = '1606359155'` y construir la URL con ese gid (análogo a `buildOperativasUrl`):
```typescript
const SG_GID = '1606359155'
export function buildCsvUrl(sheetsUrl: string): string {
  // edit URL → export con gid; pub/otra → append gid
  if (sheetsUrl.includes('/edit')) {
    const id = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    if (!id) throw new Error('Invalid Google Sheets URL')
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${SG_GID}`
  }
  const url = new URL(sheetsUrl)
  url.searchParams.set('gid', SG_GID)
  return url.toString()
}
```
2. `filterShipments`: **eliminar** la exclusión por `EXCLUDED_TERMINAL_KEYWORDS` (Chile/BA). Mantener solo la de refs basura puntuales si existe (`HARDCODED_EXCLUDED_REFS`). El nuevo cuerpo:
```typescript
export function filterShipments(shipments: ParsedShipment[]): ParsedShipment[] {
  return shipments.filter(s => !HARDCODED_EXCLUDED_REFS.includes((s.REF || '').toUpperCase()))
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm run test:run -- api/_lib/csvParser.test.ts`
Expected: PASS. Correr toda la suite: `npm run test:run` → verde.

- [ ] **Step 5: Verificación real contra la planilla publicada**

Run (script temporal, NO commitear):
```bash
node -e "fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vR1L0gDUbrXqFW_33bLA-0Gsb73x2hItsyNwUFZTHdjTlGnxO0AuE8ojBrdrtvjp0frdl8v45xCGYFM/pub?output=csv&gid=1606359155').then(r=>r.text()).then(t=>{const l=t.split('\n');console.log('filas',l.length);console.log('header',l[0].slice(0,80))})"
```
Expected: imprime cantidad de filas (cientos) y el header del SG nuevo.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/csvParser.ts api/_lib/csvParser.test.ts
git commit -m "feat(sg): main apunta al SG nuevo (gid 1606359155) + incluir Chile/BA"
```

---

## FASE 2 — UI (front: grilla + filtros + tracking)

### Task 5: Mapear campos nuevos a UnifiedOperation (fclToOperation)

**Files:**
- Modify: `src/lib/operationsTypes.ts` (UnifiedOperation + fclToOperation + EMPTY)

> **Nota de dependencia:** si `feat/new-shipment-fields` está mergeado, `UnifiedOperation` ya tiene `dischargePort` y `seguimiento` — reusarlos (no duplicar). Si no, agregarlos acá.

- [ ] **Step 1: Campos en UnifiedOperation**

Agregar a `interface UnifiedOperation` (si no existen ya): `pod: string` y `pais: string`. (`origin`, `seguimiento`, `dischargePort` ya existen / vienen de la otra PR.)

- [ ] **Step 2: EMPTY + fclToOperation**

En `EMPTY` agregar `pod: '', pais: ''` (y `seguimiento: '', dischargePort: ''` si no están). En `fclToOperation`, mapear desde el ParsedShipment:
```typescript
    origin: s.POL || '',
    dischargePort: s.POD || '',
    pod: s.POD || '',
    pais: s.PAIS || 'OTRO',
    docNumber: s.MBL || '',     // booking
    buque: s.BUQUE || '',
    seguimiento: s.SEGUIMIENTO || '',
    tipo: s.TIPO || firstWith('TIPO') || 'FCL',
```
(Sobre-escribe los defaults de EMPTY donde corresponda.)

- [ ] **Step 3: typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/operationsTypes.ts
git commit -m "feat(sg): mapear POL/POD/país/booking/buque del SG nuevo a la grilla"
```

---

### Task 6: Columnas nuevas en la grilla (Origen, Pto. Descarga, País)

**Files:**
- Modify: `src/lib/operationsTypes.ts` (`OPERATION_COLUMNS`)
- Modify: `src/components/operations/OperationsGrid.tsx` (render del badge de país en `cell`)

- [ ] **Step 1: Columnas**

En `OPERATION_COLUMNS` agregar (si no están): `{ key: 'pod', label: 'Pto. Descarga', defaultOn: true, wrap: true, w: 'max-w-[100px]' }` y `{ key: 'pais', label: 'País', defaultOn: true, w: 'max-w-[64px]' }`. (Origen/POL ya está como `origin`.)

- [ ] **Step 2: Badge de país en la celda**

En `OperationsGrid.tsx`, en la función `cell(key)` del row, agregar un case:
```typescript
case 'pais': {
  const labels: Record<string,string> = { UY:'🇺🇾 UY', AR:'🇦🇷 AR', CL:'🇨🇱 CL', OTRO:'—' }
  return op.pais ? <Badge variant="outline" className="h-5 text-[9px]">{labels[op.pais] || op.pais}</Badge> : ''
}
```

- [ ] **Step 3: build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/operationsTypes.ts src/components/operations/OperationsGrid.tsx
git commit -m "feat(sg): columnas Pto. Descarga + País (badge) en la grilla"
```

---

### Task 7: Filtros por zona / origen / destino en la grilla

**Files:**
- Modify: `src/components/operations/OperationsGrid.tsx`

- [ ] **Step 1: Estado de filtros**

Agregar:
```typescript
const [zonaFilter, setZonaFilter] = useState<'all'|'UY'|'AR'|'CL'|'OTRO'>('all')
const [originFilter, setOriginFilter] = useState('')
const [destFilter, setDestFilter] = useState('')
```

- [ ] **Step 2: Aplicar en `filtered`**

Dentro del `operations.filter(o => { ... })` agregar:
```typescript
if (zonaFilter !== 'all' && (o.pais || 'OTRO') !== zonaFilter) return false
if (originFilter && !(o.origin||'').toLowerCase().includes(originFilter.toLowerCase())) return false
if (destFilter && !(o.pod||'').toLowerCase().includes(destFilter.toLowerCase())) return false
```
Agregar `zonaFilter, originFilter, destFilter` a las deps del `useMemo`.

- [ ] **Step 3: Chips de zona + inputs**

Debajo de los chips de modo, agregar chips de zona (Todas/UY/AR/CL/Otros) que setean `zonaFilter`, y en la toolbar dos `<Input>` chicos para Origen y Destino (bindeados a `originFilter`/`destFilter`). Reusar el estilo de los chips de modo existentes.

- [ ] **Step 4: build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/operations/OperationsGrid.tsx
git commit -m "feat(sg): filtros por zona (UY/AR/CL) + origen + destino en la grilla"
```

---

### Task 8: Verificación end-to-end + tracking

**Files:** (sin cambios de código salvo ajustes)

- [ ] **Step 1: Sync real + conteo por zona**

Logueado admin en el deploy de la branch: tab Operaciones → refrescar (sincroniza el SG nuevo). Verificar:
- Aparecen cargas con POD ≠ Montevideo (Chile/BA) — antes excluidas.
- Chips de zona filtran bien; Origen/Destino filtran.
- Columnas Origen/Pto. Descarga/País se ven.

- [ ] **Step 2: Tracking público de una carga no-UY**

`/api/tracking?q=<booking>` o `?q=<ref>` de una carga Chile/BA → devuelve resultado con buque (NOMBRE BUQUE) y ruta. Confirmar que el stripFinancialFields sigue ocultando costos.

- [ ] **Step 3: Spot-check de cruce con Operativas**

Una carga UY con operativa: confirmar que el cruce por Ref sigue trayendo SALIDA/ETA_FISC/LIBRE. Una Chile/BA: sin operativa (correcto).

- [ ] **Step 4: Commit final / abrir PR**

```bash
git push
```
Abrir PR `feat/sg-nueva-multizona` para que Brian mergee.

---

## Notas de cierre
- **No tocar** la tabla `shipments` (LCL/aéreo/terrestre) ni el estado/operativo manejado por la app.
- Estado de cargas Chile/BA sin operativas: queda en base a ETA (coarse) — afinar después si Brian lo pide.
- Mantener `stripFinancialFields` y la validación de formato del tracking.
