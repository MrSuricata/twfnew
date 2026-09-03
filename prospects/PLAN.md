# PLAN MAESTRO — 9 sitios web Montevideo

> Documento único de arquitectura y ejecución. Fecha: 2026-05-15. Stack: Astro 5 + Tailwind 4 + TypeScript estricto. Monorepo pnpm. 9 sitios distribuidos en 3 tiers.

---

## 1. Resumen ejecutivo

Construimos 9 sitios web para 9 negocios reales de Montevideo (Ciudad Vieja, Centro, Cordón) repartidos en 3 niveles de complejidad: 3 landings Tier 1 (Caro Morales, Bosque Tattoo, Diana Saravia), 3 multi-página Tier 2 (Bar Tasende, Bar Hispano, Babilonia Libros) y 3 sitios complejos con backend Tier 3 (Plaza Fuerte Hotel, Karausz, Posada al Sur). Tiempo total estimado 13-19 días de desarrollo en 5 sprints, con tandas paralelas de 3 sub-agentes. Entregable: monorepo deployable, dossier por sitio y staging URLs para presentar al cliente.

| # | Negocio | Tier | Rubro | Slug `/sites/<slug>/` | Dominio sugerido |
|---|---------|------|-------|----------------------|------------------|
| 1 | Centro Estético Carolina Morales | T1 | Peluquería + barbería | `tier1-caro-morales` | `caromorales.uy` |
| 2 | BOSQUE Tattoo Estudio | T1 | Estudio de tatuajes | `tier1-bosque-tattoo` | `bosquetattoo.uy` |
| 3 | Diana Saravia Contemporary Art | T1 | Galería de arte | `tier1-diana-saravia` | `dianasaravia.uy` (unificar los 2 dominios actuales) |
| 4 | Bar Tasende | T2 | Bar / pizzería 1931 | `tier2-bar-tasende` | `bartasende.com.uy` |
| 5 | Bar Hispano | T2 | Bar tradicional 1959 | `tier2-bar-hispano` | `barhispano.com.uy` |
| 6 | Babilonia Libros | T2 | Librería independiente | `tier2-babilonia-libros` | `babilonialibros.uy` (verificar estado actual) |
| 7 | Plaza Fuerte Hotel | T3 | Hotel boutique 4★ | `tier3-plaza-fuerte` | `plazafuerte.com.uy` |
| 8 | Anticuario Karausz | T3 | Antigüedades | `tier3-karausz` | `karausz.uy` (ya existente, rebuild) |
| 9 | Posada al Sur | T3 | Hostel cooperativo | `tier3-posada-al-sur` | `posadaalsur.com.uy` (consolidar de HTTP a HTTPS, un solo dominio) |

---

## 2. Definición de tiers (contrato canónico)

