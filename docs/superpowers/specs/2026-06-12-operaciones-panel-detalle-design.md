# Operaciones: panel de detalle + grilla angosta + performance — Design

_Fecha: 2026-06-12 · Aprobado por Brian en sesión (con mockups)._

## Problema (reportado por Brian con screenshots de prod)

1. **Demasiadas columnas**: ~20 encendidas por default sobre 43 definidas → scroll horizontal
   constante, info inmanejable.
2. **Lag al cambiar chips de modalidad**: las 1.176 filas se montan TODAS al DOM
   (~25.000 celdas); `OperationRow` es memo pero el cambio de filtro re-monta cientos de
   filas de golpe. Además cada fila crea `new Date()` en cada render y monta editores
   inline por celda.
3. **Edición de CNTR multi-contenedor incómoda** (ej. A6787): la celda trunca con
   `line-clamp-2` y el editor es un input de una línea — no se ve qué contenedores hay.
4. **Chip "Seguimiento vencido" duplicado**: bloque JSX idéntico dos veces
   (`OperationsGrid.tsx:473` y `:496`).

## Decisiones tomadas (con Brian, 12/06/2026)

| Tema | Decisión |
|------|----------|
| Layout | **Opción A: panel de detalle (drawer derecho)** — elegida sobre fila expandible y presets de vistas, viendo mockups |
| Gesto | **Click en cualquier parte de la fila abre el panel.** Debe abrir instantáneo (sin fetch — los datos ya están en `op`) |
| Edición | **TODA la edición pasa al panel.** La grilla queda solo lectura (se quita `EditableCell` de las filas) |
| Columnas default | **Esencial + documental (12)**: Ref · Operativo · Cliente · BL/MAWB/CRT · Depósito · ETA · CNTR · Kg · Fiscal · Camión · Estado · Seguimiento — ajustando anchos para que no quede ancha. El resto disponible en el botón "Columnas" y siempre visible en el panel |
| Lag | **Render incremental** (~150 filas + IntersectionObserver para cargar más), no virtualización completa |
| Estética | Mantener el lenguaje visual actual (header azul #1e3a8a, zebra); no es un rediseño |

## Arquitectura

### 1 · `OperationDetailPanel` (componente nuevo)

`src/components/operations/OperationDetailPanel.tsx` — drawer lateral derecho.

- **Base**: componente `Sheet` estándar de shadcn vendored en `src/components/ui/sheet.tsx`
  (usa `@radix-ui/react-dialog`, ya instalado — **sin dependencia nueva**). Lado derecho,
  ancho ~480px en desktop; en mobile ocupa el ancho completo.
- **Props**: `op: UnifiedOperation | null` (null = cerrado), `truckStatus?: TruckRefInfo`,
  `operators`, `operatorById`, `onAssign`, `onPatch`, `onPatchFcl?`, `onArchive`,
  `onDelete?`, `onClose`.
- **Header**: Ref grande + cliente + badges: modalidad (color `MODALITY_COLORS`), tipo,
  país, estado (o `C### · estado` si va en camión, igual que la celda actual), ARCHIVADA,
  ✏️ con tooltip de campos editados (FCL espejo).
- **Secciones** (siempre las mismas, campos vacíos muestran "—"):
  1. **Contenedores** — ver §2.
  2. **Documental**: BL/MAWB/CRT (docNumber), TLX, buque, línea.
  3. **Ruta**: origen (POL), pto. descarga (POD), destino (destPort), país.
  4. **Fechas**: ETD, ETA, salida, ETA fiscal, LIBRE, seguimiento (rojo si vencido,
     mismo criterio `isSeguimientoVencido`), descarga.
  5. **Carga**: bultos, kg, m³, descripción, tipo, flags (wood / OOG / IMO / no apilable /
     seguro / certi / impresa) como toggles editables donde aplique.
  6. **Operativa**: depósito, operativa, fiscal, transporte, camión, despacho, DEV,
     operativo asignado (select, mismo `operatorsForMode`).
  7. **Acciones** (solo filas DB): archivar/restaurar · eliminar (reusa el flujo de
     confirmación tipeando la ref que ya existe en la grilla).
- **Edición**: mismas reglas que hoy, mismos mapeos:
  - Filas DB → campos de `EDITABLE_FIELDS` (commit con el mismo `onPatch(dbId, {col: v})`).
  - FCL espejo → solo campos de `EDITABLE_FCL_FIELDS` (commit `onPatchFcl(dbId, {KEY: v})`),
    el resto solo lectura con candadito; los campos de operativas (salida/fiscal/LIBRE)
    siguen viniendo de la planilla — etiqueta "planilla".
  - REF nunca se edita (el flujo con PIN llega con el flip — decisión vieja, NO re-abrir).
  - Patrón de input: igual al `EditableCell` actual (click para editar, Enter guarda,
    Esc cancela), pero en layout de formulario label+valor. Bools como switch/checkbox.
- **Apertura/cierre**: estado `selectedUid: string | null` en `OperationsGrid`. El panel
  busca la op por uid en la lista actual (si el dato cambia por un patch, el panel
  muestra el valor fresco — deriva de la misma lista, no copia). Esc y click afuera cierran.

### 2 · Editor de contenedores

Dentro del panel, sección Contenedores:

- Parsea `op.cntr` separando por coma (`split(',')`, trim, filtra vacíos) → lista de fichas.
- Cada ficha: número de contenedor + botón × para quitar (solo si el campo es editable
  para esa fila: DB siempre, FCL espejo vía overlay CNTR).
- Input "+ agregar" al final: normaliza a MAYÚSCULAS, valida formato suave (4 letras +
  7 dígitos = ok; otro formato se acepta con tolerancia — la planilla tiene valores
  irregulares, no bloquear).
- Al confirmar cualquier cambio: serializa `join(', ')` y hace UN commit al campo `cntr`
  (mismo canal que cualquier edición). Sin estado intermedio persistente.
- Contador en el título: "Contenedores (2)".

### 3 · Grilla angosta + solo lectura

- `OPERATION_COLUMNS`: cambiar `defaultOn` → quedan en `true` SOLO: ref, operator,
  cliente, docNumber, deposito, eta, cntr, kg, fiscal, camion, status, seguimiento.
  Pasan a `false`: origin, dischargePort, pais, pkgs, m3, destPort, tipo, wood, transporte.
  Ajustar `w` (max-width) de las 12 para que el total entre sin scroll en ~1500px.
- **Versionar la key de localStorage**: `'twf-ops-columns'` → `'twf-ops-columns-v2'`
  para que el nuevo default aplique también a usuarios con preferencia vieja guardada
  (la personalización posterior se sigue guardando igual). El orden (`twf-ops-col-order`)
  no cambia de key.
- `OperationRow`: se quitan `EditableCell` y los branches de edición (la fila queda de
  presentación pura) → `<tr>` clickeable (`cursor-pointer`, `onClick={() => onOpen(op.uid)}`),
  hover existente. El select de Operativo inline SE MANTIENE (es asignación rápida, no
  edición de datos; `stopPropagation` para no abrir el panel). Los botones
  archivar/eliminar de la columna acciones se mantienen con `stopPropagation`.
- La leyenda al pie ("Click en una celda para editarla…") cambia a "Click en una fila
  para ver y editar el detalle".
- Mobile: tap en la tarjeta abre el mismo panel (full-width). Toda edición que hoy exista
  dentro de `OperationCard` se reemplaza por el panel (única vía de edición).

### 4 · Performance

- **Render incremental**: `const [rowLimit, setRowLimit] = useState(150)` →
  `sorted.slice(0, rowLimit)` para el render (tabla y cards). Un `<tr>` sentinel al
  final con `IntersectionObserver` que hace `setRowLimit(n => n + 150)` al entrar al
  viewport, más una fila "Mostrando X de Y — desplazate para ver más". Reset a 150
  cuando cambia el filtro/orden (`useEffect` sobre `[sorted]` con guard).
  **Totales, export CSV y contadores siguen sobre `sorted`/`filtered` completos** —
  ningún número cambia.
- `hoyRow` (`new Date()` por fila): se calcula UNA vez en el padre (`useMemo`, día) y se
  pasa a `OperationRow` como prop `hoy: Date`.
- Quitar `EditableCell` reduce el peso por celda (sin estado de edición por celda).

### 5 · Fix chip duplicado

Borrar el segundo bloque `{segVencidos > 0 && (...)}` (líneas ~496-507). Queda uno solo,
ubicado junto a "Solo activas".

## Qué NO cambia

Chips modalidad/zona y sus contadores, búsqueda, filtros origen/destino/peso/operativo,
sort y drag de columnas, export CSV, pegado masivo, Nueva carga, Auto-asignar, Operativos,
reglas de edición FCL/DB (mismos endpoints y overlays), tracking, backend (cero cambios
de API o DB).

## Testing

- Unit (vitest): parser/serializador de contenedores (split/join, normalización,
  formatos irregulares) en un helper puro `src/lib/cntrUtils.ts` + tests.
  Lógica de "qué campo es editable para esta op" si se extrae a helper.
- Gates obligatorios: `npm run typecheck` && `npm run test:run` && `npm run build`.
- Manual (preview de Vercel): abrir/cerrar panel, editar campo DB y FCL (✏️ aparece,
  sobrevive refresh), agregar/quitar contenedor en A6787, scroll incremental con
  "Todas" (1.176), cambio de chips sin lag, chip seguimiento único, mobile.

## Fuera de alcance

- Rediseño visual general (colores, branding) — es el mismo lenguaje actual.
- Cambios de backend o modelo de datos.
- Vistas predefinidas de columnas (opción C) — puede ser una mejora futura.
- Edición de REF / flujo PIN (Etapa 4 flip).
