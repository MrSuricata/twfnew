# Brief para Claude Code — Web TWF (`twfnew`)

> **Cómo usar este archivo:** abrí Claude Code con el repo `MrSuricata/twfnew`, copiá este `.md` y el `ARQUITECTURA_DATOS_TWF.md` a una carpeta `/docs` del repo (o pegá el contenido), y mandá como primer mensaje el bloque de "PROMPT" de abajo.

---

## PROMPT (pegar como primer mensaje en Claude Code)

```
Sos el dev de la web de TWF (este repo, twfnew: Vite + React + TS + Supabase, deploy en Vercel proyecto "twf").

CONTEXTO
- Backend: Supabase proyecto "TWF", ref ihpsdeoexkipxmaxsmrc.
- Arquitectura HOY es híbrida: las cargas FCL vienen de una Google Sheet y se cachean como JSON en la tabla shipments_cache (1 fila). En cambio LCL/aéreo (lcl_air_shipments), camiones (trucks/truck_loads), cotizaciones, fotos y reportes YA viven en Supabase.
- DECISIÓN tomada con Brian: migrar a Supabase como fuente ÚNICA de verdad, por fases; la Sheet quedará como export. No flipear el master hasta reconciliar.
- Seguí las convenciones que ya existen en el repo: design tokens, utilidades .tabs-list-underline / .tab-underline, RLS service_role en todas las tablas, i18n es/en/pt, y el estilo de PRs (una feature por branch + PR a main → Vercel auto-deploy).
- Doc de arquitectura completa: /docs/ARQUITECTURA_DATOS_TWF.md (modelo objetivo + mapeo Sheet→shipments).

Trabajá en este orden. Pará y mostrame el plan antes de cada tarea.

=== TAREA A (PRIORIDAD) — Feature "Pendiente de facturar" ===
Objetivo: cuando una carga llegó a fiscal, que aparezca como pendiente de facturar, se pueda marcar facturada/no, y se pueda DESHACER si nos equivocamos.

La facturación es un EJE APARTE del status operativo (como los checks CR/BL/AD/AT). No la metas en el enum de status.

Persistencia (para no esperar la migración): tabla overlay `shipment_billing`, cruzada por ref con el cache actual. ✅ COWORK YA CREÓ ESTA TABLA en Supabase (RLS allow_service_role + deny_anon, igual que el resto) — NO la recrees, construí la UI contra ella. DDL de referencia:
  create table public.shipment_billing (
    ref text primary key,
    status text not null default 'pendiente' check (status in ('pendiente','facturada','no_aplica')),
    invoice_number text default '',
    invoiced_at timestamptz,
    invoiced_by text default '',
    updated_at timestamptz default now()
  );
  alter table public.shipment_billing enable row level security;
  -- política service_role como el resto de las tablas.

UI:
- En la pestaña Cargas: las cargas con status "en fiscal"/arribadas a fiscal van a una lista/sección abajo "🧾 Pendientes de facturar" (al estilo de las listas En Frontera / Activos HOY que ya existen). Chip con contador.
- Toggle de un clic: "Facturada ✅" / "Deshacer ↩". Reversible: marcar setea status=facturada + invoiced_at + invoiced_by; deshacer vuelve a pendiente y limpia esos campos. Nada se borra.
- Pestaña nueva "Facturación" (mismo patrón que Cotizaciones): sub-listas Pendientes / Facturadas (este mes), buscador, contador, y "aging" (Xd pendiente; rojo si supera N días). Solo rol admin (los partners NO ven facturación).
- Una carga entra como 'pendiente' cuando llega el ÚLTIMO contenedor de la referencia (todas sus partes/contenedores en fiscal — clave para refs partidas A/B y multicontenedor). 'no_aplica' para las que no se facturan.

=== TAREA B — Fase 0: blindar el import ===
El parser de la planilla rompe cuando la Sheet trae texto donde se espera fecha (bug histórico "NaNd restantes" cuando LIBRE dice "DEVUELTO"). Endurecé el parseo de fechas en TODO el pipeline de import: que devuelva null en vez de Invalid Date, y que la UI muestre el valor crudo sin romper.

=== TAREA C — Fase 1: modelo unificado shipments ===
Implementá el modelo relacional único (FCL+LCL+aéreo+terrestre) con puerto destino + tramos (multipuerto: agregar Buenos Aires y el tránsito UY→AR como datos de primera clase, hoy es texto plano en "fiscal"). Schema y mapeo Sheet→shipments en /docs/ARQUITECTURA_DATOS_TWF.md. Migrá los ~800 refs a una tabla paralela y reconciliá contra la Sheet ANTES de flipear el master. Editor inline + pegado masivo para que cargar/editar sea tan rápido como la planilla.
```

---

## División de trabajo (para que no se pisen)

| Claude Code (este repo) | Cowork (asistente de Brian) |
|---|---|
| Frontend, UI de Facturación, blindaje del import, modelo en el front, rebranding admin/usuarios → Mediterránea | Crear/migrar tablas Supabase, cargar datos del Sheet, mover fotos/reportes a Storage, consolidar Vercel, conectar dominio |

> La tabla `shipment_billing` la puede crear Cowork directo en Supabase (tiene acceso) para que vos arranques solo con la UI — coordiná con Brian.

## Definido con Brian
1. Se dispara cuando llega el **último contenedor de la referencia** (todas sus partes en fiscal).
2. **Por referencia** (no por contenedor individual).
3. Capturar **nº de factura opcional**, además del marcado sí/no.
