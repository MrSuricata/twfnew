# Rediseño: portal del cliente, modales y cards de HOY — diseño

_04/09/2026 · pedido de Brian con capturas. **Diseño para aprobar antes de implementar.**_

## Lo que pidió Brian, textual

- Modal de cambios rápidos del admin: "cada vez me gusta menos, quedó anticuado con
  respecto al resto de pantallas".
- HOY admin: "que pueda replegar los títulos estos con alertas, por ejemplo los retiros
  del buque".
- Referencias en el portal del cliente: "especialmente para Chiapero o VMG, les gusta ver
  su referencia predominante en lugar de la nuestra; y para la nuestra no hace falta
  ponerle TWF, solo el número sin la A delante".
- Novedades del cliente: "es rarísimo el proceso: apretás y te lleva a toda la lista de
  cargas; que aparezca miniatura de las fotos y del PDF al mostrar el aviso de la carga
  de hoy; repensalo para que sea cómodo, que se encuentren rápido las cosas, golpes de
  colores".
- Lista "Mis cargas": "quedó con el formato anticuado y no el nuevo".
- Modal "Detalles de Carga" del cliente: "horrible, revisar todo".

## Lo que encontró el mapeo (5 exploradores en paralelo)

| Pantalla | Estado real | Hallazgo que cambia el diseño |
|---|---|---|
| Modal rápido (`ContainerQuickEdit`, 588 líneas) | Piel vieja, hex hardcodeado, 3 `window.confirm` inline, bloque LIBRE duplicado con `ViabilityBlock` | La lógica de guardado es delicada (orden de `commitSave`): se cambia la piel, no el guardado |
| Cards de HOY (`TodayDashboard`) | 6 headers copiados a mano, 3 pieles distintas conviviendo | `PanelPlegable` existe pero no admite chips en el header ni estado controlado |
| Referencias | Tres funciones contradictorias; "TWF " hardcodeado; la misma carga se ve "TWF 8121", "8121" y "A8121" según la sección | Solo **16 de 377** FCL activas tienen ref del cliente, y es texto libre (hay una que dice el nombre del cliente) |
| Novedades / fotos | 3 clicks hasta una foto | **Las miniaturas ya viajan al cliente y se descartan**: la mejora es gratis en el servidor. La del PDF no: sin backend no se renderiza |
| Lista y modal del cliente | shadcn viejo bajo cards nuevas; dos vocabularios de estado; "Libre" a la vista del cliente (contra la spec del 02/09) | "0 contenedor(es)" es porque `n_cntr` se escribe solo al alta: **121 cargas activas** lo tienen en cero con contenedor cargado |

## Decisiones de diseño

### D1 · Una sola piel: PanelCard para todo
Las tres pantallas del cliente, el modal rápido y las cards de HOY pasan a
`partner/PanelCard.tsx`. Primero se extiende esa base (PR 0) y después se migra cada
pantalla. Nadie más define una card.

### D2 · Referencias: la del cliente manda, cuando existe y sirve
Una sola función, `refsCliente`, decide para todo el portal (cards, lista, modal, PDF,
alertas, agenda):
- **Principal**: la referencia del cliente, si está cargada **y es sana** (no vacía, no
  igual al nombre del cliente, hasta 24 caracteres). Si no, nuestro número.
- **Nuestro número**: solo dígitos, sin "A" y sin prefijo de marca. "8121", no "TWF 8121".
- **Secundaria**: la otra, en chico, siempre visible para que el mail y el teléfono
  cierren con cualquiera de las dos.
- `shipment.REF` sigue siendo la clave interna: anclas, keys, matching. No se toca.

Brian tiene que saber: hoy 3 de cada 4 cargas van a mostrar nuestro número igual, porque
la ref del cliente no está cargada. Se suma "Ref. del cliente" a los datos faltantes de
HOY para que el equipo la complete al alta.

### D3 · Novedades: la foto se ve donde está el aviso
- La card "Novedades de tus cargas" muestra **hasta 4 miniaturas** por fila (ya llegan
  firmadas), con "+N" si hay más. Tocar una abre la **galería de esa carga** en un
  visor, no la lista.
- El informe se muestra como **tarjeta de documento**: ícono PDF grande en violeta,
  título, fecha y botón "Abrir". Sin miniatura renderizada: eso requiere servidor y
  Vercel está en 12 de 12 funciones. Se dice así, no se promete.
