# FCL salida/ETA por contenedor — Fase 3 (drag&drop en la Agenda) — Plan

> REQUIRED SUB-SKILL: subagent-driven-development. Branch: `feat/fcl-agenda-dnd` (desde main, ya con Fase 1+2+diálogo). Mergea solo.

**Goal:** Arrastrar un evento en la **week view** de la Agenda a otro día → cambia la fecha de ESE contenedor (SALIDA si el evento es `salida`, ETA_FISC si `eta_fisc`) y persiste vía `onPatchShipment(dbId, { operativas })`.

**Architecture:** `@dnd-kit/core`. `DndContext` envuelve el grid en `AgendaCalendar`; `PointerSensor` con `activationConstraint: { distance: 8 }` separa tap (abre quick-edit) de drag. `AgendaEventCard` = `useDraggable` (data: el `CalendarEvent`). Cada celda-día de la week view = `useDroppable` (id = `dateKey` "YYYY-MM-DD"). `onDragEnd`: `field = event.type==='salida'?'SALIDA':'ETA_FISC'`; `over.id` = fecha nueva; `buildPatchedOperativas(event.shipment, event.cntr, { [field]: over.id })` → `onPatchShipment`. El update optimista de `handlePatchShipment` (App) refleja al instante. Solo cuando `editable`.

**Scope:** SOLO week view (tiene las tarjetas en celdas droppables). Month/day/annual sin DnD (month solo muestra puntitos + celdas-botón que navegan; fuera de scope). El click→quick-edit de Fase 2 sigue intacto.

---

## Task 1: Instalar @dnd-kit/core
- [ ] `npm install @dnd-kit/core` (v6.x, compat React 19). Verificar `npm run build` sigue verde.
- [ ] Commit `chore: add @dnd-kit/core for agenda drag&drop`.

## Task 2: `AgendaEventCard` draggable (opt-in)
**File:** `src/components/agenda/AgendaEventCard.tsx`
- [ ] Sumar prop `draggable?: boolean`. Cuando `draggable`, usar `useDraggable({ id: event.id, data: { event } })` y aplicar `ref={setNodeRef}` + `{...listeners}` + `{...attributes}` al `<button>` (mismo botón que tiene `onClick` — el `PointerSensor` con distancia separa click de drag, así que NO se rompe el click→quick-edit). Estilo: `cursor-grab` cuando draggable; `opacity-50` mientras `isDragging`. El `TooltipTrigger asChild` ya envuelve ese botón → spreads van en el botón directo.
- [ ] (Sin cambio de comportamiento cuando `draggable` es false/ausente.)
- [ ] Commit.

## Task 3: `AgendaWeekView` celdas droppable
**File:** `src/components/agenda/AgendaWeekView.tsx`
- [ ] Sumar prop `editable?: boolean`. Extraer la celda-día a un subcomponente `WeekDayCell` que llama `useDroppable({ id: dateKey })` y aplica `ref={setNodeRef}` al `<div>` de la celda (líneas ~68-90). Resaltar la celda cuando `isOver` (ej. `bg-[#1e3a8a]/5 ring-1 ring-[#1e3a8a]/30`).
- [ ] Pasar `draggable={editable}` a cada `<AgendaEventCard>`.
- [ ] Commit.

## Task 4: `AgendaCalendar` — DndContext + onDragEnd + DragOverlay
**File:** `src/components/agenda/AgendaCalendar.tsx`
- [ ] Importar `DndContext, PointerSensor, useSensor, useSensors, DragOverlay, type DragEndEvent` de `@dnd-kit/core` + `buildPatchedOperativas` de `../operations/ContainerQuickEdit`.
- [ ] `const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))`.
- [ ] Envolver el grid (`<div className="flex overflow-hidden rounded-xl border bg-card shadow-sm">` ~línea 298) en `<DndContext sensors={sensors} onDragEnd={handleDragEnd}>` (solo cuando `editable`; si no, sin DndContext).
- [ ] `handleDragEnd(e: DragEndEvent)`:
```ts
const ev = e.active.data.current?.event as CalendarEvent | undefined
const newDate = e.over?.id as string | undefined   // dateKey "YYYY-MM-DD"
if (!ev || !newDate || !ev.shipment?.__dbId || !ev.cntr) return
if (ev.type !== 'salida' && ev.type !== 'eta_fisc') return  // solo eventos de fecha movible
if (newDate === ev.date) return                              // no se movió
const field = ev.type === 'salida' ? 'SALIDA' : 'ETA_FISC'
const next = buildPatchedOperativas(ev.shipment, ev.cntr, { [field]: newDate })
onPatchShipment?.(ev.shipment.__dbId, { operativas: next })
```
- [ ] Pasar `editable` a `<AgendaWeekView>`. (Solo week view; las otras views quedan fuera del DndContext o sin droppables.)
- [ ] DragOverlay (opcional pero recomendado): renderizar una `AgendaEventCard compact` del evento activo durante el drag para un preview limpio (trackear `activeEvent` en `onDragStart`).
- [ ] Commit.

## Task 5: Test de la lógica de drop (pura)
**File:** `src/components/agenda/agendaDnd.test.ts` (o donde viva la lógica)
- [ ] Extraer la derivación a una función pura testeable `dropPatch(event, newDate)` → `{ dbId, fields } | null` (encapsula el handleDragEnd sin el efecto). Tests: arrastrar un evento `salida` a otra fecha → `fields.operativas` tiene la nueva SALIDA para ese cntr, las demás ops intactas; evento `eta_fisc` → ETA_FISC; mismo día → null; sin `__dbId` → null.
- [ ] `AgendaCalendar.handleDragEnd` usa `dropPatch`.
- [ ] Commit.

## Task 6: Verificación + PR
- [ ] `npm run typecheck` + `npm run test:run` + `npm run build` verdes.
- [ ] Push `feat/fcl-agenda-dnd` + link PR a Brian.
- [ ] Checklist preview (Vercel): en week view, arrastrar un evento de salida a otro día → el evento se mueve + la fecha persiste (recargar lo confirma) · el click corto sigue abriendo el quick-edit (no se rompe) · drag de un `eta_fisc` actualiza el arribo fiscal · portal cliente (no editable) NO permite drag.

---

## Riesgos
- **Click vs drag:** `PointerSensor` distance:8 lo separa; si el click se rompe, subir/bajar la distancia. El botón ya está en `TooltipTrigger asChild` → los spreads van en el botón directo.
- **Solo week view:** documentado; month/day/annual sin DnD (sería otra fase). Arrastrar en week es la UX principal.
- **Persistencia/refresh:** reusa `onPatchShipment` (update optimista en App → refleja al instante), mismo camino probado en Fase 2.
- **No reintroducir** escritura al cache `shipments` (bug ya arreglado) — el drop SOLO usa `onPatchShipment`.

## Fuera de scope
- DnD en month/day/annual. Arrastrar para reordenar dentro del mismo día. Cambiar lugar/otros campos por drag (eso es el quick-edit).
