import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, ArrowLeft, Newspaper, ArrowSquareOut } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import {
  type Noticia, rowToNoticia, noticiasVigentes, alertasVigentes, ordenSlides, NOTICIAS_REFRESCO_MS,
  alertaYaVista, marcarAlertaVista, categoriaMeta, tituloPlano, linkNoticia,
} from '@/lib/noticias'
import NovedadesCarrusel, { conNegrita } from '@/components/NovedadesCarrusel'

// ── Diario logístico (Brian 28/08) ───────────────────────────────────
// Alerta 1×/día + carrusel de avisos en la landing + página /novedades.
// El carrusel usa la plantilla de marca (NovedadesCarrusel); el resto sigue
// la estética de la landing (índigo #261c79, violeta #49286b, #fbfbfe).
// Si no hay noticias vigentes, NADA se muestra: la web nunca se ve vieja.

const hoyISO = () => new Date().toISOString().slice(0, 10)

export function useNoticias(): { noticias: Noticia[]; cargado: boolean } {
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    let vivo = true
    const traer = () => {
      fetch('/api/noticias')
        .then(r => (r.ok ? r.json() : null))
        // Si el pedido falla se conserva lo que ya había: mejor un Diario de
        // hace 5 minutos que un panel que parpadea vacío.
        .then(d => { if (vivo && d) setNoticias((d.noticias || []).map(rowToNoticia)) })
        .catch(() => { /* se mantiene lo anterior */ })
        .finally(() => { if (vivo) setCargado(true) })
    }
    traer()
    // Los portales quedan abiertos horas en el depósito o en el transporte:
    // se vuelve a pedir el Diario cada tanto y al volver a la pestaña, así lo
    // que se publica aparece sin recargar (Brian 03/09: "dejalo conectado").
    const timer = window.setInterval(traer, NOTICIAS_REFRESCO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') traer() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])
  return { noticias, cargado }
}

const fmtFecha = (iso: string): string => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Fondo de la viñeta por categoría — también sirve de banda lisa cuando la
 *  franja es demasiado apaisada para meter el dibujo. */
const colorVineta = (c: string): string =>
  c === 'paros' ? '#49286b' : c === 'fletes' ? '#352e6a' : '#261c79'

/** Ilustración de respaldo por categoría — si la nota no tiene foto, nunca
 *  queda pelada. Paleta de la landing. */
function VinetaCategoria({ categoria, className }: { categoria: string; className?: string }) {
  const c = categoria
  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="120" height="120" fill={colorVineta(c)} />
      {c === 'tifones' && (
        <g stroke="#9bd1e5" fill="none" strokeWidth="3.4" strokeLinecap="round" opacity=".92">
          <path d="M 62 56 a 22 22 0 1 1 22 22" />
          <path d="M 62 56 a 12 12 0 1 0 12 -12" opacity=".65" />
          <path d="M14 96 q 13 -7 26 0 t 26 0 t 26 0 t 26 0" strokeWidth="2.6" opacity=".7" />
        </g>
      )}
      {c === 'feriados' && (
        <g>
          <rect x="26" y="30" width="68" height="62" rx="7" fill="#fff" opacity=".95" />
          <rect x="26" y="30" width="68" height="19" rx="7" fill="#9bd1e5" />
          <text x="60" y="74" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#261c79" fontFamily="inherit">1–7</text>
          <text x="60" y="86" textAnchor="middle" fontSize="8.5" fontWeight="bold" fill="#49286b" fontFamily="inherit">OCTUBRE</text>
        </g>
      )}
      {c === 'fletes' && (
        <g stroke="#9bd1e5" fill="none" strokeWidth="4" strokeLinecap="round" opacity=".95">
          <path d="M22 90 L48 62 L66 74 L98 36" />
          <path d="M82 36 h16 v16" />
        </g>
      )}
      {c === 'paros' && (
        <g fill="#9bd1e5" opacity=".95">
          <path d="M34 72 l40 -19 v30 l-40 -19 z" />
          <rect x="72" y="48" width="9" height="27" rx="3" />
          <g stroke="#9bd1e5" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M88 40 l8 -7 M92 51 l11 -3 M83 32 l4 -9" />
          </g>
        </g>
      )}
      {(c === 'general' || !['tifones', 'feriados', 'fletes', 'paros'].includes(c)) && (
        <g fill="none" stroke="#9bd1e5" strokeWidth="3.4" strokeLinecap="round" opacity=".95">
          <circle cx="60" cy="60" r="28" />
          <path d="M32 60 h56 M60 32 v56" />
          <path d="M40 44 q 20 14 40 0 M40 76 q 20 -14 40 0" strokeWidth="2.4" />
        </g>
      )}
    </svg>
  )
}

