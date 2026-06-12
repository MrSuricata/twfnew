# Camiones: borradores con Guardar/Cancelar + costos por m³ — Design

_Fecha: 2026-06-12 · Aprobado por Brian en sesión._

## Objetivo

El armador de camiones LCL (`TruckBuilder`) hoy guarda **cada cambio al instante** en la DB:
camiones a medio armar quedan publicados y afectan estados de cargas, agenda, HOY y
facturación (síntoma: camiones de prueba C445/C447 que hubo que borrar a mano). Se cambia a:

1. **Flujo explícito**: botones **Guardar** y **Cancelar** en el armador.
2. **Borrador persistente**: cerrar sin guardar ni cancelar deja un borrador retomable
   desde cualquier dispositivo — tanto para camiones nuevos como para **ediciones de
   camiones ya publicados** (decisión de Brian: borrador persistente en TODO).
3. **Costos por m³**: 3 campos de costo en el camión (DESPACHO, FLETE TERRESTRE, CARGA
   SOBRE CAMIÓN, en USD); la suma dividida el total de m³ de las cargas muestra el
   **costo por m³** con semáforo.

## Decisiones tomadas (con Brian, 12/06/2026)

| Tema | Decisión |
|------|----------|
| Alcance Guardar/Cancelar | Armado de camión nuevo **y** edición de camión publicado |
| Borrador vs resto del sistema | **Invisible pero reserva**: no afecta estados/agenda/HOY/facturación/tracking; las cargas del borrador no se pueden poner en otro camión |
| Persistencia | **En la DB** (multi-dispositivo, sobrevive a todo) |
| Edición de publicados | **Overlay persistente** (igual que `web_edits` del FCL) — Brian rechazó la simplificación de buffer en memoria |
| Semáforo costo/m³ | **Verde < 75 · Amarillo 75–80 · Rojo > 80** (USD) |
| Código C### | Se asigna al crear el borrador; cancelar deja hueco en la numeración (aceptado) |

## Modelo de datos (migración aditiva en Supabase, la aplica Jarvis antes del merge)

```sql
alter table trucks
  add column draft boolean not null default false,
  add column pending_edits jsonb,
  add column cost_despacho numeric not null default 0,
  add column cost_flete numeric not null default 0,
  add column cost_carga numeric not null default 0;

alter table truck_loads
  add column pending text check (pending in ('add','remove'));
```

- `draft=true` → camión nuevo en armado, ignorado por todo el sistema.
- `pending_edits` → overlay de cambios sin guardar sobre un camión publicado
  (campos del camión: transporte, chofer, patente, fechas, notas, isSider, code, costos).
- `truck_loads.pending` → `'add'` = carga agregada en un borrador de edición ·
  `'remove'` = carga marcada para quitar · `null` = carga confirmada.

## Tipos y helpers (`src/lib/truckTypes.ts`)

- `Truck` += `draft: boolean`, `pendingEdits: Partial<TruckEditableFields> | null`,
  `costDespacho: number`, `costFlete: number`, `costCarga: number`.
- `TruckLoad` += `pending: 'add' | 'remove' | null`.
- **`applyTruckPending(t: Truck): Truck`** — merge overlay→campos (lo que ve el armador).
- **`effectiveTruckLoads(loads, truckId, { includePending })`** — las cargas confirmadas
  (sin pending='add', con pending='remove') para derivaciones, o el merge completo
  (con 'add', sin 'remove') para el armador.
- **`hasDraftState(t, loads): 'draft' | 'pending' | null`** — para badges de la lista
  (un publicado con SOLO cargas pending y sin pending_edits también es 'pending').
- **`truckCostPerM3(t: Truck, loads: TruckLoad[]): { total: number; m3: number; perM3: number | null }`**
  — suma de los 3 costos ÷ m³ del merge del armador; `perM3 = null` si m³ = 0.
- **`costColor(perM3: number): 'green' | 'yellow' | 'red'`** — <75 verde · 75–80 amarillo
  (incluye 80) · >80 rojo.

## Regla de visibilidad (derive-on-read, NO romper)

Todo consumidor que deriva algo de camiones lee **solo lo publicado**:

