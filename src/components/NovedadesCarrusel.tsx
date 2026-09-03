import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  type Noticia, type BloqueAjustado, type BloqueTexto, categoriaMeta, estiloSlide,
  tituloPartes, linkNoticia, ajustarColumna, filasKicker, ANCHO_CARACTER,
} from '@/lib/noticias'

// ── Carrusel de novedades de la portada ──────────────────────────────────
// Diseño de plantilla propia (Brian 28/08): slides de 1600×900 que se
// deslizan con drag/flechas/dots. Todo el slide se maqueta en px de diseño
// dentro de una caja 1600×900 y se escala completo al ancho disponible
// (aspect 16:9) — así las proporciones quedan idénticas en cualquier pantalla.
// Variantes visuales por nota: violeta / celeste / actualizacion / papel.

const W = 1600
const H = 900

const VIOLETA = '#49286b'
const VIOLETA_TXT = '#352e6a'
const INDIGO = '#261c79'
const CELESTE = '#9bd1e5'
const PASTEL = '#ceffff'
const NARANJA = '#e8863b'

const NUNITO = "'Nunito', 'Jost', sans-serif"
const MONTSERRAT = "'Montserrat', 'Inter', sans-serif"

const fmtFecha = (iso: string): string => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Texto con **negritas** → nodos (los asteriscos nunca se ven en pantalla). */
export function conNegrita(texto: string, strongStyle?: CSSProperties): ReactNode {
  const partes = String(texto || '').split(/\*\*(.+?)\*\*/g)
  if (partes.length === 1) return texto
  return partes.map((p, ix) => (ix % 2 === 1 ? <strong key={ix} style={strongStyle}>{p}</strong> : p))
}

// ── Medidas fijas de la maqueta (px de diseño) ────────────────────
// Los hijos que NO llevan texto variable tienen alto conocido, y se lo damos
// explícito (interlineado y alto del logo) para que sea exacto y no dependa del
// "normal" de cada navegador. Así ajustarColumna sabe cuánto alto le queda al
// texto y lo que reserva es exactamente lo que después se dibuja.

const KICKER_FS = 28
const KICKER_LH = 1.5
const KICKER_PAD = 32                    // 16px arriba + 16px abajo de la pill
const ASIDE_FS = 26
const ALTO_LINEA = 8
const ALTO_BOTON = 93                    // 30px × 1.5 de interlineado + 24px × 2 de padding
const ANCHO_LOGO = 290
const ALTO_LOGO = 101                    // el PNG es 358×125
/** Colchón que se le resta al alto de cada columna. El redondeo a subpíxeles del
 *  navegador puede comerse un pelo de renglón; con esto nunca llega al borde. */
const COLCHON = 12

const altoKicker = (filas: number) => filas * KICKER_FS * KICKER_LH + KICKER_PAD

/** Escalones de tamaño de fuente: si el texto no entra, primero se achica un
 *  punto y recién después se recorta (aprovechar el lugar antes de cortar). */
const escalones = (base: number): number[] => [base, Math.round(base * 0.9), Math.round(base * 0.82)]

/** El título va en dos renglones cuando trae "|": para medirlo, ese corte es un
 *  salto de línea de verdad. */
const tituloMedible = (titulo: string) => tituloPartes(titulo).filter(Boolean).join('\n')

// ── Piezas compartidas de los slides ─────────────────────────────

const slideBase: CSSProperties = {
  position: 'relative', flex: 'none', width: W, height: H,
  overflow: 'hidden', display: 'flex', fontFamily: MONTSERRAT,
}

/** Columna del slide: alto fijo y nada se le escapa por abajo. */
const columna = (extra: CSSProperties): CSSProperties => ({
  position: 'relative', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  minHeight: 0, overflow: 'hidden', ...extra,
})

