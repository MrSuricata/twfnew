# HOY para partners (transporte y depósito) + avisos con confirmación

Diseño acordado con Brian el 01/09/2026, después de ver funcionando HOY LCL.

## Qué se quiere

Que el transporte (TRANSCAL, CARRARA…) y el depósito (PLANIR, GODILCO, TCP) tengan
**su propio HOY**: lo que cargan o mueven hoy con las alertas que cambian cómo se
trabaja (madera → SENASA, IMO, OOG, no apilable), lo que se les viene, y —por primera
vez— **acciones**: el depósito avisa "retiré el contenedor", "devolví el vacío",
"desconsolidé, stock Nº…"; el transporte avisa "SENASA solicitado".

Decisión de Brian: **el partner propone, el equipo confirma.** Ninguna acción del
partner toca la operación hasta que alguien del equipo da OK desde HOY. Rechazar pide
motivo y el partner lo ve. "Camión cargado / salió" NO entra: lo sigue cargando el
equipo.

## Principios que no se negocian

- El portal de partners sigue sin poder escribir en `shipments`, `trucks` ni nada
  operativo. Su única escritura es **crear un aviso** en `partner_avisos`, y solo sobre
  cargas de su alcance (`allowedRefsForPayload`).
- Derive-on-read: los paneles se calculan con los mismos datos que HOY admin, filtrados
  al alcance del partner. Nada de estados copiados.
- Confirmar un aviso ejecuta **la acción que ya existe** en la app (misma función, mismo
  rastro), no una versión paralela.
- Privacidad: se mantiene todo lo de la auditoría del 26/08 y 01/09 (sin plata, sin
  transportes ajenos, sin contactos de clientes). Lo nuevo que viaja al partner: la
  marca **OOG**, el **modo** (fcl/lcl), el **stock** y la **ETA** de las LCL, y el
  **turno de retiro** de Montecon. Nada más.

## Tabla nueva: `partner_avisos` (ya creada, RLS on, sin permisos para anon)

| columna | tipo | qué es |
|---|---|---|
| id | uuid | |
| tipo | `retire` · `devolvi` · `desconsolide` · `senasa` | la acción propuesta |
| ref, cntr | text | carga y contenedor (cntr '' = la ref entera, p. ej. LCL) |
| partner_role, partner_filter, partner_email, partner_name | text | quién avisa (del JWT y `partner_users`) |
| dato | jsonb | `{fecha}` para retire/devolvi/senasa, `{stock, fecha}` para desconsolide |
| estado | `pendiente` · `confirmado` · `rechazado` | |
| motivo_rechazo, resolved_at, resolved_by | | quién y por qué lo resolvió |

Un aviso pendiente es único por (tipo, ref, cntr): si el partner vuelve a apretar, se
reusa el pendiente (no se duplica).

## API — entidad `partner-avisos` dentro de `api/data/[entity].ts` (sin función nueva: Hobby tiene 12/12)

- `GET /api/data/partner-avisos` — partner: sus avisos (`partner_filter` = su alcance
  fresco de `partner_users`), últimos 30 días. Admin/owner: todos los pendientes + los
  resueltos de los últimos 7 días.
- `POST /api/data/partner-avisos` — solo roles depot/transport. Body
  `{tipo, ref, cntr?, dato?}` (zod). Reglas: `ref` dentro de `allowedRefsForPayload`;
  depósito puede `retire`/`devolvi`/`desconsolide`, transporte solo `senasa`;
  `desconsolide` exige `dato.stock` (3-7 dígitos); si ya hay un pendiente igual, devuelve
  ese. Audita en `audit_log` (usuario = email del partner, action
  `aviso_partner:<tipo>`).
- `PATCH /api/data/partner-avisos?id=` — solo admin/owner. Body
  `{accion:'confirmar'|'rechazar', motivo?}`. Confirmar ejecuta:
  - `retire` → si la ref está en `montecon_agenda`, la misma lógica que
    `marcar retirado montecon` (retirado_at/por = quien confirma). Si no está (TCP u
    otra terminal), solo cierra el aviso; en HOY admin la card ofrece "Avisar al cliente"
    como ya hace.
  - `devolvi` → LIBRE = `DEVUELTO` con exactamente el mismo camino que el quick edit de
    LIBRE del armador/operaciones (nivel carga, propaga a contenedores vía
    `buildPerContainerPatch`; ver memoria "DEVUELTO vive en LIBRE"). Nunca escribir
    DEVUELTO en otro campo.
  - `desconsolide` → `shipments.stock = dato.stock` y `desconsol_date = dato.fecha ||
    hoy` si estaba vacía (mismo criterio que la bandeja de stock).
  - `senasa` → no toca la operación: el aviso confirmado **es** el dato. "SENASA
    solicitado" se deriva de `partner_avisos` (tipo senasa, confirmado) por ref+cntr.
  - Siempre: `estado`, `resolved_at`, `resolved_by` (nombre del admin), `audit_log`.
  Rechazar: `estado='rechazado'`, `motivo_rechazo` obligatorio.
- `partner-shipments` (existente) suma a cada operativa `OOG` (de `shipments.oog`),
  `MODE`, `STOCK`, `ETA` (de la shipment) y, para depósito, `TURNO_RETIRO` /
  `RETIRADO` desde `montecon_agenda` cuando la terminal es MONTECON. Sigue la lista
  blanca `opSegura`; nada más.

