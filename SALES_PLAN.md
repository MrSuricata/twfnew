# TWF SaaS — Plan de Venta

**Producto:** Plataforma web operativa construida para y por freight forwarders, en español, foco LATAM.
**Stack:** React + Supabase + Vercel, hardened producción (abril 2026).
**Autor:** Brian (operador TWF) — vende la herramienta que ya usa todos los días.

---

## 1. Producto en una frase

> "El sistema operativo para el agente de carga LATAM — construido por un forwarder, en español, 10× más barato que CargoWise."

Módulos listos para vender:
- Landing pública + formulario de cotización con captcha Turnstile
- Tracking público por referencia o contenedor (sin datos sensibles)
- Dashboard admin con **HOY**, Agenda, Estadísticas, Cargas, Clientes, Partners
- Portal de Cliente (su carga, ETA, LIBRE, documentos, fotos origen)
- Portal de Depósito (agenda filtrada por depósito)
- Portal de Transporte (agenda filtrada por transportista)
- Importación desde Google Sheets / Excel
- Resumen diario por Telegram (LIBRE vencido, saliendo hoy, etc.)
- Analytics: cargas por mes, contenedores, clientes top, operaciones por terminal

---

## 2. ICP — Ideal Customer Profile

**Tamaño:** 3–15 empleados; 20–200 embarques/mes; USD 500k–5M facturación.

**Geografía:**
- 🇺🇾 Uruguay — miembros AUDACA (~60 forwarders)
- 🇦🇷 Argentina — despachantes frontera, agentes import
- 🇵🇾 Paraguay, 🇨🇱 Chile, 🇧🇴 Bolivia

**Perfil tecnológico:**
- Corre la operación en **Excel + WhatsApp + Gmail** (el 80% de LATAM)
- Probó CargoWise y rebotó por precio/complejidad — o nunca lo consideró
- Ya paga USD 50–300/mes por algo (Google Workspace, Zoho, Holded)
- Tamaño que no justifica un ERP custom

**Tradelanes:** Import FCL/LCL Asia → Mercosur (dry cargo, maquinaria, retail, bicicletas).

**Descalificaciones:**
- > 50 empleados (necesitan CargoWise/Magaya features)
- Courier-only
- Ya tienen Descartes / implementación custom con equipo IT

---

## 3. Propuesta de valor — 3 diferenciadores

### 🇪🇸 Hecho para LATAM, en español nativo
No es un SaaS gringo traducido. Tiene los campos que vos usás: **LIBRE, CDEV, VTO, trasiego, carga a piso, checks CR/BL/AD/AT, SENASA/WOOD, depósito fiscal, cliente_pattern, operativa por contenedor**. CargoWise no sabe qué es un trasiego. Magaya genérico.

### 📊 Google Sheets-native
La mayoría de los forwarders viven en una hoja. **Nosotros importamos desde tu hoja**, no te pedimos migrar. Si cancelás, tu hoja sigue intacta. Cero switching cost.

### 🪟 Portales sin email
3 portales dedicados (cliente, depósito, transporte) reemplazan el "¿dónde está mi carga?" por email. **Tu cliente entra con OTP, ve su carga, listo**. Tu depósito ve solo sus ops. Transportista lo mismo.

---

## 4. Pricing

3 tiers en USD (evita inflación ARS/UYU):

| Tier | Precio | Incluye |
|---|---|---|
| **Starter** | USD **89**/mes | 1 admin · 40 shipments/mes · tracking público · cotización · import Sheets |
| **Pro** 🎯 | USD **249**/mes | 5 users · 200 shipments/mes · **portales cliente+depósito+transporte** · analytics · resumen diario Telegram |
| **Business** | USD **549**/mes | 15 users · unlimited · branding custom · subdominio white-label · soporte prioritario · API |

**Setup fee:** USD 300–600 (branding + migración + training). Waive los primeros 5 clientes como closing lever.

**Benchmark:**
- CargoWise CVP: USD 500+/mes (low end) + per-transaction
- Magaya: USD 3,000+/mes
- **TWF Pro a USD 249 = 5-10× más barato con profundidad LATAM equivalente o mayor**

---

## 5. Go-to-Market — primeros 5 clientes