/** Texto recortado a una cantidad exacta de renglones. line-clamp corta SIEMPRE
 *  en un borde de renglón y termina en puntos suspensivos — nunca a mitad de
 *  palabra contra el borde de la tarjeta (Brian 03/09: "no puede pasarnos más").
 *
 *  Dos cuidados que aprendimos probando con una nota el doble de larga:
 *  · El padding del bloque NO puede ir en el mismo div que el recorte: el
 *    renglón que sobra se sigue dibujando y asoma dentro de ese padding. Por eso
 *    la tarjeta blanca y la pill celeste van en un envoltorio aparte (`caja`) y
 *    el recorte queda pegado al texto.
 *  · `holgura` es SOLO arriba: con interlineado apretado (títulos, lineHeight
 *    menor a 1) el recorte le comería la tilde a las mayúsculas del primer
 *    renglón. Abajo no se puede agrandar por lo mismo que el punto anterior. */
function Recortado({ a, holgura = 0, caja, style, children }: {
  a: BloqueAjustado | undefined; holgura?: number; caja?: CSSProperties
  style?: CSSProperties; children: ReactNode
}) {
  if (!a || a.maxLineas < 1) return null
  const texto = (
    <div style={{
      ...style,
      boxSizing: 'border-box',
      fontSize: a.fontSize, lineHeight: a.lineHeight,
      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: a.maxLineas,
      overflow: 'hidden',
      ...(holgura ? { paddingTop: holgura, marginTop: -holgura } : {}),
    }}>{children}</div>
  )
  return caja ? <div style={{ boxSizing: 'border-box', ...caja }}>{texto}</div> : texto
}

const alLadoDelKicker = (n: Noticia) => n.kickerExtra || fmtFecha(n.publicadaAt)
const textoKicker = (n: Noticia) => n.kicker || categoriaMeta(n.categoria).label

function KickerRow({ n, asideColor, asideOpacity, sinAside, filas }: {
  n: Noticia; asideColor: string; asideOpacity?: number; sinAside?: boolean; filas: number
}) {
  const aside = sinAside ? '' : alLadoDelKicker(n)
  // Pill y fecha se recortan a las MISMAS filas que reservó filasKicker, así la
  // fila del kicker mide siempre lo que la columna le tiene reservado.
  const recorte: CSSProperties = {
    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: filas, overflow: 'hidden',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28, maxWidth: '100%', flex: 'none' }}>
      <div style={{ background: NARANJA, borderRadius: 999, padding: '16px 40px', minWidth: 0 }}>
        <div style={{
          ...recorte,
          fontWeight: 600, fontSize: KICKER_FS, lineHeight: KICKER_LH, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#FFFFFF',
        }}>
          {textoKicker(n)}
        </div>
      </div>
      {aside && (
        <div style={{
          ...recorte,
          fontWeight: 600, fontSize: ASIDE_FS, lineHeight: KICKER_LH, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: asideColor, opacity: asideOpacity,
        }}>
          {aside}
        </div>
      )}
    </div>
  )
}

function Titulo({ titulo, color, acento, a }: {
  titulo: string; color: string; acento: string; a: BloqueAjustado | undefined
}) {
  const [x, y] = tituloPartes(titulo)
  return (
    <Recortado a={a} holgura={a ? Math.round(a.fontSize * 0.2) : 0} style={{
      fontFamily: NUNITO, fontWeight: 900, letterSpacing: '-0.02em', color,
    }}>
      {x}{y && <><br /><span style={{ color: acento }}>{y}</span></>}
    </Recortado>
  )
}

const Linea = ({ color }: { color: string }) => (
  <div style={{ width: 310, height: ALTO_LINEA, background: color, flex: 'none' }} />
)

function BotonNoticia({ n, claro }: { n: Noticia; claro?: boolean }) {
  const { href, externo } = linkNoticia(n)
  return (
    <a
      href={href}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{
        background: claro ? PASTEL : VIOLETA, borderRadius: 999, padding: '24px 52px',
        fontWeight: 600, fontSize: 30, lineHeight: 1.5, color: claro ? VIOLETA_TXT : '#FFFFFF',
        display: 'flex', alignItems: 'center', gap: 18, textDecoration: 'none',
        flex: 'none', whiteSpace: 'nowrap',
      }}
    >
      Ir a la noticia <span style={{ fontFamily: NUNITO, fontWeight: 900 }}>→</span>
    </a>
  )
}

