# Camiones: auditoría + sincronización multi-usuario — Plan (spec incluido)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que nunca más "desaparezcan" cargas de camiones sin rastro: auditoría server-side de toda mutación de trucks/truck_loads, guardado quirúrgico (solo las filas tocadas, no el array entero) y refresco automático al entrar a Camiones.

**Contexto (incidente 12/06):** Brian y Agustina ven distinta cantidad de cargas en el C423 (3 reales en DB vs 5 en la pantalla de ella). Forense identificó 6 mecanismos de pérdida/desync. Los fixes atacan los 4 principales; la auditoría cubre el resto (trazabilidad).

**Causas → fixes:**

| # | Mecanismo (forense) | Fix |
|---|---------------------|-----|
| 1 | Full-array POST: dos usuarios se pisan (stale state re-upserta lo viejo) | **Guardado quirúrgico**: POST solo de las filas afectadas |
| 2 | localStorage viejo gana al entrar / guard de pendingWrites salta el set | **Refetch al entrar a Camiones + al volver el foco** |
| 3 | validateBatch: 1 fila inválida rechaza TODO el batch (cliente cree que guardó) | Quirúrgico reduce blast radius a 1 camión + error ya visible (toast del 12/06) + auditoría del rechazo |
| 4 | Sin rastro de quién borró qué | **logAudit en POST/DELETE de trucks y truck_loads** |
| 5 | Delete optimista sin recovery | Auditoría (rastro) — revert automático queda fuera de alcance |
| 6 | DELETE bulk por truckId sin uso desde la UI | Se audita fuerte (si alguien lo llama, queda registrado) |

