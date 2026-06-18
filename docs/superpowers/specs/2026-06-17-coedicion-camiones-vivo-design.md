# Co-edición en vivo de camiones consolidados — Diseño

**Fecha:** 2026-06-17 · **Estado:** aprobado en brainstorming, pendiente de plan

## Goal
Varios usuarios (Agustina, Diego, Joaquín, Brian…) co-editan el MISMO camión consolidado a la vez y se ven los cambios al instante: agregar/sacar cargas, fechas y datos de cabecera, sin pisarse ni perder trabajo.

## Decisiones tomadas (brainstorming)
1. **Co-editar el mismo camión a la vez** (no solo ver el de cada uno).
2. **Modelo de conflictos HÍBRIDO:** las CARGAS se agregan/sacan en simultáneo sin chocar (son filas distintas, se mezclan solas); la CABECERA (fechas, chofer, transporte, patente, costos, código) se edita **por turnos** (bloqueo suave: uno edita, el resto ve en vivo en lectura con botón "Tomar control").
3. **Transporte = Realtime como "timbre" + refetch:** instantáneo, pero la base sigue 100% detrás del backend. El browser NO lee tablas: solo se conecta a un canal Realtime para recibir avisos y, al recibirlos, re-consulta por el API de siempre.

## Arquitectura

### 1. Borradores: de locales a compartidos y vivos
Hoy un camión en armado es un borrador **local** (`pendingEdits` sin guardar; invisible para otros hasta publicar). Cambia a:
- El camión vive en la DB desde que se crea, **visible para todo el equipo** al instante.
- Cada cambio se **guarda al toque** (se elimina el overlay `pendingEdits` y el "guardar al final"). El armador escribe directo (optimista local + POST + broadcast).
- La bandera `draft` se conserva pero SOLO para que agenda/HOY/tracking/facturación ignoren el camión hasta publicarlo. El equipo siempre ve todos los camiones (incl. borradores) en la lista del armador.

**Impacto:** se desarma el modelo `pendingEdits`/'add'/'remove' (overlay local). Las cargas pasan a confirmarse al instante (no hay estado 'add' local). Esto simplifica el código actual de borradores pero es un cambio grande — se hace en Fase 1.

### 2. Transporte (timbre + refetch)
- Un canal Supabase Realtime `trucks-live`. El browser se suscribe con la **anon key** (pública por diseño) SOLO para `broadcast` + `presence`. No hay acceso a tablas (RLS sin cambios; la postura "todo por el backend" se mantiene).
- **Prerrequisito Fase 1:** exponer `VITE_SUPABASE_URL` + anon key al bundle y crear un cliente Supabase mínimo en el browser usado ÚNICAMENTE para Realtime (no para queries).
- Tras cada escritura de camión/carga (en los handlers `/api/data/trucks` y `/api/data/truck-loads`), el **backend** emite un broadcast `{ kind, truckId }` en el canal.
- Al recibir el aviso, cada browser re-consulta ese camión (`fetchTrucks`/`fetchTruckLoads`) y lo mezcla en su estado. Reusa la **guarda de recencia** ya existente para no pisar escrituras propias en vuelo.

### 3. Cargas — libres y sin choque
- Agregar/sacar una carga = upsert/borrado de una fila `truck_loads` + broadcast → todos refetchan → la carga aparece/desaparece al instante.
- Como son filas con id distinto, dos personas cargando en paralelo nunca chocan.
- **Anti doble-booking:** al agregar una carga (ref) que ya está en otro camión activo, avisar ("esta carga ya está en C44x") — reusar `getAssignedRefs`.

### 4. Cabecera — bloqueo suave por presencia
- Los campos de cabecera (fechas carga/salida/llegada, chofer, transporte, patente, costos, código) se editan por turnos.
- El lock se modela vía **Realtime Presence** en el canal: el primero que entra a editar la cabecera de un camión "reclama" el lock; el resto ve los campos en lectura + botón **"Tomar control"**.
- Presence se libera **solo** al desconectarse/cerrar (Supabase Presence cae en disconnect) → no queda trabado. Empate simultáneo → desempate determinístico (timestamp / userId).

