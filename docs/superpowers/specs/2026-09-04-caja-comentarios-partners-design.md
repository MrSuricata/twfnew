# Caja de comentarios en los portales de partners — diseño

_04/09/2026 · pedido de Brian. **Diseño aprobado.**_

## Lo que pidió Brian, textual

> "Me parece que el paso natural ahora, como para poder probar bien la parte del
> transporte y los partners y el depósito con sus usuarios, que voy a empezar a
> crearlos ahora, es que se le agregue una caja en algún lado de comentarios.
> Puede ser de posibles mejoras… no, como comentarios, como cosas que no les
> hayan funcionado o que hayan tenido que rectificar."

El contexto manda: Brian está por dar de alta los usuarios reales de GODILCO,
PLANIR y los transportes. La primera semana de uso es la única en la que la
fricción se ve; después el usuario se acostumbra al problema y deja de
nombrarlo.

## Decisiones tomadas con Brian

| Decisión | Elegido | Por qué |
|---|---|---|
| Encuadre | **"¿Algo no funcionó?"** | En fase de prueba la gente reporta problemas concretos, no imagina mejoras. Una caja de "sugerencias" se llena de silencio. |
| Alcance | **Depósito y transporte** | Son los que están aprendiendo la herramienta. Al cliente se le suma después: preguntarle "¿algo no funcionó?" mientras querés que el portal le dé confianza juega en contra. |
| Respuesta | **Sí, respuesta corta** | Si nadie contesta, dejan de escribir a la segunda vez. |
| Aviso a Brian | **Card en HOY, no mail** | No hay proveedor de mail transaccional en Vercel (pendiente conocido). |

## D1 · Tabla propia, no reusar `partner_avisos`

`partner_feedback`, nueva. **No** se reusa `partner_avisos` con un tipo más:
esa tabla modela *propuestas operativas sobre una carga* (retire / devolví /
desconsolidé / senasa) con flujo de confirmar-rechazar y candados por alcance.
Un comentario no es una acción sobre una carga: no se confirma, no se rechaza y
no tiene ref obligatoria. Mezclarlos ensuciaría la card que el equipo ya usa
para trabajar.

Campos: quién (email, nombre, rol y `filter_value` del partner, releídos de
`partner_users` **en el servidor**, nunca del cliente), texto, contexto (jsonb),
estado (`nuevo` | `leido` | `respondido`), respuesta, quién respondió y cuándo.

## D2 · El contexto es la mitad del valor

"No me dejó marcar el retiro" sin contexto no se puede reproducir. La caja
captura sola, sin que el usuario escriba nada:

- **pantalla** desde la que se abrió (ruta + sección),
- **ref de la carga** que tenía abierta, si había una,
- **navegador y tamaño de viewport**.

Lo último no es un detalle: los depósitos entran desde el celular, parados en
el predio, y ahí aparece la mitad de los problemas que en escritorio no se ven.

## D3 · Un botón, en el armazón que ya comparten

El botón vive en `PartnerDashboardShell`, que ya comparten `DepotDashboard` y
`TransportDashboard`: aparece en los dos sin duplicar nada y sin tocar cada
pantalla. Abre un modal corto con la piel común (`PanelCard`):

- una sola caja de texto, con tope de caracteres;
- el "¿en qué estabas?" **ya completado** con la pantalla actual, editable;
- al enviar, agradecimiento y cierre. Sin formularios de categorías.

Si hay respuesta del equipo, el partner la ve al entrar, sin ir a buscarla.

## D4 · Del lado del equipo: una card más en HOY

Card con la piel nueva junto a "Avisos de partners": quién, cuándo, qué
escribió, desde dónde, y dos acciones — responder en una línea, o marcar visto.
Los comentarios sin leer cuentan en el header (plegada sigue avisando, D7 del
rediseño del 04/09).

## D5 · Entra por el endpoint que ya existe

Vercel Hobby está en **12 de 12 serverless functions**: no hay lugar para un
endpoint nuevo. Va como un `case` más en `api/data/[entity].ts`:

- `POST` — el partner crea el comentario. Autenticado como partner; el alcance
  y la identidad se releen de `partner_users` en el servidor. Rate limit con la
  tabla `rate_limits` que ya existe.
- `GET` — el admin lista.
- `PATCH` — el admin responde o marca visto.

## Fuera de alcance (a propósito)

- **Adjuntar capturas de pantalla**: necesita storage y otra función. Si los
  comentarios piden a gritos una imagen, se agrega después.
- **Categorías o etiquetas**: clasificar diez comentarios a mano es más rápido
  que mantener una taxonomía que nadie usa.
- **Push**: la card en HOY alcanza mientras el volumen sea bajo.
- **Portal del cliente**: más adelante, con otro texto.

## Datos

La tabla nueva requiere **una migración en Supabase**. Los agentes tienen
prohibido tocar la base: la aplica Brian o Claude con su OK explícito, nunca un
agente de implementación.

## Verificación

- Lib pura de validación (texto vacío, tope de largo, armado del contexto) con
  tests.
- Test de render del modal y de la card.
- `/ui?brand=med` para verlo sin login; el flujo completo se prueba con los
  usuarios reales que Brian está creando.
- Gates: `npm run typecheck && npm run test:run && npm run build`.