/** Imagen de una nota: la foto cargada o la viñeta de su categoría. */
function ImagenNota({ n, className }: { n: Noticia; className?: string }) {
  if (n.imagenUrl) {
    return <img src={n.imagenUrl} alt="" loading="lazy" className={`${className || ''} object-cover`} />
  }
  return <VinetaCategoria categoria={n.categoria} className={className} />
}

function Kicker({ categoria, claro }: { categoria: string; claro?: boolean }) {
  const meta = categoriaMeta(categoria)
  return (
    <span className={`inline-block text-[12px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded ${claro ? 'bg-white/90 text-[#261c79]' : meta.chip}`}>
      {meta.label}
    </span>
  )
}

// ── Aviso del día al abrir la web: 1 vez por día por navegador ──────────
// Muestra el Diario completo en las mismas tarjetas de la portada, para
// deslizar entre los avisos vigentes. Lo que dispara la aparición sigue
// siendo que haya al menos un aviso marcado como alerta: si no, no
// interrumpe a nadie.
export function NovedadAlertaModal({ noticias }: { noticias: Noticia[] }) {
  const [abierta, setAbierta] = useState(false)
  const alertas = useMemo(() => alertasVigentes(noticias, hoyISO()), [noticias])
  const vigentes = useMemo(() => noticiasVigentes(noticias, hoyISO()), [noticias])
  const slides = useMemo(() => ordenSlides(vigentes), [vigentes])

  useEffect(() => {
    if (alertas.length > 0 && !alertaYaVista(hoyISO(), alertas)) setAbierta(true)
  }, [alertas])

  const cerrar = () => {
    marcarAlertaVista(hoyISO(), alertas)
    setAbierta(false)
  }
  if (alertas.length === 0 || slides.length === 0) return null

  return (
    <Dialog open={abierta} onOpenChange={o => { if (!o) cerrar() }}>
      <DialogContent
        className="p-0 overflow-hidden border-0 gap-0 sm:max-w-[880px]"
        style={{ borderRadius: 28, boxShadow: '0 60px 130px rgba(20,12,60,0.5)' }}
      >
        <DialogTitle className="sr-only">Diario logístico — avisos del día</DialogTitle>

        <div className="flex items-center justify-between gap-4 px-6 sm:px-8 pt-6 pb-4">
          <span className="rounded-full uppercase" style={{ background: '#ceffff', border: '2px solid #9bd1e5', color: '#352e6a', padding: '6px 18px', fontWeight: 600, fontSize: 12, letterSpacing: '0.08em' }}>
            Diario logístico
          </span>
          <span className="hidden sm:block" style={{ color: '#9a96b8', fontWeight: 500, fontSize: 12 }}>
            {slides.length === 1 ? '1 aviso vigente' : `${slides.length} avisos vigentes · deslizá para verlos`}
          </span>
        </div>

        {/* En pantalla grande, las tarjetas del Diario para deslizar. */}
        <div className="hidden sm:block px-8">
          <NovedadesCarrusel noticias={slides} />
        </div>

        {/* En el celular la tarjeta 16:9 quedaría ilegible: ahí va el aviso
            principal en formato lectura, con el resto a un toque de distancia. */}
        <div className="sm:hidden px-6">
          <div className="rounded-[20px] border-2 border-[#eef0f8] overflow-hidden">
            <div className="degradado-med px-5 py-4">
              <span className="inline-block rounded-full text-white uppercase" style={{ background: '#e8863b', padding: '6px 16px', fontWeight: 600, fontSize: 11, letterSpacing: '0.08em' }}>
                {slides[0].kicker || categoriaMeta(slides[0].categoria).label}
              </span>
            </div>{/* único naranja de la ficha: el que marca el aviso */}
            <div className="px-5 py-4">
              <h3 className="titulo-med text-xl text-[#49286b]">{tituloPlano(slides[0].titulo)}</h3>
              <div className="mt-2.5 mb-3" style={{ width: 100, height: 4, background: '#e8863b' }} />
              {slides[0].bajada && (
                <p className="text-[15px] leading-relaxed text-[#352e6a]">{conNegrita(slides[0].bajada, { color: '#49286b' })}</p>
              )}
              {slides.length > 1 && (
                <a href="/novedades" className="mt-3 inline-block rounded-full" style={{ background: '#ceffff', border: '2px solid #9bd1e5', padding: '7px 16px', fontWeight: 600, fontSize: 13, color: '#352e6a' }}>
                  + {slides.length - 1} aviso{slides.length > 2 ? 's' : ''} más en el Diario
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-[18px] px-6 sm:px-8 pt-5 pb-6">
          <button
            onClick={cerrar}
            className="rounded-full text-white transition-colors"
            style={{ background: '#49286b', padding: '14px 32px', fontWeight: 600, fontSize: 15 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#261c79' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#49286b' }}
          >
            Entendido
          </button>
          <a href="/novedades" className="inline-flex items-center gap-2 whitespace-nowrap" style={{ fontWeight: 600, fontSize: 15, color: '#49286b' }}>
            Ver el Diario <ArrowRight size={15} weight="bold" />
          </a>
          <span className="ml-auto hidden sm:inline" style={{ fontWeight: 500, fontSize: 12, color: '#9a96b8' }}>1 aviso por día</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Sección para la landing: el carrusel de avisos ───────────────────────
export default function NovedadesSection() {
  const { noticias } = useNoticias()
  const vigentes = useMemo(() => noticiasVigentes(noticias, hoyISO()), [noticias])
  if (vigentes.length === 0) return <NovedadAlertaModal noticias={noticias} />

  const slides = ordenSlides(vigentes)

  return (
    <>
      <NovedadAlertaModal noticias={noticias} />
      <section id="novedades" className="papel-med py-12 lg:py-16 overflow-x-clip">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[#49286b] font-semibold text-sm tracking-widest uppercase">Diario logístico</p>
              <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight text-[#261c79]">Lo que está pasando en la ruta.</h2>
              <p className="mt-4 text-[#5b5780] text-lg lg:text-xl">Tifones, feriados en Asia, fletes y paros: te avisamos antes de que afecte tu carga.</p>
            </div>
            <a href="/novedades" className="inline-flex items-center gap-1.5 text-[#49286b] font-semibold text-sm">
              Ver todas <ArrowRight size={15} weight="bold" />
            </a>
          </div>

          <div className="mt-7 lg:mt-9">
            <NovedadesCarrusel noticias={slides} />
          </div>
        </div>
      </section>
    </>
  )
}

// ── Página /novedades: el archivo completo ───────────────────────────────
export function NovedadesPage() {
  const brand = useBrand()
  const { noticias, cargado } = useNoticias()
  const vigentes = useMemo(() => noticiasVigentes(noticias, hoyISO()), [noticias])
  const [abierta, setAbierta] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>('todas')

  // Filtro por categoría: solo se ofrecen las que tienen notas vigentes.
  const categoriasConNotas = useMemo(() => {
    const conteo = new Map<string, number>()
    for (const n of vigentes) conteo.set(n.categoria, (conteo.get(n.categoria) || 0) + 1)
    return [...conteo.entries()]
  }, [vigentes])
  const visibles = filtro === 'todas' ? vigentes : vigentes.filter(n => n.categoria === filtro)

  // Tarjeta de categoría a la izquierda de cada aviso (handoff D3).
  const tarjetaCat = (c: string): string => {
    if (c === 'paros') return '#49286b'
    if (c === 'feriados') return '#ceffff'
    if (c === 'tifones') return '#e8863b'
    if (c === 'fletes') return '#352e6a'
    return '#e8e4f4'
  }

  const chipFiltro = (activo: boolean) =>
    `rounded-full px-5 py-2.5 text-[15px] font-semibold transition-colors ${activo
      ? 'bg-[#49286b] text-white'
      : 'bg-white border border-[#e5e4f1] text-[#6b6688] hover:border-[#9bd1e5]'}`

  return (
    <div className="min-h-screen bg-[#fbfbfe]">
      <header className="degradado-med">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 py-4 flex items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 text-white/85 text-sm font-medium hover:text-white transition-colors">
            <ArrowLeft size={16} weight="bold" /> {brand.name}
          </a>
          <span className="ml-auto inline-flex items-center gap-2 text-[#9bd1e5] text-sm font-semibold">
            <Newspaper size={17} weight="duotone" /> Diario logístico
          </span>
        </div>
      </header>

      {/* Hero de papel con los arcos de la marca */}
      <div className="papel-med relative overflow-hidden border-b border-[#eef0f8]">
        <div className="absolute -top-40 -right-40 w-72 h-72 rounded-full bg-[#49286b] pointer-events-none" aria-hidden />
        <div className="absolute -top-48 -right-48 w-[360px] h-[360px] rounded-full border-[18px] border-[#9bd1e5]/60 box-border pointer-events-none" aria-hidden />
        <div className="relative max-w-5xl mx-auto px-5 lg:px-8 py-10 lg:py-14">
          <span className="inline-block rounded-full bg-[#ceffff] border-2 border-[#9bd1e5] px-4 py-1.5 text-[12px] font-semibold tracking-widest uppercase text-[#352e6a]">
            Diario logístico
          </span>
          <h1 className="titulo-med mt-4 text-3xl lg:text-5xl text-[#49286b]">Avisos y noticias de la ruta</h1>
          <div className="mt-4 w-[180px] h-1.5 bg-[#49286b]" />
          <p className="mt-4 text-[#5b5780] text-lg lg:text-xl leading-relaxed max-w-2xl">Tifones, feriados en Asia, fletes, paros y todo lo que puede afectar tu carga — publicado por nuestro equipo operativo.</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-8 lg:py-10">
        {vigentes.length > 0 && (
          <div className="flex flex-wrap gap-2.5 mb-7">
            <button type="button" onClick={() => setFiltro('todas')} className={chipFiltro(filtro === 'todas')}>
              Todas · {vigentes.length}
            </button>
            {categoriasConNotas.map(([c]) => (
              <button key={c} type="button" onClick={() => setFiltro(f => (f === c ? 'todas' : c))} className={chipFiltro(filtro === c)}>
                {categoriaMeta(c).label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-5">
          {cargado && vigentes.length === 0 && (
            <div className="rounded-[20px] border-2 border-[#eef0f8] bg-white p-8 text-center text-[#6b6688]">
              Sin novedades vigentes por el momento — buena señal: la ruta está tranquila.
            </div>
          )}
          {visibles.map(n => (
            <article key={n.id} className="rounded-[20px] border-2 border-[#eef0f8] bg-white overflow-hidden">
              <button type="button" onClick={() => setAbierta(prev => (prev === n.id ? null : n.id))} className="w-full text-left flex items-stretch">
                <div className="w-[110px] lg:w-[150px] shrink-0 relative overflow-hidden hidden sm:flex items-center justify-center" style={{ background: tarjetaCat(n.categoria) }}>
                  {n.imagenUrl
                    ? <img src={n.imagenUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    : n.categoria === 'paros'
                      ? <img src="/images/med-emblem-white.svg" alt="" className="w-14 opacity-90" />
                      : <VinetaCategoria categoria={n.categoria} className="absolute inset-0 w-full h-full" />}
                </div>
                <div className="min-w-0 flex-1 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Kicker categoria={n.categoria} />
                    <span className="text-[13px] text-[#6b6688]">{fmtFecha(n.publicadaAt)}{n.vigenteHasta ? ` · vigente hasta ${fmtFecha(n.vigenteHasta)}` : ''}</span>
                  </div>
                  <h2 className="titulo-med mt-2 text-xl lg:text-[28px] text-[#352e6a]">{tituloPlano(n.titulo)}</h2>
                  {n.bajada && <p className="mt-2 text-base lg:text-lg leading-relaxed text-[#5b5780]">{conNegrita(n.bajada)}</p>}
                  {(n.cuerpo || linkNoticia(n).externo) && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#49286b]">
                      {abierta === n.id ? 'Cerrar' : 'Leer más'} <ArrowRight size={14} weight="bold" />
                    </p>
                  )}
                </div>
              </button>
              {abierta === n.id && (n.cuerpo || linkNoticia(n).externo) && (
                <div className="px-5 pb-6 sm:pl-[130px] lg:pl-[170px] text-base lg:text-[17px] text-[#3d3a5c] leading-relaxed">
                  {n.cuerpo && <p className="whitespace-pre-line">{conNegrita(n.cuerpo)}</p>}
                  {linkNoticia(n).externo && (
                    <a href={linkNoticia(n).href} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[#49286b]">
                      Ver la nota original <ArrowSquareOut size={14} weight="bold" />
                    </a>
                  )}
                </div>
              )}
            </article>
          ))}
          {cargado && vigentes.length > 0 && visibles.length === 0 && (
            <div className="rounded-[20px] border-2 border-[#eef0f8] bg-white p-8 text-center text-[#6b6688]">
              Sin avisos vigentes en esa categoría.
            </div>
          )}
        </div>
      </main>

      <footer className="py-8 text-center text-xs text-[#6b6688]">
        {brand.name} — información operativa de referencia, sujeta a cambios de navieras y autoridades.
      </footer>
    </div>
  )
}