### 5. Presencia — "quién está acá"
- Iniciales/nombre de quién está mirando o editando cada camión, desde la sesión del admin (necesita un nombre de display por sesión — viene del login admin / operador).

### 6. Seguridad
- El browser solo se conecta al canal Realtime (broadcast + presence). NO lee la base, NO escribe la base directo: lecturas y escrituras siguen por el backend autenticado.
- Lo único nuevo expuesto: la anon key (diseñada para ser pública) usada solo para el canal. RLS de tablas sin cambios.

## Componentes / unidades
- **`src/lib/realtimeBus.ts` (nuevo):** crea/gestiona el canal `trucks-live` (suscripción, broadcast helper, presence). Cliente Supabase browser mínimo (solo Realtime).
- **`api/_lib/realtimeBroadcast.ts` (nuevo):** helper server-side para emitir el broadcast tras escribir (usa el service client o el endpoint Realtime).
- **`api/data/[entity].ts`:** los handlers de trucks/truck_loads emiten broadcast tras upsert/delete.
- **`src/App.tsx`:** suscribe al bus al montar (admin), enruta avisos → `refreshTrucksFromDb`/refetch puntual; expone presencia.
- **`TrucksManagement` / `TruckBuilder` / `TrucksList`:** quitan el modelo `pendingEdits` local (guardado inmediato); muestran presencia + lock de cabecera; "Tomar control".
- **`src/lib/truckTypes.ts`:** simplifica `pending`/`pendingEdits` (o se elimina) según el nuevo modelo de guardado inmediato.

## Manejo de errores
- **Desconexión Realtime:** fallback al refresco on-focus actual (ya existe) → degradación elegante a "casi en vivo".
- **Lock huérfano:** presence cae solo en disconnect; además, timeout de inactividad por las dudas.
- **Conflicto de cabecera:** el lock lo previene; si dos escriben por una carrera de presence, gana el último + broadcast (visible al instante).
- **Broadcast perdido:** el refresco on-focus + un refetch periódico suave cierran cualquier hueco.

## Testing
- Puro/unitario: lógica de enrutado de avisos (qué refetch dispara cada `kind`), desempate de lock, anti doble-booking.
- La capa Realtime (websocket) se aísla detrás de `realtimeBus` para poder mockearla.

## Fases (cada una deja algo usable) — reordenadas: aditivo primero ("que no rompa nada")
- **Fase 1 — Timbre Realtime + refetch en vivo (ADITIVA, no toca el modelo de edición):** cliente Supabase browser mínimo (solo Realtime) + canal `trucks-live` + broadcast en las escrituras del backend + enrutar el aviso al `refreshTrucksFromDb` existente (con su guarda de recencia). Resultado: **todo cambio GUARDADO se ve al instante** entre todos (hoy se espera al focus). No toca `pendingEdits` ni el armador → bajo riesgo de regresión.
- **Fase 2 — Guardado inmediato + presencia + bloqueo de cabecera:** desarmar el overlay local `pendingEdits`/'add'/'remove' (guardar al toque) → co-edición simultánea real del mismo camión; + presencia ("quién edita") + bloqueo suave de cabecera + "Tomar control". **Es la parte invasiva** — se hace aislada, con verificación y revisión adversarial.
- **Fase 3 — Anti doble-booking + pulido:** avisos de carga ya asignada, manejo fino de desconexión, indicadores visuales.

## Fuera de scope
- Edición libre carácter-a-carácter (tipo Google Docs) en campos de texto.
- Historial/undo colaborativo.
- Co-edición de otras entidades (operaciones, cotizaciones) — solo camiones.
- Mover el resto de la DB al browser: se mantiene "todo por el backend".

## Riesgos
- **Desarmar `pendingEdits` es invasivo** (toca TruckBuilder/TrucksList/App) — es el grueso de Fase 1; se hace con cuidado + verificación.
- **Prerrequisito anon key/cliente browser** — primer paso de Fase 1; confirmar que el proyecto Supabase tiene Realtime habilitado.
- **Presence para el lock** — empates y reconexión necesitan desempate determinístico y test.
