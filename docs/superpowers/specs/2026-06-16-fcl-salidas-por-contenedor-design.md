# SPEC — FCL: salida/ETA-fiscal por contenedor + estado por depósito + edición desde Agenda/HOY (+ drag&drop)
_Creado 16/06/2026. Diseño aprobado con Brian. Repo: `twfnew` (Vite+React+Supabase). Entrega por fases (cada fase = su PR)._

## 1. Problema
El flip FCL (PR #82) **colapsó las N operativas de una carga a UNA sola fila** (`fclToColumns` usa `firstWith('SALIDA')` → se queda con la fecha del PRIMER contenedor). Consecuencias que Brian vive hoy:
1. **No puede cargar salida/arribo-fiscal por contenedor**, y los contenedores de una misma carga **no siempre salen juntos** (ej. A7743: 3 contenedores, una sola fecha posible).
2. **El estado sale mal** porque `fclColumnsStatus` reconstruye **una** operativa → nunca puede decir "parcialmente en frontera" ni reflejar el paso por el depósito UY. A7743 muestra "Contenedor Devuelto" colapsado.
3. **No hay una etapa "en depósito"**: la carga llega a terminal (TCP/MONTECON) y de ahí salta directo a frontera/fiscal; Brian quiere ver **"En GODILCO" / "En PLANIR"** cuando la movió al depósito.
4. Quiere **editar salida MVD + arribo fiscal desde Agenda/HOY** (no solo desde la grilla), y **drag&drop** en la agenda.

**Clave:** el motor de estado `getShipmentStatus` (`src/lib/shipmentTypes.ts:230`) **YA itera el array `operativas`** y maneja "Carga Hoy (2/3)", "Parcialmente en Frontera", "todos devueltos", etc. El problema es solo de **almacenamiento** (se colapsó). → Hay que **descolapsar** esa dimensión; el motor la absorbe sin cambios.

## 2. Decisiones tomadas (NO re-preguntar)
1. **Modelo = array `operativas` JSONB por contenedor** en `shipments` (descolapsar lo que el flip aplastó). Migración aditiva, sin tabla nueva, sin sumar archivo en `api/` (respeta el tope 12/12). Las columnas sueltas (`salida`/`eta_fiscal`/…) quedan como **rollup derivado** para la grilla/agenda/billing que aún las leen.
2. **Salida MVD + Arribo fiscal = por contenedor** (date-pickers). Es lo que Brian pidió surfacear arriba en el panel.
3. **Depósito UY = uno para toda la carga** (sigue en el combobox del `ViabilityBlock`, sin cambiar).
4. **Estado "En [lugar]" = selector manual por contenedor**, SIN fecha (más amigable). El **lugar de salida** puede ser **terminal (TCP, MONTECON)** o **depósito (GODILCO, PLANIR)** — porque a veces el contenedor **sale directo de terminal** (sin trasiego) y a veces va por depósito. El **depósito sigue siendo uno por carga** (decisión 3, combobox del ViabilityBlock); lo que se elige **por contenedor** es si sale **directo (terminal TCP/MONTECON)** o **vía el depósito de la carga (GODILCO/PLANIR)**. Flujo: llega a terminal → marcás por contenedor de dónde sale → estado "En TCP / MONTECON / GODILCO / PLANIR". Reusa el campo `deposito` (ya admite esos valores) + un flag/lugar por contenedor.
5. **Click en Agenda/HOY = quick-edit popover** de las 2 fechas del contenedor + botón **"más datos"** que abre el panel completo.
6. **Drag&drop = SÍ, en fase aparte** (la última). Brian: "hacemos todo, por partes".
7. **Backfill desde `sheet_raw.operativas`** (verificado: tiene las operativas originales por contenedor para las FCL migradas) → restaura fechas reales, no arranca de cero.

## 3. Arquitectura por superficie

### A. Modelo / persistencia (fundacional)
- **Migración aditiva:** `shipments` += `operativas jsonb` (array). Cada elemento: `{ cntr, salida, eta_fiscal, en_deposito(bool), operativa, descarga, dev, ... }` (forma alineada a `OperativasRecord`). El **depósito sigue a nivel carga** (`deposito` columna), no por contenedor.
- **Fuente de verdad** de salida/eta_fiscal/en_deposito = el array `operativas`. Las columnas sueltas `salida`/`eta_fiscal` se recalculan como **rollup** en cada escritura (regla: `salida` = la más temprana de los contenedores; `eta_fiscal` = la más tardía; indicador "varias" si difieren) para no romper grilla/agenda/billing/tracking que leen columnas. (Alternativa de refactor total descartada por riesgo.)
- **`dbFclToParsedShipment`** (`operationsTypes.ts:341`) pasa a mapear el array completo a `ParsedShipment.operativas` (en vez de construir `[op]`). `fclColumnsStatus` deja de sintetizar 1 op y usa el array real.
- **`fclToColumns`** (inverso, para altas/ediciones): escribe el array + recalcula el rollup.
- **Backfill (one-shot):** poblar `operativas` desde `sheet_raw.operativas` para las 1.153 FCL migradas (restaura por-contenedor). Reconciliar con ediciones post-flip que viven en las columnas sueltas (el flip fue 16/06 → riesgo bajo; regla: si la columna difiere del sheet_raw, gana la columna en la op correspondiente/primera). Tolerar fechas basura (`2001-07-17`, `1-ago-`, vacíos). FCL creadas en la web post-flip (sin `sheet_raw.operativas`) → sembrar array de 1 desde las columnas actuales.

### B. Motor de estado (`getShipmentStatus`, sin reescribir lo que ya anda)
- Ya soporta multi-op. Cambios mínimos:
  - **Nueva sub-etapa "En [lugar]"**: si la carga llegó (ETA) Y un contenedor tiene un lugar de salida marcado (`lugar_salida` ∈ {TCP, MONTECON, GODILCO, PLANIR}) Y aún no tiene SALIDA → ese contenedor está "En TCP / MONTECON / GODILCO / PLANIR". Insertar entre "llegó a terminal" y SALIDA. (Directo = TCP/MONTECON; trasiego = GODILCO/PLANIR.)
  - **Terminal con nombre:** mientras no se marcó lugar, el estado "en terminal" muestra el terminal real (`terminal` = TCP/MONTECON) → "En terminal (TCP)".
  - **Combinación:** el estado de la CARGA combina los micro-estados por contenedor (reusa la lógica `every`/`some` existente: parcial en depósito / parcial en frontera / etc.).
- **Micro-estado por contenedor** (para el panel y la agenda): función que dado un contenedor (su op) devuelve su etapa (En terminal / En [depósito] / En frontera / Carga hoy / En fiscal / Devuelto).

### C. Panel de detalle (`OperationDetailPanel.tsx`)
- **Sección nueva** después del `ViabilityBlock` y antes de "Contenedores": una fila por contenedor con **Salida MVD** + **Arribo fiscal** (date-pickers reusando `StatBox kind='date'`) + **selector de lugar de salida** (TCP / MONTECON / GODILCO / PLANIR) + micro-estado. (Mockup aprobado con Brian.)
- Persistencia: el commit escribe en el array `operativas` (índice del contenedor) vía PATCH; el server recalcula rollup.
- El combobox "Depósito UY" del ViabilityBlock queda (uno por carga).

### D. Agenda + HOY (`DashboardEnhanced.tsx` + `src/components/agenda/*`)
- **Eventos por contenedor:** `shipmentsToEvents` ya parsea `operativas[]` → con el array real, cada contenedor genera sus propios eventos salida/eta_fisc. Enriquecer `CalendarEvent` con `shipmentId` + `containerIndex` (hoy solo lleva REF) para poder editar/mover el correcto.
- **Click → quick-edit popover:** Salida MVD + Arribo fiscal de ESE contenedor (date-pickers) + botón **"más datos"** → abre el panel completo. Hoy HOY usa `ShipmentDetailsDialog` editable y Agenda lo usa read-only (`clientView=true`) → **habilitar edición admin en Agenda** (distinguir admin de portal cliente).
- Guardar desde el popover → mismo PATCH del array.

### E. Drag & drop (fase final)
- No hay librería ni calendario de terceros (grid 100% a mano, tarjetas estáticas). Plan: instalar `@dnd-kit`, hacer `AgendaEventCard` draggable, celdas de fecha como drop zones, `onDropEvent(shipmentId, containerIndex, nuevaFecha)` → PATCH del array. Feedback visual (ghost/hover), evitar drags accidentales, parseo local de fecha. Riesgo alto → fase aislada y bien testeada.

### F. API / persistencia
- PATCH `/api/data/shipments?id=…` (handler `handleShipments` en `api/data/[entity].ts`): whitelistear la nueva columna `operativas` en `SHIPMENT_COLS`; al escribir el array, recalcular rollup en el server (o en el cliente antes de mandar — definir en plan, server es más seguro). Audit log como hoy. **Sin archivo nuevo en `api/`**.

## 4. Fases (cada una = su PR, "por partes")
- **Fase 1 — Modelo + estado + panel:** migración `operativas jsonb` + rollup + backfill desde `sheet_raw` + `dbFclToParsedShipment`/`fclColumnsStatus`/`fclToColumns` al array + estado "En [depósito]" (botón manual) + terminal con nombre + micro-estado por contenedor + sección nueva en el panel. **Entrega el valor central:** estado correcto + carga/edición de fechas por contenedor.
- **Fase 2 — Agenda/HOY:** eventos por contenedor + quick-edit popover (2 fechas) + "más datos" → panel + Agenda editable para admin.
- **Fase 3 — Drag&drop:** `@dnd-kit` en la agenda.

## 5. Tests / verificación (cada fase)
- Round-trip de persistencia del array `operativas` (escribir/leer reproduce las fechas por contenedor).
- **Fidelidad de estado:** estados parciales (2/3 en frontera, 1 en depósito, etc.) + "En [depósito]" + terminal nombrado, contra casos armados.
- **Backfill:** comparar `operativas` reconstruido vs `sheet_raw.operativas` para una muestra; reconciliación con columnas post-flip.
- `npm run typecheck` (src+api) + `npm run test:run` (vitest, los 146 verdes + nuevos) + `npm run build`. PR a Brian (gh no autenticado, mergea él).

## 6. Riesgos
- **Sync del rollup:** la regla más-temprana/más-tardía debe quedar consistente con lo que muestran grilla/agenda/billing. Cubrir con tests.
- **Grilla con fechas distintas:** mostrar la más temprana + indicador "varias" (no romper el sort por fecha).
- **Precedencia de estado** con mezcla (algunos en depósito, otros en terminal/frontera): extender `getShipmentStatus` con cuidado, no romper los estados actuales.
- **Backfill vs ediciones post-flip:** el flip fue hoy → bajo riesgo, pero la regla de reconciliación debe priorizar la columna (última edición web) sobre el `sheet_raw` congelado.
- **Drag&drop:** mayor riesgo/UX → fase aislada.
- **Migración:** aditiva (columna jsonb nullable) → inofensiva sin desplegar.

## 7. Fuera de scope
- Depósito por contenedor (es uno por carga). Pagos/checks naviera (eso es el follow-up de PR-E §9, feature aparte). n8n. Tocar la Google Sheet. Reescribir grilla/billing para leer el array (se mantiene el rollup).

## 8. Relación con PR-E
Esta feature pone las fechas por contenedor en la DB → cuando se haga el core `jarvis_db.py` (PR-E), leerá ese array y Jarvis tendrá el detalle por contenedor. La migración de columnas podría compartirse con la feature §9 de PR-E (pagos/checks), pero son entregas separadas.
