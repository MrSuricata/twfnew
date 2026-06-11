# Analíticas con datos reales — Design

_Fecha: 2026-06-11 · Aprobado por Brian en sesión._

## Objetivo

La pestaña Estadísticas (`AnalyticsDashboard`) hoy recibe solo FCL (`ParsedShipment[]`) y el
"PDF" es un `window.print()` de una tabla pelada de 6 columnas. Se extiende para que:

1. Use datos de **TODAS las cargas** (FCL del espejo + LCL/aéreo/terrestre de `shipments`).
2. Tenga **filtros por modalidad y zona** además del año existente.
3. Sume una **sección de Consolidados** (camiones) con KPIs propios.
4. El **PDF sea un archivo real descargable** con branding **Mediterránea Carghas** y
   estadísticas de verdad.

## Decisiones tomadas (con Brian, 11/06/2026)

| Tema | Decisión |
|------|----------|
| Filtros | Modalidad (Todas/FCL/LCL/Aéreo/Terrestre) + Zona (Todas/UY/AR/CL/Otros) + año existente, combinables |
| Camiones | Sección propia "Consolidados" con KPIs y charts; las cargas LCL/aéreo además cuentan en las estadísticas generales |
| PDF | Resumen ejecutivo + tabla detalle, branding **Mediterránea** (NO TWF), descarga directa |
| Datos financieros | **NO van** al PDF ni al dashboard (FLETE/LOCALES afuera) |
| Fuente de datos | `buildOperations()` — la misma que la grilla de Operaciones (números idénticos) |
| Mecanismo PDF | jsPDF + jspdf-autotable (descarga directa, funciona en el PWA del iPhone) |
| Archivadas | Cuentan en las estadísticas (`includeArchived=true`) — son historia |

## Arquitectura

### Datos

- `DashboardEnhanced` pasa 3 props nuevas a `AnalyticsDashboard`: `dbShipments`, `trucks`,
  `truckLoads` (ya las tiene en scope — hoy solo no las pasa).
- Adentro: `operations = useMemo(() => buildOperations(shipments, dbShipments, new Map(), true))`.
  Las métricas multi-modalidad se calculan sobre `UnifiedOperation[]` filtradas.
- **Campos nuevos `terminal` y `n` en `UnifiedOperation`**: `fclToOperation` los mapea desde
  `ParsedShipment.TERMINAL` y `.N` (cantidad de contenedores); para cargas DB: terminal vacío,
  n=0. (El chart de Terminales y el KPI de contenedores los necesitan; hoy UnifiedOperation
  no los expone.) Aditivos, no rompen nada.
- La sección Consolidados usa `trucks` + `truckLoads` directo (no pasa por buildOperations).
  Año del camión = año de `loadDate` (fallback `departureDate`).

### Filtros

- Estado local: `selectedYear` (existe) + `modeFilter: 'all' | Modality` + `zoneFilter:
  'all' | 'UY' | 'AR' | 'CL' | 'OTRO'`.
- Año filtra por ETA (como hoy; sin ETA ⇒ fuera del conteo anual). Modalidad por `op.mode`,
  zona por `op.pais`.
- Los filtros afectan KPIs, charts, PDF y Excel por igual: **se exporta lo que se ve**.
- UI: chips estilo grilla de Operaciones (consistencia visual), debajo del header.

### Métricas (módulo nuevo `src/lib/analyticsUtils.ts`)

Funciones puras sobre `UnifiedOperation[]` / `Truck[]`+`TruckLoad[]`, testeables sin DOM:

| Función | Devuelve |
|---------|----------|
| `filterOperations(ops, year, mode, zone)` | subset filtrado |
| `kpisGenerales(ops)` | cargas totales, contenedores FCL (suma de `n`, mismo criterio que hoy), tránsito promedio ETD→ETA, clientes únicos |
| `porModalidad(ops)` / `porZona(ops)` | data para los pies nuevos |
| `porMes(ops, year)` | arribos por mes (todas las modalidades) |
| `topClientes(ops)` | top 7 por **cantidad de cargas** (antes era por contenedores N; cambia para que LCL/aéreo pesen) |
| `porLinea(ops)` / `porTerminal(ops)` | navieras y terminales |
| `volumenes(ops)` | bultos / kg / m³ totales |
| `operativasFCL(ops)` | tipo operativa, transportistas, fiscales, tipos de contenedor (igual que hoy, desde campos de UnifiedOperation) |
| `kpisConsolidados(trucks, loads, year)` | camiones armados, kg/m³/bultos transportados, promedio cargas por camión |
| `consolidadosPorMes(trucks, year)` / `volumenPorTransportista(trucks, loads, year)` | charts de la sección Consolidados |

