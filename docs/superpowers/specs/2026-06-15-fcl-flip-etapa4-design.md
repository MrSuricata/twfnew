# Spec — Flip FCL a la web (Etapa 4 de la migración a Supabase)

_Fecha: 2026-06-15 · Estado: propuesto, pendiente de aprobación de Brian._

> Objetivo de Brian: *"que no tenga que volver mañana a cambiarlo — algo persistente, seguro y pensado."*
> Por eso esta etapa **NO** toma el atajo del overlay: completa la migración al **modelo objetivo de
> `ARQUITECTURA_DATOS_TWF.md`** (tabla única `shipments` como fuente de verdad). Las FCL quedan
> idénticas a LCL/aéreo/terrestre: filas normales en columnas reales, editables, sin blob jsonb.

---

## 1. Contexto y estado actual

La migración FCL Sheet→Supabase va por etapas. Hechas y en producción:

- **Etapa 1 (espejo):** el sync (`api/sheets/sync.ts` → `performServerSync` → `fclMirrorRows`) escribe
  cada FCL como fila `shipments` con `mode='fcl' source='sheet'`, `sheet_raw` (jsonb = `ParsedShipment`
  completo), id determinístico `ref+booking+cliente`. Cleanup borra solo filas `source='sheet'` obsoletas.
- **Etapa 2 (lectura):** la app lee FCL del espejo (`fetchShipmentsFromDB` → `?includeMirror=only`),
  con fallback al cache.
- **Etapa 3 (edición inline):** overlay `web_edits` por campo (PATCH `?fcl=1`, claves `ParsedShipment`,
  whitelist de 11 campos de nivel SG en `EDITABLE_FCL_FIELDS`). El sync nunca pisa `web_edits`.
  La REF está **bloqueada** (`api/data/[entity].ts:1461`). Badge ✏️ cuando difiere del Sheet.

**Lo que falta (Etapa 4 = este spec):** que la **web sea el master** de FCL — edición total
(incluida la REF) y la planilla deja de mandar.

### Estado verificado en la DB (2026-06-15)
- `shipments`: **1.153** filas `source='sheet' mode='fcl'` (las únicas en jsonb) + 179 nativas
  (`import`: 49 aéreo, 20 terrestre, 104 LCL · `web`: 6 LCL). **Cero FCL nativas hoy.**
- `sheet_raw` trae Operativas **anidada** bajo la clave `operativas` (array) + `LIBRE_HASTA`/`calculatedLibreHasta`.
- Colisiones de ref aéreo↔FCL (`A7794`/`A7800`/`A7834`): 2 filas c/u, **0 filas en `shipment_billing`**
  → migrar billing a `id` es limpio, no hay nada que desenredar.

---

## 2. Decisión de arquitectura: tabla única (bake & own), NO overlay

Dos caminos posibles para el flip:

| | **A. Expandir el overlay** (descartado) | **B. Tabla única / "hornear"** (elegido) |
|---|---|---|
| Qué | `sheet_raw` queda de semilla, `web_edits` crece para cubrir todo, ref editable aparte | Pasar las 1.153 FCL a columnas reales; FCL = fila normal como LCL/aéreo |
| Modelo final | **Dos formas de FCL** conviviendo (espejo+overlay vs nativa) para siempre | **Una sola forma** para toda carga |
| Deuda | Sí — el blob+overlay queda de por vida | No — es el destino de `ARQUITECTURA_DATOS_TWF.md` |
| Esfuerzo | Menor ahora | Mayor ahora, cero después |

Brian pidió explícitamente lo persistente → **B**. Es además lo que ya estaba escrito como
"modelo objetivo: tabla única `shipments`" en el doc de arquitectura.

**Principio que NO se rompe:** se mantiene *derive-on-read* (estado, facturación, etc. siguen
derivándose, no se copian). El bake mueve **datos de entrada** (lo que hoy viene del Sheet) a columnas;
NO convierte en columna nada que hoy sea derivado.

---

## 3. Modelo de datos

