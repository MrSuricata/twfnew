import { useState, useEffect, useRef, Fragment } from 'react'
import type { ReactNode } from 'react'
import {
  List,
  X as XIcon,
  Boat,
  Airplane,
  Truck,
  Stack,
  GlobeHemisphereWest,
  ShieldCheck,
  Path,
  Clock,
  Buildings,
  WhatsappLogo,
  EnvelopeSimple,
  ArrowRight,
  ArrowUpRight,
  CaretRight,
  MagnifyingGlass,
  CircleNotch,
  Package,
  MapPin,
  CaretDown,
  SignIn,
} from '@phosphor-icons/react'
import { useBrand } from '@/lib/brand'
import NovedadesSection from './NovedadesSection'
import { processShipmentRecord, getShipmentStatus } from '@/lib/shipmentTypes'
import { voyageProgress, voyageCaption } from '@/lib/trackProgress'
import LoginDialog from './LoginDialog'

// ─── Mediterranea Carghas — landing ───────────────────────────────────
// Identidad propia (casa matriz que unifica todos los modos y destinos):
// gradientes índigo→violeta, tipografía Jost grande, estética editorial,
// animaciones de scroll, logo que se mueve al scrollear y tracking público.
// ──────────────────────────────────────────────────────────────────────

const MODES = [
  { icon: Boat, title: 'Marítimo FCL', desc: 'Contenedor completo puerta a puerta, con trazabilidad de punta a punta.' },
  { icon: Stack, title: 'Marítimo LCL', desc: 'Carga consolidada: pagás solo por el espacio que ocupás.' },
  { icon: Airplane, title: 'Aéreo', desc: 'Cuando el tiempo manda. Urgencias y carga de alto valor.' },
  { icon: Truck, title: 'Terrestre', desc: 'Cruces regionales y distribución en Mercosur.' },
  { icon: Path, title: 'Proyectos OOG', desc: 'Cargas fuera de medida, maquinaria y operativas especiales.' },
]

const STEPS = [
  { n: '01', title: 'Cotizás', desc: 'Nos contás origen, destino y tipo de carga. Te devolvemos una propuesta clara.' },
  { n: '02', title: 'Coordinamos origen', desc: 'Recolección, consolidación y documentación en origen — sin que muevas un dedo.' },
  { n: '03', title: 'Embarque y tránsito', desc: 'Tu carga viaja con seguimiento en tiempo real, modo a modo.' },
  { n: '04', title: 'Despacho y entrega', desc: 'Aduana, depósito fiscal y transporte final coordinados por un mismo equipo.' },
]

const REASONS = [
  { icon: GlobeHemisphereWest, title: 'Casa matriz, una sola ventana', desc: 'Unificamos todos tus embarques y destinos bajo un mismo operador. Una cuenta, un interlocutor, toda tu logística.' },
  { icon: Buildings, title: 'Red propia de agentes', desc: 'Origen en China, presencia en el Cono Sur y corresponsales en todo el mundo. Tu carga nunca está sola.' },
  { icon: ShieldCheck, title: 'Despacho integral', desc: 'Flete, aduana, depósito y transporte coordinados por un mismo equipo. Sin puntos ciegos.' },
  { icon: Clock, title: 'Operación 24/7', desc: 'Seguimiento en tiempo real y un equipo que responde cuando lo necesitás, en tu huso horario.' },
]

const STATS = [
  { value: '+15', label: 'años de experiencia' },
  { value: '+250', label: 'destinos activos' },
  { value: '4', label: 'modos de transporte' },
  { value: '24/7', label: 'seguimiento' },
]

const ROUTES = [
  { from: 'China', to: 'Uruguay · Argentina', detail: 'Shanghai · Ningbo · Qingdao → Montevideo · Buenos Aires' },
  { from: 'Europa', to: 'Cono Sur', detail: 'Hamburgo · Rotterdam · Valencia → MVD · BUE' },
  { from: 'Norteamérica', to: 'Mercosur', detail: 'Miami · Houston → Montevideo' },
  { from: 'Intra-región', to: 'Puerta a puerta', detail: 'Tránsitos UY ↔ AR ↔ BR ↔ PY' },
]

// ── Reveal-on-scroll wrapper ──
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(28px)',
        transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// Friendly status for DB shipments (LCL/aéreo/terrestre), keyed by the `status`
