import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  type Noticia, categoriaMeta, estiloSlide, tituloPartes, linkNoticia,
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

// ── Piezas compartidas de los slides ─────────────────────────────────────

const slideBase: CSSProperties = {
  position: 'relative', flex: 'none', width: W, height: H,
  overflow: 'hidden', display: 'flex', fontFamily: MONTSERRAT,
}

function KickerRow({ n, asideColor, asideOpacity, sinAside }: {
  n: Noticia; asideColor: string; asideOpacity?: number; sinAside?: boolean
}) {
  const aside = n.kickerExtra || fmtFecha(n.publicadaAt)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <div style={{
        background: NARANJA, borderRadius: 999, padding: '16px 40px', fontWeight: 600,
        fontSize: 28, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FFFFFF',
      }}>
        {n.kicker || categoriaMeta(n.categoria).label}
      </div>
      {!sinAside && aside && (
        <div style={{
          fontWeight: 600, fontSize: 26, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: asideColor, opacity: asideOpacity,
        }}>
          {aside}
        </div>
      )}
    </div>
  )
}

function Titulo({ titulo, color, acento, size }: { titulo: string; color: string; acento: string; size: number }) {
  const [a, b] = tituloPartes(titulo)
  return (
    <div style={{ fontFamily: NUNITO, fontWeight: 900, fontSize: size, lineHeight: 0.98, letterSpacing: '-0.02em', color }}>
      {a}{b && <><br /><span style={{ color: acento }}>{b}</span></>}
    </div>
  )
}

const Linea = ({ color }: { color: string }) => (
  <div style={{ width: 310, height: 8, background: color }} />
)

function BotonNoticia({ n, claro }: { n: Noticia; claro?: boolean }) {
  const { href, externo } = linkNoticia(n)
  return (
    <a
      href={href}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      style={{
        background: claro ? PASTEL : VIOLETA, borderRadius: 999, padding: '24px 52px',
        fontWeight: 600, fontSize: 30, color: claro ? VIOLETA_TXT : '#FFFFFF',
        display: 'flex', alignItems: 'center', gap: 18, textDecoration: 'none',
      }}
    >
      Ir a la noticia <span style={{ fontFamily: NUNITO, fontWeight: 900 }}>→</span>
    </a>
  )
}

