import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ArrowRight, Package, Boat, Truck, CraneTower, X, Images, MagnifyingGlass } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

export interface CaseStudy {
  id: string
  iconType: 'Boat' | 'Package' | 'Truck' | 'CraneTower'
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
  gallery?: { src: string; label: string }[]
}

const defaultCaseStudies: CaseStudy[] = [
  {
    id: 'case-1',
    iconType: 'Boat',
    type: 'FCL — Desconsolidado en Depósito',
    title: 'Recepción y Desconsolidado de Contenedores',
    description: 'Operativa completa de recepción de contenedores en depósito fiscal, desconsolidado de mercadería paletizada y coordinación de entregas al importador final.',
    origin: 'Puerto de Montevideo',
    destination: 'Depósito Fiscal, MVD',
    results: [
      { label: 'Contenedores procesados', value: '3 x 40\' HC' },
      { label: 'Desconsolidado', value: 'Mismo día' },
      { label: 'Entrega final', value: '< 48 horas' }
    ],
    image: '/images/ops-warehouse.jpg'
  },
  {
    id: 'case-lancioni',
    iconType: 'CraneTower',
    type: 'Carga Proyecto — Maquinaria Pesada',
    title: 'Operativa Lancioni A7533: Descarga de Maquinaria Agrícola',
    description: 'Coordinación integral de descarga de maquinaria agrícola pesada (Kuhn) con grúa Sennebogen 840. Operativa compleja que requirió planificación especial de izaje, supervisión directa y transporte con cama baja.',
    origin: 'Puerto de Montevideo',
    destination: 'Interior del País',
    results: [
      { label: 'Tipo de carga', value: 'Maquinaria 12+ ton' },
      { label: 'Grúa utilizada', value: 'Sennebogen 840' },
      { label: 'Descarga', value: 'Sin incidentes' },
      { label: 'Supervisión', value: 'Directa TWF' }
    ],
    image: '/images/a7533-1.jpg',
    gallery: [
      { src: '/images/a7533-1.jpg', label: 'Izaje con grúa Sennebogen 840' },
      { src: '/images/a7533-2.jpg', label: 'Maquinaria Kuhn en descarga' },
      { src: '/images/a7533-8.jpg', label: 'Maquinaria sobre base de madera' }
    ]
  },
  {
    id: 'case-3',
    iconType: 'Truck',
    type: 'Transporte Terrestre — Carga Completa',
    title: 'Carga y Despacho de Camión Completo',
    description: 'Supervisión de carga de camión completo en depósito, control de estiba y documentación para transporte terrestre regional con entrega puerta a puerta.',
    origin: 'Depósito TWF',
    destination: 'Interior / Región',
    results: [
      { label: 'Carga supervisada', value: 'Completa' },
      { label: 'Documentación', value: 'En regla' },
      { label: 'Tiempo total', value: '< 24 horas' }
    ],
    image: '/images/ops-truck-loaded.jpg'
  }
]

const getIconComponent = (iconType: 'Boat' | 'Package' | 'Truck' | 'CraneTower') => {
  switch (iconType) {
    case 'Boat':
      return Boat
    case 'Package':
      return Package
    case 'Truck':
      return Truck
    case 'CraneTower':
      return CraneTower
    default:
      return Package
  }
}

export default function CasosExito() {
  const caseStudies = defaultCaseStudies
  const [lightboxImg, setLightboxImg] = useState<{ src: string; label: string } | null>(null)
  const [expandedGallery, setExpandedGallery] = useState<string | null>(null)

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
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Casos Reales</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Operativas reales coordinadas por nuestro equipo en puertos, depósitos y rutas internacionales
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {(caseStudies || []).map((study, index) => {
            const IconComponent = getIconComponent(study.iconType)
            const hasGallery = study.gallery && study.gallery.length > 0
            const isGalleryOpen = expandedGallery === study.id

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
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                      loading="lazy"
                      onClick={() => setLightboxImg({ src: study.image, label: study.title })}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                      <div className="flex items-center gap-2 text-white">
                        <IconComponent size={24} weight="duotone" />
                        <span className="text-sm font-semibold">{study.type}</span>
                      </div>
                      {hasGallery && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedGallery(isGalleryOpen ? null : study.id)
                          }}
                          className="flex items-center gap-1.5 text-white/90 hover:text-white bg-black/30 hover:bg-black/50 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm"
                        >
                          <Images size={16} weight="bold" />
                          {study.gallery!.length} fotos
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Photo Gallery */}
                  <AnimatePresence>
                    {hasGallery && isGalleryOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-3 gap-1.5 p-3 bg-muted/30">
                          {study.gallery!.map((photo, idx) => (
                            <button
                              key={idx}
                              onClick={() => setLightboxImg(photo)}
                              className="relative aspect-square rounded-lg overflow-hidden group/thumb hover:ring-2 ring-accent transition-all"
                            >
                              <img
                                src={photo.src}
                                alt={photo.label}
                                className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                                <MagnifyingGlass size={20} weight="bold" className="text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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

      {/* Lightbox */}
      <AnimatePresence>
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
            >
              <X size={28} weight="bold" />
            </button>
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              src={lightboxImg.src}
              alt={lightboxImg.label}
              className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="text-white/90 text-lg font-medium bg-black/40 px-4 py-2 rounded-full">
                {lightboxImg.label}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