| Consumidor | Cambio |
|------------|--------|
| `truckByRef` (OperationsGrid) | Salta camiones `draft` y loads `pending='add'` |
| `api/tracking.ts` (copia server) | Ídem (el público jamás ve borradores) |
| `agendaUtils` (eventos camión) | Salta `draft`; usa fechas publicadas (sin overlay) |
| `TodayDashboard` (consolidados en movimiento) | Salta `draft` |
| `billingTypes.buildBillableItems` | Estados efectivos solo con loads confirmadas |
| `AvailableLoadsPanel` (reserva) | Una carga con CUALQUIER truck_load (incl. `pending='add'`) NO está disponible |

`pending='remove'` sigue contando como carga del camión para todas las derivaciones
hasta que se guarde.

## Flujos

### Camión nuevo
1. "Nuevo camión" crea el camión con `draft=true` (código C### asignado ya).
2. El armador edita DIRECTO las columnas reales (es invisible por el flag, no hace falta overlay).
3. **Guardar** → `draft=false` (valida: al menos 1 carga; si no, toast de error).
4. **Cancelar** → confirma y borra el camión (las cargas se liberan — ya funciona así).
5. Cerrar/salir → queda BORRADOR.

### Edición de camión publicado
1. Cualquier cambio de campos en el armador escribe a `pending_edits` (merge en el cliente
   y PATCH del jsonb completo).
2. Agregar carga → truck_load con `pending='add'`. Quitar carga confirmada → `pending='remove'`
   (quitar una que era `pending='add'` → se borra la fila directamente).
3. Los botones de estado (Cargado/En Ruta/…) escriben su fecha en `pending_edits` también.
4. **Guardar** → aplicar `pending_edits` a columnas reales + limpiar · loads `'add'`→null ·
   loads `'remove'`→ borrar fila. En una sola pasada (endpoint o secuencia de PATCHes).
5. **Cancelar** → limpiar `pending_edits` · borrar loads `'add'` · des-marcar `'remove'`.
6. Cerrar/salir → overlay queda = borrador de cambios, retomable.

### Lista de Camiones (`TrucksList`)
- Badge ámbar **BORRADOR** (`draft`) o **CAMBIOS SIN GUARDAR** (`pending_edits` o loads pending).
- Acciones en esos camiones: **Retomar** (abre el armador) · **Descartar** (con confirmación;
  draft → borra el camión · pending → cancela el overlay).

## Costos por m³ (en el armador)

- Sección "Costos del flete" con 3 inputs numéricos USD: **Despacho**, **Flete terrestre**,
  **Carga sobre camión**. Se guardan como campos del camión (pasan por el mismo flujo
  draft/overlay que todo lo demás).
- Indicador en vivo: `(despacho + flete + carga) / m³ totales del camión armado` →
  **"USD XX,XX / m³"** grande, con fondo verde (<75) / amarillo (75–80) / rojo (>80).
  Si no hay m³ cargados → "—" sin color. También muestra el total de costos y los m³.
- En `TrucksList`: el costo por m³ con su color como dato secundario de cada camión
  (si tiene costos cargados).

## UI del armador

- Barra inferior fija: estado a la izquierda (🟡 BORRADOR / 🟠 CAMBIOS SIN GUARDAR /
  ✓ Guardado) · `[Cancelar]` `[💾 Guardar camión]` a la derecha.
- Guardar deshabilitado si no hay cambios que guardar (publicado sin overlay).
- Texto castellano rioplatense, estilo de la app.

## API (`api/data/[entity].ts` + `dataClient`)

- `trucks`/`truck_loads` ya tienen CRUD genérico — las columnas nuevas viajan solas.
- Acción nueva **"commit/discard"**: puede resolverse client-side con la secuencia de
  PATCHes existente (aplicar overlay → limpiar → ajustar loads). Si la secuencia supera
  ~4 requests o queda frágil, evaluar un endpoint `?action=commit` en el handler de trucks
  (decisión del plan de implementación; preferencia: client-side simple primero).

## Testing

- vitest sobre los helpers puros: `applyTruckPending`, `effectiveTruckLoads`,
  `hasDraftState`, `truckCostPerM3` (m³=0 → null), `costColor` (bordes 74.99/75/80/80.01).
- Tests de los consumidores tocados (truckByRef salta drafts; agenda sin drafts).
- Verificación manual en prod: armar camión → cerrar → retomar desde otro dispositivo →
  guardar; editar publicado → cancelar; semáforo con casos reales.

## Fuera de alcance

- Costos por carga individual (el costo es del camión; el prorrateo es solo el indicador /m³).
- Facturar los costos (no toca billing).
- Histórico de borradores ni versionado de cambios.
- El flujo de FCL en camiones (TRASIEGO de la planilla) no cambia.