const Logo = ({ blanco }: { blanco?: boolean }) => (
  <img
    src={blanco ? '/novedades/logo-blanco.png' : '/novedades/logo-violeta.png'}
    alt="Mediterranea Carghas" style={{ width: 290 }} draggable={false}
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

// ── Variantes de slide ───────────────────────────────────────────────────

function SlideVioleta({ n }: { n: Noticia }) {
  return (
    <div style={{ ...slideBase, background: `linear-gradient(160deg, ${VIOLETA} 0%, ${VIOLETA_TXT} 55%, ${INDIGO} 100%)` }}>
      <div style={{ position: 'absolute', top: -300, right: -300, width: 460, height: 460, borderRadius: '50%', background: 'rgba(155,209,229,0.18)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -330, right: -330, width: 560, height: 560, borderRadius: '50%', border: '26px solid rgba(155,209,229,0.35)', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -300, left: -300, width: 440, height: 440, borderRadius: '50%', border: '22px solid rgba(206,255,255,0.25)', boxSizing: 'border-box', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 'none', width: 940, padding: '90px 40px 90px 110px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 30 }}>
        <KickerRow n={n} asideColor={CELESTE} />
        <Titulo titulo={n.titulo} color="#FFFFFF" acento={CELESTE} size={86} />
        <Linea color={NARANJA} />
        {n.bajada && (
          <div style={{ fontWeight: 400, fontSize: 38, lineHeight: 1.3, color: PASTEL, textWrap: 'pretty' }}>{conNegrita(n.bajada, { color: '#FFFFFF' })}</div>
        )}
      </div>
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 1, padding: '100px 110px 90px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 30 }}>
        {n.mensaje && (
          <div style={{ fontWeight: 300, fontSize: 33, lineHeight: 1.35, color: '#FFFFFF', opacity: 0.92, textAlign: 'center', textWrap: 'pretty' }}>
            {conNegrita(n.mensaje, { fontWeight: 600 })}
          </div>
        )}
        <BotonNoticia n={n} claro />
        <Logo blanco />
      </div>
    </div>
  )
}

function SlideCeleste({ n }: { n: Noticia }) {
  return (
    <div style={{ ...slideBase, background: `#cfe4f0 url(/novedades/bg-gradient.webp) center/cover no-repeat` }}>
      <ArcosClaros />
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 'none', width: 900, padding: '90px 40px 90px 110px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 26 }}>
        <KickerRow n={n} asideColor={VIOLETA} asideOpacity={0.7} />
        <Titulo titulo={n.titulo} color={VIOLETA} acento={VIOLETA} size={84} />
        {n.subtitulo && (
          <div style={{ background: PASTEL, borderRadius: 999, padding: '16px 40px', fontFamily: NUNITO, fontWeight: 900, fontSize: 34, color: VIOLETA_TXT }}>
            {n.subtitulo}
          </div>
        )}
        {n.bajada && (
          <div style={{ fontWeight: 400, fontSize: 32, lineHeight: 1.3, color: VIOLETA_TXT, textWrap: 'pretty' }}>{conNegrita(n.bajada, { color: VIOLETA })}</div>
        )}
      </div>
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 1, padding: '110px 110px 90px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 }}>
        {n.mensaje && (
          <div style={{ alignSelf: 'stretch', background: '#FFFFFF', borderRadius: 28, padding: '40px 44px', boxShadow: '0 30px 70px rgba(40,60,90,0.14)', fontWeight: 400, fontSize: 32, lineHeight: 1.3, color: VIOLETA_TXT, textWrap: 'pretty' }}>
            {conNegrita(n.mensaje, { color: VIOLETA })}
          </div>
        )}
        <BotonNoticia n={n} />
        <Logo />
      </div>
    </div>
  )
}

function SlideActualizacion({ n }: { n: Noticia }) {
  return (
    <div style={{ ...slideBase, background: `#cfe4f0 url(/novedades/bg-gradient.webp) center/cover no-repeat` }}>
      <ArcosClaros />
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 'none', width: 880, padding: '100px 40px 90px 110px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', gap: 28 }}>
        <KickerRow n={n} asideColor={VIOLETA} sinAside />
        <div style={{ fontWeight: 400, fontSize: 44, lineHeight: 1.3, color: VIOLETA_TXT, textWrap: 'pretty' }}>
          {conNegrita(n.bajada, { fontFamily: NUNITO, fontWeight: 900, color: VIOLETA })}
        </div>
        <Linea color={NARANJA} />
        {n.subtitulo && (
          <div style={{ fontWeight: 400, fontSize: 32, lineHeight: 1.3, color: VIOLETA_TXT, textWrap: 'pretty' }}>
            {conNegrita(n.subtitulo, { color: VIOLETA })}
          </div>
        )}
      </div>
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 1, padding: '110px 110px 90px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 }}>
        {n.mensaje && (
          <div style={{ fontWeight: 400, fontSize: 32, lineHeight: 1.35, color: VIOLETA_TXT, textAlign: 'center', textWrap: 'pretty' }}>
            {conNegrita(n.mensaje, { color: VIOLETA })}
          </div>
        )}
        <BotonNoticia n={n} />
        <Logo />
      </div>
    </div>
  )
}

function SlidePapel({ n }: { n: Noticia }) {
  return (
    <div style={{ ...slideBase, background: `#f4f6f8 url(/novedades/bg-paper.webp) center/cover no-repeat` }}>
      <div style={{ boxSizing: 'border-box', flex: 'none', width: 760, background: `linear-gradient(160deg, ${VIOLETA} 0%, ${VIOLETA_TXT} 60%, ${INDIGO} 100%)`, padding: '90px 80px 90px 110px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 32 }}>
        <KickerRow n={n} asideColor={CELESTE} />
        <Titulo titulo={n.titulo} color="#FFFFFF" acento={CELESTE} size={78} />
        <Linea color={CELESTE} />
        {n.bajada && (
          <div style={{ fontWeight: 400, fontSize: 34, lineHeight: 1.3, color: PASTEL, textWrap: 'pretty' }}>{conNegrita(n.bajada, { color: '#FFFFFF' })}</div>
        )}
      </div>
      <div style={{ position: 'relative', boxSizing: 'border-box', flex: 1, padding: '90px 100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: n.mensaje ? 'space-between' : 'center', gap: 28 }}>
        {n.mensaje && (
          <div style={{ alignSelf: 'stretch', background: '#FFFFFF', borderRadius: 28, padding: '40px 44px', boxShadow: '0 30px 70px rgba(40,60,90,0.12)', fontFamily: NUNITO, fontWeight: 900, fontSize: 46, lineHeight: 1.12, color: VIOLETA, textWrap: 'pretty' }}>
            {n.mensaje}
          </div>
        )}
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
  const x0 = useRef(0)
  const N = noticias.length

  useEffect(() => {
    const el = cajaRef.current
    if (!el) return
    const medir = () => setK(el.clientWidth / W)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
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
      <div style={{ position: 'relative' }}>
        <div
          ref={cajaRef}
          onPointerDown={down}
          style={{
            width: '100%', aspectRatio: '16 / 9', overflow: 'hidden',
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
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 36 }}>
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