### 3.1 Columnas que faltan en `shipments` (migración aditiva)
Las cargas nativas no tienen los campos de Operativas FCL (hoy `dbShipmentToOperation` los deja en `''`).
Se agregan (todas `text`, nullable, `add column if not exists`):

| Columna nueva | UnifiedOperation | Origen en `sheet_raw` |
|---|---|---|
| `libre` | `libre` | `LIBRE_HASTA` / `operativas[].LIBRE` |
| `salida` | `salida` | `operativas[].SALIDA` |
| `eta_fiscal` | `etaFisc` | `operativas[].ETA_FISC` |
| `operativa` | `operativa` | `operativas[].OPERATIVA` |
| `descarga` | `descarga` / `desconsol` | `operativas[].DESCARGA` |
| `dev` | `dev` | `operativas[].DEV` |
| `terminal` | `terminal` | `sheet_raw.TERMINAL` (TCP/MONTECON) |
| `n_cntr` (int) | `n` | `sheet_raw.N` |
| `origin_ref` | (agrupador de splits) | `ref` sin sufijo A/B |

El resto ya tiene columna: `cliente, etd, eta, doc_number(MBL), buque, linea, origin(POL),
discharge_port(POD), dest_country(PAIS), seguimiento, tipo, contenedor(CNTR), pkgs, kg, m3,
observacion(descripcion), fiscal, deposito, wood, transporte, oog, imo, no_apilable`.

### 3.2 El "bake" (composición de los dos mapeos existentes)
Para cada FCL espejo: estado efectivo = `applyWebEdits(sheet_raw, web_edits)` → correr la lógica de
`fclToOperation` (que ya colapsa N operativas en una fila: suma kg/m³/bultos, junta CNTR, `firstWith`
para libre/salida/etc.) → escribir el resultado en las columnas reales. Es **exactamente lo que la app
ya muestra hoy**, materializado.

- Se reutiliza el mapeo de `fclToOperation` (portado a un endpoint admin TS, NO reescrito en SQL,
  para tener UNA sola fuente del mapeo y testearlo).
- **`sheet_raw` NO se borra:** queda como respaldo histórico/auditoría (incluye el detalle por
  contenedor de `operativas[]` que la vista colapsa). `web_edits` se limpia (ya horneado).
- El `id` determinístico **se conserva** (es opaco; evita romper referencias por id).
- `source` pasa de `'sheet'` a **`'fcl'`** (marcador nativo nuevo, distinto de `'sheet'` y `'web'`).

### 3.3 Out of scope (YAGNI)
- **Tabla `containers` hija:** la vista colapsa a una fila y el panel ya maneja contenedores como
  fichas sobre el texto `contenedor` (cntrUtils). No se crea ahora.
- **`shipment_legs` multi-tramo:** futuro, no se toca.

---

## 4. El flip (cutover reversible)

Flag de servidor **`FCL_SOURCE_OF_TRUTH = sheet | db`** (env var en Vercel, default `sheet`):

| Flag | Sync de entrada | Lectura FCL | REF editable |
|---|---|---|---|
| `sheet` (hoy) | ON (Sheet→espejo) | `sheet_raw` + `web_edits` | No |
| `db` (flip) | **OFF** | columnas reales (igual que LCL/aéreo) | Sí (con PIN) |

- **Reversibilidad:** como el `id` se conserva y `sheet_raw` queda de respaldo, se puede volver a
  `sheet` (re-activa sync; al compartir id, el upsert actualiza las mismas filas, sin duplicar).
  Ventana de riesgo = ediciones hechas mientras estuvo en `db` (se pierden al revertir) → por eso hay
  verificación inmediata post-flip.
- **Tracking público** (`api/tracking.ts`): con flag `db`, FCL se leen de la tabla `shipments`
  (no del cache viejo). Se mantiene `stripFinancialFields` + match exacto + rate-limit. Esto cierra el
  bug latente de "tracking muestra datos viejos tras editar en la web".

---

## 5. REF editable — PIN + cascada transaccional + anti-duplicados

