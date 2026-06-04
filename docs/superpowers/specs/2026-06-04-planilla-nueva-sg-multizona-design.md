# Diseño — Migración a la planilla nueva (SG enriquecido, cargas multizona)

_Fecha: 2026-06-04 · Estado: aprobado por Brian, pendiente de plan de implementación._

## 1. Problema / contexto

La app lee las cargas FCL desde una Google Sheet. La planilla evolucionó:

- **SG nuevo** (pestaña `gid=1606359155`): es el "Seguimiento General" pero **enriquecido y con TODAS las cargas** (Uruguay, Chile, Buenos Aires…), no solo UY/FCL. Columnas nuevas: POL, POD, BOOKING, SEGUIMIENTO, TIPO, ESTADO, OPERATIVO, NOMBRE BUQUE, etc.
- **Operativas** (pestaña `gid=1133111465`): **sin cambios**, sigue cubriendo solo cargas de Uruguay.

El código actual (`api/_lib/csvParser.ts`):
- Lee el **SG viejo** (pestaña por defecto, 20 columnas: Ref, CLIENTE, ETD, ETA, CNTR, N, MBL, LINEA, BUQUE, TERMINAL, costos, FORMA_PAGO, VTO, CR/BL/AD/AT).
- **Excluye a propósito** Chile y Buenos Aires (`filterShipments`: `EXCLUDED_TERMINAL_KEYWORDS = ['CHILE','BUENOS AIRES']`).
- Cruza con Operativas (posicional, índices 0–20) por Ref.
- Cachea en Supabase `shipments_cache` (id=1).

**Objetivo:** que la app trabaje a partir del **SG nuevo**, con todas las cargas (UY/Chile/BA), su ruta (origen/destino), y filtros nuevos por zona/origen/destino.

## 2. Decisiones (tomadas con Brian)

| Tema | Decisión |
|------|----------|
| Fuente FCL | **SG nuevo** `gid=1606359155` (header-driven). Reemplaza al SG viejo. |
| Cargas Chile/BA | **Incluirlas** (quitar la exclusión). |
| País/zona | **Derivado del POD** (puerto de descarga). **Montevideo → Uruguay**, Buenos Aires → Argentina, puertos chilenos → Chile, otros → según puerto. Tabla de mapeo **visible y editable**. |
| Estado + Operativo de FCL | **Los maneja la app** (derivación de estado + overlay de operativo, como hoy). Se **ignoran** las columnas `ESTADO` y `OPERATIVO` del SG nuevo. |
| Buque | Columna **NOMBRE BUQUE** del SG nuevo. |
| Documento / nº para rastrear | **BOOKING** (el SG nuevo no trae MBL). |
| Operativas | **Sin cambios** (`gid=1133111465`), cruce por Ref. Chile/BA no tienen operativa (correcto). |

## 3. Mapeo de columnas (SG nuevo → modelo)

Header del SG nuevo (gid 1606359155):
`Ref · CONSIGNEE · NOTA · SEGUIMIENTO · BOOKING · LINEA · POL · POD · ETD · ETA · CONTS · N · TIPO · ESTADO · OPERATIVO · NOMBRE BUQUE · OPERATIVA · PUERTO · CTERMINAL · CDEV · LOCALES · FLETE · FORMA_PAGO · VTO · CR · BL · AD · AT`

| Columna SG nuevo | Campo del modelo | Notas |
|------------------|------------------|-------|
| Ref | `REF` | clave de cruce con Operativas |
| CONSIGNEE | `CLIENTE` | |
| NOTA | `NOTA` (nuevo, opcional) | |
| SEGUIMIENTO | `SEGUIMIENTO` (nuevo, fecha) | |
| BOOKING | `MBL` / `docNumber` | usado para rastrear (no hay MBL) |
| LINEA | `LINEA` | |
| **POL** | `POL` / `origen` (nuevo) | puerto de carga = origen |
| **POD** | `POD` / `pod` (nuevo) | puerto de descarga → deriva país |
| ETD / ETA | `ETD` / `ETA` | |
| CONTS | `CNTR` | contenedores |
| N | `N` | cantidad |
| TIPO | `TIPO` (nuevo) | tipo de contenedor (40HQ…) |
| ESTADO | — | **ignorado** (app maneja) |
| OPERATIVO | — | **ignorado** (app maneja) |
| NOMBRE BUQUE | `BUQUE` | |
| OPERATIVA | `OPERATIVA_SG` (opcional) | la app deriva la operativa real de Operativas |
| PUERTO | `TERMINAL` | |
| CTERMINAL/CDEV/LOCALES/FLETE | costos | privados (se stripean en público) |
| FORMA_PAGO / VTO | `FORMA_DE_PAGO` / `VTO` | |
| CR/BL/AD/AT | checks | |

**Aliases de header** (normalizados a mayúsculas, sin espacios/puntos): `CONSIGNEE`→CLIENTE; `POL`/`ORIGEN`→POL; `POD`/`DESTINO`/`PUERTO_DESCARGA`→POD; `NOMBRE_BUQUE`/`BUQUE`/`NOMBRE`→BUQUE; `BOOKING`→MBL; `CONTS`/`CNTR`/`CONTENEDOR(ES)`→CNTR; `SEGUIMIENTO`→SEGUIMIENTO; `TIPO`→TIPO.

## 4. País / zona desde POD

