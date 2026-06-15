# Flip FCL (Etapa 4) — Plan de implementación

> Spec: `docs/superpowers/specs/2026-06-15-fcl-flip-etapa4-design.md`.
> Ejecución **inline** por Claude en esta sesión (contexto completo del repo).
> Reglas del repo: una PR por branch desde `origin/main`; migraciones DB aditivas aplicadas en
> Supabase ANTES de la PR; `npm run typecheck && npm run test:run && npm run build` verdes antes de
> push; nunca push a main (Brian mergea). Commits y UI en español rioplatense.

**Goal:** que la web sea la fuente de verdad de las FCL (edición total incl. REF), completando la
migración al modelo de tabla única `shipments` — sin deuda, reversible.

**Orden (ajustado para seguridad/impulso):** A (columnas, aditivo) → B (billing/operativos por id) →
C (bake + flip de lectura) → D (REF editable) → E (Jarvis → API).

---

## PR-A — Columnas de Operativas + modelo (aditivo, sin cambio de comportamiento)

Branch: `feat/fcl-flip-etapa4` (esta). Funda el resto. Cero riesgo: las columnas nuevas quedan
`null` en las cargas existentes → misma vista.

**Migración Supabase (aditiva):** en `shipments` agregar (if not exists):
`libre text`, `salida text`, `eta_fiscal text`, `operativa text`, `descarga text`, `dev text`,
`terminal text`, `n_cntr int default 0`, `origin_ref text`.

- [ ] DbShipment (`src/lib/operationsTypes.ts`): agregar los 9 campos (`libre, salida, eta_fiscal,
      operativa, descarga, dev, terminal, n_cntr, origin_ref`).
- [ ] `dbShipmentToOperation`: leer las columnas nuevas hacia `libre/salida/etaFisc/operativa/
      descarga/dev/terminal/n` (hoy van a `''`/0). `origin_ref` → no se muestra, queda en el row.
- [ ] `newDbShipment`: defaults `''`/0 para los nuevos campos + `origin_ref: ''`.
- [ ] `SHIPMENT_COLS` (whitelist PATCH en `api/data/[entity].ts`): sumar `libre, salida, eta_fiscal,
      operativa, descarga, dev, terminal, n_cntr, origin_ref`. (NO se suman aún a `EDITABLE_FIELDS`:
      la edición de Operativas se habilita en PR-C, junto con el flip.)
- [ ] Test (`src/lib/operationsTypes.test.ts`): `dbShipmentToOperation` mapea las columnas nuevas;
      round-trip vía `newDbShipment`.
- [ ] `npm run typecheck && npm run test:run && npm run build` verdes → commit → push → link de PR.

---

## PR-B — Billing + operator_assignments por `shipment_id`

Branch nueva desde main: `feat/billing-by-id`. Resuelve la ambigüedad latente A7794/A7800/A7834
(hoy 0 filas billing → backfill limpio) y saca 2 tablas de la cascada de REF.

**Migración Supabase (aditiva + backfill):**
- `shipment_billing`: `add column shipment_id text`; backfill `shipment_id = (select id from shipments
  where ref = shipment_billing.ref limit 1)`; índice único `unique(shipment_id)`; conservar `ref`
  (display). (No se borra la PK ref de golpe: se deja la columna; la clave de upsert pasa a shipment_id.)
- `operator_assignments`: idem `add column shipment_id text` + backfill + `unique(shipment_id)`.

- [ ] `BillingRecord` (`billingTypes.ts`): agregar `shipmentId: string`. `indexBilling` → `Map<shipmentId>`.
- [ ] `getBillingState(shipment, byId)`: buscar por `shipment.__dbId` (FCL espejo) en vez de `REF`.
- [ ] `buildBillableItems`: dedup FCL por `uid`/`__dbId` (no por ref); DB branch usa `billingById.get(d.id)`.
- [ ] `OperatorAssignment` (`operationsTypes.ts`): `shipmentId` en vez de `ref`; `indexAssignments` →
      `Map<shipmentId>`; en `buildOperations`, FCL usa `assignments.get(s.__dbId)`.
- [ ] API `handleBilling`/`handleOperatorAssignments`: upsert `onConflict:'shipment_id'`, DELETE
      `?shipmentId=`, GET mapea `shipmentId`. Schemas Zod (`BillingRowSchema`,
      `OperatorAssignmentRowSchema`) aceptan `shipmentId`.
- [ ] `dataClient.ts` + `BillingManagement.tsx` + `App.tsx`: pasar `shipmentId` en save/delete.
- [ ] Tests: billing por id, colisión A7794 (aéreo+FCL no se pisan), round-trip asignación.
- [ ] typecheck + test:run + build verdes → commit → push → link.

