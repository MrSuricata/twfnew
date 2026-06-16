# FCL salida/ETA por contenedor — Fase 2 (editar desde Agenda/HOY) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Stacked sobre `feat/fcl-salidas-por-contenedor` (Fase 1). Branch: `feat/fcl-salidas-agenda`. Mergea DESPUÉS de Fase 1.

**Goal:** Desde Agenda y HOY, click en una carga/contenedor → **quick-edit** de Salida MVD + Arribo fiscal (+ lugar) de ESE contenedor, con botón **"más datos"** que abre el panel completo. La Agenda pasa a editable para admin.

**Architecture:** El `CalendarEvent` ya carga `event.shipment` (ParsedShipment con `__dbId`) y `event.op` (OperativasRecord del contenedor). Un Popover (Radix, ya en el repo) edita las 2 fechas + lugar del `op`, reconstruye el array con los helpers ya exportados de Fase 1 (`resolveRecord`/`buildNextOperativas` en `ContainerDatesSection.tsx`) y persiste con `PATCH /api/data/shipments?id=<dbId>` `{operativas}` (el server recomputa el rollup — Fase 1). "Más datos" abre el `OperationDetailPanel` (que ya tiene la sección por contenedor) vía estado de navegación elevado a `DashboardEnhanced`.

**Tech Stack:** React+TS, Radix Popover, Vitest. Solo front (la API ya acepta `operativas` desde Fase 1). Sin migración.

**Spec:** `docs/superpowers/specs/2026-06-16-fcl-salidas-por-contenedor-design.md` (§3D)

---

## File Structure
- `src/lib/agendaUtils.ts` — `shipmentsToEvents`: además de `salida`, generar evento `eta_fisc` por op con ETA_FISC válida.
- `src/components/operations/ContainerQuickEdit.tsx` — **(nuevo)** popover de 1 contenedor (salida + eta_fiscal + lugar + botón "más datos"). Reusa `resolveRecord`/`buildNextOperativas` de `ContainerDatesSection`.
- `src/components/agenda/AgendaEventCard.tsx` / `AgendaCalendar.tsx` — al click, abrir el `ContainerQuickEdit` (admin) en vez del diálogo read-only.
- `src/components/TodayDashboard.tsx` — mismo quick-edit en las filas de HOY.
- `src/components/DashboardEnhanced.tsx` — threadear `onPatchShipment` a Agenda/HOY; elevar `detailUid` (navegación a panel) + `onOpenDetail(uid)`.
- `src/components/operations/OperationsGrid.tsx` — aceptar `selectedUid`/`onSelectedUidChange` controlados (para que "más datos" abra el panel).
- Tests: `src/lib/agendaUtils.test.ts`, `src/components/operations/ContainerDatesSection.test.ts` (helpers ya testeados; sumar el caso del quick-edit si aplica).

---

## Task 1: Eventos `eta_fisc` en la agenda

**Files:** Modify `src/lib/agendaUtils.ts` (`shipmentsToEvents` ~217-285). Test: `src/lib/agendaUtils.test.ts`.

- [ ] **Step 1:** Test — un shipment con op `{CNTR_OP:'A', SALIDA:'2026-06-16', ETA_FISC:'2026-06-18'}` genera DOS eventos: uno `type:'salida'` en 2026-06-16 y uno `type:'eta_fisc'` en 2026-06-18, ambos con `op.CNTR_OP==='A'`.
- [ ] **Step 2:** Run → falla (hoy solo genera `salida`). `npm run test:run -- src/lib/agendaUtils.test.ts`
- [ ] **Step 3:** En `shipmentsToEvents`, junto al bloque que hace `makeEvent('salida', op.SALIDA)`, agregar: `if (isValidDateStr(op.ETA_FISC)) events.push(makeEvent('eta_fisc', op.ETA_FISC))`. Reusar el `makeEvent` local (mismo `id` patrón `${REF}-${CNTR_OP}-${type}`).
- [ ] **Step 4:** Run → pasa, y la suite completa verde.
- [ ] **Step 5:** Commit `feat(agenda): generar eventos eta_fisc por contenedor`.

## Task 2: `ContainerQuickEdit` (popover de 1 contenedor)

**Files:** Create `src/components/operations/ContainerQuickEdit.tsx`.

- [ ] **Step 1:** Componente que recibe `{ shipment: ParsedShipment, cntr: string, editable: boolean, onSaved: ()=>void, onPatch: (dbId, fields)=>Promise<void>|void, onMasDatos: ()=>void }`. Usa Radix `Popover` (`@/components/ui/popover`). Contenido: header con la ref + CNTR; dos `<input type="date">` (Salida MVD, Arribo fiscal) con draft + commit on blur; un `<select>` lugar (''/TCP/MONTECON/GODILCO/PLANIR); botón "Más datos →" que llama `onMasDatos`.
- [ ] **Step 2:** Save: tomar `shipment.operativas || []`, usar `resolveRecord`/`buildNextOperativas` (importados de `./ContainerDatesSection` — ya exportados) para construir el array con el contenedor `cntr` actualizado, y llamar `onPatch(shipment.__dbId, { operativas: next })`. Si `!shipment.__dbId` (FCL espejo pre-flip, no debería pasar post-flip) → deshabilitar edición. Después de guardar, `onSaved()`.
- [ ] **Step 3:** Micro-estado del contenedor arriba (reusar el patrón de `ContainerDatesSection`: `getShipmentStatus({REF, ETA, operativas:[op]}).label`).
- [ ] **Step 4:** Typecheck + build. Commit `feat(agenda): ContainerQuickEdit popover por contenedor`.

