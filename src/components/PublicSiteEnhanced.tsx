import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Boat,
  Truck,
  Airplane,
  Package,
  ChartLine,
  Warning,
  Lightning,
  Eye,
  Gauge,
  EnvelopeSimple,
  WhatsappLogo,
  MapPin,
  List,
  ArrowRight,
  Check,
  Star,
  Question,
  MagnifyingGlass,
  User,
  Globe,
  Headset,
  CalendarBlank,
  CaretUp,
  X
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { initGA, trackQuoteSubmission, trackWhatsAppClick, trackNavigationClick } from '@/lib/analytics'
import PublicTracking from './PublicTracking'
import { ParsedShipment } from '@/lib/shipmentTypes'
import TestimonialsCarousel from './TestimonialsCarousel'
import CasosExito from './CasosExito'
import LanguageSelector from './LanguageSelector'
import { Language, useTranslation } from '@/lib/i18n'
import { QuoteFormData } from '@/lib/quotationTypes'

interface Service {
  icon: React.ElementType
  title: string
  description: string
  details: string[]
}

// Animated counter component for stats
function AnimatedCounter({ target, prefix }: { target: number; prefix: string }) {
  const [count, setCount] = useState(0)
  const [hasAnimated, setHasAnimated] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true)
          const duration = 1500
          const steps = 40
          const increment = target / steps
          let current = 0
          const interval = setInterval(() => {
            current += increment
            if (current >= target) {
              setCount(target)
              clearInterval(interval)
            } else {
              setCount(Math.floor(current))
            }
          }, duration / steps)
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [target, hasAnimated])

  return <span ref={ref}>{prefix}{count}</span>
}

interface PublicSiteProps {
  language: Language
  onLanguageChange: (lang: Language) => void
  onAdminClick: () => void
  onClientPortalClick: () => void
  quotes: QuoteFormData[]
  onUpdateQuotes: (quotes: QuoteFormData[] | ((old?: QuoteFormData[]) => QuoteFormData[])) => void
  shipments?: ParsedShipment[]
}

