# Digest de cargas para clientes ("MED - Aviso Clientes")

**Fecha:** 2026-08-27 · **Estado:** diseño aprobado por Brian (conversación 27/08), pendiente review de spec
**Componentes:** webapp twfnew-hoy (PR) + workflow n8n nuevo

## Objetivo

Mandarle a cada cliente, **lunes y jueves 09:00 (hora UY)**, un email HTML con el estado
completo de SUS cargas activas **vía Montevideo**: las que vienen en el buque, las arribadas,
las que salen hacia el fiscal y las recién entregadas. Mismo espíritu que la Previsión
Operativa de depósitos/transportes, pero como "pequeño orden de carga" para el cliente.
El mail además hace publicidad de la web nueva (banner con link al portal `/portal`).

## Decisiones tomadas (no re-preguntar)

- **Frecuencia:** días fijos lunes y jueves 09:00 UY, estado completo. SIN detección de
  cambios ni snapshot (a diferencia de la Previsión): más simple y no hay memoria que se
  pueda desincronizar.
- **Arranque:** modo sombra con **CHIAPERO Y ASOC. S.R.L.** y **RDM - ABEA S.A.** —
  `TEST_MODE = true` en el workflow manda TODOS los mails a bridvanovich@twf.uy con asunto
  prefijado `[SOMBRA – <cliente>]`. Apagar TEST_MODE = empezar a mandar de verdad.
