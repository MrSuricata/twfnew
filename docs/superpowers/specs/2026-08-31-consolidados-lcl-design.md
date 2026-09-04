# Consolidados LCL: estados, previsión y armado de camiones

Diseño acordado con Brian el 31/08/2026.

## El problema

La sección de consolidados no se usa. No es un problema de pantallas: **el LCL
nunca entró al sistema.**

Lo que se midió en la base ese día:

- **4 cargas LCL** en toda la webapp (E208, E147, A7757B, LCL00365UY). Las cuatro
  dadas de alta en junio, **las cuatro todavía en "en origen"**, ninguna con
  fiscal ni depósito. La última se cargó el 02/07.
- El registro viejo `lcl_air_shipments` tiene **una sola fila**, de mayo.
- Mientras tanto, ese mismo día pasaron por el correo LCL247 (Ciuffo, arribo
  02/09), LCL235 y LCL367 (Tecnodiesel). Ninguna existe en la webapp.

Cuatro cargas congeladas en "en origen" desde junio son la prueba de que el
`status` manual —un desplegable que alguien tiene que acordarse de mover— no se
mantiene.

La causa de fondo la dio Brian: **el LCL lo llevan cuatro personas** (Marcos,
Agustín, Agustina, Catalina) **y cada una trabaja con su planilla.**

Y el costo de eso, en sus palabras:

> "salió un camión y esperando un día salía más carga, que luego se complica
> sacar porque no hay carga prevista"

Un camión sale a media máquina hoy; mañana llega carga que habría entrado y
después queda huérfana. **Ninguna de las cuatro planillas puede evitarlo, porque
cada una ve solo su pedazo.** Eso es lo que la webapp sí puede dar, y es la única
razón por la que el equipo migraría.

## Alcance

**Entra:** todo lo LCL (`mode='lcl'`). Los estados nuevos, la bandeja de stock,
la vista de previsión, los avisos de armado, la marca del cliente y la propuesta
FCL→LCL.

**No entra:** las FCL. Ya tienen su circuito (frontera, salida, arribo fiscal) y
no se toca. Lo único que las roza es la propuesta para pasarlas a LCL.

## Modelo de datos

Las LCL viven en `shipments` con `mode='lcl'`, que es la tabla nueva y unificada.
`lcl_air_shipments` (1 fila, de mayo) se retira.

### Migración: tres columnas, ninguna de fecha

```sql
alter table shipments add column if not exists stock         text;
alter table shipments add column if not exists marca_cliente text;  -- stand_by | prioridad
alter table shipments add column if not exists marca_motivo  text;
```

Ninguna fecha nueva: las dos que hacen falta ya existen:

- `eta` — llegada a Montevideo
- `desconsol_date` — fecha de desconsolidación

Esto último es una decisión de diseño, no un atajo: Brian confirmó que **cuando
el depósito desconsolida es cuando entrega el stock**. Son el mismo hecho, así
que no se agrega una fecha nueva — al cargar el stock se estampa
`desconsol_date` si viene vacía.

### La marca del cliente

Un campo con dos valores opuestos, los dos con motivo escrito:

| Valor | Qué significa | Efecto |
|---|---|---|
| `stand_by` | El cliente pide que no salga | Sale de las candidatas a camión |
| `prioridad` | El cliente la quiere ya | Va primera y pesa más que llenar el camión |

Sin esto no hay forma de que el equipo LCL le comunique al que arma los camiones
algo que hoy viaja por WhatsApp.

## Estados: ninguno se elige, todos se deducen

Muere el desplegable `LclAirStatus`. El estado se deriva, como el resto de la
webapp (principio sagrado del repo: derive-on-read, una fuente por dato).

| Condición | Estado |
|---|---|
| `eta` no pasó | **En viaje** |
| `eta` pasó, sin `stock` | **Aguarda stock** |
| Tiene `stock` | **Con stock** — candidata a camión |
| Está en un `truck_load` de un camión publicado | **Asignada** |
| El camión salió (`departure_date`) | **Despachada** |

No hay estado "desconsolidada": desconsolidar **es** recibir el stock, así que
sería el mismo estado con otro nombre.

`stand_by` y `prioridad` son ortogonales: una carga puede estar "con stock" y en
stand by a la vez, y eso es lo que pasa en la realidad.

## Bandeja "Aguarda stock"

La lista de las que llegaron y no tienen stock, con un campo por fila para
tipear varios seguidos: el depósito manda una tanda y se cargan todas juntas.

