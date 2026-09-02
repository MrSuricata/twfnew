# Portal del cliente: "HOY del cliente" en Mis Cargas

Diseño aprobado por Brian el 02/09/2026 ("dale hacelo"), con las tres decisiones
abiertas resueltas según la recomendación: "En Montevideo, esperando salida" va
segunda, el botón "Pedir salida" queda para la etapa siguiente, y los 4 números
de arriba se sacan.

## Problema

El portal (`/portal`, `ClientPortal.tsx`, 1227 líneas) tiene los datos bien y
seguros, pero obliga a leer: 4 contadores que no dicen qué hacer, una lista
donde la columna derecha cambia de significado por fila ("ETA Montevideo" vs
"Llega a depósito"), la ref grande a veces es la del cliente y a veces la
nuestra, chips "0 CNTR", y una agenda que mezcla tres hitos en texto corrido.
Brian: "me gusta la lógica de tarjetas y alertas que venimos usando en depósito
y en admin; pensemos la lógica para el cliente: cuándo le llegan las próximas
cargas, cargas que están zarpando, y luego activas y agenda".

## Principios

- Derive-on-read sobre los `ParsedShipment` que el portal YA recibe de
  `/api/sheets/client-data` (lista blanca `CLIENT_SHIPMENT_COLS`). Cero campos
  nuevos, cero endpoints nuevos, cero escrituras.
- Misma piel que HOY depósito/transporte: cards con contador en el título,
  filas `flex-wrap` que entran en 390 px, card vacía = no se muestra.
- Lenguaje del cliente, no el nuestro: "tu depósito", "sale de Montevideo",
  nada de LIBRE, CDEV, TLX ni transportes.
- Lógica pura y testeada en `src/lib/hoyCliente.ts`; el componente solo pinta.

## Las cards (en este orden)

| # | Card | Regla (hoy = fecha local) | Fila |
|---|------|---------------------------|------|
| 1 | **Llegan a tu depósito** | Por contenedor de cargas ya arribadas a MVD: SALIDA alcanzada y ETA_FISC no alcanzada (en frontera / sale hoy), o SALIDA futura ≤ 7 d, o ETA_FISC en 0..7 d. | ref, descripción, contenedor, fecha de llegada (ETA_FISC o "a confirmar"), "en Xd", chip En frontera / Sale hoy / Sale el dd/mm. |
| 2 | **En Montevideo, esperando salida** | Cargas con ETA alcanzada y contenedores SIN salida cargada, no entregadas. | ref, descripción, contenedor, dónde está (LUGAR_SALIDA, si no la terminal), "desde hace Xd". Orden: la que más espera primero. |
| 3 | **Llegan a Montevideo** | ETA en 0..14 d. | ref, buque, ETA, "en Xd", paso siguiente (Trasiego en X / Directo a tu depósito / Desconsolida en X). |
| 4 | **Embarcadas** | ETD en −7..+7 d y la carga no llegó a MVD. | ref, buque, "Zarpó el" / "Zarpa el", ETA estimada. |
| 5 | **Atención** | Las alertas críticas y de aviso que ya calcula `generateShipmentAlerts` (informe listo, etc.), no descartadas. | título + mensaje, click lleva a la pestaña Alertas. |

Cada fila abre la carga en la lista (pestaña Mis cargas, fila desplegada y
scroll hasta ella).

## La lista (pestaña "Mis cargas", antes "Activas")

- **Ref**: la propia del cliente grande y "TWF 7996" chico. Sin ref propia:
  "TWF 8216" grande y nada más. Regla en `refsCliente()`.
- **Estado en 6 pasos** (`estadoCliente()`): Por embarcar → Embarcada → En
  Montevideo → En camino → En tu depósito → Entregada. Reemplaza al badge con
  los códigos internos.
- **Próximo hito uniforme** a la derecha (`proximoHito()`): Zarpa · Llega a
  Montevideo · Sale de Montevideo / Salida a coordinar · Llega a tu depósito ·
  En tu depósito desde · Entregada. Siempre el mismo dato por estado.
- Chip de contenedores solo cuando `N > 0`.
- Se sacan las 4 tarjetas de números (Cargas Activas / Contenedores / Sin
  Alertas / Completadas). Los contadores viven en el título de cada card.
- Agenda, Alertas, Historial y el PDF de estado quedan como están.

## Fuera de alcance (etapa siguiente)

Botón "Pedir salida" en la card 2 (el cliente propone fecha, el equipo confirma
desde HOY como los avisos de partners). Rediseño del calendario. Cambios en la
API.

## Verificación

- Tests puros de `hoyCliente.ts`: cada card con casos borde (arribada sin
  salida, salida hoy, salida futura, llegada a depósito pasada, ETA futura,
  sin ETD, ETD futuro, entregada), `estadoCliente` para los 6 estados,
  `proximoHito` por estado, `refsCliente` con y sin ref propia.
- typecheck + test:run + build en verde.
- Revisión adversaria (correctitud, producto/UX móvil, regresiones) antes de
  mergear; el portal no tiene tests de componente.

## Decisiones que dejó la revisión adversaria (02/09, 14 hallazgos aplicados)

- **El día de la ETA la carga "llega hoy"**: está solo en "Llegan a Montevideo"
  y su estado sigue "Embarcada" con hito "Llega a Montevideo hoy". Pasa a "En
  Montevideo" desde el día siguiente. Así ninguna carga aparece en dos cards.
- **"En camino" solo si algo viaja** (salió ANTES de hoy y no llegó). El día de
  la salida la card dice SALE HOY y la fila "Sale de Montevideo hoy". Parcial
  con un contenedor entregado y otro sin salir = "En Montevideo · Salida a
  coordinar".
- **"Entregada" = DEVUELTO** en OPERATIVA o en LIBRE. DESCARGA (fecha en que se
  confirmó el arribo del buque con "¿Llegó?") y DEV (un lugar) no son entrega.
- **Activa / Historial del portal** se decide con `esActivaParaCliente`: no
  entregada; en depósito hasta 10 días después de la última llegada; sin
  operativas hasta 60 días después de la ETA. `isShipmentCompleted` (admin)
  mandaba los trasiegos a Historial el día después de la salida.
- **Card 1 exige SALIDA cargada**; sin salida es card 2. Card 4 excluye lo que
  llega hoy o ya llegó.
- **Atención va última** (como en la spec), traducida al cliente (`alertasCliente`:
  "Conviene coordinar la salida" en vez de "Días libres vencidos", ref del
  cliente) y abre la carga. El banner rojo de críticas se sacó: quedaba
  triplicado con la card y la pestaña Alertas.
- **"Pedir salida"** ya existe como link de mail por fila en la card 2
  (asunto y cuerpo prearmados con la ref). El botón que crea un aviso para el
  equipo sigue siendo etapa siguiente.
- Filtro "Estado" de la lista y barra de progreso de la fila expandida usan
  los 6 estados del cliente. `verCarga` limpia filtros antes de saltar. Tope de
  6 filas por card con "y N más". Estado vacío solo si el cliente tiene cargas.
- Pendiente para la etapa siguiente: que el PDF de estado y la Agenda usen
  `refsCliente`/`estadoCliente` (hoy siguen con la ref sin prefijo y los
  estados internos).
