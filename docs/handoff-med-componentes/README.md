# Handoff — Componentes faltantes · Webapp Mediterranea Carghas

Quinta y última tanda del rediseño de `MrSuricata/twfnew`. Cubre los componentes que
quedaron sin diseño propio después de la home, las públicas, el carrusel y las 15
pantallas de /admin.

Sigue **`docs/DISENO-MED.md`** al pie de la letra: no hay tokens nuevos.
Regla de siempre: **rediseño visual, misma funcionalidad**. Cada pantalla se armó
leyendo el componente real del repo — los campos, etiquetas, avisos y textos de abajo
salen del código, no de una interpretación.

## Cómo usarlo en Claude Code

1. Descomprimí este zip dentro del repo (por ejemplo en `docs/handoff-med-componentes/`).
2. Abrí los `.dc.html` en el navegador para ver los diseños.
3. Pedile a Claude Code:

   > Implementá el rediseño de `docs/handoff-med-componentes/README.md`. Recreá cada
   > pantalla con los componentes y el stack existentes (React + Vite + Tailwind +
   > shadcn/ui). Es rediseño visual: no cambies lógica, datos ni flujos, y no saques
   > ningún campo, botón ni estado. Los tokens salen de `docs/DISENO-MED.md`.
   > Empezá por el grupo A.

4. Andá grupo por grupo (A → E → B → C → D) y revisá cada uno antes de seguir.

## Archivos

| Archivo | Cubre | Código del repo leído |
|---|---|---|
| `A-panel-detalle.dc.html` | Panel de detalle (1 y 3 contenedores), diálogo Fotos e informes, quick-edit | `OperationDetailPanel.tsx`, `ViabilityBlock.tsx`, `RefChecksInline.tsx`, `ContainerDatesSection.tsx`, `PagosSection.tsx`, `OperationMediaSection.tsx`, `ContainerQuickEdit.tsx` |
| `B-nueva-carga-y-ctrlk.dc.html` | Modal Nueva carga (inicial + más campos con aviso) y paleta Ctrl+K (vacía, con resultados, sin resultados) | `NewShipmentDialog.tsx`, `CommandPalette.tsx` |
| `C-tableros-partners.dc.html` | Tablero de depósito y tablero de transporte | `DepotDashboard.tsx`, `TransportDashboard.tsx` |
| `D-personales-y-novedades.dc.html` | /mirendimiento, /deposito (celular), /novedades pública | `MiRendimientoPanel.tsx`, `DepositoPanel.tsx`, `NovedadesSection.tsx` |
| `E-transversales.dc.html` | Estados vacíos, skeletons, pauta mobile + 3 ejemplos | transversal a toda la app |

Estilo 100 % inline, ancho de referencia 1500 px (excepto /deposito y mobile).

## Qué cambia en cada grupo

### A · Panel de detalle (620 px)
Estructura exacta del componente: header (ref · ✎ editar · ⛶ ampliar · ◉ agregar · ✕) →
selector de operativo → **Datos rápidos** (MBL/HBL/Buque/Terminal/ETA MVD) → **Datos
clave de la carga** (ViabilityBlock: bultos, peso, volumen, fiscal, descarga, depósito,
transporte, operativa, desconsolidación, LIBRE + "Devuelve en" con Deshacer) → **Checks
documentarios** en grilla de 2 columnas con fecha (RefChecksInline) → condiciones de
estiba → **Salidas y arribos por contenedor (N)** → **Pagos** → secciones colapsables
(Fechas, Identificación, Documental, Ruta, Carga, Operativa).

Cambios visuales: cabeceras de sección con línea en vez de cards sueltas; celdas-dato
con divisor en vez de tarjetas independientes; se conservan los colores de identidad de
cada bloque (**celeste** para las fechas por contenedor, **teal** para pagos, **verde**
para el LIBRE devuelto).

**Multi-contenedor**: no son pestañas — es una tarjeta por contenedor apilada dentro de
"Salidas y arribos por contenedor (N)", cada una con sus 6 campos (Salida MVD, Arribo
fiscal, Lugar de salida, Bultos, Kg, M³) y sus avisos reales: `⏰` en rojo cuando la
salida queda antes de la llegada a MVD, `📌` en ámbar para la llegada atípica (sábado o
martes). Al pie, el total sumado de los contenedores.

**Fotos e informes** no es una sección inline: es un diálogo que se abre desde el chip
del header. Trae los chips de contenedor con contador y "Sin asignar", las dos etapas
(**Carga en origen** / **Carga en Uruguay**) con su botón punteado "Subir fotos (hasta
20)", la barra de progreso y la lista de **Informes PDF** con descargar y eliminar.

**Quick-edit**: popover de 400 px con Salida MVD, Arribo fiscal, Lugar de salida y
Bultos/Kg/M³, más el aviso rojo de salida anterior a la llegada. Guardar o "Abrir panel".