`zonaFromPOD(pod): 'UY' | 'AR' | 'CL' | 'OTRO'`, con una tabla **editable** puerto→país:
- `MONTEVIDEO`, `MVD` → UY
- `BUENOS AIRES`, `BSAS`, `BA` → AR
- `VALPARAISO`, `SAN ANTONIO`, `IQUIQUE`, `SAN VICENTE` → CL
- vacío / desconocido → OTRO (se muestra el POD crudo)

La tabla se deja en un único lugar (constante exportada) para ampliar fácil.

## 5. Modelo de datos — campos nuevos

`ShipmentRecord` / `ParsedShipment` (src/lib/shipmentTypes.ts) suman:
- `POL: string` (origen), `POD: string` (puerto descarga), `PAIS: 'UY'|'AR'|'CL'|'OTRO'` (derivado), `BOOKING: string`, `SEGUIMIENTO_SG: string`, `TIPO_SG: string`.

`UnifiedOperation` (operationsTypes.ts) + `fclToOperation` mapean estos a la grilla:
- `origin` ← POL, `pod`/`destPort` ← POD, `pais` ← PAIS, `docNumber` ← BOOKING (si no hay MBL), `buque` ← BUQUE, `seguimiento` ← SEGUIMIENTO, `tipo` ← TIPO.

(Las columnas DB para LCL/aéreo ya tienen origin/dest_port/seguimiento — se reutiliza el mismo `UnifiedOperation`.)

## 6. Ingesta (`api/_lib/csvParser.ts`)

1. `buildCsvUrl` apunta el SG a **`gid=1606359155`** (antes: pestaña por defecto). Operativas sigue en `1133111465`.
2. `parseMainSheetCSV`: extender el `switch` header-driven con las columnas nuevas (POL, POD, BOOKING, SEGUIMIENTO, TIPO, NOMBRE BUQUE, CONSIGNEE…). Validación de fila: `REF` (CLIENTE puede faltar en algunas no-UY → relajar a solo `REF`).
3. Derivar `PAIS` desde POD al parsear.
4. `filterShipments`: **quitar** la exclusión Chile/BA. (Mantener exclusión de refs basura puntuales si hace falta.)
5. `mergeOperativasData`: sin cambios (cruce por Ref; cargas sin operativa quedan igual).
6. Cache a `shipments_cache` igual que hoy.

## 7. UI (grilla + tracking)

**Grilla Operaciones:**
- Chips de **zona** (Todas · UY · Argentina · Chile · Otros) — junto a los de modo. Filtra por `pais`.
- Filtro por **Origen (POL)** y **Destino (POD)** (selects o búsqueda).
- Columnas nuevas: Origen, Pto. Descarga, País, Booking, Tipo, Seguimiento (las route ya parcialmente existen para LCL).
- Estado/operativo de FCL: **sin cambios** (derivado / overlay).

**Tracking público:**
- Buque ← NOMBRE BUQUE; nº rastreable ← BOOKING (+ contenedor + ref). La ruta (POL→POD) se puede mostrar en "Ver detalles".

## 8. Fases de implementación

- **Fase 1 — Ingesta (backend):** csvParser apunta al SG nuevo, mapeo header-driven nuevo, país por POD, incluir todas, cruce con Operativas. Verificar contra la planilla real (cantidad de cargas UY/Chile/BA). Cachear.
- **Fase 2 — UI:** campos nuevos en el modelo del front, columnas + filtros (zona/origen/destino) en la grilla, ruta/booking/buque en el tracking.

## 9. Prerrequisitos / riesgos

- **Acceso del servidor al SG nuevo: RESUELTO ✅.** La planilla está publicada a la web. Base pub:
  `https://docs.google.com/spreadsheets/d/e/2PACX-1vR1L0gDUbrXqFW_33bLA-0Gsb73x2hItsyNwUFZTHdjTlGnxO0AuE8ojBrdrtvjp0frdl8v45xCGYFM/pub?output=csv`
  - SG nuevo: `...&gid=1606359155` (devuelve el CSV enriquecido ✓)
  - Operativas: `...&gid=1133111465` ✓
  - El SG nuevo se lee apuntando el main al **gid 1606359155** (hoy el código usa la pestaña por defecto = SG viejo). Constante `SG_GID='1606359155'` análoga a `OPERATIVAS_GID`.
- **Encabezado de Ref vacío:** en el SG nuevo la **primera columna (Ref) no tiene header** (`,CONSIGNEE,...`). El parser header-driven debe tratar la **columna 0 como REF** aunque su header esté vacío.
- **Formato confirmado:** CSV separado por coma, números europeos (`"0,00"`), fechas `D/M/YYYY`, `#N/A` en celdas con fórmula (tratar como vacío).
- **Estado de Chile/BA sin operativas:** quedan con estado en base a ETA (coarse). Se puede afinar después (ej. usar ESTADO del SG como fallback solo-lectura) si Brian lo pide.
- **MBL ausente:** se usa BOOKING para rastrear. Si algún cliente busca por MBL viejo, no lo encontrará (aceptado).
- **Validación de fila:** algunas cargas no-UY pueden no tener CLIENTE/CONSIGNEE; relajar el filtro para no perderlas.
- **No romper LCL/aéreo/terrestre:** esta migración toca solo la ingesta FCL (cache) y el front compartido; las cargas DB siguen igual.

## 10. Verificación

- Comparar conteo de cargas tras el cambio: UY (con operativa) + Chile + BA, vs lo que Brian espera.
- Spot-check de 3 cargas (1 UY, 1 Chile, 1 BA): ruta POL→POD, país derivado, buque, booking, cruce con operativa (UY) correcto.
- Build + typecheck verdes. Tracking público de una carga Chile/BA por booking/contenedor.