Solo disponible con flag `db`. La REF es display; la PK sigue siendo `id`.

- **Función Postgres `rename_shipment_ref(p_id, p_new_ref, p_pin)`** (RPC, vía `apply_migration`),
  **transaccional (todo-o-nada)**:
  1. Valida PIN (`0000`, freno anti-dedo).
  2. **Anti-dup:** si `p_new_ref` ya existe en una carga NO archivada → `RAISE EXCEPTION` (la API lo
     traduce a 409 con mensaje que sugiere sufijo A/B).
  3. `UPDATE shipments SET ref = p_new_ref WHERE id = p_id`.
  4. Cascada a todo lo que llavea por ref (lista exhaustiva del mapeo de código):
     `truck_loads.source_ref` · `origin_photos.shipment_ref` · `documents.shipment_ref` ·
     `reports.shipment_ref` · `notification_tasks.shipment_ref` · `audit_log.ref`.
  5. Registra auditoría con `details = {old_ref, new_ref, pin_used:true}` (snapshot antes/después).
- **`shipment_billing` y `operator_assignments` salen de la cascada** porque se migran a `shipment_id`
  en la PR-1 (ver §6). Menos superficie, más seguro.
- **Constraint a nivel DB:** índice único parcial `unique (ref) where not archived` → la base es la
  última línea de defensa contra duplicados, no solo la app.
- **`localStorage 'twf-excluded-refs'`** (refs excluidas, lado cliente): se documenta; al renombrar una
  ref excluida, se actualiza la entrada (caso borde menor).
- **UI:** en el panel de detalle, la REF muestra candado; "Editar REF" abre modal con confirmación
  fuerte + PIN; si choca, alerta que sugiere `A`/`B`.

---

## 6. Billing y asignaciones por `shipment_id`

Hoy `shipment_billing` (PK `ref`) y `operator_assignments` (PK `ref`) se llavean por ref → ambiguas en
las 3 colisiones aéreo↔FCL y frágiles ante el cambio de REF.

- Migración aditiva: agregar `shipment_id` (FK `shipments.id`), backfill desde `ref` (limpio: las
  colisiones tienen 0 billing), volver `shipment_id` la clave (upsert `onConflict='shipment_id'`),
  `ref` queda denormalizado para display.
- `buildBillableItems` / `indexBilling` pasan a `Map<shipmentId, …>`. `getBillingState` busca por
  `op.dbId`.
- `DELETE` de billing/asignaciones por `shipment_id` (FK CASCADE limpia huérfanos).

Esto se hace **antes** del flip y es valioso por sí solo (resuelve la ambigüedad latente de A7794/A7800/A7834).

---

## 7. Acoplamiento con la planilla (Jarvis / briefings)

Post-flip la planilla queda vieja (el equipo edita la web). Hoy los **briefings diarios y skills de
Jarvis leen la Google Sheet en vivo**. Decisión: **opción B — repuntar Jarvis a leer del API de TWF**
(fuente única), en vez de construir un export DB→Sheet (máquina nocturna frágil con escritura a Sheets).
Es más limpio, persistente y es tooling propio de Brian.

- Se expone un endpoint de lectura para Jarvis (reusa `/api/data/shipments`; si hace falta, una vista
  server-side con los campos que los briefings necesitan).
- **Esta parte vive en el repo de Jarvis (`JARVIS CLAUDE`), no en `twfnew`** → es la PR-5, posterior y
  separada. El flip del webapp no la bloquea (la planilla puede seguir leyéndose como respaldo durante
  la transición).

---

## 8. Plan de implementación (PRs incrementales)

Una feature por branch desde `origin/main` + PR (Brian mergea). Cada PR: `typecheck` + `test:run` +
`build` verdes. Migraciones DB aditivas, aplicadas en Supabase ANTES de la PR.

