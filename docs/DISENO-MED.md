# Sistema de diseño — Mediterranea Carghas

> Fuente de verdad del diseño de la marca Med dentro de este repo.
> Antes de tocar cualquier pantalla de Mediterránea, leer esto.
> **No aplica a TWF — nunca**: las dos marcas comparten el código pero no la
> identidad. Todo lo compartido (admin, portal, logins, tablas, badges) resuelve
> sus colores por variables de marca en `src/index.css`: los defaults del
> `:root` son el look de TWF y el bloque `[data-brand="med"]` pisa con este
> sistema. Las clases `.titulo-med`, `.ref-med`, `.degradado-med` y `.papel-med`
> son neutras por default y solo se visten bajo `data-brand="med"`.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Paleta como utilidades (`bg-med-violeta`…) | `src/main.css`, bloque `@theme` |
| Tipografía de títulos | `src/main.css`, clase `.titulo-med` |
| Textura de papel para secciones claras | `src/main.css`, clase `.papel-med` |
| Degradado de marca | `src/main.css`, clase `.degradado-med` |
| Fuentes (Nunito + Montserrat) | `index.html`, link de Google Fonts |
| Texturas y logos | `public/novedades/`, `public/images/` |
| Landing | `src/components/MediterraneaLanding.tsx` |
| Carrusel de avisos | `src/components/NovedadesCarrusel.tsx` |
| Mockups de origen (todas las pantallas) | `docs/handoff-med/` |

## Color

| Uso | Hex | Utilidad |
|---|---|---|
| Violeta marca — títulos, botones, sidebar | `#49286b` | `med-violeta` |
| Violeta texto — cuerpo sobre claro | `#352e6a` | `med-texto` |
| Violeta profundo — fin de degradados | `#261c79` | `med-profundo` |
| Celeste — acentos, líneas, highlights | `#9bd1e5` | `med-celeste` |
| Celeste pastel — pills, fondos suaves | `#ceffff` | `med-pastel` |
| Naranja aviso | `#e8863b` | `med-aviso` |
| Texto secundario | `#6b6688` | `med-gris` |
| Labels y datos terciarios | `#9a96b8` | `med-gris-suave` |
| Bordes de card y separadores | `#eef0f8` | `med-borde` |
| Fondo de campos y cabeceras | `#fbfbfe` | `med-fondo` |
| OK — pagado, cobrado, check pasado | `#2f8f5b` | `med-ok` |
| Error — check fallido | `#d94f4f` | `med-error` |

Degradado: `linear-gradient(160deg, #49286b 0%, #352e6a 55%, #261c79 100%)`.

**El naranja solo señala riesgo** — vencimientos, salidas pisadas, datos que
faltan. Nunca decorativo: si se usa para adornar, deja de leerse como alerta.

## Tipografía

La marca usa Gotham, que no existe como fuente web. Los sustitutos aprobados:

- **Nunito 900** — títulos, números, referencias (A7994), montos.
  `line-height: 0.98–1.1`, `letter-spacing: -0.02em` en tamaños grandes.
  En el código: clase `.titulo-med`.
- **Montserrat 300–700** — cuerpo, labels, botones.
  Kickers en 600 MAYÚSCULAS con `letter-spacing: 0.06–0.08em`.

Nunca menos de 24px en piezas gráficas; en pantalla, el cuerpo va 15–17px.

## Piezas del sistema

- **Pill de estado** — radio 999px, padding 6/16, 11px peso 700 mayúsculas.
  Neutro: fondo `med-pastel` texto `med-texto`. Riesgo: fondo `med-aviso` texto
  blanco. OK: fondo `#e4f4ea` texto `med-ok`.
- **Kicker pill** — borde 2px `med-celeste`, radio 999px, padding 8/22, 13px
  peso 600 mayúsculas con `letter-spacing: .08em`. Sobre claro lleva fondo
  `med-pastel`; sobre violeta va sin fondo, con el texto celeste.
