# Arquitectura de datos — Web TWF
_Decisión (02/06/2026): migrar a Supabase como **fuente única de verdad**, por fases. La Google Sheet queda como export._

> App: https://transitworldforwarding.vercel.app · Repo: GitHub `MrSuricata/twfnew` (Vite+React) · Backend: Supabase proyecto **TWF** (`ihpsdeoexkipxmaxsmrc`).

---

## 1. Estado actual (híbrido — el problema)

| Dato | Vive en | Editable en app |
|------|---------|-----------------|
| FCL (cargas) | Google Sheet → cache JSON en `shipments_cache` (1 fila) | ❌ no |
| LCL + Aéreo | `shipments` (Supabase), `mode` lcl/air | ✅ |
| Terrestre / consolidados | `trucks` + `truck_loads` | ✅ |
| Cotizaciones, fotos, reportes, clientes, partners | Supabase | ✅ |

**Dos fuentes de verdad** = demora de sync, FCL no editable, y bugs de parsing (la Sheet mete texto donde la app espera fecha).

---

## 2. Modelo objetivo: tabla única `shipments`

Una sola entidad para TODA carga (FCL/LCL/aéreo/terrestre), con destino y modo de primera clase.

| Campo | Tipo | Notas |
|-------|------|-------|
| id / ref | text (uniq) | A7812 · LCL-0001 · AIR-0001 · split A/B |
| mode | enum | `FCL` `LCL` `AIR` `LAND` |
| client_id | FK clients | + cliente (texto puente) |
| shipper / cnee | text | |
| status | enum | en_origen, embarcado, en_viaje, arribado, en_puerto, saliendo, en_frontera, en_fiscal, devuelto |
| **origin_port** | text | puerto China |
| **dest_country** | enum | `UY` `AR` |
| **dest_port** | text | Montevideo, **Buenos Aires**, … |
| **transit** | bool | UY arribo → AR tránsito |
| **fiscal** | text | depósito fiscal AR |
| etd / eta / eta_fiscal | date | |
| linea / buque / mbl / hbl | text | |
| pkgs / kg / m3 | num | |
| terminal | enum | TCP / MONTECON |
| operativa | enum | CONTENEDOR / TRASIEGO / CARGA A PISO / DIRECTO |
| cterminal / cdev / locales / flete | num | costos/pagos |
| forma_pago | enum | PROGRAMADO / C CORRIENTE / AL ARRIBO |
| vto | date | venc. flete+locales naviera |
| libre / salida / dev | date/text | free time, salida, terminal devolución |
| wood | bool | SENASA si =sí |
| descripcion | text | |
| cr / bl / ad / at | bool/date | checks |
| **billing_status** | enum | `no_aplica` `pendiente` `facturada` — eje aparte del status operativo |
| **invoiced_at / invoiced_by** | timestamptz/text | quién y cuándo facturó (para deshacer/auditar) |
| **invoice_number** | text | nº de factura (opcional) |
| archived | bool | |
| created_at / updated_at | timestamptz | |

**Tablas hijas:**
- `containers` (shipment_id FK, cntr, tipo 20DRY/40HC/…, qty) — FCL multi-contenedor de primera clase (hoy es texto "CNTR + N").
- `shipment_legs` *(opcional, futuro)* — para rutas multi-tramo reales si crece más allá de UY→AR.
- `trucks` / `truck_loads` se mantienen y referencian `shipments` (capa de consolidación terrestre).

---

## 2b. Facturación (eje aparte del status)

Cuando llega el **último contenedor** de la referencia (todas sus partes en fiscal) → `billing_status = pendiente`. Admin la marca **facturada** (guarda `invoiced_at`/`invoiced_by` + nº opcional) y puede **deshacer** (reversible, con historial). No se mezcla en el status operativo (como los checks). UI: lista "🧾 Pendientes de facturar" en **Cargas** + pestaña nueva **Facturación** (Pendientes / Facturadas del mes, aging, toggle de un clic). Solo admin.

**Para shippearlo YA sin esperar la migración:** tabla overlay `shipment_billing` (ref PK) que la app cruza con el cache por ref. Spec de build completa → `WEB_TWF/BRIEF_CLAUDE_CODE.md`.

---

## 3. Mapeo Sheet → `shipments` (para la migración)

| Sheet (SG / Operativas) | → `shipments` |
|---|---|
| SG: Ref, Cliente, ETD, ETA, CNTR, N, MBL, Línea, Buque, Terminal | ref, cliente, etd, eta, containers[], linea, buque, terminal |
| SG: CTERMINAL, CDEV, LOCALES, FLETE, FORMA_PAGO, VTO | cterminal, cdev, locales, flete, forma_pago, vto |
| SG: CR, BL, AD, AT | cr, bl, ad, at |
| Operativas: TLX, Depósito, Salida, ETA_Fisc, LIBRE, Operativa, KG, M3, Descripción, Fiscal, DEV, Tipo, WOOD | telex, deposito, salida, eta_fiscal, libre, operativa, kg, m3, descripcion, fiscal, dev, mode/tipo, wood |
| (nuevo) | dest_country, dest_port, transit — derivar de Fiscal/destino |

LCL/aéreo ya viven en `shipments` con `mode=lcl/air`. El registro viejo
`lcl_air_shipments` salió de la app el 04/09/2026 (una sola alta, la de
Operaciones); la tabla queda en Supabase como archivo histórico.

---

## 4. Plan por fases

| Fase | Qué | Master FCL | Quién |
|------|-----|-----------|-------|
| **0** | Blindar el import (matar clase de bug NaN/fechas) | Sheet | Claude Code |
| **1** | Crear `shipments`+`containers`, migrar ~800 refs del Sheet, editor inline + pegado masivo | Sheet (espejo) | Cowork (DB+migración) · Claude Code (UI) |
| **2** | Flip a DB. Sheet pasa a export (DB→Sheet). Doble corrida + reconciliación | **DB** | ambos |
| **3** | Retirar Sheet como master. Multipuerto + modos nativos | **DB** | ambos |

---

## 5. Quién hace qué

- **Claude Code (GitHub `twfnew`):** modelo en el frontend, editor de cargas, blindaje del import, rebranding admin/usuarios → Mediterránea Carghas.
- **Cowork (acá):** crear/migrar tablas Supabase, cargar datos del Sheet, mover archivos a Storage, consolidar Vercel, conectar dominio, auditoría.

## 6. Flancos a cerrar en paralelo
Archivos base64 en Postgres → Supabase Storage · 3 proyectos Vercel duplicados → dejar `twf` · sin dominio propio · 2 índices duplicados.
