# Consolidar FCL chicas con LCL — diseño

_03/09/2026 · reglas de Brian en conversación. **Diseño, no implementado.**_
_Brian: "deberíamos ver la lógica bien y planearla bien antes de impactarlo."_

## De qué se trata

Una FCL que llega con poca carga deja media caja libre en el camión que la
lleva al fiscal argentino. Ese lugar hoy se pierde. Al mismo tiempo hay LCL
esperando en depósito a que junte volumen para armar consolidado al mismo
destino. La app tiene que juntar las dos puntas.

## La decisión NO es al armar el camión, es al llegar el contenedor

Corrección de Brian (03/09), y es lo que cambia todo respecto de la idea
inicial:

> "Yo la carga la puedo mandar a consolidar, solo se puede cruzar normalmente
> en PLANIR. Las FCL que yo vea chicas que el equipo LCL las quiera para
> consolidar junto con sus cargas, las necesito mover sí o sí a PLANIR. Así que
> no me serviría la fecha de carga o salida desde Montevideo, sino la fecha de
> **llegada a Montevideo**, para decidir antes a qué depósito mandarlas."

Consecuencias:

- El reloj es la **ETA a Montevideo**, no la salida del camión.
- La sugerencia aparece **cuando se elige el depósito**, antes del arribo.
- Para que una FCL y una LCL compartan camión, **las dos tienen que estar (o
  estar destinadas) al mismo depósito**, que normalmente es PLANIR.
- **Quién recomienda: el operativo o administrador de FCL** (Brian, Joaquín,
  Diego). "Los chicos de LCL no recomiendan cargas FCL por el momento."

## Parámetros (Brian 03/09)

| Parámetro | Valor inicial | Configurable |
|---|---|---|
| Carga "chica" | deja 30 m³ y 6 t libres o más en un sider (80 m³ / 24.500 kg) | Sí, más adelante |
| Depósito de consolidación | PLANIR | Sí — "la mayoría se hacen así, pero configurable" |

## Ciudades de los fiscales (verificado contra tablas de AFIP, 03/09)

| Fiscal | Nombre real | Ciudad | Provincia |
|---|---|---|---|
| CACEC | Cámara de Comercio Exterior de Córdoba | Córdoba capital | Córdoba |
| DFC | Depósito Fiscal Córdoba S.A. | Córdoba capital | Córdoba |
| TORTONE | Tortone S.A.C.I.F.I. | Córdoba capital | Córdoba |
| ZOFRACOR (11046) | ZOFRACOR S.A., depósito fiscal | Est. Juárez Celman, 20 km de Córdoba | Córdoba |
| ZONA FRANCA 88101 | Público ZOFRACOR — **mismo predio**, otro régimen | Est. Juárez Celman | Córdoba |
| MARE | MARE Logística Internacional S.A.S. | San Francisco | Córdoba |
| BPB | BPB Mediterránea S.A. — **no existe "BPV"** | Villa María | Córdoba |
| CLIR | Centro Logístico Internacional Rafaela | Rafaela | Santa Fe |
| ZP RAFAELA / RAFAELA | Zona primaria aduanera de Rafaela | Rafaela | Santa Fe |

**Distancias que deciden si combinar o avisar:**

| Par | km | Lectura |
|---|---|---|
| Córdoba ↔ Juárez Celman | 20 | mismo camión, sin aviso |
| Rafaela ↔ San Francisco | 90 | **el mejor combo** |
| Córdoba ↔ San Francisco | 208 | San Francisco está sobre la RN 19: es paso, no desvío |
| Córdoba ↔ Villa María | 153 | aceptable, avisar |
| Rafaela ↔ Villa María | 238 | **evitar**: otro eje |

Regla: mismo camión sin aviso hasta unos 100 km entre paradas; entre 100 y 250
se propone marcando el desvío en km; arriba de 250 no se propone.

## Las tres piezas

### 1 · "Candidata a consolidar" al elegir depósito (HOY FCL)

Cuando una FCL entra en la ventana de arribo y deja lugar, la fila ofrece:

> A8079 AIT · llega 13/09 · 5,6 t / 11 m³ → deja 69 m³ libres.
> En PLANIR hay 68 m³ con stock para **Córdoba** (DFC, CACEC).
> **[Mandar a PLANIR para consolidar]** · [No]

Condiciones: operativa trasiego o carga a piso (nunca CONTENEDOR directo),
destino por camión a Argentina, lugar libre por encima del umbral, y existe LCL
con stock o por llegar hacia la misma ciudad. Aceptar escribe DEPOSITO = PLANIR
en ese contenedor y lo marca `consolidar`. Rechazar lo esconde hasta que cambie
la ETA.

### 2 · La FCL entra al armador como bloque fijo

Marcada `consolidar`, aparece en Sugerencias de camión (`lclSugerencias.ts`)
como una carga más, pero **fija**: el motor arma alrededor de ella. Su fecha de
disponibilidad es el **trasiego**, no la ETA.

El motor devuelve **varias opciones**, no una:

| Opción | Ejemplo |
|---|---|
| Salir ahora | bloque FCL 11 m³ + 4 LCL a DFC = 62 m³, sale jueves |
| Esperar | al 9/9 llegan 10 m³ más a Córdoba → 74 m³ |
| Sumar ciudad | Rafaela y sigue a San Francisco, 90 km = 78 m³ |

"Esperar" solo se propone si **ninguna** carga tiene un reloj en contra:
almacenaje por vencer, prioridad del cliente, o el compromiso de la FCL.

### 3 · Avisos

- **Madera**: una LCL con madera arriba de un camión sin madera obliga a SENASA
  para todo el viaje. Aviso fuerte, no prohibición.
- **Desvío**: km entre paradas cuando son ciudades distintas.
- **Depósito distinto**: si la LCL desconsolida en GODILCO y la FCL va a PLANIR,
  no se proponen juntas (serían dos paradas en Montevideo).

## Datos que hay que limpiar antes (hallazgos 03/09)

1. **128 LCL activas sin fiscal cargado.** La pieza "esperar arribos" depende de
   ese dato: sin fiscal, la carga no entra a ninguna propuesta.
2. `ZF RAFAELA` no existe: la única zona franca de Santa Fe es Villa
   Constitución. Son `ZP RAFAELA` mal tipeados. La base ya está limpia
   (`RAFAELA`, 109 usos), pero la planilla los tiene.
3. `CARRETELES RAFAELA S.A` es un **cliente**, no un depósito: no agrupar por
   el nombre.

## Orden

1 → 2 → 3, cada uno con su lib pura y tests. El 1 solo ya sirve: convierte una
decisión de memoria en una sugerencia con números.
