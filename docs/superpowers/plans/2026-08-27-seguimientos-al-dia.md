# Seguimientos: sección "Al día" con acciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cargas "al día" dejen de ser solo un contador en la pestaña Seguimientos y pasen a ser filas visibles (plegadas) con las MISMAS acciones que las pendientes, + opción de estampar el seguimiento con otra fecha.

**Diseño acordado con Brian (27/08, AskUserQuestion):** cola en la pestaña propia
(ya existe: `SeguimientosBoard`) · entran vencidas + por vencer + sin fecha (las
"al día" visibles abajo, apagadas) · botón "Enviado hoy" 1 click + otra fecha
opcional. **Problema que resuelve** (Brian, caso A7995): Nico labura proactivo —
mandó seguimiento el 19/08 y de nuevo el 25/08 — pero una carga con seguimiento
fresco desaparece del tablero (solo suma al contador "al día"), y para tocarle
algo (ETA, trasbordo, update anticipado) hay que ir a Operaciones y abrir el
modal. Las nunca-enviadas y vencidas YA aparecen (colaSeguimientos las cubre).

**Architecture:** `colaSeguimientos()` pasa a devolver `alDia` como
`FilaSeguimiento[]` (ordenadas: más próximas a vencer primero) en vez de un
número. `SeguimientosBoard` agrega una sección plegada "Al día" que reusa
`filaRow()` tal cual (todas las acciones andan gratis) y generaliza
`marcarEnviado` para aceptar una fecha distinta de hoy vía popover.

**Tech Stack:** React + TS, vitest. Sin cambios de API ni DB.

---

### Task 1: `colaSeguimientos` devuelve las filas al día (TDD)

**Files:**
- Test: `src/lib/seguimientos.test.ts` (nuevo — el módulo no tiene tests)
- Modify: `src/lib/seguimientos.ts:66-72` (interface) y `:92-158` (función)

- [ ] **Step 1: Test que falla** — casos: carga con seguimiento hace 2 días entra
  en `alDia` como fila con `dias: 2`; nunca-enviada y 7+ días siguen en
  `pendientes`; `alDia` ordenada por `dias` DESC (más cerca de vencer primero) y
  a igualdad ETA más próxima; archivadas/aéreas afuera de todo.
- [ ] **Step 2: `npx vitest run src/lib/seguimientos.test.ts`** → FAIL (alDia es number).
- [ ] **Step 3: Implementar** — `alDia: FilaSeguimiento[]` en la interface (doc:
  "Cargas en viaje con seguimiento fresco (<7 días), ordenadas: más próximas a
  vencer primero"), `else alDia.push({ carga: c, dias, ...(etaVencidaDias...) })`,
  y sort al final: `b.dias - a.dias` → ETA asc → ref.
- [ ] **Step 4: Test verde.** Typecheck va a marcar los usos de `cola.alDia`
  como number → se arreglan en Task 2 (mismo commit NO: commit acá solo lib+test
  compila porque el board se toca en Task 2 — hacer Tasks 1+2 en un solo commit
  si el typecheck del repo no permite el intermedio).

### Task 2: Sección "Al día" en el board + otra fecha

**Files:**
- Modify: `src/components/SeguimientosBoard.tsx`

- [ ] **Step 1:** `cola.alDia` → `cola.alDia.length` en el subtítulo (líneas ~566-567).
- [ ] **Step 2:** chip de días en `filaRow`: si `f.dias !== null && f.dias < SEGUIMIENTO_DIAS`
  → estilo esmeralda con title "vence en X días" (hoy solo existe NUNCA rojo / HACE ND ámbar).
- [ ] **Step 3:** sección nueva al final del listado de pendientes:
  `useState(false)` `alDiaAbierto`; botón toggle "✅ Al día (N) — próximas a vencer
  primero" que expande la lista `cola.alDia.map(f => filaRow(f, true))`
  (con ETA editable por fila). Si N=0 no se muestra.
- [ ] **Step 4:** otra fecha: `marcarEnviado(f, silencioso, fecha = hoyIso())`
  + botón chico calendario junto a "Enviado hoy" (Popover con `<input type="date">`
  default hoy + botón Estampar). Toast: "seguimiento enviado DD/MM · vuelve a la
  cola en X días" con Deshacer (X = SEGUIMIENTO_DIAS − días transcurridos).
- [ ] **Step 5:** `npm run typecheck && npm run test:run && npm run build` → verde.
- [ ] **Step 6:** commit + push + link de PR a Brian.

**Fuera de alcance:** tocar las reglas de la cola (quedaron 13/08), el digest de
clientes (branch aparte), y estampar seguimiento automático cuando sale el digest
(idea anotada para después).