Es el único lugar donde se carga el stock. Que sea rápido es lo que decide si
esto funciona o se pudre como el desplegable actual.

## Vista de previsión

**El eje es el fiscal argentino**, porque es lo que define el camión: allá tiene
que descargar. El depósito uruguayo va adentro, porque el camión carga en uno
solo (normalmente).

Los valores reales medidos en la base:

- **Fiscal (destino AR):** RAFAELA 40 · MARE 24 · CACEC 22 · DFC 9 · ZOFRACOR 5 ·
  BPB · TORTONE · Zona Franca
- **Depósito (carga en UY):** GODILCO 59 · PLANIR 46 · TCP 9 · MONTECON 1

```
RAFAELA                      HOY      mié 3    jue 4    vie 5
  GODILCO                    22 m³    +18      ─        +9
  PLANIR                      6 m³    ─        +12      ─
  ──────────────────────────────────────────────────────────
  acumulado saliendo de GODILCO 22      40       40       49
```

Se lee de un saque: hoy hay 22 m³ en Godilco para Rafaela; el miércoles son 40.
Los de Planir quedan a la vista pero aparte, porque sumarlos es una parada más.

Lo que llega ("+18") sale de las LCL con ese fiscal cuya `eta` cae ese día,
tengan stock o no: es previsión, no disponibilidad.

## Aviso al publicar un camión

Cuando se publica un camión con lugar libre y hay carga del mismo fiscal
llegando en los días siguientes:

> Este camión va a RAFAELA y sale con 22 de 62 m³ desde GODILCO. El miércoles
> llegan 18 m³ más para el mismo fiscal y el mismo depósito. ¿Sale igual o lo
> corrés un día?

**Avisa, no bloquea** — mismo criterio que el aviso de feriados y paros. Quien
coordina sabe si el cliente puede esperar.

## Los tres relojes

Antes de sugerir esperar, el sistema chequea qué está apurando a la carga. Si
esperar hace que algo se pase, dice lo contrario: *sacala ahora*.

| Reloj | De dónde sale | Por qué importa |
|---|---|---|
| **Almacenaje** | 30 días desde `desconsol_date` | Hoy no lo mira nadie. Para una FCL el reloj es el libre del contenedor; en LCL no hay contenedor que devolver, así que ese reloj no existe en el sistema. |
| **Días parada** | días desde que tiene stock | "Hay carga con 12 días esperando camión" |
| **Prioridad** | marca del cliente | Pesa más que llenar el camión |

## Dos depósitos

Cargar en dos depósitos uruguayos para el mismo fiscal **se evita pero se hace
si conviene**. El sistema lo sugiere marcando el costo:

> Sumando PLANIR llegás a 46 m³. Es una parada más.

## Propuesta FCL → LCL

Una FCL chica por Montevideo, con volumen y peso que entren en un consolidado y
con el visto bueno del cliente, se **propone** desde la ficha de la carga.

Queda como propuesta pendiente y **le llega el aviso al equipo LCL**, que la
acepta o la rechaza con motivo. Si la aceptan, entra al circuito LCL con sus
estados.

Es lo único que toca las FCL, y solo para sacarlas de ahí.

## Quién usa esto

Diseñar para el equipo LCL, no solo para Brian. Ellos son los que cargan el dato;
Brian es el que arma los camiones. Si la bandeja de stock o el alta les cuestan
trabajo sin devolverles nada, vuelven a la planilla y esto queda como las cuatro
cargas de junio.

Lo que la app les da y la planilla no: **ver qué camión sale, cuándo, y con
cuánto lugar libre.**

## Decisiones abiertas

- **Cómo se avisa al equipo LCL** una propuesta FCL→LCL: mail, aviso dentro de la
  app, o las dos. Depende de si van a tener la app abierta durante el día.
- **Cuántos días de "parada"** disparan el aviso. Hay que medirlo con datos
  reales una vez que haya LCL cargadas.
- **Orden de adopción**: si migran los cuatro a la vez o arranca uno.

## Verificación

- Las cuatro LCL de junio quedan con estado derivado correcto sin tocarles nada
  (todas con `eta` pasada y sin stock → "Aguarda stock").
- Cargar el stock de una LCL la mueve a "Con stock" y la hace aparecer como
  candidata en el armador, sin ningún paso extra.
- Publicar un camión a medias con carga del mismo fiscal llegando dispara el
  aviso; con el almacenaje por vencer, dispara el contrario.
- El armador sigue funcionando igual para FCL: nada de esto cambia su circuito.
