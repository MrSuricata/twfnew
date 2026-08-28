# CLAUDE.md — twfnew (Web TWF / Mediterránea Carghas)
> Contexto permanente del repo. Leélo y NO re-explores lo que ya está acá.
> Estado vivo de la sesión actual: `HANDOFF_SESION_WEB_TWF.md` en `..\..\JARVIS CLAUDE\`.

## Qué es
App de gestión de cargas en producción (Vite + React + TS + Tailwind 4 + Supabase + Vercel).
- **Live:** transitworldforwarding.vercel.app (marca TWF) · mediterraneacarghas.vercel.app (marca Med, por hostname)
- **Admin** en `/admin` (PWA abre ahí) · Portal partners (depot/transport) · Landing pública + tracking
- **Supabase:** proyecto TWF `ihpsdeoexkipxmaxsmrc` · **Vercel:** proyecto `twf` (único)

## Diseño de Mediterránea — LEER ANTES DE TOCAR PANTALLAS DE MED
`docs/DISENO-MED.md` es la fuente de verdad: paleta, tipografía (Nunito 900 +
Montserrat), piezas del sistema (pills, cards, tablas, arcos, nodos de ruta),
tono de copy y qué falta aplicar. Los colores están como utilidades de Tailwind
(`bg-med-violeta`, `text-med-celeste`…) en el `@theme` de `src/main.css`, junto
con `.titulo-med`, `.papel-med` y `.degradado-med`. NO inventar valores nuevos ni
volver a pegar hexadecimales sueltos. TWF conserva su estética: nada de esto se
le aplica.

## Arquitectura de datos (¡leer antes de tocar!)
- **FCL** nace en Google Sheet (SG gid=1606359155 + Operativas gid=1133111465, solo refs `A####`).
  Sync (`api/sheets/sync.ts` → `performServerSync`) escribe: cache JSON (`shipments_cache`) + **espejo**
  filas `shipments` con `mode='fcl' source='sheet'`, `sheet_raw` jsonb = ParsedShipment completo,
  id determinístico ref+booking+cliente. Sync borra filas espejo obsoletas. La app LEE FCL del espejo
  (`fetchShipmentsFromDB` → sheet_raw + overlay `web_edits`), fallback cache.
- **Edición FCL** (Etapa 3): overlay por campo `web_edits` (PATCH `?fcl=1`, claves ParsedShipment,
  null = revertir). El sync nunca lo pisa. REF NO editable (flujo con PIN llega en Etapa 4 flip).
- **LCL/aéreo/terrestre/FCL-web**: filas normales en `shipments` (source `import`/`web`), editables.
- **Camiones**: `trucks` + `truck_loads` (vínculo por `truck_id`; `source_ref` = ref de la carga).
- **PRINCIPIO SAGRADO — derive-on-read, una fuente por dato, NUNCA copiar:**
  estado FCL ← planilla (getShipmentStatus) · estado carga en camión ← fechas del camión
  (`deriveTruckCargoStatus`, copia inline en api/tracking.ts: mantener en sync) · estado del camión ←
  sus fechas (`deriveTruckDisplayStatus/Info`; botones = atajo que completa fecha de hoy) ·
  facturación "pendiente" ← derivada (`buildBillableItems`), overlay `shipment_billing` solo guarda
  facturada/no_aplica · marca ← hostname.
- "Activa" (toggle Solo activas) = NO(devuelta Y en fiscal); sin datos: ETA >60d atrás = inactiva.
- Seguimiento vencido = activa + 7 días sin actualizar `seguimiento` (`isSeguimientoVencido`).
- La planilla reutiliza refs (splits A/B, 2 clientes) → `uid` único por fila en `buildOperations`.

## Auth
- Owner (Brian): env vars `ADMIN_USER`/`ADMIN_PASS_HASH` → JWT level='owner'.
- Equipo: tabla `admin_users` (email+bcrypt) → level='admin' (sin pestaña Equipo).
- Auditoría: `audit_log` vía `logAudit()` en mutaciones de [entity].ts. `invoiced_by` sale del token.

## Mapa de archivos clave
- `api/data/[entity].ts` — TODA la API de datos (switch por entity; whitelist `SHIPMENT_COLS`)
- `api/_lib/csvParser.ts` — parser planilla + espejo (`fclMirrorRows`) + `filterShipments` (solo A####)
- `api/tracking.ts` — tracking público (rate-limit, `stripFinancialFields`, excluye source='sheet')
- `src/lib/operationsTypes.ts` — modelo unificado (UnifiedOperation, buildOperations, EDITABLE_FIELDS,
  EDITABLE_FCL_FIELDS, isOperationActive, isSeguimientoVencido)
- `src/lib/billingTypes.ts` — facturación universal (buildBillableItems)
- `src/lib/pagosVencimientos.ts` — vencimientos de pagos derive-on-read (VTO NUNCA se guarda;
  ETA + forma de pago efectiva + terminal; montos null=sin datos · 0=pagado · >0=pendiente) ·
  UI: `PagosManagement` (pestaña Pagos). pago_*_by lo estampa el server ([entity].ts PATCH).
- `src/lib/truckTypes.ts` — camiones (deriveTruckDisplayStatus/Info)
- `src/lib/agendaUtils.ts` — eventos agenda (shipmentsToEvents FCL por SALIDA; trucksToEvents por
  carga 🟡 + salida 🔵, arribo NO se agenda)
- `src/components/operations/OperationsGrid.tsx` — la grilla · `BillingManagement` · `TeamManager` ·
  `TodayDashboard` (HOY: cards FCL + consolidados en movimiento) · `trucks/*` (TrucksList/Builder/Panel)
- `src/lib/dataClient.ts` — fetchers (fetchShipmentsFromDB espejo-first, patchFclShipment, etc.)

## Flujo de trabajo (NO romper)
- Una feature por branch desde `origin/main` + PR → **pasar el link** `github.com/MrSuricata/twfnew/pull/new/<branch>` (Brian mergea; gh CLI NO autenticado). NUNCA push a main.
- Obligatorio antes de push: `npm run typecheck` && `npm run test:run` && `npm run build`.
- Migraciones DB: directo en Supabase (MCP) ANTES de la PR, siempre aditivas (add column if not exists).
- Commits y UI en español rioplatense. Mensajes de error amigables. toast.error visible (no warnings mudos).
- Decisiones ya tomadas (NO re-preguntar): refs duplicadas=sufijo A/B+origin_ref · REF se edita solo
  con PIN 0000+cascada (Etapa 4) · alta de carga: solo Ref+Cliente+Modo obligatorios · IMO=FCL+LCL,
  OOG solo FCL · camión se agenda por carga+salida, no arribo.

## Pendientes grandes (ver handoff para el estado fino)
Analíticas con datos de TODAS las cargas + PDF real · polish visual Operaciones · Etapa 4 flip
(Sheet→export-only, cuando Brian diga) · fotos→Storage · unificar Cargas vs Operaciones (post-flip).
