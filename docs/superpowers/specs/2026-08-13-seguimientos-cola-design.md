# Cola de Seguimientos + inicio por usuario — diseño (13/08/2026)

Diseñado con Brian en sesión. Decisiones tomadas por él marcadas con (B).

## Problema

Nico (ngallardo@) manda updates semanales a clientes por cada carga en viaje:
mira dónde viene el buque, corrige la ETA y manda el mail. Hoy lo lleva en una
planilla aparte; la webapp tenía el campo `seguimiento` y el badge de vencido,
pero ninguna cola de trabajo.

## Decisiones

- **Universo (B):** toda carga marítima (FCL+LCL de `shipments`) que no llegó a
  su puerto — MVD, BsAs o Chile. Aéreo/terrestre afuera.
- **Corte de vida** (medido contra datos reales: 343 → 93): embarcada
  (ETD ≤ hoy, máx 120 días) o ETA dentro de 21 días. Sin fechas parseables no
  hay buque que reportar.
- **Vencimiento:** nunca enviada (🔴 primero) o último `seguimiento` hace ≥7
  días (reusa `SEGUIMIENTO_DIAS`). ETA pasada → sale sola de la cola.
- **Fila (B):** ETA editable (borrador + commit en blur/Enter, patch optimista
  a la columna `eta`) + botón "Enviado hoy" (sella `seguimiento=hoy`). Editar
  ETA NO marca enviado. El mail lo arma Nico en su Gmail.
- **Trazabilidad (B):** tabla `seguimientos_log` append-only — cada 'enviado'
  guarda la foto de ETA/buque; cada cambio de ETA desde la cola guarda
  anterior→nueva; deshacer un enviado escribe 'deshecho' (no se borra nada).
  Historial expandible por fila. Usuario estampado por el server (token).
- **Inicio por usuario (B):** `admin_users.home_area` viaja en el JWT; la app
  arranca en esa pestaña (validada). Selector en Equipo. Nico → seguimientos.
  Es la semilla del "inicio por área" (LCL / finanzas / resumen súper-admin,
  fases futuras).
- **Scoping:** GET/POST de seguimientos-log respetan `cliente_pattern` (mismo
  patrón que ref-checks/audit-log). Entidad dentro de `[entity].ts` (tope 12
  functions de Vercel Hobby).

## Fuera de esta tanda

Botón copiar-texto del update · widget LCL pendientes · panel Resumen
súper-admin · LCL del manager legacy `lcl_air` (no entran a la cola — confirmar
con Brian el alta vigente).
