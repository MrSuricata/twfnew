import { useState, useEffect } from 'react'
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
  User
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { initGA, trackQuoteSubmission, trackWhatsAppClick, trackNavigationClick } from '@/lib/analytics'
import PublicTracking from './PublicTracking'
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

interface PublicSiteProps {
  language: Language
  onLanguageChange: (lang: Language) => void
  onAdminClick: () => void
  onClientPortalClick: () => void
  quotes: QuoteFormData[]
  onUpdateQuotes: (quotes: QuoteFormData[] | ((old?: QuoteFormData[]) => QuoteFormData[])) => void
}

export default function PublicSite({ 
  language, 
  onLanguageChange, 
  onAdminClick, 
  onClientPortalClick,
  quotes,
  onUpdateQuotes
}: PublicSiteProps) {
  const t = useTranslation(language)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      toast.error(language === 'es' ? 'Por favor complete los campos requeridos' : 
                   language === 'en' ? 'Please complete required fields' :
                   'Por favor preencha os campos obrigatórios')
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

      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src="/images/twf-logo.png" alt="Transit World Forwarding" className="h-10 w-auto" />
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('inicio')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.home}
              </button>
              <button onClick={() => scrollToSection('servicios')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.services}
              </button>
              <button onClick={() => scrollToSection('tracking')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.tracking}
              </button>
              <button onClick={() => scrollToSection('nosotros')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.about}
              </button>
              <button onClick={() => scrollToSection('casos-exito')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.caseStudies}
              </button>
              <button onClick={() => scrollToSection('faq')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.faq}
              </button>
              <button onClick={() => scrollToSection('contacto')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                {t.nav.contact}
              </button>
            </div>

            <div className="hidden md:flex items-center gap-3">
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
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onAdminClick} 
                className="text-foreground/60 hover:text-foreground"
              >
                {t.nav.admin}
              </Button>
              <Button onClick={() => scrollToSection('cotizacion')} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {t.nav.quote}
              </Button>
            </div>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <List size={24} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <div className="flex flex-col gap-6 mt-8">
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

      <section id="inicio" className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-secondary -z-10" />
        <div className="absolute inset-0 opacity-20">
          <img 
            src="https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?w=1600&auto=format&fit=crop" 
            alt="Buque de carga con contenedores navegando en ruta internacional"
            className="w-full h-full object-cover"
            loading="eager"
          />
        </div>
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40 -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center text-white">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight drop-shadow-lg text-slate-600"
            >
              {t.hero.title}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl mb-8 max-w-3xl mx-auto drop-shadow-md text-slate-950"
            >
              {t.hero.subtitle}
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
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
                className="bg-white text-primary border-white hover:bg-white/90"
              >
                {t.hero.contactButton}
              </Button>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              <Card className="bg-white/20 backdrop-blur-sm border-white/30">
                <CardContent className="pt-6 text-center">
                  <Lightning size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.speed}</h3>
                  <p className="text-sm text-slate-900">{t.hero.speedDesc}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/20 backdrop-blur-sm border-white/30">
                <CardContent className="pt-6 text-center">
                  <Eye size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.transparency}</h3>
                  <p className="text-sm text-slate-900">{t.hero.transparencyDesc}</p>
                </CardContent>
              </Card>
              <Card className="bg-white/20 backdrop-blur-sm border-white/30">
                <CardContent className="pt-6 text-center">
                  <Gauge size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">{t.hero.efficiency}</h3>
                  <p className="text-sm text-slate-900">{t.hero.efficiencyDesc}</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="servicios" className="py-16 md:py-24 bg-background relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <img 
            src="https://images.unsplash.com/photo-1605732562742-3023a888e56e?w=1600&auto=format&fit=crop" 
            alt="Terminal portuaria con contenedores de carga apilados y grúas de puerto"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
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
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <service.icon size={48} weight="duotone" className="text-accent mb-4" />
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

      <section id="tracking" className="py-16 md:py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <MagnifyingGlass size={40} weight="duotone" className="text-accent" />
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">{t.tracking.title}</h2>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t.tracking.subtitle}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <PublicTracking />
          </motion.div>
        </div>
      </section>

      <section id="nosotros" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-3xl md:text-4xl font-bold mb-6 text-foreground"
            >
              Transit World Forwarding - {t.nav.about}
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-lg text-muted-foreground mb-6 leading-relaxed"
            >
              En <span className="font-semibold text-foreground">Transit World Forwarding</span> combinamos experiencia local con visión global para brindar soluciones logísticas eficientes y transparentes.
            </motion.p>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true, margin: "-100px" }}
              className="text-lg text-muted-foreground mb-8 leading-relaxed"
            >
              Somos una empresa dinámica con atención cercana, foco regional y alcance internacional. 
              Contamos con equipos operativos en Uruguay y Argentina, y una red de agentes internacionales confiables que nos permiten ofrecer soluciones integrales de transporte marítimo, terrestre y aéreo.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true, margin: "-100px" }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12"
            >
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">+15</div>
                <div className="text-sm text-muted-foreground">Años de Experiencia</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">3</div>
                <div className="text-sm text-muted-foreground">Oficinas Operativas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">+250</div>
                <div className="text-sm text-muted-foreground">Destinos Conectados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">24/7</div>
                <div className="text-sm text-muted-foreground">Atención Continua</div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <CasosExito />

      <section id="cotizacion" className="py-16 md:py-24 bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
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
            <Card>
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
                          <SelectValue placeholder={language === 'es' ? 'Seleccionar...' : language === 'en' ? 'Select...' : 'Selecionar...'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="maritima">
                            {language === 'es' ? 'Marítima (FCL/LCL)' : language === 'en' ? 'Maritime (FCL/LCL)' : 'Marítima (FCL/LCL)'}
                          </SelectItem>
                          <SelectItem value="terrestre">
                            {language === 'es' ? 'Terrestre' : language === 'en' ? 'Land' : 'Terrestre'}
                          </SelectItem>
                          <SelectItem value="aerea">
                            {language === 'es' ? 'Aérea' : language === 'en' ? 'Air' : 'Aérea'}
                          </SelectItem>
                          <SelectItem value="multiple">
                            {language === 'es' ? 'Multimodal' : language === 'en' ? 'Multimodal' : 'Multimodal'}
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
                        placeholder={language === 'es' ? 'Ciudad, País' : language === 'en' ? 'City, Country' : 'Cidade, País'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">{t.quote.destination}</Label>
                      <Input
                        id="destination"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        placeholder={language === 'es' ? 'Ciudad, País' : language === 'en' ? 'City, Country' : 'Cidade, País'}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="details">{t.quote.details}</Label>
                    <Textarea
                      id="details"
                      value={formData.details}
                      onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                      placeholder={language === 'es' ? 'Tipo de mercadería, peso aproximado, dimensiones, etc.' : 
                                 language === 'en' ? 'Type of goods, approximate weight, dimensions, etc.' :
                                 'Tipo de mercadoria, peso aproximado, dimensões, etc.'}
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

      <section id="testimonios" className="py-16 md:py-24 bg-card overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              {language === 'es' ? 'Testimonios de Clientes Satisfechos' :
               language === 'en' ? 'Satisfied Customer Testimonials' :
               'Depoimentos de Clientes Satisfeitos'}
            </h2>
            <p className="text-lg text-muted-foreground">
              {language === 'es' ? 'Empresas que confían en TWF para sus operaciones internacionales' :
               language === 'en' ? 'Companies that trust TWF for their international operations' :
               'Empresas que confiam na TWF para suas operações internacionais'}
            </p>
          </motion.div>

          <TestimonialsCarousel />
        </div>
      </section>

      <section id="faq" className="py-16 md:py-24 bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Question size={40} weight="duotone" className="text-accent" />
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">{t.nav.faq}</h2>
            </div>
            <p className="text-lg text-muted-foreground">
              {language === 'es' ? 'Respuestas a las consultas más comunes sobre nuestros servicios' :
               language === 'en' ? 'Answers to the most common questions about our services' :
               'Respostas às perguntas mais frequentes sobre nossos serviços'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
          >
            <Accordion type="single" collapsible className="w-full space-y-4">
              <AccordionItem value="item-1" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Qué tipo de cargas pueden transportar?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Transportamos todo tipo de mercadería: carga general, contenedores FCL/LCL, 
                  cargas sobredimensionadas, mercadería peligrosa (IMO certificado), productos refrigerados, 
                  maquinaria pesada y más. Cada operación se coordina según las necesidades específicas del cliente.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Cuánto tarda un envío marítimo desde China?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  El tiempo de tránsito desde puertos chinos (Shanghai, Ningbo, etc.) hasta Montevideo o Buenos Aires 
                  es de aproximadamente 30-40 días de navegación. A esto se suma el tiempo de despacho aduanero (3-7 días). 
                  Los tiempos pueden variar según la naviera, ruta y temporada.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="border rounded-lg px-6 bg-background">
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

      <section id="contacto" className="py-16 md:py-24 bg-card relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <img 
            src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1600&auto=format&fit=crop" 
            alt="Equipo profesional de logística coordinando operaciones en oficina moderna"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-card via-card/90 to-primary/5 -z-10" />
        
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
              {language === 'es' ? 'Estamos disponibles para atenderte por múltiples canales' :
               language === 'en' ? 'We are available to assist you through multiple channels' :
               'Estamos disponíveis para atendê-lo por múltiplos canais'}
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <Card className="hover:shadow-lg transition-shadow">
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

            <Card className="hover:shadow-lg transition-shadow">
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

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 text-center">
                <div className="bg-accent/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin size={32} weight="fill" className="text-accent" />
                </div>
                <h3 className="font-semibold mb-2">
                  {language === 'es' ? 'Ubicación' : language === 'en' ? 'Location' : 'Localização'}
                </h3>
                <div className="text-sm text-muted-foreground">
                  Montevideo, Uruguay
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <footer className="bg-primary text-primary-foreground py-12 pb-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/images/twf-text-white.png" alt="TWF" className="h-6 w-auto" />
              </div>
              <p className="text-sm text-primary-foreground/80">
                {language === 'es' ? 'Soluciones logísticas globales con atención local' :
                 language === 'en' ? 'Global logistics solutions with local attention' :
                 'Soluções logísticas globais com atenção local'}
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">{t.nav.services}</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">
                  {language === 'es' ? 'Flete Marítimo' : language === 'en' ? 'Maritime Freight' : 'Frete Marítimo'}
                </button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">
                  {language === 'es' ? 'Flete Terrestre' : language === 'en' ? 'Land Freight' : 'Frete Terrestre'}
                </button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">
                  {language === 'es' ? 'Flete Aéreo' : language === 'en' ? 'Air Freight' : 'Frete Aéreo'}
                </button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">
                {language === 'es' ? 'Empresa' : language === 'en' ? 'Company' : 'Empresa'}
              </h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li><button onClick={() => scrollToSection('nosotros')} className="hover:text-primary-foreground transition-colors">{t.nav.about}</button></li>
                <li><button onClick={() => scrollToSection('casos-exito')} className="hover:text-primary-foreground transition-colors">{t.nav.caseStudies}</button></li>
                <li><button onClick={() => scrollToSection('faq')} className="hover:text-primary-foreground transition-colors">{t.nav.faq}</button></li>
                <li><button onClick={() => scrollToSection('contacto')} className="hover:text-primary-foreground transition-colors">{t.nav.contact}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li>
                  {language === 'es' ? 'Términos y Condiciones' :
                   language === 'en' ? 'Terms and Conditions' :
                   'Termos e Condições'}
                </li>
                <li>
                  {language === 'es' ? 'Política de Privacidad' :
                   language === 'en' ? 'Privacy Policy' :
                   'Política de Privacidade'}
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-foreground/20 pt-8 text-center text-sm text-primary-foreground/80">
            <p>&copy; {new Date().getFullYear()} Transit World Forwarding. {t.footer.rights}</p>
            <p className="mt-2 italic">{t.footer.slogan}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
