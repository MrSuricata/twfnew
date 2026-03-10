import { useState } from 'react'
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
  Phone,
  EnvelopeSimple,
  WhatsappLogo,
  MapPin,
  List,
  ArrowRight,
  Check,
  Star,
  Question,
  MagnifyingGlass
} from '@phosphor-icons/react'
import { toast, Toaster } from 'sonner'

import { motion } from 'framer-motion'
import Login from './Login'
import Dashboard from './Dashboard'
import PublicTracking from './PublicTracking'

interface Service {
  icon: React.ElementType
  title: string
  description: string
  details: string[]
}

interface QuoteFormData {
  name: string
  email: string
  phone: string
  cargoType: string
  origin: string
  destination: string
  details: string
  timestamp: number
}

interface PublicSiteProps {
  language?: string
  onLanguageChange?: (lang: string) => void
  onAdminClick?: () => void
  onClientPortalClick?: () => void
  quotes?: QuoteFormData[]
  onUpdateQuotes?: (quotes: QuoteFormData[] | ((current?: QuoteFormData[]) => QuoteFormData[])) => void
}

function PublicSite({
  language = 'es',
  onLanguageChange,
  onAdminClick,
  onClientPortalClick,
  quotes: externalQuotes,
  onUpdateQuotes
}: PublicSiteProps = {}) {
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
  const [quotes, setQuotes] = useState<QuoteFormData[]>([])

  const services: Service[] = [
    {
      icon: Boat,
      title: 'Flete Marítimo Internacional',
      description: 'FCL y LCL desde y hacia todo el mundo',
      details: [
        'Importación y exportación global',
        'Coordinación con MSC, CMA CGM, Maersk, Hapag Lloyd, COSCO, PIL',
        'Consolidado y desconsolidado en depósitos fiscalizados',
        'Gestión completa de documentación'
      ]
    },
    {
      icon: Truck,
      title: 'Flete Terrestre Internacional',
      description: 'Transporte regional puerta a puerta',
      details: [
        'Transporte desde/hacia Brasil, Argentina, Paraguay y Chile',
        'Coordinación puerta a puerta',
        'Seguimiento en tiempo real',
        'Gestión documental completa'
      ]
    },
    {
      icon: Airplane,
      title: 'Flete Aéreo Internacional',
      description: 'Servicio express para cargas urgentes',
      details: [
        'Importación/exportación express',
        'Coordinación con principales aerolíneas',
        'Ideal para cargas urgentes o alto valor',
        'Tiempos de tránsito reducidos'
      ]
    },
    {
      icon: Package,
      title: 'Operativas Locales',
      description: 'Desconsolidación y entregas directas',
      details: [
        'Trasiegos y desconsolidaciones',
        'Entregas directas',
        'Coordinación con Montecon, TCP',
        'Gestión de liberaciones y tasas portuarias'
      ]
    },
    {
      icon: ChartLine,
      title: 'Asesoramiento Logístico',
      description: 'Planificación y optimización integral',
      details: [
        'Planificación de rutas, tiempos y costos',
        'Asistencia aduanera y documentación',
        'Optimización de embarques',
        'Consultoría personalizada'
      ]
    },
    {
      icon: Warning,
      title: 'Cargas Especiales e IMO',
      description: 'Transporte certificado de cargas peligrosas',
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
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.email || !formData.cargoType) {
      toast.error('Por favor complete los campos requeridos')
      return
    }

    setIsSubmitting(true)

    try {
      const newQuote: QuoteFormData = {
        ...formData,
        timestamp: Date.now()
      }

      setQuotes((currentQuotes) => [...(currentQuotes || []), newQuote])

      toast.success('¡Cotización enviada exitosamente! Nos contactaremos pronto.', {
        duration: 3000,
      })
      
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
      toast.error('Error al guardar la cotización. Por favor intente nuevamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" />
      
      <motion.a
        href="https://wa.me/59899511196?text=Hola!%20Necesito%20información%20sobre%20servicios%20de%20logística%20internacional"
        target="_blank"
        rel="noopener noreferrer"
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
              <Boat size={32} weight="fill" className="text-primary" />
              <span className="text-xl font-bold text-primary">TWF</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('inicio')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Inicio
              </button>
              <button onClick={() => scrollToSection('servicios')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Servicios
              </button>
              <button onClick={() => scrollToSection('tracking')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Tracking
              </button>
              <button onClick={() => scrollToSection('nosotros')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Nosotros
              </button>
              <button onClick={() => scrollToSection('cobertura')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Cobertura
              </button>
              <button onClick={() => scrollToSection('faq')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                FAQ
              </button>
              <button onClick={() => scrollToSection('contacto')} className="text-sm font-semibold text-foreground hover:text-accent transition-colors">
                Contacto
              </button>
            </div>

            <div className="hidden md:block">
              <Button onClick={() => scrollToSection('cotizacion')} className="bg-accent text-accent-foreground hover:bg-accent/90">
                Solicitar Cotización
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
                  <button onClick={() => scrollToSection('inicio')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Inicio
                  </button>
                  <button onClick={() => scrollToSection('servicios')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Servicios
                  </button>
                  <button onClick={() => scrollToSection('tracking')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Tracking
                  </button>
                  <button onClick={() => scrollToSection('nosotros')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Nosotros
                  </button>
                  <button onClick={() => scrollToSection('cobertura')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Cobertura
                  </button>
                  <button onClick={() => scrollToSection('faq')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    FAQ
                  </button>
                  <button onClick={() => scrollToSection('contacto')} className="text-left text-lg font-semibold text-foreground hover:text-accent transition-colors">
                    Contacto
                  </button>
                  <Button onClick={() => scrollToSection('cotizacion')} className="bg-accent text-accent-foreground hover:bg-accent/90 w-full">
                    Solicitar Cotización
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      <section id="inicio" className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/95 to-secondary -z-10" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40 -z-10" />
        
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="text-center text-white">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight text-slate-50"
            >
              Soluciones Logísticas Globales a Tu Medida
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl mb-8 max-w-3xl mx-auto text-slate-100"
            >
              Transit World Forwarding – Tu socio estratégico en comercio internacional
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
                Solicitar Cotización
                <ArrowRight size={20} className="ml-2" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => scrollToSection('contacto')}
                className="bg-white text-primary border-white hover:bg-white/90"
              >
                Contactar Ahora
              </Button>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Lightning size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">Rapidez</h3>
                  <p className="text-sm text-white/80">Operaciones ágiles y tiempos optimizados</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Eye size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">Transparencia</h3>
                  <p className="text-sm text-white/80">Comunicación clara en cada etapa</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 backdrop-blur-sm border-white/20">
                <CardContent className="pt-6 text-center">
                  <Gauge size={40} weight="fill" className="mx-auto mb-3 text-accent" />
                  <h3 className="font-semibold text-lg mb-2">Eficiencia</h3>
                  <p className="text-sm text-white/80">Soluciones inteligentes y efectivas</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="servicios" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Nuestros Servicios</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Soluciones integrales de transporte internacional para conectar tu negocio con el mundo
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
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">Rastree su Envío</h2>
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Ingrese el número de contenedor o referencia para conocer el estado de su carga en tiempo real
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
              Sobre Nosotros
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
                <div className="text-3xl font-bold text-accent mb-2">+10</div>
                <div className="text-sm text-muted-foreground">Años de Experiencia</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">2</div>
                <div className="text-sm text-muted-foreground">Oficinas Operativas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">+50</div>
                <div className="text-sm text-muted-foreground">Destinos Conectados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-accent mb-2">24/7</div>
                <div className="text-sm text-muted-foreground">Atención Continua</div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true, margin: "-100px" }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-12 text-left"
            >
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-2 text-foreground">Compromiso</h4>
                  <p className="text-sm text-muted-foreground">Dedicación total con cada cliente y operación</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-2 text-foreground">Eficiencia</h4>
                  <p className="text-sm text-muted-foreground">Procesos optimizados y resultados medibles</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-2 text-foreground">Comunicación</h4>
                  <p className="text-sm text-muted-foreground">Información clara y constante</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-2 text-foreground">Soluciones</h4>
                  <p className="text-sm text-muted-foreground">Estrategias inteligentes y personalizadas</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="cobertura" className="py-16 md:py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Cobertura Global</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Conectamos América del Sur con los principales mercados mundiales
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12"
          >
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 text-foreground">América del Sur</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Brasil
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Argentina
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Paraguay
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Chile
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 text-foreground">Europa</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Italia
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    España
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Alemania
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Dinamarca
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-4 text-foreground">Asia</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    China
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Corea del Sur
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    Japón
                  </li>
                  <li className="flex items-center gap-2">
                    <MapPin size={18} className="text-accent" weight="fill" />
                    India
                  </li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true, margin: "-100px" }}
            className="bg-background rounded-lg p-6 md:p-8"
          >
            <h3 className="font-semibold text-xl mb-6 text-center text-foreground">Rutas Destacadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                'Shanghai → Montevideo',
                'Hamburgo → Buenos Aires',
                'São Paulo → Montevideo',
                'Montevideo → Miami',
                'Buenos Aires → Rotterdam',
                'Córdoba → Buenaventura',
                'Shanghai → Buenos Aires',
                'Barcelona → Montevideo',
                'Asunción → Santos'
              ].map((route, index) => (
                <div key={index} className="flex items-center gap-2 text-muted-foreground">
                  <ArrowRight size={18} className="text-accent" weight="bold" />
                  <span className="text-sm">{route}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="cotizacion" className="py-16 md:py-24 bg-background">
        <div className="max-w-3xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Solicitar Cotización</h2>
            <p className="text-lg text-muted-foreground">
              Completa el formulario y te responderemos a la brevedad con la mejor solución para tu carga
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
                      <Label htmlFor="name">Nombre / Empresa *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Tu nombre o empresa"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="tu@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">WhatsApp / Teléfono</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+598 / +54"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cargoType">Tipo de Carga *</Label>
                      <Select value={formData.cargoType} onValueChange={(value) => setFormData({ ...formData, cargoType: value })}>
                        <SelectTrigger id="cargoType">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="maritima">Marítima (FCL/LCL)</SelectItem>
                          <SelectItem value="terrestre">Terrestre</SelectItem>
                          <SelectItem value="aerea">Aérea</SelectItem>
                          <SelectItem value="multiple">Multimodal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="origin">Origen</Label>
                      <Input
                        id="origin"
                        value={formData.origin}
                        onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                        placeholder="Ciudad, País"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">Destino</Label>
                      <Input
                        id="destination"
                        value={formData.destination}
                        onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                        placeholder="Ciudad, País"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="details">Detalle de la Carga</Label>
                    <Textarea
                      id="details"
                      value={formData.details}
                      onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                      placeholder="Tipo de mercadería, peso aproximado, dimensiones, etc."
                      rows={4}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90" 
                    size="lg"
                  >
                    {isSubmitting ? 'Enviando...' : 'Enviar Cotización'}
                    {!isSubmitting && <ArrowRight size={20} className="ml-2" />}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <section id="contacto" className="py-16 md:py-24 bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Contacto</h2>
            <p className="text-lg text-muted-foreground">
              Estamos disponibles para atenderte por múltiples canales
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
                <h3 className="font-semibold mb-2">Ubicación</h3>
                <div className="text-sm text-muted-foreground">
                  Montevideo, Uruguay
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <section id="testimonios" className="py-16 md:py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Lo Que Dicen Nuestros Clientes</h2>
            <p className="text-lg text-muted-foreground">
              Empresas que confían en TWF para sus operaciones internacionales
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={20} weight="fill" className="text-accent" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Excelente servicio. Coordinación impecable en nuestras importaciones desde China. 
                  Transparencia total en costos y tiempos."
                </p>
                <div className="font-semibold text-foreground">María González</div>
                <div className="text-sm text-muted-foreground">Importadora - Montevideo</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={20} weight="fill" className="text-accent" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Llevamos años trabajando con TWF en rutas Brasil-Uruguay. 
                  Siempre cumplen con los plazos y tienen soluciones para cualquier imprevisto."
                </p>
                <div className="font-semibold text-foreground">Carlos Rodríguez</div>
                <div className="text-sm text-muted-foreground">Gerente Logística - Porto Alegre</div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={20} weight="fill" className="text-accent" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Profesionales de primera. Nos ayudaron a optimizar nuestros costos logísticos 
                  y reducir tiempos de entrega en un 30%."
                </p>
                <div className="font-semibold text-foreground">Ana Martínez</div>
                <div className="text-sm text-muted-foreground">Directora Comercio Exterior - Buenos Aires</div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      <section id="faq" className="py-16 md:py-24 bg-card">
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
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">Preguntas Frecuentes</h2>
            </div>
            <p className="text-lg text-muted-foreground">
              Respuestas a las consultas más comunes sobre nuestros servicios
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

              <AccordionItem value="item-4" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Cómo puedo hacer seguimiento de mi carga?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Proporcionamos tracking completo de cada envío. Una vez confirmada la operación, 
                  recibirás el número de contenedor o guía de transporte para seguimiento en línea. 
                  Además, nuestro equipo mantiene comunicación constante informando cada etapa del proceso.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Qué documentación necesito para exportar/importar?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  La documentación básica incluye: factura comercial, packing list, conocimiento de embarque 
                  (B/L o AWB), certificado de origen (según destino) y permisos específicos según el producto. 
                  Nuestro equipo te guía en todo el proceso documental según el tipo de operación.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Trabajan con pequeñas empresas o solo grandes volúmenes?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Trabajamos con empresas de todos los tamaños. Desde carga consolidada (LCL) para pequeños 
                  importadores hasta contenedores completos y proyectos logísticos complejos. 
                  Cada cliente recibe el mismo nivel de atención y profesionalismo.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Cuál es la diferencia entre FCL y LCL?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  <strong>FCL (Full Container Load):</strong> Contenedor completo para uso exclusivo de un cliente. 
                  Ideal para volúmenes grandes (más de 15-20m³).<br/><br/>
                  <strong>LCL (Less than Container Load):</strong> Carga consolidada compartiendo contenedor con otros importadores. 
                  Más económico para volúmenes pequeños. Se paga solo por el espacio utilizado.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-8" className="border rounded-lg px-6 bg-background">
                <AccordionTrigger className="text-left font-semibold hover:text-accent">
                  ¿Ofrecen seguro de carga?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Sí, coordinamos seguros de carga internacional con compañías de primera línea. 
                  Recomendamos siempre contratar seguro para proteger tu mercadería contra daños, 
                  pérdidas o imprevistos durante el transporte. Podemos incluirlo en la cotización.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true, margin: "-100px" }}
            className="mt-12 text-center"
          >
            <Card className="bg-accent/10 border-accent/20">
              <CardContent className="pt-6">
                <h3 className="font-semibold text-lg mb-2">¿No encontraste tu respuesta?</h3>
                <p className="text-muted-foreground mb-4">
                  Nuestro equipo está disponible para resolver cualquier consulta específica
                </p>
                <Button 
                  onClick={() => window.open('https://wa.me/59899511196?text=Hola!%20Tengo%20una%20consulta%20sobre%20los%20servicios%20de%20TWF', '_blank')}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <WhatsappLogo size={20} weight="fill" className="mr-2" />
                  Contactar por WhatsApp
                </Button>
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
                <Boat size={32} weight="fill" />
                <span className="text-xl font-bold">TWF</span>
              </div>
              <p className="text-sm text-primary-foreground/80">
                Soluciones logísticas globales con atención local
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Servicios</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">Flete Marítimo</button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">Flete Terrestre</button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">Flete Aéreo</button></li>
                <li><button onClick={() => scrollToSection('servicios')} className="hover:text-primary-foreground transition-colors">Asesoramiento</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li><button onClick={() => scrollToSection('nosotros')} className="hover:text-primary-foreground transition-colors">Sobre Nosotros</button></li>
                <li><button onClick={() => scrollToSection('cobertura')} className="hover:text-primary-foreground transition-colors">Cobertura</button></li>
                <li><button onClick={() => scrollToSection('testimonios')} className="hover:text-primary-foreground transition-colors">Testimonios</button></li>
                <li><button onClick={() => scrollToSection('faq')} className="hover:text-primary-foreground transition-colors">FAQ</button></li>
                <li><button onClick={() => scrollToSection('contacto')} className="hover:text-primary-foreground transition-colors">Contacto</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/80">
                <li>Términos y Condiciones</li>
                <li>Política de Privacidad</li>
                <li>Cookies</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-primary-foreground/20 pt-8 text-center text-sm text-primary-foreground/80">
            <p>&copy; {new Date().getFullYear()} Transit World Forwarding. Todos los derechos reservados.</p>
            <p className="mt-2 italic">Movemos tu negocio al mundo</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false)
  const [currentView, setCurrentView] = useState<'public' | 'login' | 'dashboard'>('public')

  if (currentView === 'login') {
    return <Login onLogin={() => {
      setIsLoggedIn(() => true)
      setCurrentView('dashboard')
    }} onBack={() => setCurrentView('public')} />
  }

  if (currentView === 'dashboard' && isLoggedIn) {
    return <Dashboard onLogout={() => {
      setIsLoggedIn(() => false)
      setCurrentView('public')
    }} />
  }

  return (
    <>
      <PublicSite />
      <button
        onClick={() => setCurrentView('login')}
        className="fixed bottom-6 left-6 z-50 bg-primary text-primary-foreground p-2 rounded-lg shadow-lg hover:bg-primary/90 transition-all text-xs opacity-50 hover:opacity-100"
        aria-label="Admin"
      >
        Admin
      </button>
    </>
  )
}

export default App