| PR | Qué | Pre-req | Flag | Riesgo |
|----|-----|---------|------|--------|
| **1** | Billing + operator_assignments por `shipment_id` (§6) | — | `sheet` (sync ON) | Bajo |
| **2** | Columnas de Operativas + modelo (§3.1): `DbShipment`, `dbShipmentToOperation`, `EDITABLE_FIELDS`. Sin mover datos, sin cambio de comportamiento | — | `sheet` | Bajo |
| **3** | **Bake + flip de lectura**: endpoint admin idempotente que hornea las 1.153 (§3.2) · `buildOperations` lee FCL de columnas cuando flag=`db` · sync OFF en `db` · tracking lee DB · Operativas editable | 1, 2 | introduce `FCL_SOURCE_OF_TRUTH` | **Medio** (cutover) |
| **4** | **REF editable**: RPC `rename_shipment_ref` + cascada + anti-dup + constraint + UI con PIN (§5) | 3 (flag `db`) | `db` | Medio |
| **5** | **Jarvis lee del API** (§7) — repo `JARVIS CLAUDE`, separado | 3 | — | Bajo |

PR-3 y PR-4 pueden ir juntas o seguidas; se separan para flipear y verificar antes de habilitar el
cambio de REF.

### Seguridad del cutover (PR-3)
- Backup fresco de la planilla antes (ya hay backup diario automático).
- Bake idempotente + verificación: comparar conteos y spot-check de N cargas DB vs lo que mostraba el
  espejo (ya hay precedente de doble corrida en Etapa 2).
- Flag reversible (`db`→`sheet`) con ids conservados → sin duplicados al revertir.
- `sheet_raw` se conserva (respaldo + detalle por contenedor).

---

## 9. Decisiones (ya cerradas por Brian + las que tomo en este spec)

**Cerradas el 10/06 (no se re-preguntan):**
1. Refs duplicadas → sufijo `A`/`B` + `origin_ref`.
2. "Activa" = devuelta Y en fiscal; mismo trigger → pendiente de facturar.
3. Alta → obligatorios solo Ref + Cliente + Tipo.
4. FCL editable todo menos REF; REF con PIN `0000` + cascada + anti-dup.

**Tomadas en este spec (Brian delegó; corregibles):**
5. Arquitectura = tabla única / bake (no overlay). §2
6. Operativas entra al scope (columnas reales editables). §3.1
7. Jarvis → opción B (leer del API), no export DB→Sheet. §7
8. `source='fcl'` como marcador nativo; `id` conservado; `sheet_raw` se guarda de respaldo. §3.2
9. Cutover detrás de flag `FCL_SOURCE_OF_TRUTH`, reversible. §4

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cascada de REF a medias → huérfanos | RPC Postgres transaccional (todo-o-nada) |
| Duplicado de ref | Anti-dup en RPC **+** índice único parcial en DB |
| Tracking muestra datos viejos | Tracking lee de la tabla (no del cache) con flag `db` |
| Bake lossy (N operativas → 1 fila) | `sheet_raw` se conserva con el detalle; la vista ya colapsaba igual |
| Revertir pierde ediciones post-flip | Verificación inmediata + flag; ventana corta y consciente |
| Equipo sigue editando la planilla tras el flip | Cutover operativo coordinado (equipo ya migrando a la web) + planilla legible de respaldo en transición |
| Colisión de ref al crear FCL nativa | Anti-dup + constraint cubren altas y renombrados por igual |

---

## 11. Criterios de aceptación

- Con flag `db`: las 1.153 FCL se editan en la web en TODOS los campos (incl. Operativas) y la REF con PIN.
- El sync de entrada está apagado; editar en la web no se pisa.
- Cambiar una REF arrastra camiones/fotos/documentos/reportes/notificaciones/auditoría, atómicamente.
- Crear/renombrar a una ref existente → bloqueo con sugerencia de sufijo.
- Tracking público de una FCL refleja lo editado en la web.
- Facturación y asignación de operativo de las 3 refs en colisión dejan de ser ambiguas.
- `typecheck` + `test:run` + `build` verdes; round-trip de cada campo verificado.
- Revertir a `sheet` reconstruye el estado sin duplicar filas.