`AnalyticsDashboard.tsx` queda solo con UI (chips, cards, recharts) llamando a estas funciones.

### Sección Consolidados (nueva, en pantalla)

- KPIs: camiones armados en el año · kg/m³/bultos transportados · promedio de cargas por camión.
- Charts: camiones por mes (barra) · volumen (kg) por transportista (barra horizontal).
- Solo se muestra si hay camiones en el período. Se oculta si `modeFilter` = FCL (los
  consolidados son LCL/aéreo).

### PDF (módulo nuevo `src/lib/analyticsPdf.ts`)

- **Stack:** `jspdf` + `jspdf-autotable` (dependencias nuevas).
- **Separación testeable:** `buildAnalyticsReport(ops, trucks, loads, filtros)` arma la
  estructura de datos del reporte (título, KPIs, tablas) — pura, con tests. La capa que
  dibuja con jsPDF es fina y no se testea unitariamente.
- **Branding Mediterránea (fijo, no por hostname):** logo `public/images/med-logo-dark.svg`
  rasterizado a PNG vía canvas al vuelo (jsPDF no come SVG) · azul institucional `#261c79`.
- **Página 1 — resumen ejecutivo:** header con logo + "REPORTE DE OPERACIONES — [año]" +
  filtros aplicados + fecha de generación · KPIs grandes · tablas resumen: por modalidad,
  por zona, por mes, top clientes, navieras, consolidados.
- **Páginas siguientes — detalle:** autotable con las cargas filtradas: Ref, Cliente, Modo,
  Zona, ETD, ETA, CNTR/Doc, Bultos, Kg, M³. Header azul Med, zebra.
- **Footer:** "Página X · Mediterránea Carghas — Documento confidencial".
- **Nombre de archivo:** `reporte-mediterranea-[año].pdf` (con sufijo de filtros si aplican,
  ej. `reporte-mediterranea-2026-lcl-uy.pdf`).
- Sin datos financieros.
- 0 cargas ⇒ el PDF se genera igual con resumen en cero (no es error).
- Error de generación ⇒ `toast.error` visible.

### Excel/CSV

Se mantiene el botón; pasa a exportar las `operations` filtradas (todas las modalidades)
con columnas de UnifiedOperation útiles (Ref, Cliente, Modo, Zona, ETD, ETA, CNTR/Doc,
Bultos, Kg, M³, Estado). El viejo `exportToPDF` de `exportUtils.ts` queda sin uso desde
Estadísticas (se borra si no tiene otros consumidores).

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `src/lib/analyticsUtils.ts` | **Nuevo** — agregaciones puras |
| `src/lib/analyticsUtils.test.ts` | **Nuevo** — tests vitest |
| `src/lib/analyticsPdf.ts` | **Nuevo** — buildAnalyticsReport + capa jsPDF |
| `src/components/AnalyticsDashboard.tsx` | Refactor: props nuevas, operations, chips, sección Consolidados, handlers PDF/Excel nuevos |
| `src/components/DashboardEnhanced.tsx` | Pasar `dbShipments`/`trucks`/`truckLoads` |
| `src/lib/operationsTypes.ts` | Campos `terminal` y `n` en UnifiedOperation + mapeo en fclToOperation |
| `package.json` | + `jspdf`, `jspdf-autotable` |

## Testing

- Unit (vitest): `analyticsUtils` (filtros combinados, agregaciones, edge cases: sin ETA,
  kg=0, refs duplicadas con uid, camión sin loadDate) + `buildAnalyticsReport` (estructura
  del reporte refleja filtros).
- Manual: typecheck + test:run + build verdes (obligatorio pre-push) · verificación visual
  del dashboard y de un PDF generado con datos reales de prod.

## Fuera de alcance

- Datos financieros en dashboard o PDF.
- Cambios al tracking público o a la grilla de Operaciones.
- Rebranding general del admin a Mediterránea (solo el PDF lleva marca Med).
