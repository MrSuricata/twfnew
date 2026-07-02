import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash, PencilSimple, Star, User } from '@phosphor-icons/react'
import { toast } from 'sonner'


export interface Testimonial {
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

export default function TestimonialsEditor() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>(defaultTestimonials)
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [formData, setFormData] = useState<Testimonial>({
    id: '',
    name: '',
    role: '',
    company: '',
    text: '',
    rating: 5,
    avatarUrl: ''
  })

  const handleOpenDialog = (testimonial?: Testimonial) => {
    if (testimonial) {
      setFormData(testimonial)
      setEditingTestimonial(testimonial)
    } else {
      setFormData({
        id: Date.now().toString(),
        name: '',
        role: '',
        company: '',
        text: '',
        rating: 5,
        avatarUrl: ''
      })
      setEditingTestimonial(null)
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingTestimonial(null)
    setFormData({
      id: '',
      name: '',
      role: '',
      company: '',
      text: '',
      rating: 5,
      avatarUrl: ''
    })
  }

  const handleSave = () => {
    if (!formData.name || !formData.role || !formData.company || !formData.text) {
      toast.error('Por favor complete todos los campos requeridos')
      return
    }

    if (editingTestimonial) {
      setTestimonials((current) =>
        (current || []).map(t => t.id === formData.id ? formData : t)
      )
      toast.success('Testimonio actualizado exitosamente')
    } else {
      setTestimonials((current) => [...(current || []), formData])
      toast.success('Testimonio creado exitosamente')
    }

    handleCloseDialog()
  }

  const handleDelete = (id: string) => {
    if (confirm('¿Está seguro de eliminar este testimonio?')) {
      setTestimonials((current) => (current || []).filter(t => t.id !== id))
      toast.success('Testimonio eliminado')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Testimonios</h1>
          <p className="text-muted-foreground">
            Administrá los testimonios de clientes que aparecen en el sitio web
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => handleOpenDialog()}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus size={20} className="mr-2" />
              Nuevo testimonio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTestimonial ? 'Editar testimonio' : 'Nuevo testimonio'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Juan Pérez"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Cargo *</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="Director de Operaciones"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Empresa/Ciudad *</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Montevideo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="text">Testimonio *</Label>
                <Textarea
                  id="text"
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Excelente servicio, muy profesionales..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rating">Calificación *</Label>
                <Select 
                  value={formData.rating.toString()} 
                  onValueChange={(value) => setFormData({ ...formData, rating: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">⭐⭐⭐⭐⭐ (5 estrellas)</SelectItem>
                    <SelectItem value="4">⭐⭐⭐⭐ (4 estrellas)</SelectItem>
                    <SelectItem value="3">⭐⭐⭐ (3 estrellas)</SelectItem>
                    <SelectItem value="2">⭐⭐ (2 estrellas)</SelectItem>
                    <SelectItem value="1">⭐ (1 estrella)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarUrl">URL Avatar (opcional)</Label>
                <Input
                  id="avatarUrl"
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  placeholder="https://ejemplo.com/avatar.jpg"
                />
                {formData.avatarUrl && (
                  <div className="mt-2">
                    <img 
                      src={formData.avatarUrl} 
                      alt="Preview" 
                      className="w-16 h-16 rounded-full object-cover border-2 border-border"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {editingTestimonial ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(testimonials || []).map((testimonial) => (
          <Card key={testimonial.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
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
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                      <User size={24} className="text-accent" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{testimonial.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{testimonial.role}</p>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleOpenDialog(testimonial)}
                    className="h-8 w-8"
                  >
                    <PencilSimple size={16} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => handleDelete(testimonial.id)}
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                  >
                    <Trash size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-1">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} size={16} weight="fill" className="text-accent" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground italic line-clamp-3">
                "{testimonial.text}"
              </p>
              <p className="text-xs text-muted-foreground">
                {testimonial.company}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!testimonials || testimonials.length === 0) && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <User size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No hay testimonios</h3>
              <p className="text-muted-foreground mb-4">
                Creá el primer testimonio de cliente
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