---

## PR-C — Bake + flip de lectura (EL cutover) · flag `FCL_SOURCE_OF_TRUTH`

Branch nueva: `feat/fcl-bake-flip`. Aquí la web pasa a master. Reversible por flag.

**Migración/-data:** ninguna estructural nueva; el bake es por endpoint admin idempotente.

- [ ] Endpoint admin `POST /api/data/shipments?mode=bake-fcl` (idempotente, owner-only): por cada fila
      `source='sheet'`, componer estado efectivo (`applyWebEdits(sheet_raw, web_edits)`) → correr el
      mapeo de `fclToOperation` → escribir columnas reales (cliente/etd/eta/.../libre/salida/eta_fiscal/
      operativa/terminal/n_cntr/origin_ref) → `source='fcl'`, conservar `id`, conservar `sheet_raw`,
      limpiar `web_edits`. Devuelve `{horneadas, total}`. Reusa la lógica de `fclToOperation`
      (extraer a helper compartido `fclEffectiveToColumns` testeado, sin duplicar el mapeo).
- [ ] Botón "Hornear FCL a la base" en pestaña Equipo (owner) — como el de migrar fotos.
- [ ] Flag `FCL_SOURCE_OF_TRUTH` (env Vercel, default `sheet`). Con `db`:
  - `api/sheets/sync.ts`: NO escribe el espejo (sync de entrada OFF).
  - `buildOperations`/`fetchShipmentsFromDB`: las FCL vienen como `DbShipment` (source `fcl`), no como
    `ParsedShipment`. `buildOperations` deja de recibir FCL en `shipments[]`.
  - `buildBillableItems`: rama FCL deriva `pendiente` de las columnas `salida`+`eta_fiscal` (colapsadas)
    en vez del array `operativas[]`.
  - `api/tracking.ts`: FCL desde la tabla `shipments` (no del cache), manteniendo `stripFinancialFields`.
- [ ] Operativas editable: sumar `libre/salida/etaFisc/operativa/descarga/dev/terminal` a
      `EDITABLE_FIELDS`; FCL (`source='fcl'`) deja de ser `readOnly`.
- [ ] Verificación post-bake: script de conteo + spot-check N cargas (columnas vs lo que mostraba el espejo).
- [ ] Tests del helper de bake + de la derivación de billing por columnas. typecheck + test:run + build.

---

## PR-D — REF editable (PIN + cascada transaccional + anti-dup)

Branch nueva: `feat/fcl-ref-editable`. Requiere flag `db`.

- [ ] Migración: índice único parcial `create unique index if not exists ux_shipments_ref_active on
      shipments(ref) where not archived`.
- [ ] Función Postgres `rename_shipment_ref(p_id text, p_new_ref text, p_pin text)` (vía apply_migration),
      transaccional: valida PIN `0000`; si `p_new_ref` existe en carga no archivada → `RAISE`; update
      `shipments.ref`; cascada `truck_loads.source_ref`, `origin_photos.shipment_ref`,
      `documents.shipment_ref`, `reports.shipment_ref`, `notification_tasks.shipment_ref`,
      `audit_log.ref`; registra audit con `{old_ref,new_ref}`.
- [ ] API `PATCH /api/data/shipments?id=&renameRef=&pin=` → llama la RPC; 409 si choca; 403 si PIN mal.
- [ ] UI panel detalle: "Editar REF" con modal de confirmación + PIN; alerta anti-dup que sugiere A/B.
- [ ] `localStorage 'twf-excluded-refs'`: actualizar entrada al renombrar (caso borde).
- [ ] Tests: rename ok cascada completa; rename a ref existente → 409; PIN inválido → 403.
- [ ] typecheck + test:run + build verdes → commit → push → link.

---

## PR-E — Jarvis lee del API (repo `JARVIS CLAUDE`, separado)

- [ ] Repuntar los scripts de briefing de Jarvis a leer `shipments` del API de TWF (en vez de la Sheet).
- [ ] Validar que el briefing diario salga igual con datos del API.

---

## Self-review
- **Cobertura del spec:** §3.1 columnas→PR-A · §6 billing por id→PR-B · §3.2/§4 bake+flip+tracking→PR-C ·
  §5 REF→PR-D · §7 Jarvis→PR-E. ✓
- **Sin placeholders:** cada PR tiene archivos + pasos concretos; el código fino se escribe al ejecutar
  cada paso (ejecución inline con contexto).
- **Consistencia de tipos:** `shipmentId` (no `shipment_id` en TS) en BillingRecord/OperatorAssignment;
  columnas DB en snake_case; `source='fcl'` marcador nativo; flag `FCL_SOURCE_OF_TRUTH`.