**Regla de oro:** primero red tibia, nada de cold outbound. Los primeros 5 salen de tu contexto.

### Estrategia por canal

**1. AUDACA — red tibia (foco #1)**
- Pedí 3 intros a Martín Colombo / Pablo Simes (Mediterránea) → forwarders que se quejan de su sistema actual o siguen en Excel puro
- Objetivo: 2 reuniones/semana durante el mes 1

**2. Red de agentes Argentina**
- Tus contactos en RDM, PCS, Wildengold, Transcal
- Pitch: "operá tus cargas con agente en UY en el mismo sistema que usa TWF" → network effect

**3. LinkedIn warm DMs**
- ~30 forwarders UY/AR/PY que interactúan con contenido AUDACA/ALACAT
- Brian posta 1 video de 60s con demo real → comentarios → DMs → calls

**4. WhatsApp grupos operador**
- LATAM vive en WhatsApp (SOS Despachantes, grupos AUDACA)
- No spam: compartí el URL de tracking como "miren lo que hicimos para TWF"

**5. ALACAT/AUDACA eventos**
- Sponsor coffee break + presentación 10 min case study
- 1 conversación side-meeting > 100 cold emails

### Metas

- **60 días:** 2 clientes pagando
- **90 días:** 5 clientes pagando (MRR ~USD 1,000-1,500)
- **Founding customer rate:** primeros 3 pagan 50% off year 1 a cambio de testimonial + case study

---

## 6. Demo strategy — 3 hero features (20 min max)

Usar datos reales del prospect, no demo genérico.

1. **Sheets → live dashboard en 60 segundos**
   Importá su CONTROL CARGAS-style sheet. Boom, su operación con alertas de urgencia (LIBRE ≤5d rojo, VTO vencido, checks faltantes). *"Ey, esto entiende mi negocio."*

2. **Portal de cliente**
   Login como uno de **sus clientes reales** y mostrale lo que ve ese cliente: ETA, buque, status, docs. Todo forwarder gasta horas/semana en "¿dónde está mi carga?" → esto se vende solo.

3. **Tracking público + quote form**
   Mostrale el logo de él en el landing, copiá el URL, pegalo en WhatsApp. *"Esto es lo que le mandás a tu cliente en vez de contestar mails."* Utilidad día 1.

---

## 7. Objections handling

| Objeción | Respuesta |
|---|---|
| *"Mis datos están en mi Excel, no quiero migrar."* | "No migrás. Conectamos tu Sheet, la app lee desde ahí. Cancelás mañana, tu Sheet sigue intacta." |
| *"¿Dónde están mis datos? ¿Son seguros?"* | "Supabase en AWS São Paulo, RLS por tenant, backups diarios, exportable a CSV. Te muestro el dump en vivo." |
| *"Mi equipo no es técnico."* | "Onboarding asistido, 2 calls de 1h. Si alguien usa Gmail + Excel, usa TWF. 100% español, voseo uruguayo." |
| *"Ya uso CargoWise / Sistema Forward / desarrollo in-house."* | "No competimos con tu ERP contable. Competimos con el caos entre Excel + WhatsApp + email. Convivimos con lo que ya tenés." |
| *"¿Qué pasa si Brian desaparece?"* | Código en escrow tier Business, SLA escrito, export total cuando quieras, stack estándar (React/Supabase) — cualquier dev lo continúa. |

---

## 8. Onboarding — 72h contrato → producción

- **Día 0:** Provisionamos tenant Supabase + Vercel con subdominio custom. Upload branding (logo, colores).
- **Día 1 (call 1h):** Import Sheet, map columnas, create users, setup EmailJS.
- **Día 2 (call 1h):** Crear primeros 3 clientes en portal, probar tracking público, setear template email.
- **Día 3:** Go-live + 30 días de soporte WhatsApp directo.

**Plug-and-play:** portales, tracking, dashboard, analytics, quote form.
**Customization:** logo/colors, column mapping de su sheet, lista de estados locales, templates de email.
**Esfuerzo Brian:** 4–6h total por cliente.

---

## 9. Riesgos & mitigaciones

| Riesgo | Mitigación |
|---|---|
| Lock-in a Spark KV / EmailJS | Migrar quote storage a Supabase puro antes de cliente #2. Reemplazar EmailJS por Resend. |
| Bandwidth Brian (es operador full-time en TWF) | Cap 5 clientes año 1. Contratar soporte part-time en cliente #4. Documentar onboarding como checklist. |
| Respuesta de CargoWise/SistemaForward con tier barato | **Profundidad > precio** — seguir construyendo features Mercosur-específicas (SENASA, DUA, NCM lookup) que no priorizan. |
| Churn a los 3 meses (vuelve a Excel) | Portales crean stickiness (sus clientes no quieren perderlos). Billing anual con 2 meses gratis. |
| Data breach / responsabilidad | Contrato con liability cap = 12 meses fees. Cyber-insurance USD 500-800/año antes del cliente 1. |
| Data residency Argentina/Uruguay | Supabase São Paulo region. Privacy policy LATAM. Consent GDPR-like ya implementado en quote form. |

---

## 10. Gap analysis — lo que FALTA para vender sin objeciones

Features que podrían bloquear ventas serias:

1. **🔴 Facturación electrónica** (DGI UY e-factura + AFIP AR) — **bloqueante #1**. Sin esto, TWF es "capa de visibilidad" no "reemplazo completo". **Build MVP en días 31-60** o integrar con Alegra/Contabilium/Dogma.
2. **Integración contable** — QuickBooks/Contabilium/Xero. Mínimo: CSV export mensual.
3. **Gestión DUA/aduana** — fotos sí, pero no flow estructurado de docs customs (DUA, CRT, MIC, extracción BL).
4. **CRM pipeline** — QuotesManagement existe, pero no lead pipeline ni follow-up automation ni deal stages.
5. **Multi-moneda + FX** — USD default; falta UYU/ARS/BRL + rates configurables.
6. **Parseo email entrante** — advice automático desde mails de navieras. Diferenciador de CargoWise.
7. **PWA mobile-first** — UI responsive ✓ pero no optimizado para operadores en movimiento.
8. **Permisos granulares** — admin/client/depot/transport; falta "viewer", "ops", "finance".
9. **Audit log / historial** — requerido por clientes compliance-focused.
10. **API + webhooks** — mencionado como tier Business, pending.

**Prioridad build antes del cliente 3:** #1 (facturación), #5 (multi-currency), #9 (audit log).

---

## 11. Plan 30/60/90 días

### Days 1–30 — Foundation + primer cliente
- Extraer branding TWF-específico → tenant-configurable (logo, colors, legal entity).
- Landing genérica en `twf-saas.com` (o similar).
- Sales deck PDF de 1 página + demo Loom 3 min en español.
- Pricing page con Stripe checkout (Starter + Pro).
- Legal: ToS + Privacy + MSA template (abogado LATAM ~USD 800).
- Discovery calls con 5 contactos AUDACA. **Objetivo: 1 cliente cerrado.**

### Days 31–60 — Escalá el closing
- Build **facturación MVP** (UY e-factura via third-party + AR factura C PDF).
- Onboard clientes 2 y 3 (target: 1 UY + 1 AR).
- Cadencia LinkedIn: 2 posts/semana de Brian mostrando feature sobre data real.
- Sponsor coffee break / lightning talk AUDACA.
- Build audit log + multi-currency.

### Days 61–90 — Fundamentos product-market-fit
- Case study PDF del cliente 1 (métricas: horas ahorradas, emails reducidos).
- Primer ad spend (USD 500/mes LinkedIn LATAM logistics) — recién después de 2 cerrados.
- Contratar soporte part-time (USD 600-900/mes UY/AR).
- **Clientes 4 y 5 firmados. MRR target: USD 1,000-1,500.**
- Decisión estratégica: solo o levantar angel (USD 50-100k) para dev full-time + build CRM + API.

---

## 12. Recursos / referencias

- [AUDACA](http://www.audaca.com.uy/) — Asociación Uruguaya Agentes de Carga
- [ALACAT](https://www.alacat.org/) — Federación LATAM
- Competitors research:
  - CargoWise CVP model — USD 500+/mes low end
  - Magaya — USD 3,000+/mes
  - Sistema Forward (LATAM) — pricing privado
  - Linbis, Logitude, Logipulse — alternativas de segundo nivel