// column. FCL uses getShipmentStatus() (derived from the Sheet's operativas).
// Stepper PÚBLICO de 3 etapas: origen → tránsito → destino (puerto de destino).
// El tramo terrestre (frontera / fiscal / entrega) es info interna y NO se
// expone al público: todo lo posterior al arribo se muestra como "En destino".
const TRACK_STAGES = ['En origen', 'En tránsito', 'En destino']
function trackStage(s: string): number {
  const t = (s || '').toLowerCase()
  if (/devuelt|entregad|fiscal|fronter|sale hoy|sali|carga hoy|puerto|arribad|terminal/.test(t)) return 2
  if (/tr[aá]nsito|viaje|embarcad/.test(t)) return 1
  if (/origen/.test(t)) return 0
  return 1
}

const DB_STATUS: Record<string, { label: string; progress: number }> = {
  en_origen: { label: 'En Origen', progress: 8 },
  embarcado: { label: 'Embarcado', progress: 20 },
  en_viaje: { label: 'En Tránsito', progress: 35 },
  en_transito: { label: 'En Tránsito', progress: 35 },
  arribado: { label: 'Arribado a Puerto', progress: 55 },
  en_puerto: { label: 'En Puerto', progress: 55 },
  saliendo: { label: 'Sale Hoy', progress: 65 },
  salio: { label: 'En Frontera', progress: 72 },
  en_frontera: { label: 'En Frontera', progress: 75 },
  en_fiscal: { label: 'En Depósito Fiscal', progress: 90 },
  llego_fiscal: { label: 'En Depósito Fiscal', progress: 90 },
  devuelto: { label: 'Entregado', progress: 100 },
  entregado: { label: 'Entregado', progress: 100 },
}