- **Botón primario** — fondo `med-violeta`, texto blanco, radio 999px, peso 600.
- **Botón secundario** — borde 2px `rgba(73,40,107,0.2)`, texto `med-violeta`.
- **Card** — blanca, radio 20–28px, borde 2px `med-borde`, o sombra
  `0 24px 60px rgba(38,28,121,0.10)` cuando va elevada.
- **Tabla** — cabecera `med-fondo` con labels 11px mayúsculas `med-gris-suave`;
  filas separadas por 2px `#f4f5fa`; fila con alerta tintada `#fff9f4`.
  La referencia siempre en Nunito 900 violeta.
- **Línea separadora** — 310×8px (180×6 en bloques chicos). Violeta sobre claro,
  celeste sobre violeta o foto.
- **Arcos de esquina** — círculos desbordados: violeta sólido + anillo celeste
  sobre fondo claro, translúcidos celestes sobre violeta. Son decorativos y van
  **detrás** del texto. Ojo: los elementos posicionados se pintan sobre los que
  no lo están, así que el bloque de contenido también necesita `relative`.
- **Nodos de ruta** — círculo violeta + nombre en Nunito 900, unidos por línea
  celeste; el último nodo va relleno `med-pastel` con borde violeta. Se usa
  tanto para rutas (origen → destino) como para procesos (paso a paso).

## Cómo se escribe

Rioplatense, voseo, frases cortas. Tensión, después solución, después respaldo.
Sin emojis y sin signos de exclamación. Nada de tono instructivo: el texto lo
firma un operador, no un manual.

En contenido publicado **no van cifras de fletes ni recargos** — siempre
cualitativo. El número vive en la cotización, no en la web.
Los datos duros de una pieza noticiosa llevan fuente y fecha, o no van.

## Reglas de fondo

1. El violeta es tinta y acento, no fondo de todo.
2. Las secciones claras llevan la textura de papel (`.papel-med`), no blanco
   plano.
3. Fotos propias de la operativa. Nunca banco de imágenes.
4. Sin tarjetas con iconito genérico: listas editoriales y tablas densas.

## Qué ya está aplicado (28/08/2026)

Todo el recorrido base:

- **Landing completa** — portada, servicios, proceso, novedades con carrusel,
  cobertura, equipo, texturas de papel y el imán suave de scroll (`proximity`,
  hero excluido; se quita sacando `data-snap-landing` si molesta).
- **Admin** — referencias en `ref-med` (grilla + HOY), `statusBadgeClass` con
  la paleta, contadores de pestañas por significado, barra con `degradado-med`
  + pill ADMIN + "Activar avisos" naranja, pestaña activa 3px/700, cabecera de
  la grilla en violeta profundo y tablas compartidas con cabecera clara.
- **Accesos** — `MarcoLogin` envuelve los tres logins (formularios intactos;
  colores por variables de marca, TWF conserva su azul). Header del portal del
  cliente con el degradado.
- **Menores** — 404 con papel y Nunito gigante; títulos de Términos y
  Privacidad.

El handoff de componentes (`docs/handoff-med-componentes/`) también está
aplicado: panel de detalle (cabeceras con línea, ref Nunito, popovers), Nueva
carga y Ctrl+K, shimmer del sistema, shell de partners con la banda de marca y
la página /novedades con hero de papel, filtros por categoría y tarjetas de
color por aviso.

Pendiente que NO es diseño: las acciones de los tableros de partners que
proponen los mockups C (Marcar recibido, Registrar salida, Confirmar retiro/
entrega, la ruta en nodos por viaje) son funcionalidad nueva — los tableros
reales muestran la agenda filtrada, sin escrituras de partners. Si se quieren,
es un proyecto aparte con lógica y API, no un restyling. También quedan como
decisiones a conversar: login unificado por perfil y el fondo claro del hero.

## Una advertencia para el panel

El panel no es la landing. Ahí la prioridad es resolver el día rápido: densidad
de datos, contadores que se leen sin entrar, color que significa algo. Aplicar
el sistema es pulir la terminación (tipografía, pills, cabeceras), **nunca**
agrandar títulos ni sumar aire a costa de ver menos cargas por pantalla.