- El botón de la fila lleva a la **ficha de la carga** (modal nuevo, D5), no a la lista.
- Las firmas de las fotos vencen a las 8 h: el portal las vuelve a pedir al volver a la
  pestaña y cada 4 h, como ya hace el Diario. Sin eso, un portal abierto todo el día
  muestra imágenes rotas.

### D4 · Lista "Mis cargas" a la piel nueva
Fila colapsada con `FilaTitulo` / `FilaDatos`: refs (D2), estado con **un solo
vocabulario** (`estadoCliente`, el de las cards), contenedores contados desde la lista
real (no `n_cntr`), próximo hito a la derecha. **Sale "Libre"** de la vista del cliente,
como fijaba la spec del 02/09: es dato nuestro. Historial con la misma fila.

### D5 · Ficha de la carga del cliente: modal propio
Se crea `ClientShipmentDialog`, **sin tocar** `ShipmentDetailsDialog` (lo comparten
Agenda, Tracking y HOY admin). Tres pestañas con la piel nueva:
- **Resumen**: línea de tiempo derivada de `estadoCliente` (una sola fuente, sin
  `reached: true` fijo), datos de la carga, contenedores contados.
- **Fotos**: galería por lugar (origen / Montevideo), con fecha.
- **Informes**: tarjetas de documento (D3).
Sin "Libre". Referencias según D2. Es el destino de "Ver detalle" y de las novedades.

### D6 · Modal rápido del admin: misma piel, mismo guardado
Se cambia la cáscara a PanelCard (header tintado, chips, `Dato`, título accesible) y
**no se toca `commitSave`**: el orden de guardado y la propagación por contenedor son
delicados y están cubiertos por el DnD de la Agenda. Los tres `window.confirm` pasan a
una lib pura (`quickEditReglas.ts`) con tests, para que la UI solo pregunte. El bloque
LIBRE + Devuelto pasa a un componente compartido con `ViabilityBlock` (hoy está
duplicado). Se borran las props muertas.

### D7 · Cards de HOY plegables, con memoria
`PanelPlegable` pasa a admitir estado controlado, chips en el header y contador siempre
visible. Cada card de HOY FCL se pliega; la preferencia se guarda en `user_prefs`
(clave `hoyFclCardsCerradas`) con un hook reutilizable, así cada operador arma su HOY.
**Plegada sigue avisando**: el header muestra el contador y los chips rojos (reagendar,
vencidos), así plegar no esconde lo urgente. No se reabre sola.

## Datos que hay que arreglar en el servidor (PR 0)
- Cantidad de contenedores derivada de la lista real cuando `n_cntr` es 0 o nulo
  (arregla el "0 contenedor(es)" en modal, Historial, Agenda y chip).
- `CLIENT_REF` tipado en `ParsedShipment` (hoy son casts) y presente en la vista
  previa "Ver como", que hoy no lo manda (por eso Brian no ve lo que ve el cliente).
- La ref deja de ir embebida en el texto de las alertas: la pinta la UI con D2.

## Orden y paralelismo

| Paso | Qué | Por qué en ese orden |
|---|---|---|
| 0 | PanelCard base + arreglos de servidor | Todo lo demás lo usa |
| 1 | Modal rápido ∥ Cards HOY plegables | Archivos disjuntos entre sí (`TodayDashboard` 1373-1400 vs el resto) |
| 2 | Referencias (D2) | Toca `hoyCliente.ts` y `ClientPortal.tsx`: va solo |
| 3 | Lista + ficha del cliente (D4, D5) | Crea el modal que necesita el paso 4 |
| 4 | Novedades con miniaturas (D3) | Abre el modal del paso 3 |

Cada paso: rama propia en worktree aislado, lib pura + tests, gates, verificación en
`/ui?brand=med` y en "Ver como", PR, merge. Yo reviso cada uno antes de mergear.

## Fuera de alcance
- Miniatura renderizada del PDF (necesita servidor).
- Rediseñar `ShipmentDetailsDialog` del admin.
- Tocar la plantilla del digest en n8n (solo se avisa el nuevo formato de ref).

## Verificación
- `/ui?brand=med` con cargas demo que tengan ref del cliente, fotos e informe.
- "Ver como" Chiapero: ref 1410 predominante, 8121 en chico, sin "TWF".
- Cero tests de render hoy en estas 5 pantallas: cada paso agrega el suyo.