**Branch:** `feat/camiones-sync-auditoria` (desde main con #74 mergeada). Gates: `npm run typecheck && npm run test:run && npm run build && npm run lint` (126 tests baseline, sin warnings nuevos). Commits en español. NUNCA push a main. Repo: `C:\Users\Usuario\Desktop\CLAUDE\PAPRIKA CLAUDE\twfnew-hoy`.

**Infra existente:** `audit_log` (ts, usuario, action, entity, ref, details jsonb) + helper `logAudit(db, payload, action, entity, ref, details)` en `api/data/[entity].ts:50-58` (fire-and-forget) + `auditUser` extrae el nombre del token. La pestaña Equipo ya muestra la actividad.

---

### Task 1: Auditoría server-side de camiones

**Files:**
- Modify: `api/data/[entity].ts` — `handleTrucks` (~853-936) y `handleTruckLoads` (~970-1019)

- [ ] **Step 1: Auditar trucks**

En `handleTrucks` POST (después del upsert exitoso, antes del res.json):
1. Antes del upsert: `const ids = deduped.map(r => r.id)` → `const { data: prevRows } = await db.from('trucks').select('id, draft, code').in('id', ids)` → `const prevById = new Map(prevRows.map(...))`.
2. Después del upsert exitoso, para cada fila del batch:
   - Si NO estaba en prevById → `logAudit(db, payload, 'crear', 'camion', row.code, { draft: row.draft })`
   - Si estaba y `prev.draft === true && row.draft === false` → `logAudit(db, payload, 'publicar', 'camion', row.code, {})`
   - Si estaba y `prev.draft === false && row.draft === true` → `logAudit(..., 'despublicar', 'camion', row.code, {})`
   - Cambios comunes de campos NO se auditan (sería ruido por keystroke).

En `handleTrucks` DELETE (antes del delete):
```ts
const { data: t } = await db.from('trucks').select('code').eq('id', id).maybeSingle()
const { data: ls } = await db.from('truck_loads').select('source_ref').eq('truck_id', id)
// ...después del delete exitoso:
logAudit(db, payload, 'eliminar', 'camion', t?.code || id, { cargas_cascadeadas: (ls || []).map(l => l.source_ref) })
```

- [ ] **Step 2: Auditar truck_loads**

POST (después del upsert exitoso):
1. Antes: `const ids = rows.map(r => r.id)` → select de existentes → `newOnes = rows.filter(not in existing)`.
2. Si hay filas nuevas: por cada truck_id afectado, resolver el code (`select id, code from trucks where id in (...)`) y `logAudit(db, payload, 'agregar_cargas', 'camion', code, { refs: [...source_refs nuevas...], pending: [...] })`.
3. Updates de filas existentes NO se auditan individualmente SALVO cambio de `pending` (es estructura): si `prev.pending !== row.pending` → `logAudit(..., row.pending === 'remove' ? 'marcar_quitar_carga' : row.pending === null && prev.pending === 'add' ? 'confirmar_carga' : 'cambio_pending', 'camion', code, { ref: source_ref, de: prev.pending, a: row.pending })`. (El select previo debe traer también `pending, source_ref, truck_id`.)

DELETE por id (antes del delete): select `source_ref, truck_id` → resolver code → después del delete: `logAudit(db, payload, 'quitar_carga', 'camion', code, { ref: source_ref })`.

DELETE por truckId (bulk): select refs antes → `logAudit(db, payload, 'quitar_cargas_bulk', 'camion', truckId, { refs: [...] })`.

También: si `validateBatch` RECHAZA un batch de truck_loads (400): `logAudit(db, payload, 'guardado_rechazado', 'camion', 'batch', { error: v.error, filas: req.body?.length })` — así un guardado fallido deja rastro server-side aunque el cliente lo ignore.

- [ ] **Step 3: Gates + commit**

`npm run typecheck && npm run build` (la API no tiene tests unitarios de handlers — verificar que compila).

```bash
git add api/data/[entity].ts
git commit -m "feat(camiones): auditoria server-side de crear/publicar/eliminar camiones y agregar/quitar cargas"
```

---

### Task 2: Guardado quirúrgico (solo filas tocadas)

**Files:**
- Modify: `src/App.tsx` — `handleUpdateTrucks` (~390), `handleUpdateTruckLoads` (~425)
- Modify: `src/components/trucks/TruckBuilder.tsx` — todos los call-sites
- Modify: `src/components/trucks/TrucksList.tsx` — handleCreate/handleDiscard call-sites
- Test: `src/lib/truckTypes.test.ts` (helper nuevo si aplica)

- [ ] **Step 1: Firmas con scope**

En App, los handlers ganan un parámetro opcional `changedIds`:

```ts
const handleUpdateTrucks = (updated: Truck[], changedIds?: string[]) => {
  setTrucks(updated)
  saveToStorage('twf-trucks', updated)
  const toSave = changedIds ? updated.filter(t => changedIds.includes(t.id)) : updated
  if (isAdminLoggedIn && toSave.length > 0) {
    // ...igual que hoy pero saveTrucks(toSave)
  }
}
```

Ídem `handleUpdateTruckLoads(updated, changedIds?)` → `saveTruckLoads(toSave)`.
Las firmas de los props (`onUpdateTrucks`, `onUpdateTruckLoads`) en DashboardEnhanced/TrucksManagement/TruckBuilder/TrucksList se amplían igual (param opcional — backward compatible con los callers que no lo pasan).

- [ ] **Step 2: Call-sites pasan los ids tocados**

TruckBuilder:
- `updateTruck(patch)`: → `onUpdateTrucks(mapped, [truck.id])`
- `addFcl/addLclAir/addDb`: → `onUpdateTruckLoads([...truckLoads, load], [load.id])`
- `updateLoad(id, patch)`: → `onUpdateTruckLoads(mapped, [id])`
- `removeLoad` (marca pending='remove'): → `onUpdateTruckLoads(mapped, [l.id])`
- `undoRemoveLoad`: ídem `[l.id]`
- `handleSave` (publicado): `onUpdateTrucks(r.trucks, [truck.id])` y `onUpdateTruckLoads(r.loads, idsDeEsteCamion)` donde `idsDeEsteCamion = r.loads.filter(l => l.truckId === truck.id).map(l => l.id)`
- `handleSave` (draft flip): `onUpdateTrucks(mapped, [truck.id])`
- `handleCancel` (publicado): ídem con los ids del camión.

TrucksList:
- `handleCreate`: `onUpdateTrucks([...trucks, truck], [truck.id])`
- `handleDiscard` (pending): `onUpdateTrucks(r.trucks, [t.id])` + `onUpdateTruckLoads(r.loads, idsDeEseCamion)`

OperationsGrid/otros: no llaman estos handlers para camiones — verificar con grep que no quede ningún caller sin revisar (los que no pasan changedIds siguen funcionando como hoy, pero NO debe quedar ninguno del subsistema camiones sin scope).

- [ ] **Step 3: Gates + commit**

`npm run typecheck && npm run test:run && npm run build && npm run lint`

```bash
git add src/App.tsx src/components/trucks src/components/DashboardEnhanced.tsx
git commit -m "feat(camiones): guardado quirurgico - solo se postean las filas tocadas, chau pisadas entre usuarios"
```

(Sumar archivos de props intermedias si el typecheck pide.)

---

### Task 3: Refresco automático de camiones

**Files:**
- Modify: `src/App.tsx` — función `refreshTrucksFromDb` nueva + prop
- Modify: `src/components/trucks/TrucksManagement.tsx` — useEffect on mount + on focus

- [ ] **Step 1: Refetch liviano en App**

```ts
// Refresco liviano SOLO de camiones (al entrar a la pestaña / volver el foco):
// trae la verdad de la DB sin pisar escrituras en vuelo.
const refreshTrucksFromDb = useCallback(async () => {
  if (!isAdminLoggedIn) return
  try {
    const [freshTrucks, freshLoads] = await Promise.all([fetchTrucks(), fetchTruckLoads()])
    if (pendingTrucksWritesRef.current === 0) {
      setTrucks(freshTrucks)
      saveToStorage('twf-trucks', freshTrucks)
    }
    if (pendingTruckLoadsWritesRef.current === 0) {
      setTruckLoads(freshLoads)
      saveToStorage('twf-truck-loads', freshLoads)
    }
  } catch (err) {
    console.warn('[DB] refresh trucks failed:', err)
  }
}, [isAdminLoggedIn])
```

(`fetchTrucks`/`fetchTruckLoads` ya existen en dataClient — sumar al import.) Pasar `onRefreshTrucks={refreshTrucksFromDb}` por DashboardEnhanced → TrucksManagement.

- [ ] **Step 2: Disparos en TrucksManagement**

```ts
// Al entrar a Camiones: traer lo último (multi-usuario). Al volver el foco
// a la ventana, ídem con throttle de 60s.
const lastRefresh = useRef(0)
const doRefresh = useCallback(() => {
  if (Date.now() - lastRefresh.current < 60_000) return
  lastRefresh.current = Date.now()
  onRefreshTrucks?.()
}, [onRefreshTrucks])
useEffect(() => { doRefresh() }, [doRefresh])
useEffect(() => {
  const onFocus = () => doRefresh()
  window.addEventListener('focus', onFocus)
  return () => window.removeEventListener('focus', onFocus)
}, [doRefresh])
```

⚠️ Decisión: NO refrescar con el builder abierto sobre un camión con cambios locales sin persistir... los cambios del builder SÍ se persisten al toque (draft directo / overlay), así que el refetch no pisa nada — y el guard de pendingWritesRef cubre la ventana en vuelo. Refrescar siempre.

- [ ] **Step 3: Gates + commit**

```bash
git add src/App.tsx src/components/DashboardEnhanced.tsx src/components/trucks/TrucksManagement.tsx
git commit -m "feat(camiones): refresco automatico al entrar a Camiones y al volver el foco"
```

---

### Task 4: Gates finales + push + PR

- [ ] Suite completa + push `feat/camiones-sync-auditoria` + link de PR a Brian.

Checklist manual post-merge:
1. Dos navegadores (Brian + otro): A agrega carga → B entra a Camiones → la ve sin refrescar a mano.
2. B con vista vieja edita OTRO camión → no resucita/borra nada del camión de A (guardado quirúrgico).
3. Quitar una carga → en Equipo → Actividad aparece "quitar_carga · camión CXXX · ref EXX" con el usuario.
4. Publicar un borrador → actividad "publicar".
5. Forzar un guardado inválido → actividad "guardado_rechazado" + toast rojo en el cliente.

## Notas para el ejecutor

- `logAudit` es fire-and-forget — NUNCA bloquear ni romper la respuesta por un fallo de auditoría.
- Los selects previos para auditar agregan 1-2 queries por mutación — aceptable (las mutaciones de camiones son poco frecuentes).
- NO tocar la semántica de validateBatch (rechazo total) — el quirúrgico reduce el blast radius y el rechazo ahora queda auditado + visible.
- NO intentar Realtime/websockets — fuera de alcance (queda en backlog).