**Tier 1 — Landing single-page.** Un solo HTML navegable por anclas (#servicios, #galeria, #contacto). Contenido: hero con propuesta de valor, servicios/portfolio, prueba social (3-6 reseñas o testimonios), horarios + mapa, botón flotante de WhatsApp, formulario de contacto simple (3 campos), Schema.org `LocalBusiness`. Sin backend, sin CMS, sin multilenguaje. Edita el dev en código + commits. Hosting estático en Cloudflare Pages. Build time < 5s.

**Tier 2 — Multi-página estática.** Entre 5 y 9 rutas independientes (Home, Quiénes somos / Historia, Carta o Catálogo, Galería, Eventos / Servicios, Contacto, 404, Legal). Content collections de Astro (markdown + frontmatter) para que el dev pueda editar carta/blog/eventos sin tocar componentes. Formulario contacto con Resend (server-side, sin DB). Galería con lightbox. Schema.org del rubro (`Restaurant`, `BarOrPub`, `BookStore`). Sin auth, sin reservas online, sin admin panel, sin multilenguaje (sólo ES; placeholders i18n preparados por si el cliente pide EN después). Cloudflare Pages.

**Tier 3 — Sitio complejo con backend.** Multi-página + Supabase (postgres + auth + storage + RLS) + multilenguaje real ES/EN/PT-BR con rutas dedicadas y `hreflang`. Módulos funcionales: reservas online (hotel + hostel), catálogo navegable con filtros y solicitud de pieza (Karausz), inscripciones a talleres y tours (Posada). Panel admin protegido por Supabase Auth para que el cliente cargue contenido (habitaciones, tarifas, piezas, eventos) sin tocar código. Server actions de Astro 5 para formularios autenticados. Tests Playwright en flujos críticos. Hosting Vercel (necesitamos serverless + edge functions + ISR). Build time aceptable < 60s.

**No-goals explícitos (anti-scope-creep).** Tier 1 no lleva blog, no lleva CMS, no lleva multilenguaje. Tier 2 no lleva e-commerce ni reservas online ni auth. Tier 3 no lleva pasarela de pago real en esta fase (reservas confirman por email + WhatsApp, no se cobra online); no lleva PWA offline; no lleva app móvil. Cualquier requerimiento que no esté en esta lista es out-of-scope y se factura aparte.

---

## 3. Arquitectura técnica

### Stack elegido

- **Astro 5** como meta-framework para los 9. Razón: hace SSG por defecto (Tier 1/2 estáticos puros, Lighthouse 95+ regalado), permite Islands (hidratar sólo lo dinámico — Lightbox, MobileMenu, FormularioReserva), tiene server actions y server endpoints nativos en v5 (Tier 3), content collections con validación Zod, integración nativa con `astro:assets` (WebP/AVIF), i18n nativo en v5. No usamos Next/Nuxt porque hidratan toda la página por defecto y para sitios con 70% contenido estático es overkill.
- **Tailwind CSS 4** con `@tailwindcss/vite`. Razón: CSS engine nuevo en Rust 10x más rápido, `@theme` directives in-CSS para tokens, fácil de overridear por sitio sin perder el preset compartido.
- **TypeScript estricto** (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) en los 9. Razón: detecta bugs en componentes compartidos, hace que los schemas Zod sirvan de tipo runtime + compile-time.
- **Supabase** sólo en Tier 3. Razón: postgres real con RLS (mejor que Firebase para datos tabulares como reservas/piezas), auth out-of-the-box, storage para imágenes que sube el admin, free tier soporta los 3 sitios (50k MAU, 500MB DB, 1GB storage por proyecto — vamos a tener 1 proyecto Supabase por sitio para aislar permisos y costos).
- **Resend** para envío de mails transaccionales (formularios de contacto, confirmación de reservas). Razón: 100 mails/día gratis, API limpia, soporta dominios verificados. Alternativa descartada: SMTP propio (overhead operativo no justificado).
- **pnpm** workspaces. Razón: hard-links en lugar de copia, 3-4x más rápido que npm en monorepos grandes, lockfile determinista.
- **Zod** para validación runtime de forms y content collections. Razón: un solo schema sirve para validar input del usuario, frontmatter de markdown y respuesta de Supabase.

### Estructura monorepo

```
/twfnew/
├── pnpm-workspace.yaml
├── package.json              ← workspace root, scripts cross-sitio
├── turbo.json                ← cache build matrix (opcional pero recomendado)
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── .github/workflows/        ← CI/CD
├── /sites/
│   ├── tier1-caro-morales/
│   ├── tier1-bosque-tattoo/
│   ├── tier1-diana-saravia/
│   ├── tier2-bar-tasende/
│   ├── tier2-bar-hispano/
│   ├── tier2-babilonia-libros/
│   ├── tier3-plaza-fuerte/
│   ├── tier3-karausz/
│   └── tier3-posada-al-sur/
├── /packages/
│   ├── ui/                   ← componentes .astro compartidos
│   ├── config/               ← tailwind preset, tsconfig base, eslint config
│   ├── lib/                  ← analytics, schema.org builders, i18n helpers, forms, Resend client, Supabase client factory
│   └── content/              ← schemas Zod compartidos (LocalBusiness, MenuItem, ArtPiece, Room, Workshop)
├── /supabase/
│   ├── plaza-fuerte/
│   │   ├── migrations/
│   │   ├── seed.sql
│   │   └── config.toml
│   ├── karausz/
│   └── posada-al-sur/
└── /docs/                    ← dossier por sitio, decisiones de arquitectura
```

Cada sitio en `/sites/*` es un proyecto Astro auto-contenido con su propio `astro.config.mjs`, `tailwind.config.ts` (extiende el preset), `package.json` (declara dependencias a `@twf/ui`, `@twf/lib`, etc. con `workspace:*`).

### Hosting/deploy

- **Cloudflare Pages para Tier 1 y 2** (6 sitios). Razón: estáticos puros, build gratuito ilimitado, CDN global con cache edge, custom domains gratis, preview deploys automáticos por PR. No necesitamos serverless ahí porque los formularios de contacto de Tier 2 los procesa un endpoint server de Astro deployado como Cloudflare Function (incluido en el plan gratuito).
- **Vercel para Tier 3** (3 sitios). Razón: integración nativa con Astro 5 server actions, edge functions con runtime Node para Supabase client, ISR para páginas de habitaciones / piezas (revalidate on-demand cuando admin actualiza), preview deploys, ENV vars por entorno. Alternativa descartada: Cloudflare Workers — la lib `@supabase/supabase-js` funciona pero Vercel tiene mejor DX y observability gratis.

### DNS y dominios (placeholders)

Cada cliente decide su dominio definitivo. La convención por default es `<negocio>.com.uy` salvo que el cliente prefiera `.uy` (más corto, más caro). Tiers 3 ya tienen dominios existentes que hay que migrar:
- Karausz: `karausz.uy` ya está en uso → coordinar transferencia de NS.
- Posada al Sur: pasar de `es.posadaalsur.com.uy` + `en.posadaalsur.com.uy` (HTTP) a un solo `posadaalsur.com.uy` (HTTPS) con redirects 301 desde los subdominios viejos.
- Diana Saravia: unificar `dianasaraviagallery.com` y `dianasaravia.com.uy` con un canónico (recomendado `dianasaravia.uy`) + 301 desde los otros dos.

### Env vars y secretos (canónica)

Archivo `.env.example` por sitio. Nada commiteado. En CI inyectado vía Secrets de GitHub Actions + Vercel/Cloudflare project env.

```bash
# Comunes (los 9)
PUBLIC_SITE_URL=https://negocio.com.uy
PUBLIC_GA4_ID=G-XXXXXXX                 # opcional, sólo si cliente lo aprueba
PUBLIC_ANALYTICS_PROVIDER=ga4|plausible|none
PUBLIC_WHATSAPP_NUMBER=59898911302      # formato internacional sin +
PUBLIC_WHATSAPP_DEFAULT_MSG="Hola! Quería consultar..."
RESEND_API_KEY=re_xxx
CONTACT_TO_EMAIL=cliente@negocio.uy
CONTACT_FROM_EMAIL=web@negocio.uy       # debe estar verificado en Resend
RATE_LIMIT_SECRET=<random-32-chars>     # para el bucket de rate-limit de forms

# Tier 3 adicionales
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...                # public, va al cliente
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # SOLO server, NUNCA expuesta
PUBLIC_DEFAULT_LOCALE=es
PUBLIC_LOCALES=es,en,pt
ADMIN_SIGNUP_TOKEN=<random-32>          # bloquea registro abierto al admin

# Plaza Fuerte específico (opcional fase 2)
BOOKING_ENGINE_API_KEY=                 # placeholder si después integramos PMS
```

---

## 4. Sistema de diseño compartido

### Tokens (`packages/config/tailwind.preset.ts`)

- **Spacing scale:** la default de Tailwind (`0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`) + extensiones `section-y: 4rem`, `section-y-lg: 6rem`, `gutter: 1.25rem`.
- **Breakpoints:** `xs: 360px`, `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`. Mobile-first siempre.
- **Radios:** `sm: 0.25rem`, `md: 0.5rem`, `lg: 0.75rem`, `xl: 1rem`, `2xl: 1.5rem`, `full: 9999px`.
- **Sombras:** `xs: 0 1px 2px rgb(0 0 0 / 0.04)`, `sm: 0 2px 4px rgb(0 0 0 / 0.06)`, `md: 0 4px 12px rgb(0 0 0 / 0.08)`, `lg: 0 12px 32px rgb(0 0 0 / 0.10)`.
- **Z-index:** `dropdown: 1000`, `sticky: 1100`, `header: 1200`, `whatsapp-fab: 1250`, `drawer: 1300`, `modal: 1400`, `toast: 1500`, `cookie-banner: 1600`.
- **Container:** `max-w-7xl` (1280px) por default, `max-w-prose` para texto largo.
- **Animation:** transiciones cortas `150ms ease-out` para hover; `300ms ease-out` para drawer/modal; respeto a `prefers-reduced-motion`.

### Paletas por negocio (9)

Cada paleta tiene 5 tokens: `primary` (CTA principal), `secondary` (acento secundario), `accent` (highlights), `neutral-bg` (fondo dominante), `neutral-text` (texto principal). Todas verificadas mentalmente para contraste AA mínimo (4.5:1 texto sobre fondo) — el dev valida con axe en CI.

| Sitio | primary | secondary | accent | neutral-bg | neutral-text |
|-------|---------|-----------|--------|------------|--------------|
| Caro Morales | `#C58A9E` rosa empolvado | `#3D2B2F` marrón oscuro | `#E9D8C4` nude | `#FAF6F2` crema | `#1F1416` casi negro |
| Bosque Tattoo | `#0E0E0E` negro tinta | `#7A8C5F` verde musgo | `#C9A66B` ocre | `#F2EFE9` papel | `#0E0E0E` |
| Diana Saravia | `#1A1A1A` carbón | `#8B7355` tierra | `#D4A574` arena | `#FFFFFF` blanco galería | `#1A1A1A` |
| Bar Tasende | `#1F3B2E` verde botella | `#C8A961` mostaza vintage | `#A12B1E` rojo italiano | `#F5EFE2` crema | `#2A1F18` |
| Bar Hispano | `#7B2D26` bordó español | `#E8B547` dorado | `#1E1E1E` ébano | `#F4ECDB` papel viejo | `#1E1E1E` |
| Babilonia Libros | `#2E4B6B` azul tinta | `#B85C38` naranja teja | `#E6C66F` amarillo página | `#F7F2E8` papel | `#1B2233` |
| Plaza Fuerte | `#0E2C4E` navy patrimonial | `#B89B5E` dorado heráldico | `#8C6A3F` bronce | `#FBF8F3` marfil | `#0E2C4E` |
| Karausz | `#5C1A2B` burdeos | `#D9CCB4` bone | `#1F1F1F` negro mate | `#F1EAD9` pergamino | `#1F1F1F` |
| Posada al Sur | `#E25E3E` terracota | `#1F6B5A` verde solidario | `#F2C14E` amarillo cooperativo | `#FBF5E9` arena clara | `#23231F` |

### Tipografías por sitio

Todas se cargan con `font-display: swap`, self-hosted con `@fontsource-variable/*` o subset propio si el peso lo justifica. Pares display + body:

| Sitio | Display | Body |
|-------|---------|------|
| Caro Morales | Cormorant Garamond | Inter |
| Bosque Tattoo | Bebas Neue | Inter |
| Diana Saravia | Playfair Display | Inter |
| Bar Tasende | Abril Fatface | Source Serif 4 |
| Bar Hispano | Playfair Display | Lora |
| Babilonia Libros | Libre Caslon Text | Inter |
| Plaza Fuerte | Cormorant Garamond | Inter |
| Karausz | Cormorant Infant | Libre Baskerville |
| Posada al Sur | DM Serif Display | DM Sans |

### Catálogo `packages/ui` (componentes Astro compartidos)

Marcado por tier mínimo donde son obligatorios: T1 / T2 / T3.

| Componente | T1 | T2 | T3 | Notas |
|------------|----|----|----|-------|
| `Button.astro` (variants: primary/secondary/ghost) | x | x | x | Soporta `as="a"` o `as="button"` |
| `Link.astro` | x | x | x | Maneja external icon + prefetch |
| `Section.astro` | x | x | x | Wrapper semántico con padding consistente |
| `Container.astro` | x | x | x | max-w + gutter |
| `Nav.astro` + `MobileMenu.astro` | — | x | x | Tier 1 usa nav inline sin drawer |
| `Footer.astro` | x | x | x | Slots para columnas |
| `Hero.astro` | x | x | x | Variants: image-bg, video-bg, split |
| `FormField.astro`, `Input`, `Textarea`, `Select`, `Checkbox` | x | x | x | Labels con `htmlFor`, errores con `aria-describedby` |
| `Card.astro` | — | x | x | Para menú, eventos, habitaciones |
| `Badge.astro` | — | x | x | Estados (disponible/vendido/agotado) |
| `Modal.astro` (island) | — | — | x | Focus trap, ESC, overlay click |
| `Drawer.astro` (island) | — | x | x | Filtros catálogo |
| `Accordion.astro` (FAQ) | — | x | x | Headless, accesible |
| `Tabs.astro` | — | x | x | Roving tabindex |
| `Gallery.astro` + `Lightbox.astro` (island) | x | x | x | Tier 1 con lightbox liviano |
| `MapEmbed.astro` | x | x | x | Lazy load iframe Google Maps |
| `WhatsAppFloat.astro` | x | x | x | FAB con `wa.me` |
| `CookieBanner.astro` (island) | si carga GA | si carga GA | si carga GA | Sólo se monta si `analytics !== 'none'` |
| `Toast.astro` + `AriaLive` | x | x | x | Mensajes de form |
| `Pagination.astro` | — | x | x | Catálogos largos |
| `Breadcrumbs.astro` | — | x | x | Schema.org BreadcrumbList |
| `LangSwitcher.astro` | — | — | x | Sólo Tier 3 |
| `JsonLd.astro` | x | x | x | Inyecta `<script type="application/ld+json">` |
| `SeoHead.astro` | x | x | x | OG, Twitter, canonical, hreflang |

---

## 5. Mapa de páginas y funcionalidades por sitio

### 5.1 Caro Morales — Tier 1

**Rutas (single-page con anclas):** `/` con secciones `#servicios`, `#precios`, `#galeria`, `#horarios`, `#ubicacion`, `#contacto`.

**Componentes específicos:** Hero con foto de fachada o lavadero (variante image-bg), `ServiceList` (chips con servicio + precio orientativo), Gallery (8-12 fotos del trabajo), MapEmbed Brandzen 2011, WhatsAppFloat con mensaje `"Hola Caro! Quería reservar un turno para…"`.

**Copy real para home (tono cálido, barrio, directo):**
- "Tu peluquería y barbería en Cordón, sobre Brandzen."
- "Cortes, color, alisados y barbería — atendemos hombres y mujeres."
- "Reservá tu turno por WhatsApp en segundos. Sin esperas."
- "Trabajamos con producto profesional y técnicas actualizadas (balayage, mechas californianas, fade, barba con toalla caliente)."
- "Más de 10 años atendiendo al barrio del Cordón."
- "Estamos a una cuadra de 18 de Julio, fácil llegada en bondi o caminando."
- "Promos de martes y miércoles: consultanos."

**Imágenes necesarias:** fachada (1), interior del salón (2), lavadero (1), trabajos de pelo before/after (4), trabajos de barbería (3), retrato Caro detrás de la silla (1). Si el cliente no tiene fotos pro: stock keywords "hair salon interior warm", "barber chair leather", "hairdresser working closeup"; alternativa generación: prompt "interior of small modern hair salon in Cordón Montevideo, warm pink and beige tones, natural light, professional, no people".

---

### 5.2 BOSQUE Tattoo — Tier 1

**Rutas:** `/` con `#artistas`, `#estilos`, `#proceso`, `#galeria`, `#agendar`, `#faq`.

**Componentes específicos:** Hero oscuro full-bleed con un tatuaje grande de referencia, `ArtistCard` (foto + bio + estilo + IG), `StyleGrid` (filtros visuales por fineline/blackwork/ilustrativo), Gallery con Lightbox (20-30 piezas), Accordion FAQ ("¿Cuánto cuesta una sesión?", "¿Cuidados post-tattoo?", "¿Hacen retoque gratis?"), WhatsAppFloat con mensaje `"Hola! Tengo una referencia para tatuarme. Adjunto foto y consulto."`.

**Copy real para home (tono editorial, oscuro, calmo):**
- "BOSQUE. Estudio privado de tatuajes en Ciudad Vieja."
- "Trabajamos con cita previa. Tu sesión, tu privacidad."
- "Fineline, blackwork, ilustrativo y proyectos a medida."
- "Mandanos tu referencia por WhatsApp y armamos juntos el diseño."
- "Materiales esterilizados, agujas descartables, productos hipoalergénicos."
- "Atendemos también guest spots y proyectos grandes (manga, sleeve)."
- "Consultá por sesiones de piercing con joyería de implant grade."

**Imágenes necesarias:** estudio por dentro (3, low-light, deliberado), tatuadores trabajando (3), portfolio (20-30 trabajos categorizados por estilo), detalle de máquinas/agujas estériles (2). Stock keywords: "tattoo studio interior dark moody", "tattoo artist hands closeup". `{{PENDIENTE_FOTOS_PORTFOLIO}}` con los tatuadores.

---

### 5.3 Diana Saravia — Tier 1

**Rutas:** `/` con `#diana`, `#artistas`, `#exposiciones`, `#ferias`, `#contacto`. Una sección "Visitas con cita" en lugar de horarios fijos (galería trabaja con agenda).

**Componentes específicos:** Hero limpio con obra destacada (variante split: obra + texto), `ArtistCard` (12-20 artistas representados con foto + nombre + 1 obra), `FairsList` (lista cronológica de ferias internacionales: Miami, Madrid, Lima, Punta del Este), formulario contacto con campo "interés (visita / obra específica / colaboración)", WhatsAppFloat con `"Quería visitar la galería / consultar por una obra."`.

**Copy real para home (tono curatorial, sobrio, prestigio):**
- "Diana Saravia · Contemporary Art."
- "20 años seleccionando arte uruguayo contemporáneo en Ciudad Vieja."
- "Representamos a más de 15 artistas locales con trayectoria internacional."
- "Visitas con cita previa en Carlos Quijano 1288 o Club de París, San José 876."
- "Participamos en ferias en Miami, Madrid, Lima y Punta del Este."
- "Asesoramiento a coleccionistas, decoradores e instituciones."
- "Contacto directo con Diana: agendá una visita."

**Imágenes necesarias:** retrato de Diana en la galería (1), espacio de la galería (4, con obras montadas), 12-20 obras representativas de artistas (con créditos correctos), foto de la sede Club de París (1). `{{PENDIENTE_LISTA_ARTISTAS_REPRESENTADOS}}` y `{{PENDIENTE_DERECHOS_DE_IMAGEN_DE_OBRAS}}`.

---

### 5.4 Bar Tasende — Tier 2

**Rutas:** `/`, `/historia`, `/menu`, `/galeria`, `/eventos-privados`, `/contacto`, `/404`, `/legal`.

**Componentes específicos:** Hero con foto de la pizza al tacho (split), `MenuSection` (entradas, pizzas, minutas, postres, bebidas) renderizado desde `src/content/menu/*.md` con precios, `HistoryTimeline` (1931 - hoy, hitos), Gallery con fotos del mobiliario original y la barra, formulario eventos privados (capacidad estimada, fecha tentativa, tipo de evento), `MapEmbed` Ciudadela 1300, schema `Restaurant` + `serves` pizza.

**Copy real para home (tono porteño-montevideano, orgulloso, sin solemnidad):**
- "Bar Tasende. Desde 1931 en la esquina de Ciudadela y San José."
- "La pizza al tacho es nuestra. La amasamos como aprendió el abuelo."
- "Tres generaciones detrás de la barra. La cuarta ya está creciendo."
- "Mobiliario original, copas de vidrio grueso y mantel a cuadros."
- "Bajá a tomar algo después del laburo o vení el viernes con la barra."
- "Hacemos eventos privados: cumpleaños, jubilaciones, vermús de oficina."
- "Reservás llamándonos o por WhatsApp. Sin formularios raros."

**Imágenes necesarias:** fachada (1), barra y mobiliario antiguo (3), pizza al tacho en proceso (4: amasado, horno, corte, plato), platos clásicos (chivito, milanesa, ensalada — 4), fotos de archivo familia Tasende (2-3, `{{PENDIENTE_FOTOS_HISTORICAS}}`), retrato del dueño actual (1), galería de comensales (2).

---

### 5.5 Bar Hispano — Tier 2

**Rutas:** `/`, `/historia`, `/la-preparacion`, `/carta`, `/galeria`, `/eventos`, `/contacto`, `/404`, `/legal`.

**Componentes específicos:** Hero con foto cenital de "la preparación" (los 30 platitos), `PreparacionShowcase` (página dedicada con grid de los platitos y nombres), `MenuSection` por categoría (picadas, chivitos, milanesas, minutas, bebidas), `HistoryTimeline` (1959 - cambio de manos 2024 - hoy), formulario eventos con preset "after-office corporativo" / "cumpleaños" / "vermouth grupal", `MapEmbed` Río Negro 1254.

**Copy real para home (tono clásico, picaresco, 18 de julio):**
- "Bar Hispano. Esquina de Río Negro y San José desde 1959."
- "Nuestra preparación: 30 platitos que vienen sin que los pidas, con tu trago."
- "Chivito canadiense, milanesa con todo, picada para tres con vermouth."
- "Bar de barrio, mesa redonda, mozos que se acuerdan de tu nombre."
- "Bajo nueva administración desde 2024. Misma carta, misma fórmula."
- "Reservás por teléfono al 2900 4596 o pasando."
- "Eventos privados, after-office y cumpleaños: consultanos."

**Imágenes necesarias:** fachada con cartel (1), barra con botellas (2), "la preparación" servida completa (3 ángulos), chivito clásico (2), milanesa (2), interior con comensales (2), retrato nuevos dueños familia Ramos (1, `{{PENDIENTE_AUTORIZACION_FOTO_DUEÑOS}}`).

---

### 5.6 Babilonia Libros — Tier 2

**Rutas:** `/`, `/sobre-marcelo`, `/novedades`, `/usados`, `/comics-manga`, `/blog`, `/visitanos`, `/contacto`, `/404`, `/legal`.

**Componentes específicos:** Hero con foto de la fachada frente a la Feria (split), `BookCarousel` (novedades destacadas, no inventario completo: 12-20 títulos curados), `CategoryGrid` (Novedades / Usados / Cómics / Manga), `BlogList` (reseñas de Marcelo Marchese, columnas: 6-12 posts iniciales), `MapEmbed` Tristán Narvaja 1591 con nota "junto a la Feria de los domingos", formulario "¿buscás un libro?" (título, autor, edición, contacto).

**Copy real para home (tono librero, culto pero accesible):**
- "Babilonia Libros. Frente a la Feria de Tristán Narvaja desde 1997."
- "Libros nuevos, usados, cómics y manga. Lo que entra y lo que vuelve."
- "Marcelo Marchese — librero, profesor de historia, escritor — atiende personalmente."
- "Vení los domingos cuando la Feria desborda, o entre semana para conversar."
- "¿Buscás un libro? Si no lo tenemos, lo conseguimos."
- "Reseñas, recomendaciones y novedades editoriales en nuestro blog."
- "Pedidos por WhatsApp al 2400 8000."

**Imágenes necesarias:** fachada con la Feria al fondo (1), interior con estanterías (3), retrato Marcelo Marchese (1), pilas de libros curadas (4), sección comics-manga (2), feria de los domingos vista desde la puerta (1, `{{PENDIENTE_FOTO_DOMINGO}}`).

---

### 5.7 Plaza Fuerte Hotel — Tier 3

**Rutas (3 idiomas):** `/`, `/habitaciones`, `/habitaciones/[slug]`, `/eventos`, `/historia-edificio`, `/galeria`, `/contacto`, `/reservar`, `/reservar/confirmacion`, `/admin/login`, `/admin/dashboard`, `/admin/habitaciones`, `/admin/disponibilidad`, `/admin/reservas`, `/admin/eventos`, `/404`, `/legal/privacidad`, `/legal/terminos`. Multiplicado por `/`, `/en/`, `/pt/`.

**Componentes específicos:** `RoomCard` con galería + precio desde + capacidad + vista, `BookingForm` (check-in, check-out, huéspedes → SSR consulta disponibilidad en Supabase y muestra habitaciones válidas), `RoomGalleryFilter` (single/doble/suite/vista puerto), `EventInquiryForm` (sala, fecha, cantidad de personas, tipo evento), `HistoryHero` (edificio 1913), `LangSwitcher`, admin tables CRUD con `@tanstack/table` o tabla server-rendered simple.

**Módulos funcionales con flujos:**

1. **Reserva de habitación.**
   - Usuario carga `/` o `/habitaciones`, completa BookingForm (date range + huéspedes).
   - Form POST a `/api/availability` (server endpoint) → query a Supabase `room_availability` con rango y huéspedes → devuelve habitaciones disponibles con tarifa total.
   - Usuario elige habitación → ruta `/reservar?room=xxx&from=yyy&to=zzz`.
   - Completa datos huésped (nombre, email, tel, país) → POST `/api/bookings` → inserta en `bookings` con status `pending`, dispara mail al hotel + mail confirmación al usuario via Resend.
   - Página `/reservar/confirmacion` con resumen. (Sin pasarela de pago en esta fase; el hotel confirma manualmente y cobra a la llegada o por link separado.)
   - **Tablas:** `rooms`, `room_availability`, `bookings`.

2. **Solicitud evento corporativo / casamiento.**
   - `/eventos` muestra las 3 salas con capacidades y fotos.
   - Form `/eventos#cotizar` con sala, fecha tentativa, cantidad de personas, presupuesto, tipo de evento (corporativo / casamiento / otro).
   - POST `/api/events` → inserta en `contact_inquiries` con tag `event_request`, envía mail.
   - **Tablas:** `events` (catálogo de salas), `contact_inquiries`.

3. **Panel admin.**
   - Login Supabase Auth email + password.
   - CRUD de `rooms`, edición de `room_availability` (toggle de bloqueos y tarifas estacionales), vista de `bookings` con cambio de status (`pending → confirmed / cancelled`), edición de `events`, lista de `contact_inquiries`.
   - **Tablas:** `admin_users` (vinculada a `auth.users`).

**Copy real para home (tono boutique, patrimonial, internacional):**
- "Plaza Fuerte Hotel. Edificio histórico de 1913 en el corazón de Ciudad Vieja."
- "A media cuadra de la Peatonal Sarandí, una cuadra del Teatro Solís."
- "15 habitaciones únicas, bar con vista al puerto, terraza y tres salones de eventos."
- "Reservá directo con nosotros y ahorrá la comisión de las plataformas."
- "Atendemos en español, inglés y portugués."
- "Business center, salones de hasta 80 personas y servicio personalizado."
- "Llegada flexible: arribo desde las 14h, salida hasta las 12h."

**Imágenes necesarias:** fachada del edificio 1913 (2, día y noche), lobby (2), cada una de las 15 habitaciones (3 fotos c/u = 45), bar/terraza con vista al puerto (4), 3 salones de eventos (2 c/u = 6), desayunador (2), detalles patrimoniales (cornisas, mosaicos — 4). `{{PENDIENTE_SET_FOTOS_PROFESIONALES_HOTEL}}`.

---

### 5.8 Anticuario Karausz — Tier 3

**Rutas (3 idiomas):** `/`, `/historia`, `/catalogo`, `/catalogo/[slug-pieza]`, `/categorias/[categoria]`, `/estilos/[estilo]`, `/contacto`, `/solicitar/[slug-pieza]`, `/wishlist`, `/admin/login`, `/admin/dashboard`, `/admin/piezas`, `/admin/piezas/nueva`, `/admin/piezas/[id]/editar`, `/admin/categorias`, `/admin/inquiries`, `/404`, `/legal/*`. Multiplicado por `/`, `/en/`, `/pt/`.

**Componentes específicos:** `PieceCard` con galería + estado (disponible/reservado/vendido), `CatalogFilters` (Drawer con categoría, estilo, época, rango precio, estado), `PieceGallery` (5-8 fotos con Lightbox), `PieceDetails` (procedencia, dimensiones, estado de conservación, precio o "consultar"), `RelatedPieces`, `RequestForm` adjunto en `/solicitar/[slug-pieza]`, panel admin con uploader Supabase Storage para múltiples imágenes.

**Módulos funcionales con flujos:**

1. **Catálogo navegable con filtros.**
   - `/catalogo` SSR con query Supabase paginada (12 por página), filtros vía query params.
   - URL ejemplo: `/catalogo?categoria=mobiliario&estilo=art-deco&estado=disponible&page=2`.
   - Cada `/catalogo/[slug]` es ISR (revalidate cuando admin edita).
   - **Tablas:** `items`, `categories`, `item_images`.

2. **Solicitud por pieza.**
   - Botón "Solicitar esta pieza" en `/catalogo/[slug]` → `/solicitar/[slug]` con form prellenado (pieza + ID).
   - Campos: nombre, email, país, mensaje, modalidad de envío preferida.
   - POST `/api/inquiries` → inserta en `inquiries` con FK a `items.id` → mail a Karausz + auto-reply a cliente.
   - **Tablas:** `inquiries`.

3. **Wishlist anónima (opcional fase 2 si hay tiempo).**
   - Botón "Avisame si entra una pieza similar" → guarda preferencias en `wishlist_alerts` con cookie de sesión.
   - Admin puede broadcastear mail cuando entra una pieza que matchea.

4. **Panel admin.**
   - Login Supabase Auth, CRUD de `items` con upload de imágenes a Storage (bucket `pieces`), toggle de `item_status` (disponible / reservado / vendido), CRUD `categories`, vista de `inquiries` con marcado de respondidas.

**Copy real para home (tono curatorial, lujo accesible, internacional):**
- "Anticuario Karausz. Desde 1942 en Bartolomé Mitre 1417, Ciudad Vieja."
- "Mobiliario clásico europeo, plata, cristalería, obras y piezas únicas."
- "Catálogo en constante rotación. Lo que ves hoy puede no estar mañana."
- "Atendemos a coleccionistas, decoradores y compradores internacionales."
- "Solicitá una pieza desde donde estés. Coordinamos envío a Argentina y EE.UU."
- "Relanzados en 2024 por nuevos dueños. Mismo espíritu, nueva mirada."
- "Visitas con cita o paseando por Ciudad Vieja: estamos abiertos."

**Imágenes necesarias:** fachada del local (2), interior con piezas montadas (4), 50-100 piezas de catálogo inicial (con 3-5 fotos c/u — total 200-500 fotos a subir vía admin), retrato Federico Büker + Valeria Britos (1), detalles patrimoniales del local (2). `{{PENDIENTE_SHOOTING_PROFESIONAL_CATALOGO}}`.

---

### 5.9 Posada al Sur — Tier 3

**Rutas (3 idiomas):** `/`, `/habitaciones`, `/habitaciones/[slug]`, `/reservar`, `/reservar/confirmacion`, `/centro-cultural`, `/talleres`, `/talleres/[slug]`, `/talleres/[slug]/inscribirse`, `/city-tours`, `/city-tours/[slug]`, `/city-tours/[slug]/inscribirse`, `/cooperativa`, `/contacto`, `/admin/login`, `/admin/dashboard`, `/admin/habitaciones`, `/admin/disponibilidad`, `/admin/bookings`, `/admin/talleres`, `/admin/tours`, `/admin/inscripciones`, `/404`, `/legal/*`. Multiplicado por `/`, `/en/`, `/pt/`.

**Componentes específicos:** `BedTypeCard` (cama en dorm / habitación privada / familiar), `BookingFormHostel` (incluye selección de tipo de cama), `WorkshopCard` (foto, fecha, cupos restantes, precio), `TourCard` (duración, recorrido, idioma), `InscriptionForm` (datos + cantidad participantes), `CoopStory` (narrativa de turismo solidario con foto del equipo).

**Módulos funcionales con flujos:**

1. **Reserva de cama / habitación.**
   - Flujo análogo a Plaza Fuerte pero con `beds` (no `rooms`) y soporte para reservar 1 cama en un dorm de 6.
   - Form check-in/out + viajeros + tipo (cama dorm / privada / familiar).
   - `/api/availability-beds` → query a `beds` + `bookings` para calcular disponibilidad real (cama dorm: cuenta cuántas camas del dorm están ocupadas en esas fechas).
   - **Tablas:** `beds`, `bookings`.

2. **Inscripción a taller.**
   - `/talleres` lista paginada con próximos talleres (filtro de fechas).
   - `/talleres/[slug]` muestra detalle + cupos restantes (calculado: capacidad - inscripciones).
   - Botón "Inscribirme" → `/talleres/[slug]/inscribirse` con form (nombre, email, tel, cantidad participantes).
   - POST `/api/workshop-inscriptions` → valida cupo en transacción (`select for update` o equivalente con RLS), inserta, dispara mail.
   - **Tablas:** `workshops`, `workshop_inscriptions`.

3. **Inscripción a city tour.**
   - `/city-tours` con catálogo (Ciudad Vieja a pie, Mercado del Puerto, tour solidario por economía social, etc.).
   - `/city-tours/[slug]/inscribirse` similar a taller.
   - **Tablas:** `city_tours`, `tour_inscriptions`.

4. **Panel admin.**
   - CRUD de `beds`, `workshops`, `city_tours`, gestión de `bookings` y de inscripciones.

**Copy real para home (tono cálido, solidario, sin pose hippie):**
- "Posada al Sur. Hospedaje cooperativo en Ciudad Vieja, a metros del Mercado del Puerto."
- "Camas en dormitorios, habitaciones privadas y familiares. Desayuno incluido."
- "Centro cultural con talleres semanales: cerámica, escritura, batucada, idiomas."
- "City tours por Ciudad Vieja y por la economía social montevideana."
- "Gestionada por la cooperativa Retos al Sur. Turismo con propósito."
- "Reservá directo con nosotros y apoyás a un emprendimiento de economía solidaria."
- "Atendemos en español, inglés y portugués. Te esperamos en Pérez Castellano 1424."

**Imágenes necesarias:** fachada en Pérez Castellano (1), patio interno (2), dorms (3), habitación privada (2), familiar (1), cocina compartida (1), sala de talleres (2), tour por la Ciudad Vieja en acción (3), equipo de la cooperativa (1, `{{PENDIENTE_AUTORIZACION_FOTOS_EQUIPO}}`), Mercado del Puerto a una cuadra (1).

---

## 6. Funcionalidades transversales (los 9)

- **WhatsApp FAB.** Componente `WhatsAppFloat.astro` con `wa.me/<PUBLIC_WHATSAPP_NUMBER>?text=<encodeURIComponent(PUBLIC_WHATSAPP_DEFAULT_MSG)>`. Visible en mobile bottom-right, desktop bottom-right discreto. `aria-label="Contactar por WhatsApp"`. Se oculta si el usuario hace scroll-up rápido (gesto = quiere ver menú, no nos taparlo).
- **Maps embebido.** `MapEmbed.astro` con `<iframe>` lazy-loaded (atributo `loading="lazy"`), dimensiones explícitas para no causar CLS, fallback `noscript` con link a Google Maps. Dirección + horarios en texto plano arriba del mapa (no sólo en el iframe — SEO + accesibilidad).
- **Formulario contacto.** Estructura común en `packages/lib/forms.ts`. Server endpoint `POST /api/contact`. Pasos: parse `multipart/form-data` o `application/json`, validación Zod, honeypot field `website` (si viene relleno = bot, devolvemos 200 vacío), rate-limit en memoria (Upstash Redis para Tier 3, in-memory KV para Tier 1/2 en Cloudflare Functions) — 5 envíos por IP por hora, llamada a Resend con template HTML + texto, respuesta JSON `{ ok, message }` que el cliente renderiza en `aria-live="polite"` o "assertive" si error.
- **Analytics configurable.** `packages/lib/analytics.ts` con factory que decide según `PUBLIC_ANALYTICS_PROVIDER`. Default `none` en dev. En prod, GA4 por default; Plausible como opción premium si cliente paga. Carga diferida con `astro:page-load` y sólo si hay consentimiento (ver cookie banner).
- **Schema.org JSON-LD.** `packages/lib/schema.ts` exporta builders tipados: `localBusiness()`, `restaurant()`, `barOrPub()`, `hotel()`, `hostel()`, `artGallery()`, `store()`, `bookStore()`, `healthAndBeautyBusiness()`, `event()`, `breadcrumbList()`. Cada sitio importa el suyo y lo monta vía `<JsonLd>` en el `<head>`. Validamos en CI con `npx schema-org-validator` o llamada al validator de Google manual pre-deploy.
- **Open Graph + Twitter Cards.** `SeoHead.astro` recibe `title`, `description`, `image`, `lang`, `canonical`. Si no se pasa imagen explícita, generamos OG dinámica con **Satori** (`@vercel/og` adaptado a Astro) usando una plantilla por sitio (logo + título + paleta del sitio). Endpoint `/og-image.png?title=...&page=...` cachea en CDN.
- **`sitemap.xml`.** Integración `@astrojs/sitemap` con configuración por sitio (`changefreq`, `priority` por ruta, `i18n` para Tier 3). `robots.txt` static con `Sitemap:` apuntando.
- **`manifest.json` + favicons.** Set generado con `pwa-asset-generator` desde un SVG master por sitio: `favicon.ico`, `favicon-16/32.png`, `apple-touch-icon-180.png`, `android-chrome-192/512.png`, `manifest.webmanifest` con name/short_name/colors/icons.
- **Banner de cookies.** Sólo se monta si `PUBLIC_ANALYTICS_PROVIDER !== 'none'`. Persistencia en `localStorage` con clave `cookies-consent-v1` (versionada para invalidar si cambia política). Botones "Aceptar" / "Sólo necesarias". TCF-lite (no full IAB, no lo necesitamos para Uruguay).
- **404 personalizada.** Cada sitio con su 404 estilizada con la paleta + CTA a home + búsqueda (Tier 2/3) o WhatsApp (Tier 1).
- **Legal.** Plantilla `packages/content/legal/{privacidad,terminos,cookies}.md.tpl` con placeholders `{{NEGOCIO_NOMBRE}}`, `{{NEGOCIO_RUT}}`, `{{NEGOCIO_DIRECCION}}`, `{{NEGOCIO_EMAIL}}`. Cada sitio resuelve los placeholders en build. Texto base redactado en español rioplatense con menciones a Ley 18.331 (protección de datos en Uruguay).

---

## 7. Multilenguaje (sólo Tier 3)

**Estrategia.** I18n nativo de Astro 5 (`astro.config.mjs` con `i18n: { locales: ['es','en','pt'], defaultLocale: 'es', routing: { prefixDefaultLocale: false } }`). Rutas: `/` (es), `/en/`, `/pt/`. Detección automática vía `Accept-Language` opt-in (no redirige por default, sólo sugiere con banner discreto si el idioma del browser no matchea).

**Content collections con `lang`.** En `src/content/<collection>/<slug>.<lang>.md` (ej. `rooms/suite-puerto.es.md`, `rooms/suite-puerto.en.md`). Schema Zod compartido en `packages/content/schemas.ts` con campo `lang: z.enum(['es','en','pt'])`. Loader helper en `packages/lib/i18n.ts`: `getEntryByLang(collection, slug, lang)` con fallback a `es` si la traducción no existe.

**`hreflang` + canonical.** `SeoHead.astro` recibe `alternates: { es: '/ruta', en: '/en/ruta', pt: '/pt/ruta' }` y emite `<link rel="alternate" hreflang="...">` para los 3 + `x-default` apuntando a `es`. Canonical único por idioma (cada versión es su propio canonical, no se canonicalizan entre sí).

**Páginas obligatorias en los 3 idiomas:**
- Plaza Fuerte: Home, Habitaciones (lista + detalle de las 15), Reservar (flow completo), Eventos, Contacto, Legal. Historia del edificio puede arrancar sólo en ES.
- Karausz: Home, Catálogo + detalle de pieza + solicitar, Contacto, Legal. Historia puede arrancar sólo en ES.
- Posada al Sur: Home, Habitaciones, Reservar, Talleres (lista + detalle + inscribirse), City tours (idem), Cooperativa, Contacto, Legal.

**Páginas sólo en ES (con badge "available in Spanish only"):**
- Blog si lo hubiera (no aplica en esta fase).
- Páginas históricas o documentos largos del cooperativismo (Posada).

---

## 8. Schema de Supabase (los 3 Tier 3)

Convención general: nombres en snake_case, plural; `id uuid primary key default gen_random_uuid()`; `created_at timestamptz default now()`; `updated_at timestamptz default now()` con trigger; idiomas en columnas `_es`/`_en`/`_pt` para campos cortos o tabla satélite `_translations` si son muchos. RLS habilitada en todas las tablas. Public read sólo donde corresponde, write sólo para roles autenticados con membresía en `admin_users`.

### 8.1 Plaza Fuerte Hotel

```sql
-- rooms
id uuid pk
slug text unique not null
name_es text not null, name_en text, name_pt text
description_es text, description_en text, description_pt text
type text not null check (type in ('single','double','suite','family'))
capacity int not null
has_port_view boolean default false
base_price_uyu numeric(10,2) not null
images jsonb not null default '[]'        -- array de paths en storage
amenities text[] default '{}'
is_active boolean default true
created_at, updated_at

-- room_availability
id uuid pk
room_id uuid references rooms(id) on delete cascade
date date not null
price_uyu numeric(10,2)                  -- override de tarifa para el día
is_blocked boolean default false
unique (room_id, date)
index on (room_id, date)

-- bookings
id uuid pk
room_id uuid references rooms(id) on delete restrict
check_in date not null
check_out date not null check (check_out > check_in)
guests int not null
guest_name text not null
guest_email text not null
guest_phone text
guest_country text
total_uyu numeric(10,2) not null
status text not null default 'pending' check (status in ('pending','confirmed','cancelled'))
notes text
created_at, updated_at
index on (check_in, check_out)
index on (status)

-- events (catálogo de salas + tipo de evento)
id uuid pk
slug text unique
name_es text, name_en text, name_pt text
capacity int
description_es text, description_en text, description_pt text
images jsonb default '[]'

-- contact_inquiries
id uuid pk
type text check (type in ('contact','event_request','press'))
name text, email text, phone text
message text
event_id uuid references events(id) null
event_date date null
guest_count int null
status text default 'new' check (status in ('new','answered','archived'))
created_at

-- admin_users
user_id uuid pk references auth.users(id) on delete cascade
role text default 'admin' check (role in ('admin','manager'))
display_name text
created_at
```

**RLS policies:**
- `rooms`, `events`: `select` público (`using (is_active is true or is_active is null)`). `insert/update/delete` sólo si `auth.uid() in (select user_id from admin_users)`.
- `room_availability`: `select` público (necesario para calcular disponibilidad). `write` sólo admin.
- `bookings`: NO `select` público. `insert` público pero validado por un edge function/server endpoint que verifica disponibilidad y limpia campos. `select/update` sólo admin.
- `contact_inquiries`: `insert` público con rate-limit en server. `select` sólo admin.
- `admin_users`: `select` sólo admin (`auth.uid() in (select user_id from admin_users)`).

### 8.2 Anticuario Karausz

```sql
-- categories
id uuid pk
slug text unique not null
name_es text not null, name_en text, name_pt text
parent_id uuid references categories(id) null     -- jerarquía opcional
sort_order int default 0
is_active boolean default true

-- styles (Luis XV, Art Decó, etc.)
id uuid pk
slug text unique
name_es text not null, name_en text, name_pt text

-- items (piezas)
id uuid pk
slug text unique not null
title_es text not null, title_en text, title_pt text
description_es text, description_en text, description_pt text
category_id uuid references categories(id)
style_id uuid references styles(id) null
era text                                          -- "Siglo XIX", "1920s"
dimensions text                                   -- "120 x 80 x 45 cm"
provenance text
condition text
price_uyu numeric(12,2) null                      -- null = "consultar"
price_visible boolean default false
status text not null default 'available' check (status in ('available','reserved','sold','hidden'))
sort_order int default 0
created_at, updated_at
index on (status, category_id)
index on (style_id)

-- item_images
id uuid pk
item_id uuid references items(id) on delete cascade
storage_path text not null                        -- en bucket 'pieces'
alt_es text, alt_en text, alt_pt text
sort_order int default 0
unique (item_id, sort_order)

-- inquiries
id uuid pk
item_id uuid references items(id) on delete set null
name text not null, email text not null, phone text
country text
shipping_preference text
message text
status text default 'new' check (status in ('new','answered','archived'))
created_at
index on (item_id)
index on (status)

-- admin_users (idéntica a Plaza Fuerte)
```

**RLS policies:**
- `categories`, `styles`, `items` (con `status in ('available','reserved','sold')`), `item_images`: `select` público.
- `items` con `status = 'hidden'`: sólo admin.
- `inquiries`: `insert` público (rate-limited), `select` sólo admin.
- Write en todo lo demás: sólo admin.

### 8.3 Posada al Sur

```sql
-- beds (representa una cama o una habitación)
id uuid pk
slug text unique
type text not null check (type in ('dorm','private','family'))
dorm_capacity int                                 -- null para private/family
name_es text, name_en text, name_pt text
description_es text, description_en text, description_pt text
base_price_uyu numeric(10,2) not null
images jsonb default '[]'
amenities text[] default '{}'
is_active boolean default true

-- bookings
id uuid pk
bed_id uuid references beds(id)
check_in date not null, check_out date not null check (check_out > check_in)
beds_count int not null default 1                 -- cuántas camas reserva (para dorms)
guest_name text not null, guest_email text not null, guest_phone text, guest_country text
total_uyu numeric(10,2) not null
status text default 'pending' check (status in ('pending','confirmed','cancelled'))
created_at, updated_at
index on (bed_id, check_in, check_out)

-- workshops
id uuid pk
slug text unique
title_es text not null, title_en text, title_pt text
description_es text, description_en text, description_pt text
date_time timestamptz not null
duration_minutes int
capacity int not null
price_uyu numeric(10,2) not null
instructor text
images jsonb default '[]'
is_active boolean default true
index on (date_time, is_active)

-- workshop_inscriptions
id uuid pk
workshop_id uuid references workshops(id) on delete cascade
name text not null, email text not null, phone text
participants_count int not null default 1
notes text
status text default 'pending' check (status in ('pending','confirmed','cancelled'))
created_at
index on (workshop_id, status)

-- city_tours
id uuid pk
slug text unique
title_es text not null, title_en text, title_pt text
description_es text, description_en text, description_pt text
schedule_pattern text                             -- "Sábados 10:00" descriptivo
duration_minutes int
capacity int
price_uyu numeric(10,2) not null
languages text[] default '{es}'
images jsonb default '[]'
is_active boolean default true

-- tour_inscriptions
id uuid pk
tour_id uuid references city_tours(id) on delete cascade
date date not null                                -- fecha específica que el usuario pide
name text, email text, phone text
participants_count int not null default 1
language_pref text
notes text
status text default 'pending'
created_at

-- admin_users (idéntica)
```

**RLS policies:** mismo patrón. Read público de catálogos activos, write admin-only, insert público en `bookings`, `workshop_inscriptions`, `tour_inscriptions` mediado por server endpoints que validan cupo.

---

## 9. SEO, performance, accesibilidad

**Lighthouse targets en los 9 (mobile y desktop):** Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Medido en CI con Lighthouse CI (`@lhci/cli`) bloqueando merge si baja del threshold.

**Checklist WCAG 2.1 AA accionable:**
- Contraste mínimo 4.5:1 texto, 3:1 elementos UI grandes. Validado con axe en CI.
- Foco visible siempre (no `outline: none` sin reemplazo). Anillo de foco `ring-2 ring-offset-2` con color de paleta.
- Navegación 100% por teclado (Tab, Shift+Tab, Enter, ESC, flechas en Tabs/Accordion).
- Todas las `<img>` con `alt` significativo (o `alt=""` para decorativas).
- Labels asociadas a inputs (`<label for="...">` o `aria-labelledby`).
- Headings jerárquicos (un `<h1>` por página, sin saltar niveles).
- `aria-live="polite"` para feedback de forms; `"assertive"` para errores críticos.
- Skip-link "Saltar al contenido principal" al inicio del `<body>`.
- Modales con focus trap, ESC cierra, foco vuelve al trigger.
- Soporte `prefers-reduced-motion` en todas las animaciones.

**Imágenes.** Pipeline `astro:assets` con `<Image>` y `<Picture>`. Formatos AVIF primero, WebP fallback, JPEG legacy. Dimensiones `width`/`height` explícitas (evita CLS). `loading="lazy"` excepto LCP. Sets responsivos `widths={[360, 640, 1024, 1536]}`. Storage de imágenes de admin (Tier 3) en Supabase Storage con transformaciones server-side (resize on-demand).

**Fonts.** Self-host vía `@fontsource-variable/<font>`, subset a latin + latin-ext. `font-display: swap`. Preload del peso crítico del display + body en el `<head>`.

**JS hidratado mínimo.** Astro por defecto manda 0 JS. Islands sólo donde hay interactividad real: MobileMenu, Lightbox, CookieBanner, BookingForm, CatalogFilters, Modal. Resto sin hidratación. Tier 1 termina con < 10 KB de JS en total. Tier 3 con < 80 KB en páginas con form complejo.

**Critical CSS.** Astro inline-a el CSS crítico de la página por default. Tailwind 4 purga lo no usado en build. CSS final por página < 15 KB gzipped.

---

## 10. Calidad y testing

- **ESLint + Prettier.** Config compartido en `packages/config/eslint.config.js` con presets `astro/recommended`, `@typescript-eslint/recommended-type-checked`, `jsx-a11y`. Prettier con `astro-plugin`. Pre-commit hook con lint-staged.
- **Type-check.** `astro check` por sitio + `tsc --noEmit -p packages/<pkg>` para libs. CI corre los dos en paralelo.
- **Playwright (Tier 3).** 3 specs mínimas por sitio:
  - Plaza Fuerte: `booking-flow.spec.ts` (buscar disponibilidad → seleccionar habitación → completar form → ver confirmación), `event-inquiry.spec.ts`, `admin-login.spec.ts`.
  - Karausz: `catalog-filter.spec.ts`, `request-piece.spec.ts`, `admin-add-piece.spec.ts`.
  - Posada: `hostel-booking.spec.ts`, `workshop-inscription.spec.ts`, `tour-inscription.spec.ts`.
  - Corren contra una DB Supabase de test (branch dedicado, recreado por CI con migraciones + seed).
- **Vitest.** Para utils puros en `packages/lib` (schema builders, i18n helpers, validaciones Zod, rate-limiter).
- **Lighthouse CI.** `lhci autorun` por sitio en CI con `assertions` en `lighthouserc.cjs`. Thresholds del punto 9.
- **axe-core.** `@axe-core/playwright` corre smoke test en home de cada sitio + en flujos críticos de Tier 3. 0 violaciones serias permitidas.

---

## 11. CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`):

```yaml
on: [push, pull_request]
jobs:
  install:
    - pnpm install --frozen-lockfile
    - cache pnpm store
  lint:
    needs: install
    - pnpm lint
  typecheck:
    needs: install
    - pnpm typecheck            # corre astro check + tsc en paralelo por sitio
  unit:
    needs: install
    - pnpm test:unit            # vitest
  build:
    needs: [lint, typecheck]
    strategy:
      matrix:
        site: [tier1-caro-morales, tier1-bosque-tattoo, tier1-diana-saravia,
               tier2-bar-tasende, tier2-bar-hispano, tier2-babilonia-libros,
               tier3-plaza-fuerte, tier3-karausz, tier3-posada-al-sur]
    - pnpm --filter ./sites/${{ matrix.site }} build
  lighthouse:
    needs: build
    strategy: { matrix: { site: [...] } }
    - lhci autorun --config sites/${{ matrix.site }}/lighthouserc.cjs
  axe:
    needs: build
    - pnpm test:a11y
  e2e-tier3:
    needs: build
    strategy: { matrix: { site: [tier3-*] } }
    services:
      supabase: image: supabase/cli (o usar branch DB remoto)
    - pnpm --filter ./sites/${{ matrix.site }} test:e2e
```

**Preview deploys.** Cada PR dispara deploy a Cloudflare Pages (T1/T2) y Vercel (T3) con URL temporal. Comentario automático en el PR con las 9 URLs.

**Migrations Supabase.** Versionadas en `/supabase/<sitio>/migrations/<timestamp>_<name>.sql`. Workflow `migrations.yml` corre `supabase db push --linked` contra el branch DB del PR (Supabase Branching). Merge a `main` aplica a producción con aprobación manual.

---

## 12. Cronograma + asignación a sub-agentes

| Sprint | Duración | Objetivo | Paralelizable? |
|--------|----------|----------|----------------|
| **0 — Foundation** | 1-2 días | Scaffolding monorepo, pnpm workspaces, packages/config (tailwind preset + tsconfig + eslint), packages/ui con 5-6 componentes base (Button, Container, Section, Hero, FormField, JsonLd), packages/lib (schema.ts, analytics.ts, forms.ts, i18n.ts skeleton), packages/content (schemas Zod), 1 sitio piloto (Caro Morales) end-to-end como prueba del pipeline + 1 deploy a Cloudflare Pages staging. | Secuencial (es la base de todo). 1 agente. |
| **1 — Tier 1** | 2-3 días | Los 3 Tier 1 en paralelo aprovechando el piloto. | Paralelo. 3 agentes (Bosque, Diana, refinamiento Caro). |
| **2 — Tier 2** | 3-4 días | Los 3 Tier 2 con content collections, blog (Babilonia), historia + carta + galería. | Paralelo. 3 agentes (Tasende, Hispano, Babilonia). |
| **3a — Supabase schemas** | 1 día | Migraciones SQL + RLS + seed de los 3 Tier 3. Probadas localmente con `supabase start`. **Esto va ANTES de codear front Tier 3.** | Paralelo. 1 agente DB (los 3 esquemas) o 3 en paralelo si DB es separable. |
| **3b — Tier 3 frontend + admin** | 4-6 días | Los 3 Tier 3 en paralelo con sus módulos (booking, catálogo, talleres) + i18n + panel admin. | Paralelo. 3 agentes (Plaza Fuerte, Karausz, Posada). |
| **4 — QA cross-sitios** | 1-2 días | Lighthouse CI sobre los 9, axe sobre los 9, fixes de regresiones, smoke test manual de los flujos, deploys a staging definitivos. | Secuencial mayormente. 1 agente QA + 9 fixes puntuales. |
| **5 — Entrega** | 1 día | Dossier por sitio (README con stack + cómo editar contenido + cómo deployar + credenciales admin), PR final a `main`, video walkthrough para cliente. | Secuencial. 1 agente. |

**Total: 13-19 días.** Crítico: Sprint 0 bien hecho ahorra días en Sprints 1-3. Sprint 3a (schemas) bloquea a 3b — no se puede paralelizar al revés.

Tareas paralelizables explícitamente marcadas:
- Sprint 1: 3 sitios en simultáneo, sin dependencias entre ellos.
- Sprint 2: igual.
- Sprint 3a: las 3 DBs son proyectos Supabase independientes, sin FK cross-sitio.
- Sprint 3b: 3 sitios independientes, comparten sólo `packages/*`.

Tareas secuenciales explícitas:
- Sprint 0 antes que todo.
- Sprint 3a antes de 3b en cada Tier 3.
- Sprint 4 después de los 3 Sprints de construcción.

---

## 13. Convenciones de código

- **Branch naming.** `feat/<sitio-slug>/<feature>`, `fix/<sitio-slug>/<bug>`, `chore/monorepo/<task>`, `docs/<sitio-slug>/<doc>`. Ej: `feat/tier3-plaza-fuerte/booking-flow`, `chore/monorepo/eslint-config`.
- **Commits convencionales.** `feat(plaza-fuerte): add room availability query`, `fix(bar-tasende): correct map iframe lazy loading`, `chore(monorepo): bump astro to 5.1`, `docs(karausz): add admin user setup guide`, `refactor(ui): extract WhatsAppFloat island`. Scope siempre es el slug corto del sitio o `monorepo`/`ui`/`lib`/`content`/`supabase`.
- **PR template** (`.github/PULL_REQUEST_TEMPLATE.md`):
  ```
  ## Qué cambia
  ## Por qué
  ## Screenshots
  - [ ] Mobile 360px
  - [ ] Tablet 768px
  - [ ] Desktop 1280px
  ## Lighthouse
  - Performance: __
  - Accessibility: __
  - SEO: __
  - Best Practices: __
  ## Checklist
  - [ ] `pnpm lint` pasa
  - [ ] `pnpm typecheck` pasa
  - [ ] axe sin violaciones serias
  - [ ] (Tier 3) Playwright pasa
  - [ ] Sin secretos commiteados
  - [ ] Migraciones Supabase incluidas si aplica
  ```
- **Estructura por sitio.** `src/pages/`, `src/components/` (específicos del sitio, los compartidos van en `packages/ui`), `src/content/`, `src/layouts/`, `src/styles/global.css`, `public/`, `astro.config.mjs`, `tailwind.config.ts`, `tsconfig.json`, `.env.example`, `README.md`.

---

## 14. Riesgos y mitigaciones

1. **Cliente no aprueba copy o lo cambia tarde.** *Mitigación:* enviar el copy de cada sitio en un Google Doc compartido al inicio del sprint del sitio; bloquear cambios > 48hs antes de deploy a staging.
2. **Fotos profesionales no disponibles.** *Mitigación:* tener pack de stock + prompts de generación por sitio listos como Plan B; presupuestar 1 día de shooting con un fotógrafo local que la agencia coordine (especialmente crítico para Plaza Fuerte y Karausz).
3. **Integración con PMS hotelero (Plaza Fuerte) más cara/compleja de lo previsto.** *Mitigación:* en esta fase NO integramos PMS — usamos Supabase como source of truth y el hotel maneja disponibilidad por el panel admin. Documentamos como roadmap fase 2 una posible integración con Cloudbeds o Beds24 cuando el cliente lo pague.
4. **Resend free tier (100 mails/día) insuficiente para Tier 3.** *Mitigación:* monitorear desde semana 1; si pasamos de 70/día consistentemente, upgrade a plan Pro USD 20/mes. Alternativa: SES con plantillas, más barato pero más operación.
5. **Babilonia Libros tiene sitio activo en `babilonialibros.com` con tráfico SEO acumulado.** *Mitigación:* `{{VERIFICAR_ESTADO_SITIO_BABILONIA}}` antes de la propuesta. Si tiene autoridad SEO, planificar migración con 301 desde TODAS las URLs viejas y comparativo de keyword performance pre/post.
6. **Posada al Sur migración de subdominios HTTP a HTTPS rompe SEO.** *Mitigación:* mapeo 1-a-1 de URLs viejas → nuevas con redirects 301 en Cloudflare, sitemap.xml de URLs viejas enviado a Google Search Console como "moved permanently", monitoreo de rankings primer mes post-launch.
7. **Karausz tiene dominio y sitio en uso; rebuild sin downtime.** *Mitigación:* desarrollar en `staging.karausz.uy`, demo al cliente, cutover en una ventana acordada (martes 22h) con DNS TTL bajado a 5min las 24h previas.
8. **Diana Saravia: derechos de imagen sobre obras de artistas representados.** *Mitigación:* checklist por artista en sección 15; no publicamos obras sin autorización escrita; usamos fotos del espacio de la galería como fallback visual.
9. **Cliente Tier 3 no se compromete a cargar contenido al admin.** *Mitigación:* video tutorial por módulo (3-5 min), seed inicial con 30% del contenido pre-cargado por nosotros, 1 sesión de capacitación remota incluida en el entregable.

---

## 15. Datos pendientes del cliente (consolidado)

Lista accionable única para enviar al cliente del proyecto. Agrupada por sitio + transversales. Incluye los `{{PENDIENTE_*}}` / `{{VERIFICAR_*}}` explícitos de FICHAS.md más todo lo que detecté.

**Transversal (los 9):**
- Logo en SVG o vectorial editable (Illustrator / Figma export). Si no hay, autorización para diseñar uno simple.
- Confirmación del dominio elegido por sitio (de la columna "Dominio sugerido") y si ya está registrado / a registrar.
- Acceso al panel del registrador del dominio (Antel, NIC.uy, GoDaddy) para apuntar NS a Cloudflare/Vercel.
- Mail corporativo final (`info@negocio.uy`) — recomendado dejar de usar @gmail/@hotmail. Decidir si lo proveemos vía Google Workspace, Zoho Mail u otro.
- Horarios exactos de atención por día de la semana (incluir feriados).
- Cuenta de WhatsApp Business confirmada (número definitivo, no celular personal si es posible).
- Redes a linkear desde el footer: IG, FB, X/Twitter, TikTok, YouTube — URLs definitivas.
- Texto de tratamiento de datos personales conforme a Ley 18.331 (lo redactamos pero necesita aprobación del cliente o su escribano).
- Política de cookies aprobada.
- ¿Quieren GA4 o Plausible? (Plausible USD 9/mes pero sin banner de cookies obligatorio).

**1. Caro Morales (T1):**
- Lista de servicios + precios orientativos (cortes, color, peinados, barbería, alisados).
- Promociones recurrentes (martes/miércoles?).
- 8-12 fotos del trabajo (before/after permitido legalmente).
- Foto retrato de Caro.
- Confirmación de WhatsApp 098 911 302 como número oficial.

**2. BOSQUE Tattoo (T1):**
- `{{PENDIENTE_DIRECCION_EXACTA}}` — calle y número en Ciudad Vieja (privado por DM).
- Lista de tatuadores con foto + bio + estilo + IG personal.
- Portfolio: 20-30 fotos categorizadas por estilo.
- Precio mínimo orientativo de sesión (¿UYU 3.500? ¿USD 100?).
- Política de seña, retoque, cuidados post-tattoo (para FAQ).
- ¿Hacen piercing? Confirmar y listar tipos + precios.

**3. Diana Saravia (T1):**
- `{{PENDIENTE_LISTA_ARTISTAS_REPRESENTADOS}}` con nombre + bio corta + obra destacada.
- `{{PENDIENTE_DERECHOS_DE_IMAGEN_DE_OBRAS}}` — autorización escrita por artista.
- Calendario de próximas ferias (Miami 2026, Madrid 2026, etc.).
- Decisión sobre dominios: ¿unificamos a `dianasaravia.uy` y redirigimos los otros dos?
- Foto retrato de Diana + 4-6 fotos de la galería con obras montadas.
- ¿Mantenemos la segunda sede (Club de París, San José 876) en mismo sitio o separada?

**4. Bar Tasende (T2):**
- Menú completo con precios actualizados (entradas, pizzas, minutas, postres, bebidas).
- Historia detallada (fechas clave: 1931, hijos, nietos, hitos).
- `{{PENDIENTE_FOTOS_HISTORICAS}}` — fotos de archivo familia Tasende.
- ¿Aceptan reservas para grupos? Cantidad mínima.
- Servicios de eventos privados: capacidades, ¿catering propio o externo?
- Confirmación del email oficial (cambiar de @hotmail).
- ¿Hacen delivery propio o sólo Pedidos Ya / Rappi? Links.

**5. Bar Hispano (T2):**
- Foto cenital + nombre de cada uno de los 30 platitos de "la preparación" (es la atracción central — sin esto el sitio no rinde).
- Carta actual completa con precios (post-cambio de dueño 2024).
- Historia con permiso de uso de fotos antiguas.
- `{{PENDIENTE_AUTORIZACION_FOTO_DUEÑOS}}` (familia Ramos).
- ¿Reservas por WhatsApp o sólo teléfono?
- Eventos privados / corporativos / cumpleaños — políticas.

**6. Babilonia Libros (T2):**
- `{{VERIFICAR_ESTADO_SITIO_BABILONIA}}` — confirmar si `babilonialibros.com` está vivo, qué autoridad SEO tiene, qué URLs hay que redirigir.
- Selección curada de 30-50 novedades para arrancar (no inventario completo).
- 5-10 reseñas / columnas iniciales de Marcelo Marchese para el blog.
- Categorías exactas (¿separamos manga de cómic? ¿novela gráfica aparte?).
- Política de canje de usados y compra de bibliotecas.
- Newsletter: ¿quieren?, ¿con qué herramienta (Mailchimp / Buttondown / Resend con magic link)?

**7. Plaza Fuerte Hotel (T3):**
- Verificación previa: confirmar 100% que no existe dominio oficial actual.
- Inventario detallado de las 15 habitaciones: nombre, tipo, capacidad, m², vista, amenities, precio base UYU.
- `{{PENDIENTE_SET_FOTOS_PROFESIONALES_HOTEL}}` — set completo (3 fotos x 15 hab + comunes + salones).
- 3 salones de eventos: capacidades, planos, fotos, precios orientativos.
- Política de check-in / check-out, cancelación, niños, mascotas, accesibilidad.
- Idiomas confirmados: ¿ES/EN/PT o sumamos IT?
- Datos del responsable de cargar contenido al panel admin (email para crear cuenta).
- Datos legales del hotel (RUT, razón social) para schema.org y legales.

**8. Anticuario Karausz (T3):**
- Coordinación de cutover de `karausz.uy` (ya en uso) — ventana de mantenimiento.
- `{{PENDIENTE_SHOOTING_PROFESIONAL_CATALOGO}}` — set inicial de 50-100 piezas con 3-5 fotos cada una.
- Categorías + estilos definitivos (la lista del punto 5.8 es una propuesta, confirmar con Federico y Valeria).
- Política de envíos internacionales y reservas.
- Datos del responsable del panel admin.
- ¿Activamos wishlist de fase 2 en lanzamiento o queda para v1.1?
- Mantener prensa actual de `karausz.uy/prensa` o curar selección nueva.

**9. Posada al Sur (T3):**
- Confirmación de que la cooperativa Retos al Sur sigue operando habitaciones (no sólo centro cultural).
- Mapeo de URLs HTTP viejas (`es.posadaalsur.com.uy/*` y `en.posadaalsur.com.uy/*`) para redirects 301 — pedir export del sitemap actual.
- Inventario de camas/dorms: cantidad de camas por dorm, habitaciones privadas, familiar, precio base.
- Calendario de talleres próximos 3 meses con foto + descripción + cupos + precio.
- Catálogo de city tours: nombres, recorridos, duración, idiomas, precios.
- `{{PENDIENTE_AUTORIZACION_FOTOS_EQUIPO}}` de la cooperativa.
- Texto / discurso oficial sobre turismo solidario y la cooperativa Retos al Sur (1 página).
- Datos del o los responsables del panel admin (puede haber más de 1).
- Decidir si los talleres y tours aceptan pago online (fase 2) o sólo reservan cupo y pagan en persona (fase 1).

---

**Fin del PLAN.** Cualquier cosa no listada en este documento es out-of-scope. Cambios al alcance se documentan en `/docs/scope-changes.md` con firma del cliente.
