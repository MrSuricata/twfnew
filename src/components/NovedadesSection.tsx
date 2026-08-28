import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ArrowRight, ArrowLeft, Newspaper, ArrowSquareOut } from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import {
  type Noticia, rowToNoticia, noticiasVigentes, alertasVigentes,
  alertaYaVista, marcarAlertaVista, categoriaMeta, tituloPlano, linkNoticia,
} from '@/lib/noticias'
import NovedadesCarrusel, { conNegrita } from '@/components/NovedadesCarrusel'

// ── Novedades logísticas (Brian 28/08) ───────────────────────────────────
// Alerta 1×/día + carrusel de avisos en la landing + página /novedades.
// El carrusel usa la plantilla de marca (NovedadesCarrusel); el resto sigue
// la estética de la landing (índigo #261c79, violeta #49286b, #fbfbfe).
// Si no hay noticias vigentes, NADA se muestra: la web nunca se ve vieja.

const hoyISO = () => new Date().toISOString().slice(0, 10)

function useNoticias(): { noticias: Noticia[]; cargado: boolean } {
  const [noticias, setNoticias] = useState<Noticia[]>([])
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch('/api/noticias')
      .then(r => (r.ok ? r.json() : { noticias: [] }))
      .then(d => { if (vivo) setNoticias((d.noticias || []).map(rowToNoticia)) })
      .catch(() => { /* sección vacía y listo */ })
      .finally(() => { if (vivo) setCargado(true) })
    return () => { vivo = false }
  }, [])
  return { noticias, cargado }
}

const fmtFecha = (iso: string): string => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Ilustración de respaldo por categoría — si la nota no tiene foto, nunca
 *  queda pelada. Paleta de la landing. */
function VinetaCategoria({ categoria, className }: { categoria: string; className?: string }) {
  const c = categoria
  return (
    <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <rect width="120" height="120" fill={c === 'tifones' ? '#261c79' : c === 'paros' ? '#49286b' : c === 'fletes' ? '#352e6a' : '#261c79'} />
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
    <span className={`inline-block text-[11px] font-semibold tracking-widest uppercase px-2 py-0.5 rounded ${claro ? 'bg-white/90 text-[#261c79]' : meta.chip}`}>
      {meta.label}
    </span>
  )
}