const Logo = ({ blanco }: { blanco?: boolean }) => (
  <img
    src={blanco ? '/novedades/logo-blanco.png' : '/novedades/logo-violeta.png'}
    alt="Mediterranea Carghas"
    style={{ width: ANCHO_LOGO, height: ALTO_LOGO, flex: 'none' }} draggable={false}
  />
)

/** Arcos de esquina de los slides claros: círculo violeta sólido + anillo. */
function ArcosClaros() {
  return (
    <>
      <div style={{ position: 'absolute', top: -300, right: -300, width: 460, height: 460, borderRadius: '50%', background: VIOLETA, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -330, right: -330, width: 560, height: 560, borderRadius: '50%', border: '26px solid rgba(155,209,229,0.65)', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -300, left: -300, width: 440, height: 440, borderRadius: '50%', background: VIOLETA, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -330, left: -330, width: 540, height: 540, borderRadius: '50%', border: `22px solid ${PASTEL}`, boxSizing: 'border-box', pointerEvents: 'none' }} />
    </>
  )
}

/** Columna derecha de todas las variantes: mensaje + botón + logo. El mensaje es
 *  lo único de alto variable; botón y logo entran como alto fijo. */
function ajusteDerecha(
  texto: string,
  { ancho, alto, gap, base, lineHeight, factor, extra = 0 }:
    { ancho: number; alto: number; gap: number; base: number; lineHeight: number; factor?: number; extra?: number },
) {
  const bloques: BloqueTexto[] = texto.trim()
    ? [{ clave: 'mensaje', texto, ancho, tamanos: escalones(base), lineHeight, factor, extra }]
    : []
  return ajustarColumna(bloques, { alto: alto - COLCHON, gap, fijos: [ALTO_BOTON, ALTO_LOGO] })
}

// ── Variantes de slide ────────────────────────────────────
// Cada variante le pasa a ajustarColumna su geometría real en px de diseño:
// ancho útil (columna menos paddings) y alto útil (900 menos paddings), con los
// altos fijos de kicker / línea / botón / logo. Nota nueva o nota larga, el
// cálculo se rehace solo: nadie tiene que contar caracteres.

