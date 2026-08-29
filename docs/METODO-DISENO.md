# Método de trabajo — diseño de la webapp

> Cómo razonar cualquier tarea de diseño en este repo. Sale de lo aprendido
> (y de los errores cometidos) durante el rediseño de agosto/2026. Vale para
> cualquier sesión que toque pantallas. El QUÉ está en `DISENO-MED.md`;
> esto es el CÓMO PENSAR.

## 1 · Dos marcas, una app: la identidad se resuelve por variables

TWF y Mediterránea comparten el código pero **jamás** la identidad. Antes de
tocar un componente, preguntarse: ¿esto lo ve TWF también? Si sí, el color o
la tipografía NO se escriben directo — se escriben contra una variable o una
clase que cada marca resuelve distinto (`src/index.css`: defaults del `:root`
= look TWF; bloque `[data-brand="med"]` = el sistema Med; clases como
`.titulo-med` son neutras por default). Regla de oro: si un cambio hace que
una superficie de TWF se vea "un poco Med", está mal aunque quede lindo.

## 2 · Diseño ≠ funcionalidad: los mockups siempre simplifican

Un mockup de Claude Design muestra la estética con una versión REDUCIDA de la
pantalla. La app real siempre tiene más: filtros, columnas, acciones, estados.
La regla es **estética del mockup, funcionalidad de la app**: nunca quitar un
campo, botón o estado porque el mockup no lo dibuja. Y al revés: si el mockup
dibuja acciones que no existen (botones de partners, subir BL del cliente),
eso es FUNCIONALIDAD NUEVA — no se implementa como si fuera un restyling; se
anota y se conversa (ejemplos vivos en `DISENO-MED.md`, sección pendientes).

## 3 · Buscar la palanca de sistema antes que editar pantallas

Antes de editar 15 archivos, buscar el punto único que viste a todos:
- una función central (`statusBadgeClass`, `statusColorToClass`),
- un componente compartido (`ui/table`, `ui/badge`, el shell),
- una regla CSS por `data-slot` (`[data-slot="card"]`, `h4` del panel),
- una clase gancho puesta una vez (`.celda-panel`, `.bloque-panel`).
El fino pantalla-por-pantalla va DESPUÉS de agotar las palancas. Así se
vistieron 15 pantallas con una capa de CSS.

## 4 · Ojo con la cascada: lo nuestro pisa a Tailwind

Las reglas propias en `index.css`/`main.css` viven fuera de las capas de
Tailwind → le ganan a cualquier utility aunque tengan menos especificidad.
Consecuencia: una regla genérica (borde de cards) PISA los bordes semánticos
(riesgo naranja, info celeste). Siempre excluir lo que declara estilo propio
(`:not([class*="border-med-"])`…) o poner la regla al nivel correcto. Los
tintes con significado — rojo pisada, ámbar fuera de ventana — no se tocan
nunca por estética: son información operativa.

## 5 · Verificar con datos reales o no está verificado

"Compila y los tests pasan" no es verificación de diseño. El circuito:
1. Proxy TEMPORAL en `vite.config.ts` → `'/api': mediterraneacarghas.vercel.app`
   (NO commitearlo nunca; es contra producción: mirar, no escribir).
2. Entrar de verdad: admin con su login; el portal con la impersonación de un
   cliente CON cargas (Clientes → ícono de persona).
3. Medir por estilos computados (getComputedStyle), no solo por captura — las
   capturas headless a veces salen en blanco y mienten.
4. Comparar contra el mockup archivado, lado a lado.
5. Probar la marca TWF también (`?brand=twf`): que nada haya cambiado.
Los mockups viven en `docs/handoff-med/` y `docs/handoff-med-componentes/`;
los exports en PNG, en `TWF-DOCS` (fuera del repo).

## 6 · El proceso por tanda, sin excepciones

Branch desde `origin/main` → cambio acotado (una tanda = una idea) →
`npm run typecheck && npm run test:run && npm run build` → verificación
visual del punto 5 → commit que explica el PORQUÉ (no el qué) → PR → merge
solo con autorización vigente → chequear que el deploy llegó (grep de un
marcador en el bundle de producción, no confiar en el hash local: producción
buildea con la marca inyectada y el hash difiere).

## 7 · Cuando el usuario dice "no veo diferencia", tiene razón

Es el dato más valioso que puede dar. Casi siempre significa que se aplicó lo
estructural-invisible y se dejó lo visible (pasó con las celdas del panel).
Volver al mockup, ponerlo al lado de la captura real y preguntarse: ¿qué es
lo PRIMERO que un ojo no técnico nota distinto? Eso era lo que había que
hacer. Y si algo quedó afuera a propósito, decirlo en el momento, no dejar
que lo descubra.

## 8 · Lo que no se negocia

- Copy de operador: rioplatense, corto, sin emojis, sin tono de manual, sin
  mencionar IA (regla general del dueño).
- Sin cifras de fletes/recargos en nada publicado.
- Densidad del panel: se pule la terminación, nunca se agranda a costa de ver
  menos cargas por pantalla.
- El naranja solo señala riesgo. Si decora, deja de avisar.
