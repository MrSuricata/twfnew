import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Package, Boat, Truck } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

export interface CaseStudy {
  id: string
  iconType: 'Boat' | 'Package' | 'Truck'
  type: string
  title: string
  description: string
  origin: string
  destination: string
  results: {
    label: string
    value: string
  }[]
  image: string
}

const defaultCaseStudies: CaseStudy[] = [
  {
    id: 'case-1',
    iconType: 'Boat',
    type: 'FCL - Importación desde Asia',
    title: 'Importación de Maquinaria Industrial desde China',
    description: 'Coordinación integral de 2 contenedores 40\' HC con maquinaria pesada desde Shanghai a Montevideo, incluyendo gestión aduanera completa y entrega en planta del cliente.',
    origin: 'Shanghai, China',
    destination: 'Montevideo, Uruguay',
    results: [
      { label: 'Tiempo de tránsito', value: '35 días' },
      { label: 'Coordinación aduanera', value: '100% sin demoras' },
      { label: 'Satisfacción del cliente', value: 'Excelente' }
    ],
    image: 'https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?w=800&auto=format&fit=crop'
  },
  {
    id: 'case-2',
    iconType: 'Package',
    type: 'LCL - Consolidado Europa',
    title: 'Consolidado de Repuestos desde Italia',
    description: 'Servicio LCL optimizado para importador de autopartes. Carga consolidada desde Génova con desconsolidado en depósito fiscal y entrega directa al cliente en 48hs post-arribo.',
    origin: 'Génova, Italia',
    destination: 'Buenos Aires, Argentina',
    results: [
      { label: 'Ahorro vs FCL', value: '45%' },
      { label: 'Frecuencia', value: 'Quincenal' },
      { label: 'Entregas a tiempo', value: '98%' }
    ],
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop'
  },
  {
    id: 'case-3',
    iconType: 'Truck',
    type: 'Trasiego & Operativa Local',
    title: 'Operativa de Trasiego en Terminal Montecon',
    description: 'Coordinación de trasiego de contenedor con mercadería perecedera, gestión express de liberaciones portuarias y entrega directa en menos de 24 horas desde descarga del buque.',
    origin: 'Puerto de Montevideo',
    destination: 'Canelones, Uruguay',
    results: [
      { label: 'Tiempo total', value: '< 24 horas' },
      { label: 'Gestión documental', value: 'Express' },
      { label: 'Producto preservado', value: '100%' }
    ],
    image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=800&auto=format&fit=crop'
  }
]

const getIconComponent = (iconType: 'Boat' | 'Package' | 'Truck') => {
  switch (iconType) {
    case 'Boat':
      return Boat
    case 'Package':
      return Package
    case 'Truck':
      return Truck
    default:
      return Package
  }
}

export default function CasosExito() {
  const caseStudies = defaultCaseStudies
  const scrollToCotizacion = () => {
    const element = document.getElementById('cotizacion')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section id="casos-exito" className="py-16 md:py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent -z-10" />
      
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: "-100px" }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Casos de Éxito</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Operativas reales que demuestran nuestro compromiso con soluciones logísticas eficientes y personalizadas
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {(caseStudies || []).map((study, index) => {
            const IconComponent = getIconComponent(study.iconType)
            return (
              <motion.div
                key={study.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-xl transition-all duration-300 group overflow-hidden">
                  <div className="relative h-48 overflow-hidden">
                    <img 
                      src={study.image} 
                      alt={`Caso de éxito: ${study.title}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center gap-2 text-white mb-2">
                        <IconComponent size={24} weight="duotone" />
                        <span className="text-sm font-semibold">{study.type}</span>
                      </div>
                    </div>
                  </div>
                
                <CardContent className="pt-6">
                  <h3 className="text-xl font-semibold mb-3 text-foreground line-clamp-2">{study.title}</h3>
                  <p className="text-muted-foreground mb-4 text-sm leading-relaxed line-clamp-3">
                    {study.description}
                  </p>

                  <div className="space-y-2 mb-4 pb-4 border-b border-border">
                    <div className="flex items-start gap-2 text-sm">
                      <ArrowRight size={16} className="text-accent flex-shrink-0 mt-0.5" weight="bold" />
                      <div>
                        <span className="text-muted-foreground">Origen: </span>
                        <span className="font-medium">{study.origin}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <ArrowRight size={16} className="text-accent flex-shrink-0 mt-0.5" weight="bold" />
                      <div>
                        <span className="text-muted-foreground">Destino: </span>
                        <span className="font-medium">{study.destination}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    <h4 className="font-semibold text-sm text-foreground mb-3">Resultados:</h4>
                    {study.results.map((result, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Check size={16} className="text-accent" weight="bold" />
                          {result.label}
                        </span>
                        <span className="font-semibold text-accent">{result.value}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={scrollToCotizacion}
                    variant="outline"
                    className="w-full hover:bg-accent hover:text-accent-foreground transition-colors"
                    size="sm"
                  >
                    Cotizar tu Carga
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
            )
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="mt-10 text-center"
        >
          <p className="text-muted-foreground text-sm">
            Cada operación es única.{' '}
            <button onClick={scrollToCotizacion} className="text-accent font-semibold hover:underline">
              Solicitá tu cotización personalizada →
            </button>
          </p>
        </motion.div>
      </div>

      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "itemListElement": (caseStudies || []).map((study, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "item": {
              "@type": "CaseStudy",
              "name": study.title,
              "description": study.description,
              "url": `https://twf.uy/#casos-exito`
            }
          }))
        })}
      </script>
    </section>
  )
}