function SlideVioleta({ n }: { n: Noticia }) {
  const ANCHO = 790
  const filas = filasKicker(textoKicker(n), alLadoDelKicker(n), { ancho: ANCHO })
  const izq = ajustarColumna([
    { clave: 'titulo', texto: tituloMedible(n.titulo), ancho: ANCHO, tamanos: escalones(86), lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
    ...(n.bajada.trim() ? [{ clave: 'bajada', texto: n.bajada, ancho: ANCHO, tamanos: escalones(38), lineHeight: 1.3 }] : []),
  ], { alto: 720 - COLCHON, gap: 30, fijos: [altoKicker(filas), ALTO_LINEA] })
  const der = ajusteDerecha(n.mensaje, { ancho: 520, alto: 710, gap: 30, base: 33, lineHeight: 1.35 })
  return (
    <div style={{ ...slideBase, background: `linear-gradient(160deg, ${VIOLETA} 0%, ${VIOLETA_TXT} 55%, ${INDIGO} 100%)` }}>
      <div style={{ position: 'absolute', top: -300, right: -300, width: 460, height: 460, borderRadius: '50%', background: 'rgba(155,209,229,0.18)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -330, right: -330, width: 560, height: 560, borderRadius: '50%', border: '26px solid rgba(155,209,229,0.35)', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -300, left: -300, width: 440, height: 440, borderRadius: '50%', border: '22px solid rgba(206,255,255,0.25)', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div style={columna({ flex: 'none', width: 940, padding: '90px 40px 90px 110px', alignItems: 'flex-start', justifyContent: 'space-between', gap: 30 })}>
        <KickerRow n={n} asideColor={CELESTE} filas={filas} />
        <Titulo titulo={n.titulo} color="#FFFFFF" acento={CELESTE} a={izq.titulo} />
        <Linea color={NARANJA} />
        <Recortado a={izq.bajada} style={{ fontWeight: 400, color: PASTEL, textWrap: 'pretty' }}>
          {conNegrita(n.bajada, { color: '#FFFFFF' })}
        </Recortado>
      </div>
      <div style={columna({ flex: 1, padding: '100px 110px 90px 30px', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 30 })}>
        <Recortado a={der.mensaje} style={{ fontWeight: 300, color: '#FFFFFF', opacity: 0.92, textAlign: 'center', textWrap: 'pretty' }}>
          {conNegrita(n.mensaje, { fontWeight: 600 })}
        </Recortado>
        <BotonNoticia n={n} claro />
        <Logo blanco />
      </div>
    </div>
  )
}

function SlideCeleste({ n }: { n: Noticia }) {
  const ANCHO = 750
  const filas = filasKicker(textoKicker(n), alLadoDelKicker(n), { ancho: ANCHO })
  const izq = ajustarColumna([
    { clave: 'titulo', texto: tituloMedible(n.titulo), ancho: ANCHO, tamanos: escalones(84), lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
    ...(n.subtitulo.trim() ? [{ clave: 'subtitulo', texto: n.subtitulo, ancho: ANCHO - 80, tamanos: escalones(34), lineHeight: 1.5, factor: ANCHO_CARACTER.titulo, extra: 32 }] : []),
    ...(n.bajada.trim() ? [{ clave: 'bajada', texto: n.bajada, ancho: ANCHO, tamanos: escalones(32), lineHeight: 1.3 }] : []),
  ], { alto: 720 - COLCHON, gap: 26, fijos: [altoKicker(filas)] })
  const der = ajusteDerecha(n.mensaje, { ancho: 590 - 88, alto: 700, gap: 28, base: 32, lineHeight: 1.3, extra: 80 })
  return (
    <div style={{ ...slideBase, background: `#cfe4f0 url(/novedades/bg-gradient.webp) center/cover no-repeat` }}>
      <ArcosClaros />
      <div style={columna({ flex: 'none', width: 900, padding: '90px 40px 90px 110px', alignItems: 'flex-start', justifyContent: 'space-between', gap: 26 })}>
        <KickerRow n={n} asideColor={VIOLETA} asideOpacity={0.7} filas={filas} />
        <Titulo titulo={n.titulo} color={VIOLETA} acento={VIOLETA} a={izq.titulo} />
        <Recortado
          a={izq.subtitulo}
          caja={{ background: PASTEL, borderRadius: 999, padding: '16px 40px', minWidth: 0 }}
          style={{ fontFamily: NUNITO, fontWeight: 900, color: VIOLETA_TXT }}
        >
          {/* Mismo caso que el mensaje de la variante papel: iba en crudo y los
              asteriscos se verían literales. En la pill el texto ya es Nunito
              900, así que el énfasis también va por color + subrayado. */}
          {conNegrita(n.subtitulo, {
            color: INDIGO,
            textDecoration: 'underline',
            textDecorationColor: VIOLETA,
            textDecorationThickness: 3,
            textUnderlineOffset: 4,
          })}
        </Recortado>
        <Recortado a={izq.bajada} style={{ fontWeight: 400, color: VIOLETA_TXT, textWrap: 'pretty' }}>
          {conNegrita(n.bajada, { color: VIOLETA })}
        </Recortado>
      </div>
      <div style={columna({ flex: 1, padding: '110px 110px 90px 0', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 })}>
        <Recortado
          a={der.mensaje}
          caja={{
            alignSelf: 'stretch', background: '#FFFFFF', borderRadius: 28, padding: '40px 44px',
            boxShadow: '0 30px 70px rgba(40,60,90,0.14)',
          }}
          style={{ fontWeight: 400, color: VIOLETA_TXT, textWrap: 'pretty' }}
        >
          {conNegrita(n.mensaje, { color: VIOLETA })}
        </Recortado>
        <BotonNoticia n={n} />
        <Logo />
      </div>
    </div>
  )
}

function SlideActualizacion({ n }: { n: Noticia }) {
  const ANCHO = 730
  const filas = filasKicker(textoKicker(n), '', { ancho: ANCHO })
  const izq = ajustarColumna([
    { clave: 'bajada', texto: n.bajada, ancho: ANCHO, tamanos: escalones(44), lineHeight: 1.3 },
    ...(n.subtitulo.trim() ? [{ clave: 'subtitulo', texto: n.subtitulo, ancho: ANCHO, tamanos: escalones(32), lineHeight: 1.3 }] : []),
  ], { alto: 710 - COLCHON, gap: 28, fijos: [altoKicker(filas), ALTO_LINEA] })
  const der = ajusteDerecha(n.mensaje, { ancho: 610, alto: 700, gap: 28, base: 32, lineHeight: 1.35 })
  return (
    <div style={{ ...slideBase, background: `#cfe4f0 url(/novedades/bg-gradient.webp) center/cover no-repeat` }}>
      <ArcosClaros />
      <div style={columna({ flex: 'none', width: 880, padding: '100px 40px 90px 110px', alignItems: 'flex-start', justifyContent: 'space-between', gap: 28 })}>
        <KickerRow n={n} asideColor={VIOLETA} sinAside filas={filas} />
        <Recortado a={izq.bajada} style={{ fontWeight: 400, color: VIOLETA_TXT, textWrap: 'pretty' }}>
          {conNegrita(n.bajada, { fontFamily: NUNITO, fontWeight: 900, color: VIOLETA })}
        </Recortado>
        <Linea color={NARANJA} />
        <Recortado a={izq.subtitulo} style={{ fontWeight: 400, color: VIOLETA_TXT, textWrap: 'pretty' }}>
          {conNegrita(n.subtitulo, { color: VIOLETA })}
        </Recortado>
      </div>
      <div style={columna({ flex: 1, padding: '110px 110px 90px 0', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 })}>
        <Recortado a={der.mensaje} style={{ fontWeight: 400, color: VIOLETA_TXT, textAlign: 'center', textWrap: 'pretty' }}>
          {conNegrita(n.mensaje, { color: VIOLETA })}
        </Recortado>
        <BotonNoticia n={n} />
        <Logo />
      </div>
    </div>
  )
}

function SlidePapel({ n }: { n: Noticia }) {
  const ANCHO = 570
  const filas = filasKicker(textoKicker(n), alLadoDelKicker(n), { ancho: ANCHO })
  const izq = ajustarColumna([
    { clave: 'titulo', texto: tituloMedible(n.titulo), ancho: ANCHO, tamanos: escalones(78), lineHeight: 0.98, factor: ANCHO_CARACTER.titulo },
    ...(n.bajada.trim() ? [{ clave: 'bajada', texto: n.bajada, ancho: ANCHO, tamanos: escalones(34), lineHeight: 1.3 }] : []),
  ], { alto: 720 - COLCHON, gap: 32, fijos: [altoKicker(filas), ALTO_LINEA] })
  const der = ajusteDerecha(n.mensaje, { ancho: 640 - 88, alto: 720, gap: 28, base: 46, lineHeight: 1.12, factor: ANCHO_CARACTER.titulo, extra: 80 })
  return (
    <div style={{ ...slideBase, background: `#f4f6f8 url(/novedades/bg-paper.webp) center/cover no-repeat` }}>
      <div style={columna({ flex: 'none', width: 760, background: `linear-gradient(160deg, ${VIOLETA} 0%, ${VIOLETA_TXT} 60%, ${INDIGO} 100%)`, padding: '90px 80px 90px 110px', alignItems: 'flex-start', justifyContent: 'center', gap: 32 })}>
        <KickerRow n={n} asideColor={CELESTE} filas={filas} />
        <Titulo titulo={n.titulo} color="#FFFFFF" acento={CELESTE} a={izq.titulo} />
        <Linea color={CELESTE} />
        <Recortado a={izq.bajada} style={{ fontWeight: 400, color: PASTEL, textWrap: 'pretty' }}>
          {conNegrita(n.bajada, { color: '#FFFFFF' })}
        </Recortado>
      </div>
      <div style={columna({ flex: 1, padding: '90px 100px', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 })}>
        <Recortado
          a={der.mensaje}
          caja={{
            alignSelf: 'stretch', background: '#FFFFFF', borderRadius: 28, padding: '40px 44px',
            boxShadow: '0 30px 70px rgba(40,60,90,0.12)',
          }}
          style={{ fontFamily: NUNITO, fontWeight: 900, color: VIOLETA, textWrap: 'pretty' }}
        >
          {/* Iba en crudo: una nota "papel" con **negritas** mostraba los
              asteriscos en la web pública. El énfasis acá NO puede ser ni más
              peso ni el violeta (el texto base ya es Nunito 900 violeta) ni el
              naranja (reservado para la pill del aviso): se marca con el
              subrayado celeste, el mismo recurso que la línea de la portada. */}
          {conNegrita(n.mensaje, {
            color: INDIGO,
            textDecoration: 'underline',
            textDecorationColor: CELESTE,
            textDecorationThickness: 5,
            textUnderlineOffset: 6,
          })}
        </Recortado>
        <BotonNoticia n={n} />
        <Logo />
      </div>
    </div>
  )
}

function Slide({ n }: { n: Noticia }) {
  switch (estiloSlide(n)) {
    case 'violeta': return <SlideVioleta n={n} />
    case 'actualizacion': return <SlideActualizacion n={n} />
    case 'papel': return <SlidePapel n={n} />
    default: return <SlideCeleste n={n} />
  }
}

// ── El carrusel ──────────────────────────────────────────────────────────

const UMBRAL_DRAG = 120   // px de diseño para pasar de slide

export default function NovedadesCarrusel({ noticias }: { noticias: Noticia[] }) {
  const [i, setI] = useState(0)
  const [dragX, setDragX] = useState(0)          // en px de diseño
  const [dragging, setDragging] = useState(false)
  const [k, setK] = useState(0)                  // escala = ancho real / 1600
  const cajaRef = useRef<HTMLDivElement>(null)
  const marcoRef = useRef<HTMLDivElement>(null)
  const x0 = useRef(0)
  const N = noticias.length

  // La escala sale del ancho disponible Y del alto que queda libre en pantalla:
  // así la tarjeta entra entera cuando el imán de scroll frena en la sección,
  // en vez de cortarse abajo. El alto libre se mide contra la sección real
  // (encabezado arriba, dots abajo), no con un número inventado.
  useEffect(() => {
    const marco = marcoRef.current
    if (!marco) return
    const medir = () => {
      const ancho = marco.clientWidth
      if (!ancho) return
      const seccion = marco.closest('section')
      let porAlto = Infinity
      if (seccion) {
        const rs = seccion.getBoundingClientRect()
        const rm = marco.getBoundingClientRect()
        const arriba = rm.top - rs.top          // encabezado + padding superior
        const abajo = rs.bottom - rm.bottom     // dots + padding inferior
        const libre = window.innerHeight - arriba - abajo
        if (libre > 240) porAlto = libre / H
      } else {
        // Fuera de una sección (el aviso del día lo monta dentro del diálogo):
        // dejamos lugar para el encabezado y los botones del propio diálogo.
        const libre = window.innerHeight * 0.62
        if (libre > 200) porAlto = libre / H
      }
      setK(Math.min(ancho / W, porAlto))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(marco)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [])

  // Si cambia la lista y el índice quedó afuera, volver al principio.
  useEffect(() => { if (i >= N) setI(0) }, [N, i])

  const ir = (d: number) => {
    setI(v => (v + d + N) % N)
    setDragX(0)
  }

  useEffect(() => {
    if (N < 2) return
    const kb = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return
      if (e.key === 'ArrowRight') ir(1)
      if (e.key === 'ArrowLeft') ir(-1)
    }
    window.addEventListener('keydown', kb)
    return () => window.removeEventListener('keydown', kb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N])

  if (N === 0) return null

  // El drag va con listeners en window: sobreviven a re-renders y al
  // pointercancel que dispara Chromium si el arrastre nativo (selección de
  // texto / drag de links) se roba el puntero. El delta sale del evento.
  const down = (e: React.PointerEvent) => {
    if (N < 2) return
    if ((e.target as HTMLElement).closest('a')) return
    e.preventDefault()
    const escala = k > 0 ? k : 1
    x0.current = e.clientX
    setDragging(true)
    setDragX(0)
    const onMove = (ev: PointerEvent) => setDragX((ev.clientX - x0.current) / escala)
    const onFin = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onFin)
      window.removeEventListener('pointercancel', onFin)
      const dx = (ev.clientX - x0.current) / escala
      setDragging(false)
      if (dx < -UMBRAL_DRAG) ir(1)
      else if (dx > UMBRAL_DRAG) ir(-1)
      else setDragX(0)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onFin)
    window.addEventListener('pointercancel', onFin)
  }

  const flechaStyle: CSSProperties = {
    position: 'absolute', top: '50%',
    width: `clamp(44px, ${Math.round(72 * k)}px, 72px)`,
    height: `clamp(44px, ${Math.round(72 * k)}px, 72px)`,
    borderRadius: '50%', background: '#FFFFFF', border: 0, padding: 0,
    boxShadow: '0 12px 30px rgba(38,28,121,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    fontFamily: NUNITO, fontWeight: 900,
    fontSize: `clamp(22px, ${Math.round(34 * k)}px, 34px)`,
    color: VIOLETA, userSelect: 'none', zIndex: 2,
  }

  return (
    <div>
      <div ref={marcoRef} style={{ position: 'relative', width: '100%' }}>
        <div
          ref={cajaRef}
          onPointerDown={down}
          style={{
            width: k > 0 ? Math.round(W * k) : '100%',
            height: k > 0 ? Math.round(H * k) : undefined,
            aspectRatio: k > 0 ? undefined : '16 / 9',
            marginInline: 'auto',
            overflow: 'hidden',
            borderRadius: Math.round(48 * k) || 24,
            boxShadow: '0 50px 110px rgba(38,28,121,0.22)',
            cursor: N > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            touchAction: 'pan-y', userSelect: 'none',
          }}
        >
          {k > 0 && (
            <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
              <div style={{
                display: 'flex',
                transform: `translateX(${-i * W + dragX}px)`,
                transition: dragging ? 'none' : 'transform 480ms cubic-bezier(.22,.61,.36,1)',
              }}>
                {noticias.map(n => <Slide key={n.id} n={n} />)}
              </div>
            </div>
          )}
        </div>
        {N > 1 && (
          <>
            <button type="button" aria-label="Aviso anterior" onClick={() => ir(-1)}
              style={{ ...flechaStyle, left: Math.round(-34 * k), transform: 'translateY(-50%)' }}>‹</button>
            <button type="button" aria-label="Aviso siguiente" onClick={() => ir(1)}
              style={{ ...flechaStyle, right: Math.round(-34 * k), transform: 'translateY(-50%)' }}>›</button>
          </>
        )}
      </div>
      {N > 1 && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 22 }}>
          {noticias.map((n, ix) => (
            <button key={n.id} type="button" aria-label={`Aviso ${ix + 1} de ${N}`}
              onClick={() => { setI(ix); setDragX(0) }}
              style={{
                width: ix === i ? 52 : 14, height: 14, borderRadius: 999, border: 0, padding: 0,
                cursor: 'pointer', background: ix === i ? VIOLETA : 'rgba(73,40,107,0.25)',
                transition: 'all 300ms',
              }} />
          ))}
        </div>
      )}
    </div>
  )
}