### B · Nueva carga y Ctrl+K
Modalidad en el orden real (LCL · Aéreo · Terrestre · FCL) con el punto de color de cada
modo; `*` en Ref, Cliente y Modalidad; la ref sugerida como link ("Sugerida: A8290 — click
para usar"); los datos principales visibles (shipper, incoterm, país/puerto de origen,
puerto de destino, país/zona con su nota, destino final, operativo) y el resto colapsado
bajo "Más campos (todos opcionales) · N completados".

El segundo estado muestra el **soft-warning real**: banda ámbar "Sin completar: … Tocá
Guardar igual para crear la carga así" y el botón cambiando a **Guardar igual**. Dentro
de "Más campos" van las secciones Datos clave, Fechas (con el aviso de la llegada normal
salida+2) y Carga con los **Indicadores**: Madera tri-estado (A confirmar / Sí / No) más
los checkboxes Telex, No apilable, Entrega en planta, Seguro, Certificada, Impreso, IMO y
OOG. Cierre con la nota de que el estado de las FCL se deriva de las fechas.

Paleta Ctrl+K: grupos con contador (Navegación / Acciones / Operaciones / Clientes /
Contenedores), atajos de dos teclas en cápsulas y estado sin resultados con acción de
crear.

### C · Tableros de partners
Los ven terceros: menos densidad, tipografía más grande, una acción por fila. Depósito:
KPIs → "Por llegar" en cards anchas con **Marcar recibido** → "En depósito" en tabla con
**Registrar salida** (la que sale mañana, tintada). Transporte: cada viaje es una card
con la **ruta en nodos** y dos acciones; el que retira hoy lleva cabecera naranja.

### D · Páginas personales y /novedades
**/mirendimiento** es semanal: encabezado con el rango de fechas y los botones ← Semana
anterior / Siguiente → / **Copiar parte**; las 5 métricas reales (Fui al depósito sobre
*días con operativa*, Fotos de la carga, Avisé traslado, Avisé salida, **Informe de las
que fui** sobre las visitas) con el color por porcentaje (≥80 verde, ≥50 ámbar, resto
rojo); chips de depósitos con cantidad; tabla **Operativa por operativa** (Ref, Cliente,
Contenedor, Depósito, Fecha con sufijo `sal.`/`lleg.`, y los cinco círculos: Fui, Fotos,
Traslado, Salida, Informe — los verdes se tildan, los celestes son derivados y no se
tocan, el ámbar `!` es "hay informe pero la visita no está marcada"); y la tabla **Cómo
viene, mes a mes** con celdas `n/total`.

**/deposito** es una pantalla de celular (430 px, botones de 44 px): buscador, tarjeta por
carga con badge *hoy / ayer / en N días*, y dentro **un bloque por contenedor** con su
propio badge, contador de fotos, historial de actas y los dos botones grandes **Fotos** y
**Acta**. El acta abierta trae los cuatro checks (Diferencia de bultos, Embalaje
deteriorado, Bultos con humedad, Mercadería a la vista), el comentario y la nota de que
cada acta se agrega al historial sin pisar la anterior. Incluye los estados de subida, de
lista vacía y el aviso de actas que no cargaron.

**/novedades** hereda el sistema de los flyers: hero claro con arcos, filtros por
categoría y cada aviso como fila con tarjeta de categoría a la izquierda (violeta para
paros, celeste para feriados, naranja para clima, lila para interés general).

### E · Transversales
Cuatro tipos de vacío (inicial, filtro sin match, vacío positivo en verde, error), misma
anatomía y máximo una acción. Skeletons con shimmer `#eef0f8 → #dfe7f5`, 1,5 s, con la
forma del contenido real — nunca spinners. Mobile: tabla → lista de cards, KPIs de a dos
con el de riesgo primero, tabs con scroll horizontal, toque mínimo 44 px y panel de
detalle a pantalla completa con sub-pestañas.

## Tokens (de `docs/DISENO-MED.md`)

```
#49286b violeta marca      #352e6a violeta texto     #261c79 violeta profundo
#9bd1e5 celeste            #ceffff celeste pastel    #e8863b naranja aviso
#6b6688 texto secundario   #9a96b8 terciario         #c9c5d8 deshabilitado
#eef0f8 borde card         #e5e4f1 borde input       #f4f5fa separador de fila
#f7f9fc fondo app          #fbfbfe fondo input       #FFFFFF superficie
#2f8f5b verde OK           #e4f4ea fondo verde       #b45f16 texto naranja
#fdece0 pill naranja       #fff9f4 fila con alerta   #d94f4f rojo error
#3a7c9a celeste texto      #f4fbfe fondo celeste     #2f7d78 teal pagos
```

Tipografía: **Nunito 900** (títulos, refs, números, contenedores) · **Montserrat 300-700**
(cuerpo, labels, botones). Kickers 600 mayúsculas, `letter-spacing: 0.07-0.08em`.
Radios: pills `999px` · cards `20-22px` · inputs `11-14px` · modal/popover `18-24px`.

## Assets

`public/images/med-logo-white.svg` y las fotos operativas salen del repo. Los PNG de
`assets/` son los de marca ya usados en handoffs anteriores. Todo liviano.
