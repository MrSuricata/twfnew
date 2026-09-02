# Plan — HOY para partners + avisos con confirmación

Spec: `docs/superpowers/specs/2026-09-01-partner-hoy-avisos-design.md`. Base: branch `feat/partner-hoy-avisos` (contiene spec, este plan, el contrato `src/lib/partnerAvisos.ts` y las funciones de `dataClient`). La tabla `partner_avisos` ya existe en Supabase (RLS on, sin permisos para anon).

Se ejecuta con agentes en paralelo, cada uno en su worktree/branch desde `feat/partner-hoy-avisos`, PR contra `main`, revisión adversaria y corrección. Orden de merge: W1 → W2/W3/W4.

## W1 — API (`api/data/[entity].ts`, sin funciones serverless nuevas)
- [ ] Entidad `partner-avisos`: GET (partner: propios 30 d · admin: pendientes + 7 d resueltos), POST (solo depot/transport; zod; ref en `allowedRefsForPayload`; tipo permitido por rol; `desconsolide` exige stock 3-7 dígitos; reusa pendiente igual), PATCH (solo admin/owner; confirmar ejecuta la acción existente: `retire` → marcar retirado en `montecon_agenda` si la ref está agendada; `devolvi` → LIBRE=DEVUELTO por el mismo camino del quick edit de LIBRE; `desconsolide` → stock + desconsol_date si vacía; `senasa` → nada; siempre resolved_*, `logAudit`).
- [ ] `partner-shipments`: sumar `OOG`, `MODE`, `STOCK`, `ETA` por operativa y `TURNO_RETIRO`/`RETIRADO` (montecon_agenda) para depósito. Lista blanca `opSegura` intacta para todo lo demás.
- [ ] Mapeo fila → `PartnerAviso` (camelCase) en un helper testeable; tests de reglas puras (tipo por rol, stock válido, dedupe).
- [ ] typecheck (cubre api/) + test:run + build.

## W2 — Panel transporte (`TransportDashboard.tsx` + libs puras nuevas `src/lib/hoyTransporte.ts`)
- [ ] Cards: Hoy cargan (alertas grandes madera→botón SENASA / IMO / OOG / no apilable / TLX), Próximos 14 días (`ProximasSalidas` + marca OOG), Cargas especiales asignadas (30 d o sin fecha), Mis avisos. Calendario abajo como hoy.
- [ ] Botón "SENASA solicitado" → `crearPartnerAviso({tipo:'senasa', ref, cntr, dato:{fecha:hoy}})`; estados pendiente/confirmado vía `avisoPendiente`/`senasaSolicitado`.
- [ ] Tests de `hoyTransporte.ts` (hoy cargan, especiales, ventanas).

## W3 — Panel depósito (`DepotDashboard.tsx` + `src/lib/hoyDeposito.ts`)
- [ ] Cards: Operativas de hoy, Retiros próximos (+ "Retiré"), LIBRE por vencer/vencidos (+ "Devolví el vacío" con fecha), LCL a desconsolidar (+ "Desconsolidé, stock Nº" con validación `stockValido`), Próximos 14 días, Mis avisos.
- [ ] Tests de `hoyDeposito.ts` (retiros por ventana, libres ≤5 d / vencidos, LCL sin stock en su depósito).

## W4 — HOY admin: card "Avisos de partners"
- [ ] Componente `AvisosPartnersCard` usado en `TodayDashboard` (tipos fcl + senasa) y `HoyLcl` (desconsolide + senasa). OK → `resolverPartnerAviso(id,'confirmar')` + refresh de shipments/agenda; Rechazar → diálogo con motivo obligatorio. Oculta si no hay pendientes; confirmados de 24 h plegados.
- [ ] Tests del filtro por área (`AREA_POR_TIPO`).

## Cierre
- [ ] Merge W1, luego W2/W3/W4 (rebase si hace falta). Verificación en producción con accesos de prueba (depósito PLANIR, transporte TRANSCAL) y con la sesión admin: los 4 tipos de aviso de punta a punta.
