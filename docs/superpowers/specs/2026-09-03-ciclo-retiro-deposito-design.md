# Ciclo de retiro con el depósito — diseño

_03/09/2026 · aprobado por Brian en conversación (puntos marcados "correcto")_

## Problema

El depósito (GODILCO, PLANIR) llama o escribe para preguntar si un contenedor
ya se puede retirar de la terminal. La respuesta depende de dos cosas que el
equipo ya sabe y ya marca en la web, pero que el depósito no ve: si la naviera
liberó la carga y si la terminal está pagada. Después del retiro, el equipo
tiene que enterarse, confirmar y avisarle al cliente; hoy la mitad de ese
ciclo existe y la otra mitad se hace por WhatsApp.

## Decisiones (Brian, 03/09)

1. **"Pagado terminal" se marca donde ya se marca**: en la pestaña Pagos o en el
   modal de la carga (botón "Pagado" en la fila del rubro). No hay un botón
   nuevo en Retiros. _Una sola fuente por dato._
2. **El verde del depósito se DERIVA, con dos condiciones**: `liberado`
   (check de cierre en `ref_checks`) **y** terminal pagada
   (`pago_terminal_at` estampado, o `monto_terminal = 0` por la convención
   legacy de la SG). Con una sola de las dos, la fila no está verde y dice cuál
   falta. _Con liberación sin pago, el depósito va y no se lo dan._
3. **Cuando el equipo confirma el retiro, el portal del cliente muestra
   "en depósito" solo.** Sin mail automático.

## Lo que ya existe (no se toca)

| Paso | Dónde vive |
|---|---|
| Pagos OK / LIBERADO | `ref_checks.steps` (`pagos_ok`, `liberado`), pestaña Checks |
| Terminal pagada | `shipments.pago_terminal_at` / `monto_terminal` (pestaña Pagos, `PagosSection`) |
| Aviso "retiré" del depósito | `partner_avisos` tipo `retire`, card Retiros del portal |
| Confirmación desde HOY | `ejecutarAccionAviso` → `marcarMontecon(ref,'retirado')` si hay agenda |
| Recordatorio "avisar al cliente" → AVISADO | `montecon_agenda.avisado_at`, card Retiros de HOY admin |

## Cambios

### 1 · El depósito ve "LISTO PARA RETIRAR" (verde) o qué falta

- **API partner** (`partnerShipmentsVisibles`, solo rol `depot`): por cada
  carga FCL se agregan dos booleanos a nivel carga, sin montos ni fechas de
  pago: `LIBERADA` (de `ref_checks`) y `TERMINAL_PAGADA` (de la regla del
  punto 2). Se leen con dos consultas ligeras por lote de refs.
- **Lib pura** `src/lib/hoyDeposito.ts`: `estadoRetiro(carga)` →
  `'listo' | 'falta_liberacion' | 'falta_pago' | 'faltan_ambos'`. Tests.
- **Card Retiros del depósito**: fila con tinte verde y chip "LISTO PARA
  RETIRAR" cuando `listo`; si no, chip ámbar con "Falta liberación" / "Falta
  pago terminal" / "Falta liberación y pago". El botón "Retiré" sigue siempre
  (el depósito puede retirar igual si la realidad lo permite; el estado es
  información, no candado).

### 2 · Confirmar "retiré" también en TCP

- `ejecutarAccionAviso` tipo `retire`: si la carga NO tiene fila en
  `montecon_agenda` (TCP), se crea la fila con `retirado_at` (hoy ya se puede
  marcar retirado sin agenda por el botón de HOY: `marcarMontecon` lo admite).
  Así TCP entra al mismo ciclo RETIRADO → AVISADO y aparece el recordatorio de
  avisar al cliente. Antes, en TCP el aviso se cerraba y nada más.

### 3 · El cliente ve "En depósito"

- **API cliente** (`api/sheets/client-data.ts`): por carga FCL, `RETIRADO`
  (fecha) desde `montecon_agenda.retirado_at`, cualquier terminal.
- **Lib** `src/lib/hoyCliente.ts`: en la card "En Montevideo, esperando
  salida", si hay `RETIRADO` la fila dice **"En depósito {DEPOSITO} desde
  {fecha}"** en vez de "En puerto". `estadoCliente` gana el sub-estado
  `en_deposito` entre `en_puerto` y `sale`. Tests.
- Sin mail. El "avisado" del equipo sigue siendo el AVISADO de la card de HOY.

### Fuera de alcance (por ahora)

- Botón "Pagado" en la card Retiros de HOY admin (Brian: "capaz"; se decide
  después de ver el verde funcionando).
- Notificación push al depósito cuando una carga pasa a "listo".

## Orden de implementación

1 → 2 → 3. Cada uno es un PR chico con su lib pura + tests. El 1 es el que
saca las llamadas del depósito; el 3 es el que saca las del cliente.

## Verificación

- `/ui?brand=med` con cargas demo en los tres estados de retiro.
- Un aviso "retiré" real de GODILCO sobre una carga TCP → aparece el
  recordatorio en HOY y, tras AVISADO, desaparece.
- Portal del cliente (vista previa "Ver como") mostrando "En depósito".