// ── Alerta al abrir la web: 1 vez por día por navegador ──────────────────
export function NovedadAlertaModal({ noticias }: { noticias: Noticia[] }) {
  const [abierta, setAbierta] = useState(false)
  const alertas = useMemo(() => alertasVigentes(noticias, hoyISO()), [noticias])

  useEffect(() => {
    if (alertas.length > 0 && !alertaYaVista(hoyISO(), alertas)) setAbierta(true)
  }, [alertas])

  const cerrar = () => {
    marcarAlertaVista(hoyISO(), alertas)
    setAbierta(false)
  }
  if (alertas.length === 0) return null
  const a = alertas[0]

  return (
    <Dialog open={abierta} onOpenChange={o => { if (!o) cerrar() }}>
      <DialogContent className="p-0 overflow-hidden max-w-md border-0">
        <DialogTitle className="sr-only">{tituloPlano(a.titulo)}</DialogTitle>
        <div className="relative h-24">
          <ImagenNota n={a} className="w-full h-full" />
          <span className="absolute top-3 left-4"><Kicker categoria={a.categoria} claro /></span>
          <span className="absolute top-3.5 right-4 text-[11px] text-white/90">{fmtFecha(a.publicadaAt)}</span>
        </div>
        <div className="px-5 pt-4 pb-5">
          <h3 className="text-lg font-bold leading-snug text-[#261c79]">{tituloPlano(a.titulo)}</h3>
          {a.bajada && <p className="mt-2 text-sm text-[#5b5780]">{conNegrita(a.bajada)}</p>}
          {alertas.length > 1 && (
            <p className="mt-2 text-xs font-medium text-[#49286b]">+ {alertas.length - 1} aviso{alertas.length > 2 ? 's' : ''} más en Novedades</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={cerrar} className="rounded-lg bg-[#261c79] px-5 py-2 text-sm font-semibold text-white hover:bg-[#352e6a] transition-colors">
              Entendido
            </button>
            <a href="/novedades" className="text-sm font-semibold text-[#49286b] inline-flex items-center gap-1">
              Ver novedades <ArrowRight size={14} weight="bold" />
            </a>
            <span className="ml-auto text-[10px] text-[#6b6688]">1 aviso por día</span>
          </div>
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

  // Los 6 avisos más recientes, en orden cronológico (el más viejo abre).
  const slides = vigentes.slice(0, 6).reverse()

  return (
    <>
      <NovedadAlertaModal noticias={noticias} />
      <section id="novedades" className="py-20 lg:py-28 bg-white overflow-x-clip">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[#49286b] font-semibold text-sm tracking-widest uppercase">Novedades logísticas</p>
              <h2 className="mt-3 text-3xl lg:text-5xl font-bold tracking-tight text-[#261c79]">Lo que está pasando en la ruta.</h2>
              <p className="mt-4 text-[#5b5780] text-lg">Tifones, feriados en Asia, fletes y paros: te avisamos antes de que afecte tu carga.</p>
            </div>
            <a href="/novedades" className="inline-flex items-center gap-1.5 text-[#49286b] font-semibold text-sm">
              Ver todas <ArrowRight size={15} weight="bold" />
            </a>
          </div>

          <div className="mt-12 lg:mt-14">
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

  return (
    <div className="min-h-screen bg-[#fbfbfe]">
      <header className="bg-[#261c79]">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 py-4 flex items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 text-white/85 text-sm font-medium hover:text-white transition-colors">
            <ArrowLeft size={16} weight="bold" /> {brand.name}
          </a>
          <span className="ml-auto inline-flex items-center gap-2 text-[#9bd1e5] text-sm font-semibold">
            <Newspaper size={17} weight="duotone" /> Novedades logísticas
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-10 lg:py-14">
        <p className="text-[#49286b] font-semibold text-sm tracking-widest uppercase">Novedades logísticas</p>
        <h1 className="mt-2 text-3xl lg:text-4xl font-bold tracking-tight text-[#261c79]">Avisos y noticias de la ruta</h1>
        <p className="mt-3 text-[#5b5780]">Tifones, feriados en Asia, fletes, paros y todo lo que puede afectar tu carga — publicado por nuestro equipo operativo.</p>

        <div className="mt-8 space-y-5">
          {cargado && vigentes.length === 0 && (
            <div className="rounded-2xl border border-[#e5e4f1] bg-white p-8 text-center text-[#6b6688]">
              Sin novedades vigentes por el momento — buena señal: la ruta está tranquila.
            </div>
          )}
          {vigentes.map(n => (
            <article key={n.id} className="rounded-2xl border border-[#e5e4f1] bg-white overflow-hidden">
              <button type="button" onClick={() => setAbierta(prev => (prev === n.id ? null : n.id))} className="w-full text-left flex gap-5 p-5 items-start">
                <div className="w-[92px] h-[92px] rounded-xl overflow-hidden flex-shrink-0 hidden sm:block">
                  <ImagenNota n={n} className="w-full h-full" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Kicker categoria={n.categoria} />
                    <span className="text-[11px] text-[#6b6688]">{fmtFecha(n.publicadaAt)}{n.vigenteHasta ? ` · vigente hasta ${fmtFecha(n.vigenteHasta)}` : ''}</span>
                  </div>
                  <h2 className="mt-1.5 text-lg lg:text-xl font-bold leading-snug text-[#261c79]">{tituloPlano(n.titulo)}</h2>
                  {n.bajada && <p className="mt-1.5 text-sm text-[#5b5780]">{conNegrita(n.bajada)}</p>}
                  {(n.cuerpo || linkNoticia(n).externo) && (
                    <p className="mt-2 text-xs font-semibold text-[#49286b]">{abierta === n.id ? 'Cerrar' : 'Leer más'}</p>
                  )}
                </div>
              </button>
              {abierta === n.id && (n.cuerpo || linkNoticia(n).externo) && (
                <div className="px-5 pb-5 sm:pl-[132px] text-sm text-[#3d3a5c] leading-relaxed">
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
        </div>
      </main>

      <footer className="py-8 text-center text-xs text-[#6b6688]">
        {brand.name} — información operativa de referencia, sujeta a cambios de navieras y autoridades.
      </footer>
    </div>
  )
}