// ── Tracking card (calls the same /api/tracking endpoint TWF uses) ──
function TrackingCard() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof processShipmentRecord> | null>(null)
  const [meta, setMeta] = useState<{ status?: string; mode?: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!q.trim()) return
    setLoading(true); setNotFound(false); setResult(null); setMeta(null); setExpanded(false)
    try {
      const res = await fetch(`/api/tracking?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) {
        const data = await res.json()
        const raw = (data.results || [])[0]
        if (raw) {
          setResult(processShipmentRecord(raw))
          setMeta({ status: raw.status, mode: raw.mode })
        } else setNotFound(true)
      } else setNotFound(true)
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }

  // FCL → status from operativas (rich); DB rows → from the `status` column.
  const status = (() => {
    if (!result) return null
    if (meta?.mode && meta.mode !== 'fcl') {
      return DB_STATUS[(meta.status || '').toLowerCase()] || { label: 'En proceso', progress: 30 }
    }
    return getShipmentStatus(result)
  })()

  const fmtDate = (s?: string) => {
    if (!s) return ''
    const p = s.split('-')
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
  }

  const details: { label: string; value: string }[] = result ? [
    { label: 'ETD (salida origen)', value: fmtDate(result.ETD) },
    { label: 'ETA (puerto destino)', value: fmtDate(result.ETA) },
    { label: 'Buque', value: result.BUQUE || '' },
    { label: 'Línea', value: result.LINEA || '' },
    { label: 'Terminal / destino', value: result.TERMINAL || '' },
    { label: 'Contenedor', value: result.CNTR || '' },
  ].filter(d => d.value) : []

  return (
    <div className="rounded-2xl bg-white shadow-2xl shadow-indigo-950/30 p-6 w-full max-w-md">
      <div className="flex items-center gap-2 text-[#261c79]">
        <MapPin size={20} weight="duotone" className="text-[#49286b]" />
        <h3 className="font-semibold text-lg">Rastreá tu carga</h3>
      </div>
      <p className="text-sm text-[#6b6688] mt-1">Ingresá tu referencia, contenedor o BL / AWB.</p>
      <form onSubmit={search} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9a96b8]" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ej: A7762, MEDU1234567 o BL"
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-[#e5e4f1] bg-[#fbfbfe] text-sm focus:outline-none focus:border-[#9bd1e5] focus:ring-2 focus:ring-[#9bd1e5]/30"
          />
        </div>
        <button type="submit" disabled={loading}
                className="h-11 px-4 rounded-xl bg-[#352e6a] text-white font-medium text-sm hover:bg-[#261c79] transition-colors disabled:opacity-60">
          {loading ? <CircleNotch size={18} className="animate-spin" /> : 'Rastrear'}
        </button>
      </form>

      {status && result && (
        <div className="mt-4 rounded-xl border border-[#e5e4f1] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#261c79]">{result.REF}</span>
            {/* Etiqueta pública capada a las 3 etapas — el estado interno fino
                (frontera/fiscal/entrega) no se muestra al público */}
            <span className="text-xs px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: '#eef0f8', color: '#352e6a' }}>{TRACK_STAGES[trackStage(status.label)]}</span>
          </div>
          {result.CLIENTE && <div className="text-sm text-[#6b6688] mt-1">{result.CLIENTE}</div>}

          {/* Journey stepper — el tramo "En tránsito → En destino" se llena
              proporcionalmente al tiempo de viaje real (ETD→ETA) */}
          {(() => {
            const stage = trackStage(status.label)
            const voyage = stage === 1 ? voyageProgress(result.ETD, result.ETA) : null
            const caption =
              stage === 0 && result.ETD
                ? `Salida estimada de origen: ${fmtDate(result.ETD)}${result.ETA ? ` · ETA ${fmtDate(result.ETA)}` : ''}`
                : stage === 1 && voyage
                  ? `${voyageCaption(voyage)}${result.ETA ? ` (ETA ${fmtDate(result.ETA)})` : ''}`
                  : stage === 1 && result.ETA
                    ? `ETA estimada: ${fmtDate(result.ETA)}`
                    : null
            return (
              <div className="mt-4">
                <div className="flex items-center">
                  {TRACK_STAGES.map((_, i) => (
                    <Fragment key={i}>
                      <div
                        className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${i <= stage ? 'bg-[#49286b]' : 'bg-[#e5e4f1]'}`}
                        style={i === stage ? { boxShadow: '0 0 0 4px rgba(73,40,107,.15)' } : undefined}
                      />
                      {i < TRACK_STAGES.length - 1 && (
                        i === 1 && stage === 1 && voyage ? (
                          <div className="flex-1 h-0.5 bg-[#e5e4f1] relative overflow-hidden rounded-full">
                            <div
                              className="absolute inset-y-0 left-0 bg-[#49286b] transition-[width] duration-700"
                              style={{ width: `${Math.round(voyage.pct * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className={`flex-1 h-0.5 transition-colors ${i < stage ? 'bg-[#49286b]' : 'bg-[#e5e4f1]'}`} />
                        )
                      )}
                    </Fragment>
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between">
                  {TRACK_STAGES.map((label, i) => (
                    <span key={i} className={`text-[10px] leading-tight text-center ${i === stage ? 'text-[#49286b] font-semibold' : 'text-[#9a96b8]'}`} style={{ width: `${100 / TRACK_STAGES.length}%` }}>
                      {label}
                    </span>
                  ))}
                </div>
                {caption && (
                  <p className="mt-2 text-[11px] text-[#6b6688] text-center">{caption}</p>
                )}
              </div>
            )
          })()}

          {details.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="mt-3 flex items-center gap-1 text-xs font-medium text-[#49286b] hover:text-[#261c79]"
              >
                {expanded ? 'Ocultar detalles' : 'Ver detalles'}
                <CaretDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[#eef0f8] pt-3">
                  {details.map(d => (
                    <div key={d.label}>
                      <div className="text-[10px] uppercase tracking-wide text-[#9a96b8]">{d.label}</div>
                      <div className="text-sm text-[#261c79] font-medium mt-0.5 break-words">{d.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {notFound && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#6b6688]">
          <Package size={16} /> No encontramos esa carga. Verificá la referencia o escribinos.
        </div>
      )}
    </div>
  )
}

export default function MediterraneaLanding() {
  const brand = useBrand()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const mail = `mailto:${brand.contact.email}?subject=${encodeURIComponent('Consulta de cotización')}`
  // Número de WhatsApp de la marca (sin '+' ni espacios para wa.me). Mientras
  // Mediterránea no tenga su propio número en brand.contact.whatsapp, los CTA de
  // WhatsApp caen al email de la marca — así ningún lead se desvía al número de otra marca.
  const waNumber = (brand.contact.whatsapp || '').replace(/[^0-9]/g, '')
  const wa = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent('Hola Mediterranea Carghas, quiero cotizar un embarque.')}`
    : mail

  const navLinks = [
    { href: '#modos', label: 'Servicios' },
    { href: '#novedades', label: 'Diario' },
    { href: '#cobertura', label: 'Cobertura' },
    { href: '#proceso', label: 'Cómo trabajamos' },
    { href: '#nosotros', label: 'Nosotros' },
  ]

  const Wordmark = ({ className = '' }: { className?: string }) => (
    <span className={`flex items-center gap-2.5 text-white ${className}`}>
      <img src={brand.logo.iconWhite} alt="" className="h-9 w-auto" />
      <span className="font-semibold text-lg leading-none tracking-tight whitespace-nowrap">
        Mediterranea<span className="text-[#9bd1e5]"> Carghas</span>
      </span>
    </span>
  )

  return (
    <div data-snap-landing className="min-h-screen overflow-x-clip bg-white text-[#1a1530]" style={{ fontFamily: "'Jost', sans-serif" }}>
      {/* ── Nav ── */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-[#261c79]/95 backdrop-blur-md shadow-lg shadow-indigo-950/20' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between relative">
          {/* Logo: docked left at top → glides to center + grows on scroll.
              Always position:absolute on md+ so only transform/left animate
              (switching position type can't be transitioned → that was the jump). */}
          <a
            href="#top"
            className={`z-10 will-change-transform transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)] md:absolute md:top-1/2 md:-translate-y-1/2 ${
              scrolled
                ? 'md:left-1/2 md:-translate-x-1/2'
                : 'md:left-5 lg:left-8 md:translate-x-0'
            }`}
          >
            <Wordmark />
          </a>

          {/* Links: visible at top; fade out on scroll so the centered logo has room */}
          <nav
            className={`hidden md:flex items-center gap-8 ml-auto mr-6 transition-opacity duration-300 ${
              scrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className="text-sm text-white/80 hover:text-white transition-colors">{l.label}</a>
            ))}
          </nav>

          {/* Ingresar + Cotizar: siempre visibles en desktop */}
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full border border-white/25 text-white text-sm font-medium hover:bg-white/10 transition-colors"
            >
              <SignIn size={15} weight="bold" /> Ingresar
            </button>
            <a href={wa} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-[#9bd1e5] text-[#261c79] text-sm font-semibold hover:bg-[#ceffff] transition-colors">
              Cotizar <ArrowRight size={15} weight="bold" />
            </a>
          </div>

          <button className="md:hidden text-white ml-auto" onClick={() => setMenuOpen(o => !o)} aria-label="Menú">
            {menuOpen ? <XIcon size={24} /> : <List size={24} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-[#261c79] border-t border-white/10 px-5 py-4 space-y-3">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="block text-white/85 py-1">{l.label}</a>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setLoginOpen(true) }}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full border border-white/25 text-white font-medium"
              >
                <SignIn size={15} weight="bold" /> Ingresar
              </button>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-[#9bd1e5] text-[#261c79] font-semibold">Cotizar <ArrowRight size={15} weight="bold" /></a>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section id="top" className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #261c79 0%, #352e6a 45%, #49286b 100%)' }} />
        <div className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-luminosity" style={{ backgroundImage: 'url(/images/ops-crane-port.jpg)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(1200px 600px at 80% 10%, rgba(155,209,229,0.18), transparent)' }} />

        <div className="relative max-w-7xl mx-auto px-5 lg:px-8 pt-28 pb-16 w-full">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            {/* left */}
            <div>
              <Reveal>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[#ceffff] text-xs tracking-wide mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9bd1e5]" /> CASA MATRIZ · LOGÍSTICA INTERNACIONAL
                </span>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="titulo-med text-white text-4xl sm:text-6xl lg:text-7xl break-words">
                  Una sola casa para<br />
                  <span className="text-[#9bd1e5]">toda tu logística</span> internacional.
                </h1>
              </Reveal>
              <Reveal delay={160}>
                <p className="mt-6 text-lg text-white/75 max-w-xl leading-relaxed">
                  Unificamos todos los modos de transporte y todos los destinos bajo un mismo operador.
                  De China al Cono Sur, de origen a depósito fiscal — coordinado por un solo equipo.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <a href={wa} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-[#9bd1e5] text-[#261c79] font-semibold hover:bg-[#ceffff] transition-colors">
                    Cotizar mi embarque <ArrowUpRight size={18} weight="bold" />
                  </a>
                  <a href="#modos" className="inline-flex items-center gap-2 px-6 h-12 rounded-full border border-white/25 text-white font-medium hover:bg-white/10 transition-colors">
                    Ver servicios
                  </a>
                </div>
              </Reveal>
            </div>

            {/* right — tracking card fills the space */}
            <Reveal delay={200} className="lg:justify-self-end w-full flex lg:block justify-center">
              <TrackingCard />
            </Reveal>
          </div>

          {/* stat strip */}
          <Reveal delay={120}>
            <div className="mt-14 lg:mt-20 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-sm">
              {STATS.map(s => (
                <div key={s.label} className="px-5 py-6 bg-white/[0.03]">
                  <div className="text-3xl lg:text-4xl font-bold text-white tracking-tight">{s.value}</div>
                  <div className="text-xs text-white/55 mt-1 uppercase tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Modos ── */}
      <section id="modos" className="papel-med py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <Reveal>
            <div>
              <div className="flex items-center gap-5">
                <span className="rounded-full bg-[#ceffff] border-2 border-[#9bd1e5] px-5 py-2 text-[13px] font-semibold tracking-widest uppercase text-[#352e6a] shrink-0">
                  Servicios
                </span>
                <span className="flex-1 h-0.5 bg-[#eef0f8]" />
              </div>
              <h2 className="titulo-med mt-7 text-4xl lg:text-[58px] text-[#49286b] max-w-[800px]">Un operador, todos los modos.</h2>
            </div>
          </Reveal>

          <div className="mt-10 lg:mt-12 flex flex-col">
            {MODES.map((m, i) => {
              const Icon = m.icon
              return (
                <Reveal key={m.title} delay={i * 60}>
                  <div className={`group grid grid-cols-[auto_1fr] lg:grid-cols-[90px_300px_1fr_auto] gap-x-6 gap-y-2 lg:gap-8 items-center py-7 lg:py-8 border-t-2 border-[#eef0f8] transition-colors hover:bg-[#fbfbfe] ${i === MODES.length - 1 ? 'border-b-2' : ''}`}>
                    <span className="titulo-med text-2xl lg:text-3xl text-[#9bd1e5] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="titulo-med text-xl lg:text-[28px] text-[#49286b] flex items-center gap-2.5">
                      <Icon size={22} weight="duotone" className="text-[#9bd1e5] lg:hidden shrink-0" />
                      {m.title}
                    </h3>
                    <p className="col-span-2 lg:col-span-1 text-[15px] lg:text-[17px] leading-relaxed text-[#6b6688]">{m.desc}</p>
                    <ArrowRight size={22} weight="bold" className="hidden lg:block text-[#49286b] opacity-25 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={200}>
            <a href={wa} target="_blank" rel="noopener noreferrer"
               className="mt-8 rounded-2xl p-6 border border-dashed border-[#9bd1e5] bg-[#9bd1e5]/8 flex flex-wrap items-center justify-between gap-4 hover:bg-[#9bd1e5]/15 transition-colors">
              <div>
                <h3 className="titulo-med text-xl text-[#49286b]">¿Una operación distinta?</h3>
                <p className="mt-1.5 text-sm text-[#6b6688]">Contanos qué necesitás mover y armamos la solución.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[#49286b] font-semibold text-sm">Hablemos <ArrowRight size={15} weight="bold" /></span>
            </a>
          </Reveal>
        </div>
      </section>

      {/* ── Proceso paso a paso ── */}
      <section id="proceso" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <Reveal>
            <div
              className="relative overflow-hidden rounded-[36px] px-6 py-12 sm:px-12 lg:px-[72px] lg:py-16 bg-[#f2f7fb] bg-cover bg-center"
              style={{ backgroundImage: 'url(/novedades/bg-gradient.webp)' }}
            >
              {/* Arcos de esquina. Van detrás del contenido: el bloque de texto
                  también está posicionado, así que manda el orden del DOM. */}
              <div className="absolute -bottom-60 -right-60 w-[400px] h-[400px] rounded-full bg-[#49286b] pointer-events-none" aria-hidden />
              <div className="absolute -bottom-[270px] -right-[270px] w-[500px] h-[500px] rounded-full border-[20px] border-[#9bd1e5]/60 box-border pointer-events-none" aria-hidden />

              <div className="relative">
                <p className="text-[#49286b] font-semibold text-sm tracking-widest uppercase">Cómo trabajamos</p>
                <h2 className="titulo-med mt-3 text-3xl lg:text-[44px] text-[#49286b]">De la cotización a la entrega.</h2>

                <ol className="mt-10 lg:mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
                  {STEPS.map((s, i) => {
                    const ultimo = i === STEPS.length - 1
                    return (
                      <li key={s.n} className={`flex flex-col gap-4 ${ultimo ? '' : 'lg:pr-6'}`}>
                        <div className="flex items-center" aria-hidden>
                          <span className={`w-[30px] h-[30px] rounded-full shrink-0 ${ultimo ? 'bg-[#ceffff] border-[5px] border-[#49286b] box-border' : 'bg-[#49286b]'}`} />
                          {!ultimo && <span className="flex-1 h-1 bg-[#9bd1e5]" />}
                        </div>
                        <h3 className="titulo-med text-xl lg:text-[23px] text-[#49286b]">{s.title}</h3>
                        <p className="text-[15px] leading-relaxed text-[#352e6a]">{s.desc}</p>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Cobertura ── */}
      {/* ── Novedades logísticas (avisos + noticias, Brian 28/08) ── */}
      <NovedadesSection />

      <section id="cobertura" className="py-20 lg:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #261c79 0%, #352e6a 100%)' }}>
        <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{ backgroundImage: 'url(/images/ops-container-yard.jpg)' }} />
        <div className="relative max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-start">
            <Reveal>
              <div className="flex flex-col items-start gap-6">
                <span className="rounded-full border-2 border-[#9bd1e5] px-5 py-2 text-[13px] font-semibold tracking-widest uppercase text-[#9bd1e5]">
                  Cobertura
                </span>
                <h2 className="titulo-med text-4xl lg:text-[56px] text-white">
                  De origen a destino, <span className="text-[#9bd1e5]">sin fronteras.</span>
                </h2>
                <div className="w-[180px] h-1.5 bg-[#9bd1e5]" />
                <p className="text-white/75 text-lg leading-relaxed">
                  Como casa matriz gestionamos todas las destinaciones del Cono Sur y más allá — con red
                  propia de agentes en origen.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {['China', 'Europa', 'Norteamérica', 'Uruguay', 'Argentina', 'Brasil', 'Paraguay'].map(c => (
                    <span key={c} className="px-5 py-2 rounded-full bg-white/10 border border-white/[0.18] text-white/90 text-sm font-medium">{c}</span>
                  ))}
                </div>
              </div>
            </Reveal>
            <div className="flex flex-col gap-3.5">
              {ROUTES.map((r, i) => (
                <Reveal key={r.from + r.to} delay={i * 70}>
                  <div className="rounded-[20px] bg-white/[0.06] border border-white/[0.12] px-6 py-6 sm:px-[30px] hover:bg-white/[0.1] transition-colors">
                    {/* El trayecto: sale de un puerto y llega a otro */}
                    <div className="flex items-center gap-3.5" aria-hidden>
                      <span className="w-3.5 h-3.5 rounded-full bg-[#9bd1e5] shrink-0" />
                      <span className="flex-1 h-[3px] bg-[#9bd1e5]/40" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#ceffff] border-[3px] border-[#9bd1e5] box-border shrink-0" />
                    </div>
                    <div className="titulo-med mt-3.5 text-[22px] text-white">
                      {r.from} <span className="text-[#9bd1e5]">→</span> {r.to}
                    </div>
                    <div className="mt-1.5 text-[15px] text-white/60">{r.detail}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Nosotros / Por qué ── */}
      <section id="nosotros" className="py-20 lg:py-28 bg-[#fbfbfe]">
        <div className="max-w-7xl mx-auto px-5 lg:px-8">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-14 lg:gap-[72px] items-center">
            <Reveal>
              <div className="relative">
                <img
                  src="/images/team-containers.jpg"
                  alt="El equipo de Mediterranea Carghas en el depósito de contenedores"
                  loading="lazy"
                  className="w-full h-[360px] lg:h-[520px] object-cover rounded-[36px] block"
                />
                <div className="absolute left-4 -bottom-6 lg:-left-6 lg:-bottom-6 rounded-3xl bg-[#49286b] px-8 py-6">
                  <div className="titulo-med text-[34px] text-[#9bd1e5]">+15 años</div>
                  <div className="mt-1 text-[13px] font-semibold tracking-widest uppercase text-white/75">
                    moviendo carga en la región
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="flex flex-col items-start gap-6 pt-10 lg:pt-0">
                <span className="rounded-full bg-[#ceffff] border-2 border-[#9bd1e5] px-5 py-2 text-[13px] font-semibold tracking-widest uppercase text-[#352e6a]">
                  Por qué Mediterranea
                </span>
                <h2 className="titulo-med text-4xl lg:text-[54px] text-[#49286b]">
                  La tranquilidad de un solo responsable.
                </h2>
                <dl className="self-stretch">
                  {REASONS.map((r, i) => (
                    <div
                      key={r.title}
                      className={`py-5 border-t-2 border-[#eef0f8] flex flex-col sm:flex-row gap-1.5 sm:gap-5 sm:items-baseline ${i === REASONS.length - 1 ? 'border-b-2' : ''}`}
                    >
                      <dt className="titulo-med text-[19px] text-[#49286b] sm:shrink-0 sm:w-[260px]">{r.title}</dt>
                      <dd className="text-[15px] leading-relaxed text-[#6b6688] m-0">{r.desc}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section id="contacto" className="py-20 lg:py-24" style={{ background: 'linear-gradient(120deg, #49286b 0%, #261c79 100%)' }}>
        <div className="max-w-5xl mx-auto px-5 lg:px-8 text-center">
          <Reveal>
            <h2 className="titulo-med text-3xl lg:text-5xl text-white">Cotizá tu próximo embarque.</h2>
            <p className="mt-4 text-white/70 text-lg max-w-xl mx-auto">Decinos origen, destino y tipo de carga. Te respondemos con una propuesta clara, sin letra chica.</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href={wa} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 px-6 h-12 rounded-full bg-[#9bd1e5] text-[#261c79] font-semibold hover:bg-[#ceffff] transition-colors">
                <WhatsappLogo size={20} weight="fill" /> WhatsApp
              </a>
              <a href={mail} className="inline-flex items-center gap-2 px-6 h-12 rounded-full border border-white/25 text-white font-medium hover:bg-white/10 transition-colors">
                <EnvelopeSimple size={20} /> {brand.contact.email}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#1a1448] text-white/70">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="max-w-sm">
              <Wordmark />
              <p className="mt-4 text-sm leading-relaxed">Casa matriz de logística internacional. Unificamos todos los modos y destinos bajo un mismo operador.</p>
            </div>
            <div className="flex gap-12 text-sm">
              <div className="space-y-2">
                <div className="text-white font-semibold mb-3">Servicios</div>
                <a href="#modos" className="block hover:text-white">Marítimo</a>
                <a href="#modos" className="block hover:text-white">Aéreo</a>
                <a href="#modos" className="block hover:text-white">Terrestre</a>
                <a href="#modos" className="block hover:text-white">Proyectos</a>
              </div>
              <div className="space-y-2">
                <div className="text-white font-semibold mb-3">Empresa</div>
                <a href="/novedades" className="block hover:text-white">Diario logístico</a>
                <a href="#cobertura" className="block hover:text-white">Cobertura</a>
                <a href="#nosotros" className="block hover:text-white">Nosotros</a>
                <a href="/terminos" className="block hover:text-white">Términos</a>
                <a href="/privacidad" className="block hover:text-white">Privacidad</a>
              </div>
              <div className="space-y-2">
                <div className="text-white font-semibold mb-3">Accesos</div>
                <a href="/portal" className="block hover:text-white">Portal de clientes</a>
                <a href="/partner" className="block hover:text-white">Portal de partners</a>
                <a href="/admin" className="block hover:text-white">Acceso equipo</a>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-2 text-xs text-white/45">
            <span>© {new Date().getFullYear()} {brand.legalName}. Todos los derechos reservados.</span>
            <span>{brand.contact.email}</span>
          </div>
        </div>
      </footer>

      {/* Diálogo de acceso (Equipo · Cliente · Partner) */}
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  )
}