- **Vía Montevideo** = `PAIS/dest_country = 'UY'` (verificado en producción 27/08:
  UY 193 · CL 124 vía San Antonio/Valparaíso · AR 41 vía Buenos Aires). Las vía Chile y
  vía BsAs quedan FUERA de este digest por ahora (Brian: "todavía no tengo tan afinadas
  las cargas de otros puertos").
- **Mapeo cliente→email:** NO se crea tabla nueva. Se reutiliza el catálogo `clients`
  existente (343 clientes con aliases + `cliente_pattern`) agregando 2 columnas.
- **El mail muestra lo mismo que el portal:** estados de `getShipmentStatus`
  (🚢 en tránsito · ⚓ en puerto · 🚛 salió MVD · 🛃 frontera · 📦 fiscal), campos seguros
  del shape de `rowToClientShipment`. Nada financiero, jamás.
- **Contenido por carga:** REF **sin la A** (regla emails con clientes) + ref propia del
  cliente si existe (`client_ref`) + contenedor + **buque** + ETA + estado + salida
  programada + fiscal destino + descripción + bultos/kg/m3.

## Componente 1 — Webapp (branch `feat/digest-clientes`)

### Migración (Supabase, aditiva, antes de la PR)

```sql
alter table clients add column if not exists digest_active boolean not null default false;
alter table clients add column if not exists digest_emails text not null default '';
```

- `digest_active`: este cliente recibe el digest.
- `digest_emails`: destinatarios (separados por coma). Si está vacío, fallback a
  `clients.email`. Si ambos vacíos y `digest_active`, el endpoint lo reporta como
  `sin_email` (el workflow avisa a Brian en el resumen, no manda nada).

### API

1. **Entity `clients`** (`api/data/[entity].ts` → `handleClients`): exponer y aceptar
   `digestActive` / `digestEmails` en GET/POST (mismo estilo camelCase↔snake_case que el
   resto). Auditoría vía `logAudit` como ya hacen las mutaciones.
2. **Endpoint nuevo `GET /api/data/client-digest`** (auth admin, mismo switch de entity):
   - Lee `clients` con `digest_active = true`.
   - Lee `shipments` con la whitelist `CLIENT_SHIPMENT_COLS` (nunca viajan montos).
   - Por cliente: filtra con `matchesClientePattern(cliente, effectiveClientePattern(client))`
     (patrón guardado o derivado de name+aliases — ya existe, espejo en admin-login.ts),
     `esCargaDeClienteActiva(...)` (activas: ETA ≤60d, entregadas ≤10d, sin archivadas
     ni source='sheet') y **`dest_country='UY'`** (case-insensitive; vacío NO entra).
   - Shape de salida por carga: `rowToClientShipment(...)` (CLIENTE vacío — una ref
     compartida A/B no filtra el nombre del otro cliente) + `estado` derivado.
   - **`deriveEstadoClienteDigest()` en `api/_lib/`**: espejo server-side SOLO del subset
     de `getShipmentStatus` que el digest necesita (en_transito / en_puerto /
     salio_montevideo / en_frontera / llego_fiscal, con label y emoji). Comentario
     "mantener en sync con src/lib/shipmentTypes" — misma convención que
     deriveTruckCargoStatus en api/tracking.ts (api/ NO importa de src/, verificado).
   - Respuesta:
     ```json
     { "generatedAt": "...", "clients": [ {
         "name": "CHIAPERO Y ASOC. S.R.L.", "displayName": "Chiapero y Asoc.",
         "emails": "a@x.com,b@x.com" | "", "sinEmail": false,
         "cargas": [ { "REF": "7620", "CLIENT_REF": "", "CNTR": "...", "BUQUE": "...",
                       "ETA": "...", "SALIDA": "...", "ETA_FISC": "...", "FISCAL": "...",
                       "DESCRIPCION": "...", "PKGS": 0, "KG": 0, "M3": 0,
                       "estado": { "code": "en_transito", "label": "En tránsito marítimo", "emoji": "🚢" } } ]
     } ] }
     ```
     La REF ya sale SIN la A (se la quita el endpoint). Clientes `digest_active` sin
     cargas activas vía UY vienen con `cargas: []` (el workflow decide no mandar).

### UI — ClientManager

- Toggle "📬 Digest lunes/jueves" + campo "Emails para el digest" (placeholder: "si queda
  vacío usa el email principal") en el form de cliente. Nada más — sin pestaña nueva.
- En la lista de clientes, badge chico cuando `digest_active` (para ver de un vistazo
  quiénes lo reciben).

### Tests (vitest, obligatorios antes de push)

- `esCargaDeClienteActiva` ya tiene tests; agregar: filtro vía UY (UY entra, CL/AR/vacío
  no), matcheo por patrón con variantes reales ("RDM - ABEA S.A." matchea patrón ABEA),
  `deriveEstadoClienteDigest` (un caso por estado + sin fechas), REF sin A, fallback
  digest_emails→email→sinEmail, y que el shape jamás incluya campos financieros.

## Componente 2 — Workflow n8n "MED - Aviso Clientes"

Clon estructural de "Prevision Operativa MED - v2" (login → HTTP → code → gmail), pero
más corto porque el server ya entrega todo masticado:

1. **Schedule:** lunes y jueves 09:00 America/Montevideo (verificar timezone del
   instance; si corre en UTC → cron `0 12 * * 1,4`).
2. **LOGIN_WEBAPP:** POST `/api/auth/admin-login` (igual al existente).
3. **TOMA_DIGEST:** GET `/api/data/client-digest` con Bearer token.
4. **ARMA_MAILS** (code): por cada cliente con `cargas.length > 0` y emails:
   - HTML con la estética de los mails de previsión (tablas inline-styles Gmail-safe):
     saludo con `displayName`, cargas agrupadas por estado en este orden:
     🚢 En viaje a Montevideo (con buque y ETA) → ⚓ En puerto → 🚛 Salida programada /
     salió (fecha + fiscal destino) → 🛃 En frontera → 📦 Arribadas al fiscal (últimos días).
   - Columnas: Ref · Su ref (si hay CLIENT_REF) · Contenedor · Buque · ETA · Salida ·
     Fiscal · Mercadería · Bultos · Kg · M3.
   - **Banner publicitario** (HTML/CSS puro, SIN imágenes adjuntas — los clientes de mail
     bloquean imágenes; un banner HTML renderiza siempre y es clickeable): "🚀 Nueva web de
     Mediterránea Carghas — seguí tus cargas online" + botón → `https://mediterraneacarghas.vercel.app/portal`
     + línea "¿Todavía no tenés usuario? Respondé este mail y te lo creamos."
   - `TEST_MODE = true` (constante arriba del nodo): destinatario = bridvanovich@twf.uy,
     asunto `[SOMBRA – <cliente>] Estado de sus cargas – Mediterránea Carghas – <fecha>`.
     Con TEST_MODE off: destinatarios reales, asunto sin prefijo.
5. **MAIL_CLIENTE** (gmail, misma credencial de siempre, appendAttribution off).
6. **RESUMEN_BRIAN** (code + gmail): siempre, un mail a Brian: cuántos clientes, cuántas
   cargas cada uno, a qué casillas se mandó (o se habría mandado), y alertas
   (`sinEmail`, clientes digest_active con 0 cargas).

## Seguridad

- Un mail por cliente; imposible cruzar cargas porque el server agrupa por patrón y el
  shape sale con CLIENTE vacío (regla refs compartidas A/B).
- Campos financieros nunca viajan (whitelist en el SELECT, misma defensa del portal).
- El endpoint requiere JWT admin; sin token no responde nada.
- Errores de login/fetch en n8n → el workflow corta sin mandar mails a medias (mismo
  comportamiento que la Previsión).

## Fuera de alcance v1 (anotado, no hacer)

- Cargas vía Chile / vía Buenos Aires (cuando Brian afine esos datos).
- LCL / aéreo / terrestre y cargas en camiones consolidados.
- Frecuencia configurable por cliente y detección de cambios.
- Crear usuarios de portal automáticamente (el banner invita a pedirlo).

## Plan de activación

1. PR webapp → Brian mergea → migración ya aplicada.
2. Marcar `digest_active` a CHIAPERO Y ASOC. S.R.L. y RDM - ABEA S.A. desde ClientManager.
3. Workflow n8n con TEST_MODE=true → correr a mano una vez → Brian valida los mails sombra.
4. Ajustes de formato → cargar `digest_emails` reales → TEST_MODE=false.
5. Sumar clientes = prender el toggle en la web (n8n no se toca más).