## Contrato compartido — `src/lib/partnerAvisos.ts` (ya escrito en la branch base)

Tipos `PartnerAvisoTipo`, `PartnerAviso`, etiquetas en español, y helpers puros:
`avisoPendiente(avisos, tipo, ref, cntr)`, `senasaSolicitado(avisos, ref, cntr)`,
`agruparAvisosPorEstado(avisos)`. Y en `src/lib/dataClient.ts`:
`fetchPartnerAvisos()`, `crearPartnerAviso(input)`, `resolverPartnerAviso(id, accion,
motivo?)`. Todos los paneles usan esto; nadie redefine los tipos.

## Panel del transporte (`TransportDashboard` → HOY transporte)

Cards, en este orden, con la misma piel del portal (PartnerDashboardShell):

1. **Hoy cargan** — operativas con SALIDA = hoy (o fecha de carga = hoy) de su alcance.
   Cada fila: ref, cliente, contenedor, depósito de carga (chip con color), fiscal,
   bultos/kg/m³, y **alertas grandes**: 🪵 Madera → botón "SENASA solicitado" (crea el
   aviso; si ya hay pendiente muestra "esperando confirmación"; si confirmado, ✓ SENASA
   solicitado), ☣ IMO, 📐 OOG (sobredimensionada), ⛔ No apilable, TLX pendiente.
   Vacío: "Hoy no cargás ninguna."
2. **Próximos 14 días** — la lista que ya existe (`ProximasSalidas`, formato del mail),
   sin cambios salvo sumar la marca OOG.
3. **Cargas especiales asignadas** — de aquí a 30 días, o sin fecha todavía pero
   asignadas a ellos: todo lo que sea IMO, OOG, madera o no apilable, para que consigan
   la unidad y los permisos con tiempo. Agrupadas por tipo de alerta.
4. **Mis avisos** — los que mandó, con estado (pendiente / confirmado / rechazado + motivo).

Después de las cards, el calendario que ya tienen.

## Panel del depósito (`DepotDashboard` → HOY depósito)

1. **Operativas de hoy** — cargas/trasiegos de hoy en su depósito (SALIDA = hoy o
   retiro = hoy), con las mismas alertas grandes (madera/IMO/OOG/no apilable) y el
   transporte que viene.
2. **Retiros próximos** — contenedores que retiran de la terminal hacia su depósito:
   operativa TRASIEGO/CARGA A PISO con DEPOSITO = el suyo y ETA (o turno de Montecon)
   entre hoy-2 y hoy+7. Muestra terminal, ETA, turno si hay, LIBRE. Botón **"Retiré"**
   (aviso `retire`; oculto si ya hay pendiente/confirmado). Vacío amable.
3. **LIBRE por vencer / vencidos** — contenedores en su depósito (retirados y no
   devueltos) con LIBRE ≤ 5 días o vencido, rojo si vencido. Botón **"Devolví el
   vacío"** (aviso `devolvi` con fecha de hoy editable). Mismos umbrales que HOY admin.
4. **LCL a desconsolidar** — LCL con `deposito` = el suyo, ETA pasada y sin stock.
   Botón **"Desconsolidé, stock Nº"** con input (aviso `desconsolide`, valida 3-7
   dígitos). Cuando el equipo confirma, esa LCL pasa a "con stock" en HOY LCL.
5. **Próximos 14 días** — `ProximasSalidas` en modo depósito (ya existe).
6. **Mis avisos**.

## HOY admin — card "Avisos de partners"

Arriba de todo en HOY FCL (TodayDashboard) y en HOY LCL (HoyLcl), misma card,
filtrada por lo que corresponde a cada área (retire/devolvi → FCL; desconsolide → LCL;
senasa → donde esté la carga). Cada aviso: quién ("PLANIR"), qué, ref + contenedor,
dato, hace cuánto. Botones **OK** y **Rechazar** (pide motivo). OK llama
`resolverPartnerAviso(id,'confirmar')` y refresca; la fila desaparece. Si no hay
pendientes, la card no se muestra (cero ruido). Contador en el título. Los avisos
confirmados en las últimas 24 h se ven plegados abajo ("PLANIR marcó devuelto MRKU…,
confirmado por Joaquín"), para que se vea el rastro.

## Verificación

- Un depósito de prueba (alcance PLANIR) crea los tres tipos de aviso; un transporte de
  prueba (TRANSCAL) crea `senasa`; ambos ven 405/403 si intentan cualquier otra
  escritura. El partner NO puede crear avisos sobre refs fuera de su alcance (403).
- En HOY admin aparecen los pendientes; OK de `devolvi` deja LIBRE = DEVUELTO en la
  carga (y la alerta de LIBRE se apaga); OK de `desconsolide` deja stock y
  `desconsol_date` y la LCL aparece "con stock"; OK de `retire` marca retirado en
  Montecon; OK de `senasa` hace que el panel del transporte muestre ✓.
- Rechazar exige motivo y el partner lo ve en "Mis avisos".
- typecheck + test:run + build en verde; tests de las libs puras (filtros de cada card
  y helpers de avisos).

## Fuera de alcance (esta etapa)

Avisar al cliente automáticamente al confirmar "retiré" (queda el botón manual que ya
existe); "camión salió" por el transporte; notificaciones push a partners; FCL Buenos
Aires.