export default function PublicSite({
  language,
  onLanguageChange,
  onAdminClick,
  onClientPortalClick,
  quotes,
  onUpdateQuotes,
  shipments = []
}: PublicSiteProps) {
  const t = useTranslation(language)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('inicio')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [lightboxImg, setLightboxImg] = useState<{ src: string; label: string } | null>(null)
  const logoRef = useRef<HTMLButtonElement>(null)
  const navContainerRef = useRef<HTMLDivElement>(null)
  const [logoTranslateX, setLogoTranslateX] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cargoType: '',
    origin: '',
    destination: '',
    details: ''
  })

  useEffect(() => {
    initGA()
  }, [])

  // Navbar scroll effect + scroll-to-top visibility
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
      setShowScrollTop(window.scrollY > 600)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Calculate logo center offset for smooth slide animation
  useEffect(() => {
    const calculateOffset = () => {
      const logo = logoRef.current
      const container = navContainerRef.current
      if (!logo || !container) return

      const containerRect = container.getBoundingClientRect()
      const logoRect = logo.getBoundingClientRect()
      const containerCenter = containerRect.left + containerRect.width / 2
      const logoCenter = logoRect.left + logoRect.width / 2
      setLogoTranslateX(containerCenter - logoCenter)
    }

    calculateOffset()
    window.addEventListener('resize', calculateOffset)
    return () => window.removeEventListener('resize', calculateOffset)
  }, [])

  // Active section detection via IntersectionObserver
  useEffect(() => {
    const sectionIds = ['inicio', 'servicios', 'tracking', 'nosotros', 'casos-exito', 'cotizacion', 'testimonios', 'faq', 'contacto']
    const observers: IntersectionObserver[] = []

    sectionIds.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id)
        },
        { rootMargin: '-40% 0px -50% 0px' }
      )
      observer.observe(el)
      observers.push(observer)
    })

    return () => observers.forEach(o => o.disconnect())
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const services: Service[] = [
    {
      icon: Boat,
      title: t.services.maritime,
      description: t.services.maritimeDesc,
      details: [
        'Importación y exportación global',
        'Coordinación con MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidado y desconsolidado en depósitos fiscalizados',
        'Gestión completa de documentación'
      ]
    },
    {
      icon: Truck,
      title: t.services.land,
      description: t.services.landDesc,
      details: [
        'Transporte desde/hacia Brasil, Argentina, Paraguay y Chile',
        'Coordinación puerta a puerta',
        'Seguimiento en tiempo real',
        'Gestión documental completa'
      ]
    },
    {
      icon: Airplane,
      title: t.services.air,
      description: t.services.airDesc,
      details: [
        'Importación/exportación express',
        'Coordinación con principales aerolíneas',
        'Ideal para cargas urgentes o alto valor',
        'Tiempos de tránsito reducidos'
      ]
    },
    {
      icon: Package,
      title: t.services.local,
      description: t.services.localDesc,
      details: [
        'Trasiegos y desconsolidaciones',
        'Entregas directas',
        'Coordinación con Montecon, TCP',
        'Gestión de liberaciones y tasas portuarias'
      ]
    },
    {
      icon: ChartLine,
      title: t.services.consulting,
      description: t.services.consultingDesc,
      details: [
        'Planificación de rutas, tiempos y costos',
        'Asistencia aduanera y documentación',
        'Optimización de embarques',
        'Consultoría personalizada'
      ]
    },
    {
      icon: Warning,
      title: t.services.special,
      description: t.services.specialDesc,
      details: [
        'Coordinación segura y certificada',
        'Cargas peligrosas o sobredimensionadas',
        'Seguimiento detallado',
        'Cumplimiento normativo total'
      ]
    }
  ]

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
      setMobileMenuOpen(false)
      trackNavigationClick(id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.email || !formData.cargoType) {
      toast.error(t.quote.validationError)
      return
    }

    setIsSubmitting(true)

    const newQuote: QuoteFormData = {
      id: `${Date.now()}`,
      ...formData,
      timestamp: Date.now(),
      status: 'pending',
      notes: [],
      language
    }

    onUpdateQuotes((current) => [...(current || []), newQuote])

    try {
      trackQuoteSubmission(formData.cargoType)

      // Send quote via server-side email
      fetch('/api/quotes/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, language })
      }).catch(err => console.warn('Quote email failed:', err))

      toast.success(t.quote.success, { duration: 3000 })

      setFormData({
        name: '',
        email: '',
        phone: '',
        cargoType: '',
        origin: '',
        destination: '',
        details: ''
      })
    } catch (error) {
      console.error('Error al guardar cotización:', error)
      toast.error(t.quote.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <motion.a
        href="https://wa.me/59899511196?text=Hola!%20Necesito%20información%20sobre%20servicios%20de%20logística%20internacional"
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackWhatsAppClick()}
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-xl hover:bg-[#20BD5A] transition-all hover:shadow-2xl group"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, duration: 0.3 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Contactar por WhatsApp"
      >
        <WhatsappLogo size={32} weight="fill" />
        <motion.span 
          className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          1
        </motion.span>
      </motion.a>

      <nav className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b transition-all duration-300 ${
        scrolled ? 'bg-background/98 border-border shadow-md' : 'bg-background/80 border-transparent'
      }`}>
        <div ref={navContainerRef} className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo — smoothly slides to center when scrolled */}
            <button
              ref={logoRef}
              onClick={scrollToTop}
              className="flex items-center gap-2 cursor-pointer z-10"
              style={{
                transform: scrolled ? `translateX(${logoTranslateX}px)` : 'translateX(0)',
                transition: 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              }}
              aria-label="Volver al inicio"
            >
              <img src="/images/twf-icon-dark.png" alt="TWF" className="h-11 w-auto" />
              <img
                src="/images/twf-text-dark-new.png"
                alt="Transit World Forwarding"
                className="h-8 hidden sm:block"
                style={{
                  opacity: scrolled ? 0 : 1,
                  maxWidth: scrolled ? 0 : '200px',
                  overflow: 'hidden',
                  transition: 'opacity 0.4s ease, max-width 0.4s ease'
                }}
              />
              <span
                className="text-xl font-bold text-primary sm:hidden"
                style={{
                  opacity: scrolled ? 0 : 1,
                  maxWidth: scrolled ? 0 : '60px',
                  overflow: 'hidden',
                  transition: 'opacity 0.4s ease, max-width 0.4s ease'
                }}
              >TWF</span>
            </button>

            <div className={`hidden lg:flex items-center gap-6 transition-all duration-500 ${
              scrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
              {([
                ['inicio', t.nav.home],
                ['servicios', t.nav.services],
                ['tracking', t.nav.tracking],
                ['nosotros', t.nav.about],
                ['casos-exito', t.nav.caseStudies],
                ['faq', t.nav.faq],
                ['contacto', t.nav.contact]
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => scrollToSection(id)}
                  className={`text-sm font-semibold transition-colors relative pb-1 ${
                    activeSection === id
                      ? 'text-accent'
                      : 'text-foreground hover:text-accent'
                  }`}
                >
                  {label}
                  {activeSection === id && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className={`hidden lg:flex items-center gap-3 transition-all duration-500 ${
              scrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}>
              <LanguageSelector
                currentLanguage={language}
                onLanguageChange={onLanguageChange}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={onClientPortalClick}
                className="text-foreground/60 hover:text-foreground gap-2"
              >
                <User size={18} />
                {t.nav.clientPortal}
              </Button>
              <Button onClick={() => scrollToSection('cotizacion')} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {t.nav.quote}
              </Button>
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon">
                  <List size={24} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 px-6">
                <div className="flex flex-col gap-5 mt-8">
                  <LanguageSelector 
                    currentLanguage={language} 
                    onLanguageChange={onLanguageChange}
                  />
                  <button onClick={() => scrollToSection('inicio')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.home}
                  </button>
                  <button onClick={() => scrollToSection('servicios')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.services}
                  </button>
                  <button onClick={() => scrollToSection('tracking')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.tracking}
                  </button>
                  <button onClick={() => scrollToSection('nosotros')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.about}
                  </button>
                  <button onClick={() => scrollToSection('casos-exito')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.caseStudies}
                  </button>
                  <button onClick={() => scrollToSection('faq')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.faq}
                  </button>
                  <button onClick={() => scrollToSection('contacto')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    {t.nav.contact}
                  </button>
                  <Button onClick={onClientPortalClick} variant="outline" className="w-full">
                    <User size={18} className="mr-2" />
                    {t.nav.clientPortal}
                  </Button>
                  <Button onClick={() => scrollToSection('cotizacion')} className="bg-accent text-accent-foreground hover:bg-accent/90 w-full">
                    {t.nav.quote}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      <section id="inicio" className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden min-h-[85vh] flex items-center">
        <div className="absolute inset-0 z-0">
          <img src="/images/hero-bg.jpg" alt="" className="w-full h-full object-cover" loading="eager" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-primary/80 via-primary/70 to-primary/90 z-[1]" />
        <div className="absolute inset-0 overflow-hidden z-[2]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="hero-particle" />
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center text-white">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 100, delay: 0.2 }}
              className="mb-6"
            >
              <img src="/images/twf-icon-white.png" alt="" className="h-20 md:h-28 mx-auto mb-2 drop-shadow-2xl" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight drop-shadow-lg text-white"
            >
              {t.hero.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-lg md:text-xl mb-2 max-w-3xl mx-auto drop-shadow-md text-white/90"
            >
              {t.hero.subtitle}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="text-accent font-semibold text-lg md:text-xl italic mb-8"
            >
              Let's Go Up
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
            >
              <Button
                size="lg"
                onClick={() => scrollToSection('cotizacion')}
                className="bg-accent text-accent-foreground hover:bg-accent/90 hover:scale-105 transition-transform"
              >
                {t.hero.quoteButton}
                <ArrowRight size={20} className="ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => scrollToSection('contacto')}
                className="bg-white/10 text-white border-white/30 hover:bg-white/20"
              >
                {t.hero.contactButton}
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 1.0 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Lightning size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.speed}</h3>
                  <p className="text-sm text-white/80">{t.hero.speedDesc}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Eye size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.transparency}</h3>
                  <p className="text-sm text-white/80">{t.hero.transparencyDesc}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Gauge size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.efficiency}</h3>
                  <p className="text-sm text-white/80">{t.hero.efficiencyDesc}</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Wave: Hero → Servicios */}
      <div className="relative -mt-1">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0,40 C360,80 720,0 1440,40 L1440,80 L0,80 Z" className="fill-background" />
        </svg>
      </div>

      <section id="servicios" className="py-16 md:py-24 bg-background relative overflow-hidden">
        {/* Dot pattern background */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">{t.services.title}</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t.services.subtitle}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow group">
                  <CardContent className="pt-6">
                    <service.icon size={48} weight="duotone" className="text-accent mb-4 group-hover:scale-110 transition-transform" />
                    <h3 className="text-xl font-semibold mb-2 text-foreground">{service.title}</h3>
                    <p className="text-muted-foreground mb-4">{service.description}</p>
                    <ul className="space-y-2">
                      {service.details.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check size={18} className="text-accent flex-shrink-0 mt-0.5" weight="bold" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Wave: Servicios → Tracking */}
      <div className="relative -mt-1">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0,0 L1440,60 L1440,60 L0,60 Z" className="fill-primary" />
        </svg>
      </div>

      <section id="tracking" className="py-16 md:py-24 bg-primary relative overflow-hidden">
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <MagnifyingGlass size={40} weight="duotone" className="text-accent" />
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">{t.tracking.title}</h2>
            </div>
            <p className="text-lg text-primary-foreground/70 max-w-2xl mx-auto">
              {t.tracking.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <PublicTracking shipments={shipments} />
          </motion.div>
        </div>
      </section>

      {/* Wave: Tracking → Nosotros */}
      <div className="relative -mt-1">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0,0 C480,80 960,0 1440,40 L1440,80 L0,80 Z" className="fill-background" />
          <path d="M0,0 C480,80 960,0 1440,40" stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" fill="none" />
        </svg>
        <div className="absolute inset-0 bg-primary -z-10" />
      </div>

      <section id="nosotros" className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src="/images/section-port.jpg" alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="absolute inset-0 bg-primary/85 z-[1]" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-3xl md:text-4xl font-bold mb-6 text-white"
            >
              Transit World Forwarding - {t.nav.about}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-lg text-white/80 mb-6 leading-relaxed"
            >
              Con más de 15 años en comercio exterior, <span className="font-semibold text-white">Transit World Forwarding</span> conecta tu negocio con más de 250 destinos en los 5 continentes.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-lg text-white/80 mb-8 leading-relaxed"
            >
              Operamos desde Uruguay y Argentina con una red de agentes de confianza en los principales puertos del mundo. Cada cliente tiene un ejecutivo asignado que coordina su carga de punta a punta.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true, margin: "-100px" }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-12"
            >
              {[
                { num: '+15', label: 'Años de Experiencia' },
                { num: '3', label: 'Oficinas Operativas' },
                { num: '+250', label: 'Destinos Conectados' },
                { num: '24/7', label: 'Atención Continua' }
              ].map((stat, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + idx * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
                >
                  <div className="text-3xl md:text-4xl font-bold text-accent mb-2">{stat.num}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true, margin: "-100px" }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12 text-left"
            >
              {[
                { title: 'Compromiso', desc: 'Dedicación total con cada cliente y operación' },
                { title: 'Eficiencia', desc: 'Procesos optimizados y resultados medibles' },
                { title: 'Comunicación', desc: 'Información clara y constante' },
                { title: 'Soluciones', desc: 'Estrategias inteligentes y personalizadas' },
              ].map((val, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="bg-white/10 backdrop-blur-sm border-white/10 h-full">
                    <CardContent className="pt-6">
                      <h4 className="font-semibold mb-2 text-white">{val.title}</h4>
                      <p className="text-sm text-white/70">{val.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>

            {/* Team photo */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              viewport={{ once: true }}
              className="mt-12 rounded-2xl overflow-hidden shadow-2xl"
            >
              <img
                src="/images/team-containers.jpg"
                alt="Equipo TWF en depósito de contenedores"
                className="w-full h-48 md:h-72 object-cover object-center"
                loading="lazy"
              />
              <div className="bg-white/10 backdrop-blur-sm px-6 py-4 text-center">
                <p className="text-white/80 text-sm">Nuestro equipo en terreno — supervisión directa de operativas en depósito fiscal</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Operaciones Reales — gallery ── */}
      <section className="py-16 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-10"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Nuestras Operativas</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Imágenes reales de nuestras operaciones logísticas en puertos, depósitos y rutas internacionales
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { src: '/images/ops-loading.jpg', label: 'Carga de contenedores' },
              { src: '/images/ops-crane-port.jpg', label: 'Operativa portuaria' },
              { src: '/images/ops-container-yard.jpg', label: 'Depósito de contenedores' },
              { src: '/images/ops-warehouse.jpg', label: 'Desconsolidado en depósito' },
              { src: '/images/ops-supervising.jpg', label: 'Supervisión en terreno' },
              { src: '/images/ops-forklift.jpg', label: 'Manejo de mercadería' },
            ].map((photo, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: idx * 0.08 }}
                viewport={{ once: true }}
                className="relative rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => setLightboxImg(photo)}
              >
                <img
                  src={photo.src}
                  alt={photo.label}
                  className="w-full h-40 md:h-56 object-cover ops-gallery-img"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                  <span className="text-white text-sm font-medium">{photo.label}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <CasosExito />

      <section id="cotizacion" className="py-16 md:py-24 bg-gradient-to-b from-accent/5 via-background to-accent/10 relative overflow-hidden">
        {/* Radial glow behind form */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">{t.quote.title}</h2>
            <p className="text-lg text-muted-foreground">
              {t.quote.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <Card className="border-accent/20 shadow-lg">
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t.quote.name} *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={t.quote.name}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t.quote.email} *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t.quote.phone}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+598 / +54"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cargoType">{t.quote.cargoType} *</Label>
                      <Select value={formData.cargoType} onValueChange={(value) => setFormData({ ...formData, cargoType: value })}>
                        <SelectTrigger id="cargoType">
                          <SelectValue placeholder={t.quote.select} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="maritima">
                            {t.quote.maritime}
                          </SelectItem>
                          <SelectItem value="terrestre">
                            {t.quote.land}
                          </SelectItem>
                          <SelectItem value="aerea">
                            {t.quote.air}
                          </SelectItem>
                          <SelectItem value="multiple">
                            {t.quote.multimodal}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="origin">{t.quote.origin}</Label>
                      <Input
                        id="origin"
                        value={formData.origin}
                        onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                        placeholder={t.quote.cityCountry}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">{t.quote.destination}</Label>
                      <Input
                        id="destination"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        placeholder={t.quote.cityCountry}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="details">{t.quote.details}</Label>
                    <Textarea
                      id="details"
                      value={formData.details}
                      onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                      placeholder={t.quote.detailsPlaceholder}
                      rows={4}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90" 
                    size="lg"
                  >
                    {isSubmitting ? t.quote.submitting : t.quote.submit}
                    {!isSubmitting && <ArrowRight size={20} className="ml-2" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Wave: Cotización → Testimonios */}
      <div className="relative -mt-1">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0,40 C360,0 720,80 1440,20 L1440,80 L0,80 Z" className="fill-primary" />
        </svg>
      </div>

      <section id="testimonios" className="py-16 md:py-24 bg-primary relative overflow-hidden">
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-primary-foreground">
              {t.testimonials.title}
            </h2>
            <p className="text-lg text-primary-foreground/70">
              {t.testimonials.subtitle}
            </p>
          </motion.div>

          <TestimonialsCarousel />
        </div>
      </section>

      {/* Wave: Testimonios → FAQ */}
      <div className="relative -mt-1">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto block" preserveAspectRatio="none">
          <path d="M0,0 L720,60 L1440,0 L1440,60 L0,60 Z" className="fill-background" />
        </svg>
        <div className="absolute inset-0 bg-primary -z-10" />
      </div>

      <section id="faq" className="py-16 md:py-24 bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Question size={40} weight="duotone" className="text-accent" />
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">{t.nav.faq}</h2>
            </div>
            <p className="text-lg text-muted-foreground">
              {t.faq.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <Accordion type="single" collapsible className="w-full space-y-4">
              <AccordionItem value="item-1" className="border rounded-lg px-6 bg-background last:border-b">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Qué tipo de cargas pueden transportar?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Transportamos todo tipo de mercadería: carga general, contenedores FCL/LCL, 
                  cargas sobredimensionadas, mercadería peligrosa (IMO certificado), productos refrigerados, 
                  maquinaria pesada y más. Cada operación se coordina según las necesidades específicas del cliente.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="border rounded-lg px-6 bg-background last:border-b">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Cuánto tarda un envío marítimo desde China?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  El tiempo de tránsito desde puertos chinos (Shanghai, Ningbo, etc.) hasta Montevideo o Buenos Aires 
                  es de aproximadamente 30-40 días de navegación. A esto se suma el tiempo de despacho aduanero (3-7 días). 
                  Los tiempos pueden variar según la naviera, ruta y temporada.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="border rounded-lg px-6 bg-background last:border-b">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Ofrecen servicio de despacho aduanero?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Sí, brindamos asesoramiento completo en gestiones aduaneras y coordinamos con despachantes 
                  de confianza. Asistimos en la documentación necesaria, clasificación arancelaria y gestión 
                  de permisos especiales cuando se requieren.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </div>
      </section>

      <section id="contacto" className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-15">
          <img
            src="/images/team-yard-wide.jpg"
            alt="Equipo TWF en operativa"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-card via-card/95 to-primary/5 z-[1]" />
        
        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              {t.nav.contact} - Transit World Forwarding
            </h2>
            <p className="text-lg text-muted-foreground">
              {t.faq.contactNote}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardContent className="pt-6 text-center">
                  <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <EnvelopeSimple size={32} weight="fill" className="text-accent" />
                  </div>
                  <h3 className="font-semibold mb-2">Email</h3>
                  <a href="mailto:bridvanovich@twf.uy" className="text-sm text-muted-foreground hover:text-accent transition-colors">
                    bridvanovich@twf.uy
                  </a>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              viewport={{ once: true }}
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardContent className="pt-6 text-center">
                  <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <WhatsappLogo size={32} weight="fill" className="text-accent" />
                  </div>
                  <h3 className="font-semibold mb-2">WhatsApp</h3>
                  <a href="https://wa.me/59899511196" className="text-sm text-muted-foreground hover:text-accent transition-colors">
                    +598 99 511 196
                  </a>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <Card className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardContent className="pt-6 text-center">
                  <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MapPin size={32} weight="fill" className="text-accent" />
                  </div>
                  <h3 className="font-semibold mb-2">
                    {t.footerNav.location}
                  </h3>
                  <div className="text-sm text-muted-foreground">
                    Montevideo, Uruguay
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="bg-primary text-primary-foreground py-12 pb-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          {/* CTA banner */}
          <div className="bg-primary-foreground/10 border border-primary-foreground/20 rounded-2xl p-6 md:p-8 mb-12 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xl md:text-2xl font-bold mb-1">
                {t.cta.title}
              </h3>
              <p className="text-primary-foreground/70 text-sm">
                {t.cta.subtitle}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => scrollToSection('cotizacion')}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
              >
                {t.cta.onlineQuote}
              </Button>
              <Button
                onClick={() => {
                  trackWhatsAppClick()
                  window.open('https://wa.me/59891000000', '_blank')
                }}
                className="bg-green-500 hover:bg-green-600 text-white"
              >
                <WhatsappLogo size={20} weight="fill" className="mr-2" />
                WhatsApp
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/images/twf-icon-white.png" alt="TWF" className="h-10 w-auto" />
                <img src="/images/twf-text-white-new.png" alt="Transit World Forwarding" className="h-7 w-auto" />
              </div>
              <p className="text-sm text-primary-foreground/70 mb-4">
                {t.footerNav.slogan2}
              </p>
              <div className="flex gap-3">
                <a href="mailto:info@twf.uy" className="text-primary-foreground/60 hover:text-accent transition-colors">
                  <EnvelopeSimple size={20} />
                </a>
                <a href="https://wa.me/59891000000" target="_blank" rel="noopener noreferrer" className="text-primary-foreground/60 hover:text-green-400 transition-colors">
                  <WhatsappLogo size={20} />
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-primary-foreground/90">{t.nav.services}</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">
                  {t.footerNav.maritimeFreight}
                </button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">
                  {t.footerNav.landFreight}
                </button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">
                  {t.footerNav.airFreight}
                </button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-primary-foreground/90">
                {t.footerNav.company}
              </h4>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                <li><button onClick={() => scrollToSection('nosotros')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">{t.nav.about}</button></li>
                <li><button onClick={() => scrollToSection('casos-exito')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">{t.nav.caseStudies}</button></li>
                <li><button onClick={() => scrollToSection('faq')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">{t.nav.faq}</button></li>
                <li><button onClick={() => scrollToSection('contacto')} className="hover:text-primary-foreground hover:translate-x-1 transition-all duration-200">{t.nav.contact}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-primary-foreground/90">Legal</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/60">
                <li className="hover:text-primary-foreground transition-colors cursor-default">
                  {t.footerNav.terms}
                </li>
                <li className="hover:text-primary-foreground transition-colors cursor-default">
                  {t.footerNav.privacy}
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-primary-foreground/50">
            <p>&copy; {new Date().getFullYear()} Transit World Forwarding. {t.footer.rights}</p>
            <p className="italic">{t.footer.slogan}</p>
          </div>
        </div>
      </footer>

      {/* Scroll to top button */}
      <motion.button
        onClick={scrollToTop}
        className="fixed bottom-6 left-6 z-50 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:bg-primary/90 transition-colors"
        initial={{ scale: 0, opacity: 0 }}
        animate={showScrollTop ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ duration: 0.2 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Volver arriba"
      >
        <CaretUp size={24} weight="bold" />
      </motion.button>

      {/* ── Photo Lightbox ── */}
      {lightboxImg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-[101]"
            aria-label="Cerrar"
          >
            <X size={28} weight="bold" />
          </button>
          <motion.img
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            src={lightboxImg.src}
            alt={lightboxImg.label}
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-6 left-0 right-0 text-center">
            <span className="text-white/90 text-lg font-medium bg-black/40 px-4 py-2 rounded-full">{lightboxImg.label}</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}
