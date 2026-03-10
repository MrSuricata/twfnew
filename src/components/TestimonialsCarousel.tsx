import { useState, useEffect, useRef, MouseEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Star, User } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

interface Testimonial {
  id: string
  name: string
  role: string
  company: string
  text: string
  rating: number
  avatarUrl?: string
}

const defaultTestimonials: Testimonial[] = [
  {
    id: '1',
    name: 'María González',
    role: 'Importadora',
    company: 'Montevideo',
    text: 'Excelente servicio. Coordinación impecable en nuestras importaciones desde China. Transparencia total en costos y tiempos.',
    rating: 5
  },
  {
    id: '2',
    name: 'Carlos Rodríguez',
    role: 'Gerente Logística',
    company: 'Porto Alegre',
    text: 'Llevamos años trabajando con TWF en rutas Brasil-Uruguay. Siempre cumplen con los plazos y tienen soluciones para cualquier imprevisto.',
    rating: 5
  },
  {
    id: '3',
    name: 'Ana Martínez',
    role: 'Directora Comercio Exterior',
    company: 'Buenos Aires',
    text: 'Profesionales de primera. Nos ayudaron a optimizar nuestros costos logísticos y reducir tiempos de entrega en un 30%.',
    rating: 5
  },
  {
    id: '4',
    name: 'Roberto Silva',
    role: 'Gerente de Compras',
    company: 'Santiago',
    text: 'La mejor decisión fue confiar en TWF para nuestras operaciones internacionales. Servicio confiable y comunicación permanente.',
    rating: 5
  },
  {
    id: '5',
    name: 'Lucía Fernández',
    role: 'Directora de Operaciones',
    company: 'São Paulo',
    text: 'TWF nos permite competir a nivel global con la tranquilidad de tener un socio local que entiende nuestras necesidades.',
    rating: 5
  },
  {
    id: '6',
    name: 'Diego Pereira',
    role: 'CEO',
    company: 'Asunción',
    text: 'Desde cargas pequeñas hasta contenedores completos, siempre el mismo profesionalismo. Altamente recomendados.',
    rating: 5
  },
  {
    id: '7',
    name: 'Patricia Oliveira',
    role: 'Jefa de Importaciones',
    company: 'Curitiba',
    text: 'El seguimiento detallado de cada operación nos da la seguridad que necesitamos. Excelente trabajo del equipo de TWF.',
    rating: 5
  },
  {
    id: '8',
    name: 'Martín Sánchez',
    role: 'Gerente General',
    company: 'Córdoba',
    text: 'Costos competitivos, tiempos respetados y atención personalizada. Todo lo que buscábamos en un freight forwarder.',
    rating: 5
  }
]

export default function TestimonialsCarousel() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return

    let animationFrameId: number
    let scrollPosition = 0
    const scrollSpeed = 0.5

    const scroll = () => {
      scrollPosition += scrollSpeed
      
      if (scrollPosition >= scrollContainer.scrollWidth / 2) {
        scrollPosition = 0
      }
      
      scrollContainer.scrollLeft = scrollPosition
      animationFrameId = requestAnimationFrame(scroll)
    }

    animationFrameId = requestAnimationFrame(scroll)

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  const duplicatedTestimonials = [...defaultTestimonials, ...defaultTestimonials]

  return (
    <div 
      ref={containerRef}
      className="relative"
      onMouseMove={handleMouseMove}
    >
      <div 
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.06), transparent 40%)`
        }}
      />
      
      <div 
        ref={scrollRef}
        className="flex gap-6 overflow-x-hidden pb-4"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
      >
        {duplicatedTestimonials.map((testimonial, index) => (
          <motion.div
            key={`${testimonial.id}-${index}`}
            className="flex-shrink-0 w-[350px]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: (index % defaultTestimonials.length) * 0.1 }}
            viewport={{ once: true }}
          >
            <Card className="h-full hover:shadow-xl transition-all duration-300 border-border/50 hover:border-accent/50 relative overflow-hidden group">
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(236, 150, 90, 0.08), transparent 70%)`
                }}
              />
              <CardContent className="pt-6 relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  {testimonial.avatarUrl ? (
                    <img 
                      src={testimonial.avatarUrl} 
                      alt={testimonial.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-border"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <User size={24} className="text-accent" />
                    </div>
                  )}
                  <div className="flex gap-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} size={20} weight="fill" className="text-accent" />
                    ))}
                  </div>
                </div>
                <p className="text-muted-foreground mb-6 italic leading-relaxed min-h-[120px]">
                  "{testimonial.text}"
                </p>
                <div className="mt-auto">
                  <div className="font-semibold text-foreground">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.company}</div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
