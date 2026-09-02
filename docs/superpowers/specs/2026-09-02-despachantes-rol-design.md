# Despachantes: el cuarto rol de la red

Diseño para discutir con Brian. Idea suya del 02/09/2026:

> "Esto también lo vamos a usar más adelante para determinar quién es el
> despachante de cada carga. Entonces vamos a tener también usuarios para
> despachantes, no sé si entraría en partners capaz, y que puedan entrar ellos
> y ver todas las cargas en las cuales ellos son despachantes, de diferentes
> clientes capaz, y que nosotros somos el agente. Casi cerrando una red
> buenísima."

## Por qué cierra la red

Hoy cada rol ve su pedazo: el cliente sus cargas, el depósito lo que entra y
sale de su predio, el transporte lo que carga. El despachante es el que falta:
es quien necesita los papeles antes que nadie y a quien hoy se le manda todo
por mail. Con su vista, cada carga tiene a sus cuatro actores mirando el mismo
dato, y el mail deja de ser el sistema.

Un despachante trabaja para VARIOS clientes nuestros, y un cliente puede tener
un despachante distinto por operación. Por eso el despachante no cuelga del
cliente: es un dato de la carga.

## Qué falta hoy

- **No existe el dato.** `shipments` no tiene columna `despachante`. Lo más
  parecido es `agente`, que es otra cosa (el agente de origen: CRAFT, SACO,
  TRANS-CHINA…). Navatta, el despachante que más usamos, no aparece en ninguna
  columna: vive en los mails y en las certificaciones.
- **No existe el rol.** `partner_users.role` hoy solo tiene `depot` y
  `transport` (y en la base, un solo usuario, de depósito).

## Propuesta

### 1. El dato: `shipments.despachante`

Columna nueva, texto, con catálogo propio (como clientes): NAVATTA y los que
usen los clientes argentinos. Se elige de una lista, nunca se tipea libre
(misma regla que acabamos de aplicar al cliente, y por el mismo motivo).

Dónde se carga: en el alta y en los datos clave, al lado del fiscal. Y en HOY
como dato faltante reclamable, para las que llegan sin despachante asignado.

Regla de negocio a confirmar con Brian: ¿el despachante lo define el cliente
(casi siempre el mismo) o cambia por carga? Si es casi siempre el mismo,
conviene un despachante por defecto en la ficha del cliente, que la carga
hereda y se puede cambiar.

### 2. El rol: `customs` dentro de partners

Sí, entra en partners. Es exactamente el mismo mecanismo: usuario con
`filterValue` (el nombre del despachante), login propio, y un endpoint que
filtra las cargas por ese valor. Sumar `'customs'` al rol de `partner_users` y
a la rama de `partner-shipments`, filtrando **por carga** (`despachante`), no
por operativa como depósito y transporte.

### 3. Qué ve, y qué no

Un despachante necesita más papel que el depósito, y sí conoce a su cliente
(trabaja para él). La lista blanca sería:

| Ve | No ve |
|---|---|
| Ref, **cliente**, ETA, buque, línea, terminal | Nuestros costos, flete y locales |
| BL / HBL, contenedor, bultos, kg, m³, descripción | El transporte y el depósito de otras cargas |
| Fiscal de destino, operativa, madera (SENASA), IMO, OOG | Cargas de clientes donde él no es el despachante |
| Estado de la liberación y de los checks documentales | Datos de otros despachantes |

El cliente es la excepción respecto de los otros partners: al despachante se le
muestra, porque es su cliente. Eso hay que decidirlo explícitamente, no que
salga por descuido.

### 4. Su HOY

Mismas cards que el resto, en su idioma:

1. **Llegan esta semana** — para preparar el DUA: ETA, buque, terminal,
   documentos que ya tiene y los que faltan.
2. **Sin documentación completa** — las que llegan y todavía no tienen BL,
   factura o packing. Es la card que hoy es una cadena de mails.
3. **Con madera (SENASA)** — las que necesitan el trámite antes de la frontera.
4. **Despachadas / en destino** — cierre, para que sepa qué ya salió.

### 5. Lo que gana el equipo

La contracara: en el HOY de ustedes, cada carga muestra su despachante, y las
que llegan sin despachante asignado se reclaman como dato faltante. Además
habilita el aviso "documentación enviada al despachante" como paso del
circuito, en vez de buscar el mail.

## Etapas sugeridas

1. **Dato**: columna, catálogo, selector en alta y datos clave, dato faltante
   en HOY. Sin login todavía. Ya sirve: el equipo deja de buscar en mails.
2. **Backfill**: completar el despachante de las cargas vivas (Navatta en las
   uruguayas; los argentinos, con Brian).
3. **Rol y portal**: `customs` en partners, endpoint, HOY del despachante,
   accesos.
4. **Avisos**: el despachante avisa "DUA presentado" / "liberado", el equipo
   confirma, igual que depósito y transporte.

## Preguntas para Brian

1. ¿El despachante es por carga o por cliente (con excepciones)?
2. ¿Cuántos despachantes distintos hay hoy? ¿Navatta y quién más?
3. ¿Ve el nombre del cliente? (mi recomendación: sí, es su cliente)
4. ¿Le mostramos los documentos (BL, factura) para descargar, o solo el estado?
