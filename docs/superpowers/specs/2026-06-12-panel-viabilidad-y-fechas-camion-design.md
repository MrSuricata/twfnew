# Panel: bloque de viabilidad + unificación de fechas de camión — Design

_Fecha: 2026-06-12 · Aprobado por Brian en sesión (con mockup)._

Dos cambios independientes que vinieron en el mismo pedido. Se implementan como **2 PRs separadas** (parte A y parte B), ambas desde main.

---

## PARTE A — Bloque de viabilidad arriba del panel de Operaciones

### Objetivo
Al abrir una operación, mostrar arriba de todo un bloque destacado y visual con los datos
que Brian/el equipo miran para decidir rápido si una carga es viable, y editarlos cómodo
(cuadros grandes + toggles), sin tener que bajar por las secciones. Pensado sobre todo para
los consolidados que el equipo carga a mano (LCL/aéreo/terrestre).

### Decisiones (con Brian, 12/06/2026)
| Tema | Decisión |
|------|----------|
| Campos del bloque | Peso, Volumen, **Bultos**, Fiscal (destino), **Depósito UY (dónde carga)**, Desconsolidación + toggles Apilable / Madera / Entrega en planta |
| "Depósito fiscal" | El campo **fiscal** (destino: CACEC, MARE, ZP RAFAELA…) |
| Depósito UY | El campo **deposito** — **combobox**: sugiere los conocidos (GODILCO, PLANIR, LOBRAUS, TCP, MONTECON, STL) + los ya usados, y deja escribir uno nuevo |
| Editable | **LCL/aéreo/terrestre (DB): editable.** FCL: read-only con candadito (hasta el flip — diseñado para activar FCL-editable con un cambio de una línea cuando llegue) |
| Duplicados | Esos campos se **mueven** al bloque y se sacan de las secciones de abajo (sin duplicar) |
| Estilo | Cuadros grandes editables (valor 24-26px) + toggles Sí/No grandes; el seleccionado en **azul institucional con texto blanco** (estilo de la app) |

### Modelo de datos (migración aditiva, la aplica Jarvis antes del merge)
```sql
alter table shipments
  add column if not exists desconsol_date text,          -- fecha de desconsolidación (YYYY-MM-DD)
  add column if not exists entrega_planta boolean not null default false;
```
- `deposito`, `fiscal`, `pkgs`, `kg`, `m3`, `wood`, `no_apilable` **ya existen** y ya son editables para DB.
- `desconsol_date` y `entrega_planta` son nuevos.

### Tipos
- `DbShipment` (operationsTypes.ts) += `desconsol_date?: string`, `entrega_planta?: boolean`.
- `UnifiedOperation` += `desconsol: string` (desconsolidación) y `entregaPlanta: boolean`.
  - `dbShipmentToOperation`: `desconsol ← desconsol_date || ''`, `entregaPlanta ← !!entrega_planta`.
  - `fclToOperation`: `desconsol ← descarga` (la planilla ya trae DESCARGA por operativa), `entregaPlanta ← false` (no hay dato en el Sheet; read-only).
- `EDITABLE_FIELDS` += `desconsol: { col: 'desconsol_date', type: 'text' }` (date), `entregaPlanta: { col: 'entrega_planta', type: 'bool' }`. (`deposito`, `fiscal`, `pkgs`, `kg`, `m3`, `wood`, `noApilable` ya están.)
- `EDITABLE_FCL_FIELDS`: **sin cambios** (FCL read-only en el bloque por ahora).

### Componente nuevo: `ViabilityBlock` (`src/components/operations/ViabilityBlock.tsx`)
Recibe la `UnifiedOperation`, el `editMode` (db-editable / read-only), y un `onCommit(key, value)`
(el mismo canal que usa el panel hoy). Estructura:
- **6 cuadros grandes** en grid 2-col: Peso (kg, número), Volumen (m³, número), Bultos (número),
  Fiscal destino (texto), Depósito UY (combobox), Desconsolidación (fecha).
  - Numéricos/texto/fecha: click en el cuadro → editás inline (mismo patrón que FieldRow del panel).
  - Depósito UY: input con `<datalist>` poblado de `DEPOSITOS_UY` ∪ depósitos distintos ya
    presentes en las ops (prop `knownDepositos: string[]`), permite valor libre.
- **3 toggles grandes Sí/No**: Apilable (= `!noApilable`), Madera (`wood`), Entrega en planta
  (`entregaPlanta`). Seleccionado = azul institucional, texto blanco. Click togglea y commitea.
  - ⚠️ Apilable es la NEGACIÓN de `noApilable`: UI "Apilable Sí" ⇒ `noApilable=false`.