## Task 3: Threadear patch + navegación en DashboardEnhanced

**Files:** Modify `src/components/DashboardEnhanced.tsx`, `src/components/operations/OperationsGrid.tsx`.

- [ ] **Step 1:** En `DashboardEnhanced`: elevar el estado de detalle. Hoy `selectedUid` vive en `OperationsGrid`. Agregar en DashboardEnhanced `const [detailUid, setDetailUid] = useState<string|null>(null)` y pasar a `OperationsGrid` como props controladas `selectedUid={detailUid}` + `onSelectedUidChange={setDetailUid}`. (En `OperationsGrid`, si vienen esas props usarlas; si no, mantener el estado interno actual — backward compatible.)
- [ ] **Step 2:** En `DashboardEnhanced`, definir `onOpenDetail = (uid: string) => { setActiveTab('operaciones'); setDetailUid(uid) }`. Necesita el `uid` de la operación FCL para una ref — derivarlo igual que `buildOperations` (`fcl-${REF}`), o exponer un helper. Como Agenda trabaja con refs, mapear ref→uid: el uid FCL es `fcl-${REF}` (ver `buildOperations`); pasar `onOpenDetail` que reciba la REF y arme `fcl-${ref}`.
- [ ] **Step 3:** Definir `onPatchShipment` (ya existe para la grilla — `onPatchShipment(id, fields)` que hace el PATCH). Pasarlo también a `AgendaCalendar` y `TodayDashboard`.
- [ ] **Step 4:** Typecheck + build + tests. Commit `feat(ops): elevar estado de detalle + threadear patch a agenda/hoy`.

## Task 4: Enchufar quick-edit en Agenda (editable para admin)

**Files:** Modify `src/components/agenda/AgendaCalendar.tsx` (+ props), `AgendaEventCard.tsx` si hace falta.

- [ ] **Step 1:** `AgendaCalendarProps` += `onPatchShipment?`, `onOpenDetail?: (ref:string)=>void`, `editable?: boolean` (admin). DashboardEnhanced pasa `editable` true (es el dashboard admin), `onPatchShipment`, `onOpenDetail`.
- [ ] **Step 2:** Al seleccionar un evento: si `editable`, abrir `ContainerQuickEdit` (anclado al card) con `shipment=event.shipment`, `cntr=event.cntr`, `onPatch=onPatchShipment`, `onMasDatos={() => onOpenDetail?.(event.ref)}`, `onSaved` = cerrar + refrescar. Si no editable (portal cliente/partner), mantener el diálogo read-only actual.
- [ ] **Step 3:** Tras guardar, refrescar la data (el dashboard re-fetchea; reusar el mecanismo de refresh existente de la grilla/HOY — `onUpdateShipments` o re-fetch). Verificar que el evento refleje la fecha nueva.
- [ ] **Step 4:** Typecheck + build. Commit `feat(agenda): quick-edit de salida/arribo por contenedor (admin)`.

## Task 5: Quick-edit en HOY

**Files:** Modify `src/components/TodayDashboard.tsx`.

- [ ] **Step 1:** Las filas de HOY ya son clickeables (abren `ShipmentDetailsDialog`). Cambiar (para admin) a abrir `ContainerQuickEdit` con el contenedor de esa fila (HOY agrupa por op/contenedor — usar el `op`/`cntr` de la fila), `onPatch`, `onMasDatos`. Mantener el botón/acción "más datos" → `onOpenDetail(ref)`.
- [ ] **Step 2:** Typecheck + build + tests. Commit `feat(hoy): quick-edit de salida/arribo por contenedor`.

## Task 6: Verificación + PR

- [ ] `npm run typecheck` + `npm run test:run` + `npm run build` verdes.
- [ ] Push `feat/fcl-salidas-agenda` + link PR a Brian (mergear DESPUÉS de Fase 1).
- [ ] Checklist preview (Vercel): en Agenda, click en un evento de salida → popover con las 2 fechas → editar → se persiste y el evento se mueve · botón "más datos" abre el panel en la pestaña Operaciones · en HOY ídem · portal cliente sigue read-only.

---

## Riesgos
- **Persistencia desde el diálogo viejo:** NO la tocamos — el quick-edit persiste vía PATCH `operativas` (camino probado en Fase 1). El diálogo read-only del portal cliente queda igual.
- **Elevar `selectedUid`:** hacerlo backward-compatible (props opcionales) para no romper el uso actual de la grilla.
- **Refresh tras guardar:** asegurar que la agenda re-lea (no mostrar fecha vieja). Reusar el refresh existente.
- **Admin-only:** el quick-edit editable solo en el dashboard admin; portal cliente/partner mantiene read-only.

## Fuera de scope
- Drag&drop (Fase 3). Editar campos no-fecha desde el popover (eso es "más datos" → panel). Persistencia full del ShipmentDetailsDialog para FCL.
