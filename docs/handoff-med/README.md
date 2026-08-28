# Handoff de diseño — Webapp Mediterranea Carghas

Rediseño visual completo de `mediterraneacarghas.vercel.app` (repo `MrSuricata/twfnew`).
Sitio público, portal de cliente y **todo el /admin**.

## Qué son estos archivos

Son **referencias de diseño en HTML** (prototipos con la apariencia buscada), NO código
de producción para copiar tal cual. La tarea es **recrear estos diseños dentro de la app
existente** (React + Vite + Tailwind + shadcn/ui), reemplazando el estilo actual sin tocar
la lógica, los datos ni los flujos.

Abrilos en el navegador para verlos. Todo el estilo es **inline**, así que cada bloque se lee
de corrido. Los datos son de ejemplo pero salen de la app real (A7994 / ELDA S.R.L., TCP,
MONTECON, salidas pisadas, etc.).

| Archivo | Cubre |
|---|---|
| `01-home.dc.html` | Home pública: hero + tracking, franja de stats, servicios 01-05, proceso, novedades, cobertura, nosotros, CTA, footer |
| `02-paginas-publicas.dc.html` | Seguimiento público, Casos reales, Login (cliente/partner/equipo), Portal del cliente, Dashboard resumido, Cotización, 404, Política de privacidad |
| `03-admin.dc.html` | /admin completo: Hoy, Agenda, Seguimientos, Analíticas, Operaciones, Checks, Camiones, Transportes, Cotizaciones, Facturación, Pagos, Contenido web, Clientes, Partners, Equipo |
| `04-carrusel-noticias.dc.html` | Carrusel de avisos operativos (swipe + flechas + dots + autoplay) para la home y el portal |

## Fidelidad

**Alta.** Colores, tipografía, jerarquía, espaciados y tono de copy son finales.
Los datos de ejemplo NO: se reemplazan por los reales de la app.

## Design tokens

```
--violeta-marca    #49286b   títulos, botones primarios, sidebar, números
--violeta-texto    #352e6a   cuerpo sobre fondo claro
--violeta-profundo #261c79   fin de degradados, sidebar admin
--celeste          #9bd1e5   acentos, líneas, highlights sobre violeta
--celeste-pastel   #ceffff   pills, badges de estado neutro
--naranja-aviso    #e8863b   avisos, alertas, riesgo, "requiere acción"
--gris-texto       #6b6688   texto secundario
--gris-suave       #9a96b8   labels y datos terciarios
--borde            #eef0f8   bordes de card y separadores de tabla
--borde-input      #e5e4f1   inputs y botones secundarios
--fondo-app        #f7f9fc   fondo de pantallas admin
--fondo-input      #fbfbfe   fondo de campos y cabeceras de tabla
--verde-ok         #2f8f5b   estados OK / pagado / cobrado
--rojo-error       #d94f4f   checks fallidos
```

Degradado de marca: `linear-gradient(160deg, #49286b 0%, #352e6a 55%, #261c79 100%)`.

## Tipografía

Google Fonts. La marca usa **Gotham** (no disponible como fuente web); estos son los
sustitutos aprobados y en uso en todas las piezas de Mediterranea:

- **Nunito 900** — títulos, números, refs (A7994), montos. `line-height: 0.98–1.1`,
  `letter-spacing: -0.02em` en títulos grandes.
- **Montserrat 300–700** — cuerpo, labels, botones. Kickers en 600 MAYÚSCULAS con
  `letter-spacing: 0.06–0.08em`.

## Componentes del sistema

- **Pill / badge de estado:** `border-radius: 999px`, padding 6/16, 11px weight 700 mayúsculas.
  Neutro = `#ceffff` sobre texto `#352e6a`; aviso = `#e8863b` sobre blanco; OK = `#e4f4ea` sobre `#2f8f5b`.
- **Botón primario:** fondo `#49286b`, texto blanco, `border-radius: 999px`, weight 600.
- **Botón secundario:** borde 2px `rgba(73,40,107,0.2)`, texto `#49286b`, mismo radio.
- **Card:** blanco, `border-radius: 20–22px`, borde 2px `#eef0f8` (o sombra
  `0 24px 60px rgba(38,28,121,0.10)` en superficies elevadas).
- **Tabla:** cabecera `#fbfbfe` con labels 11px mayúsculas `#9a96b8`; filas separadas por
  `2px #f4f5fa`; fila con alerta tintada `#fff9f4`. Ref siempre en Nunito 900 violeta.
- **Línea separadora de marca:** 310×8px violeta (sobre claro) o celeste (sobre violeta).
- **Arcos de esquina:** círculos desbordados en las esquinas — violeta sólido + anillo celeste
  sobre fondo claro; versiones translúcidas sobre violeta. Decorativos, nunca bajo el texto.
- **Nodos de ruta:** círculo violeta 34px + ciudad Nunito 900 + país en mayúsculas, unidos por
  línea celeste de 4px; último nodo relleno `#ceffff` con borde violeta.
- **Barra superior admin:** 68px con el degradado de marca, logo blanco + pill "ADMIN",
  buscador Ctrl+K translúcido y "Cerrar sesión".
- **Tabs admin:** fila que envuelve, activa con subrayado 3px `#49286b` y peso 700;
  contadores como pills (celeste = informativo, naranja = requiere acción).

## Principios del rediseño

1. El violeta es **tinta y acento**, no fondo de todo — el sitio actual satura el oscuro.
2. Nada de cards con iconito genérico: listas editoriales numeradas y tablas densas.
3. El **naranja solo señala riesgo** (vencimientos, salidas pisadas, faltantes). Nunca decorativo.
4. Fotos propias de la operativa, nunca banco de imágenes.
5. Copy rioplatense, frases cortas, sin emojis ni signos de exclamación.

## Assets incluidos

- `public/images/med-logo-dark.svg` / `med-logo-white.svg` / `med-emblem-white.svg` — del repo.
- `public/images/*.jpg` — fotos operativas reales del repo (puerto, depósito, camión, A7533).
- `assets/logo-violeta.png` / `logo-blanco.png` / isotipos — versiones raster de respaldo.
- `assets/bg-gradient.png` / `bg-paper.png` — texturas de fondo de la marca.

## Orden sugerido de implementación

1. Tokens y tipografía (base de todo lo demás).
2. Shell de /admin (barra + tabs) — se reutiliza en 15 pantallas.
3. Tablas y pills de estado — el componente más repetido de la app.
4. Home pública y carrusel de novedades.
5. Portal del cliente y login.
6. Pantallas admin restantes, de a una.

---

## Nota de archivo (28/08/2026)

Copia liviana del handoff original, guardada en el repo como referencia de
diseño permanente. Al abrir los `.dc.html` en el navegador, las texturas y
fotos pesadas no van a cargar: no están acá para no inflar el repo.

- Texturas ya optimizadas y en uso: `public/novedades/bg-gradient.webp` y
  `bg-paper.webp`. Fotos operativas: `public/images/`.
- El ZIP original completo (con los PNG pesados) quedó fuera del repo, en
  `..\..\TWF-DOCS\PLANTILLA-MEDITERRANEA-CARGHAS3-handoff-webapp.zip`.
- El sistema destilado de este handoff está en `docs/DISENO-MED.md` — ese es
  el documento de trabajo; estos HTML son la referencia visual de origen.