- Si `editMode` es read-only (FCL): cuadros y toggles muestran el valor con candadito, sin editar.
- Constante `DEPOSITOS_UY = ['GODILCO','PLANIR','LOBRAUS','TCP','MONTECON','STL']` en operationsTypes.ts.

### Integración en `OperationDetailPanel.tsx`
- Renderizar `<ViabilityBlock>` arriba de todo (después del header, antes de la sección Identificación).
- **Sacar** de las SECTIONS los campos que suben al bloque: `kg`, `m3`, `pkgs` (sección Carga),
  `fiscal` y `deposito` (sección Operativa), `descarga` (sección Fechas — es el dato de desconsol).
  De los FLAGS sacar `wood` y `noApilable` (pasan a toggles del bloque).
  **Quedan** abajo: `descripcion`, `tipo` (Carga); `operativa`, `transporte`, `camion`, `despacho`,
  `dev` (Operativa); flags `tlx`, `oog`, `imo`, `seguro`, `certi`, `impresa`; y las secciones
  Identificación, Documental, Ruta y el resto de Fechas (etd, eta, salida, etaFisc, libre, seguimiento).
- `knownDepositos` se calcula en el panel (o en la grilla y se pasa) a partir de las operations.

### Tests
- `operationsTypes.test.ts`: mapeo de `desconsol`/`entregaPlanta` en ambos mappers + presencia en EDITABLE_FIELDS.
- Lógica del toggle Apilable (negación de noApilable): test puro de la transformación si se extrae a helper.

---

## PARTE B — Unificar fecha de carga y salida del camión

### Objetivo
Para consolidados LCL la fecha de carga y la de salida son lo mismo. Brian no quiere ver dos
campos redundantes. Se muestra **un solo campo** "Fecha de carga / salida" que por detrás
mantiene las dos columnas iguales — sin romper la máquina de estados, agenda ni facturación
(que dependen de ambas).

### Decisión (con Brian, 12/06/2026)
**Un solo campo en la UI que escribe ambas columnas (`load_date` = `departure_date`).** NO se
borra ninguna columna de la base (eso rompería estados/agenda/billing/tests). Para Brian
desaparece un campo; internamente quedan sincronizadas.

### Cambios
- `src/components/trucks/TruckBuilder.tsx`:
  - Reemplazar los DOS inputs ("Fecha de carga" + "Fecha de salida") por **uno**:
    "Fecha de carga / salida". Su `onChange` hace `updateTruck({ loadDate: v, departureDate: v })`.
  - El stepper de estado `setStatusWithDate`: el botón "Cargado" y "En tránsito" rellenan AMBAS
    fechas con hoy (hoy "Cargado"→loadDate, "En tránsito"→departureDate; pasan a setear las dos).
    "Arribo a fiscal" sigue igual (arrivalDate). Revisar que no quede inconsistencia (departure < load imposible si son iguales).
  - El input de fecha lee `merged.departureDate || merged.loadDate` (por si hay camiones viejos con solo una).
- `src/lib/agendaUtils.ts` `trucksToEvents`: si `loadDate === departureDate` (o uno vacío),
  emitir **un solo evento** "🟡 Carga/Salida" en esa fecha en vez de dos idénticos. Si difieren
  (camiones viejos), mantener los dos (no romper histórico).
- `src/components/trucks/TrucksList.tsx`: el display de fechas colapsa "Carga X · Sale X" →
  "Carga/Sale X" cuando son iguales.
- `truckUtils.ts` health check "salida anterior a la carga": queda inocuo (iguales) — no tocar.
- Estados (`deriveTruckDisplayStatus`, `deriveTruckCargoStatus`), billing, tracking: **sin cambios**
  (siguen leyendo ambas columnas; al ser iguales, "Cargado" y "En frontera" comparten fecha, que
  es justo lo que Brian quiere para consolidados).

### Base de datos
**Sin migración.** Las dos columnas siguen existiendo; solo se escriben iguales desde la UI.

### Compatibilidad
- Camiones viejos con fechas distintas: se respetan (el input muestra departure||load; la agenda
  mantiene dos eventos solo si difieren). No se fuerza la igualdad retroactiva.

### Tests
- `agendaUtils.test.ts`: camión con load==departure → 1 evento; load≠departure (viejo) → 2 eventos.
- `truckTypes`/builder: el campo único escribe ambas (test del handler si se extrae helper).

---

## Orden de implementación
1. **PR-A** (`feat/panel-bloque-viabilidad`): bloque de viabilidad. Migración primero.
2. **PR-B** (`feat/camion-fecha-unica`): fecha única de camión. Sin migración.
Independientes; se pueden mergear en cualquier orden.

## Fuera de alcance
- FCL editable en el bloque (llega con el flip — el bloque ya queda preparado).
- Borrar columnas de fecha de la base.
- Costos/PDF (ya hechos en PRs previas).
