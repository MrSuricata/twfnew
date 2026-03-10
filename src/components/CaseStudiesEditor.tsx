import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Pencil, Trash, FloppyDisk, X } from '@phosphor-icons/react'
import { toast } from 'sonner'

import { CaseStudy } from './CasosExito'

export default function CaseStudiesEditor() {
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([])
  const [editingCase, setEditingCase] = useState<CaseStudy | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<CaseStudy>>({
    iconType: 'Boat',
    type: '',
    title: '',
    description: '',
    origin: '',
    destination: '',
    results: [
      { label: '', value: '' },
      { label: '', value: '' },
      { label: '', value: '' }
    ],
    image: ''
  })

  const handleEdit = (caseStudy: CaseStudy) => {
    setEditingCase(caseStudy)
    setFormData(caseStudy)
    setIsDialogOpen(true)
  }

  const handleNew = () => {
    setEditingCase(null)
    setFormData({
      iconType: 'Boat',
      type: '',
      title: '',
      description: '',
      origin: '',
      destination: '',
      results: [
        { label: '', value: '' },
        { label: '', value: '' },
        { label: '', value: '' }
      ],
      image: ''
    })
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.title || !formData.description || !formData.origin || !formData.destination) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }

    const newCase: CaseStudy = {
      id: editingCase?.id || `case-${Date.now()}`,
      iconType: formData.iconType || 'Boat',
      type: formData.type || '',
      title: formData.title || '',
      description: formData.description || '',
      origin: formData.origin || '',
      destination: formData.destination || '',
      results: formData.results || [],
      image: formData.image || ''
    }

    if (editingCase) {
      setCaseStudies((current) => 
        (current || []).map(c => c.id === editingCase.id ? newCase : c)
      )
      toast.success('Caso de éxito actualizado')
    } else {
      setCaseStudies((current) => [...(current || []), newCase])
      toast.success('Caso de éxito creado')
    }

    setIsDialogOpen(false)
    setEditingCase(null)
  }

  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este caso de éxito?')) {
      setCaseStudies((current) => (current || []).filter(c => c.id !== id))
      toast.success('Caso de éxito eliminado')
    }
  }

  const updateResult = (index: number, field: 'label' | 'value', value: string) => {
    const newResults = [...(formData.results || [])]
    newResults[index] = { ...newResults[index], [field]: value }
    setFormData({ ...formData, results: newResults })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Casos de Éxito</h2>
          <p className="text-muted-foreground">Gestiona los casos de éxito que se muestran en la web</p>
        </div>
        <Button onClick={handleNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus size={20} className="mr-2" />
          Nuevo Caso
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(caseStudies || []).map((caseStudy) => (
          <Card key={caseStudy.id} className="overflow-hidden">
            {caseStudy.image && (
              <div className="h-32 overflow-hidden">
                <img 
                  src={caseStudy.image} 
                  alt={caseStudy.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <CardHeader className="pb-3">
              <CardTitle className="text-lg line-clamp-2">{caseStudy.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <div className="font-medium">{caseStudy.type}</div>
                <div className="text-xs mt-1">{caseStudy.origin} → {caseStudy.destination}</div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleEdit(caseStudy)}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Pencil size={16} className="mr-2" />
                  Editar
                </Button>
                <Button 
                  onClick={() => handleDelete(caseStudy.id)}
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                >
                  <Trash size={16} />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {(caseStudies || []).length === 0 && (
          <Card className="col-span-full">
            <CardContent className="pt-6 text-center py-12">
              <Plus size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No hay casos de éxito</h3>
              <p className="text-muted-foreground mb-4">Crea el primer caso de éxito para tu sitio web</p>
              <Button onClick={handleNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Plus size={20} className="mr-2" />
                Crear Caso de Éxito
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCase ? 'Editar Caso de Éxito' : 'Nuevo Caso de Éxito'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="iconType">Icono *</Label>
                <Select 
                  value={formData.iconType} 
                  onValueChange={(value: 'Boat' | 'Package' | 'Truck') => setFormData({ ...formData, iconType: value })}
                >
                  <SelectTrigger id="iconType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Boat">🚢 Barco (Marítimo)</SelectItem>
                    <SelectItem value="Package">📦 Paquete (LCL/Consolidado)</SelectItem>
                    <SelectItem value="Truck">🚛 Camión (Terrestre)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">Categoría *</Label>
                <Input
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Ej: FCL - Importación desde Asia"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Título del caso de éxito"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el caso de éxito en detalle"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origen *</Label>
                <Input
                  id="origin"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  placeholder="Ej: Shanghai, China"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destino *</Label>
                <Input
                  id="destination"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  placeholder="Ej: Montevideo, Uruguay"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="image">URL de Imagen</Label>
              <Input
                id="image"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://images.unsplash.com/..."
              />
              {formData.image && (
                <div className="mt-2">
                  <img 
                    src={formData.image} 
                    alt="Preview" 
                    className="w-full h-32 object-cover rounded border"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/800x400?text=Error+cargando+imagen'
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>Resultados (3)</Label>
              {[0, 1, 2].map((index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Etiqueta (ej: Tiempo de tránsito)"
                    value={formData.results?.[index]?.label || ''}
                    onChange={(e) => updateResult(index, 'label', e.target.value)}
                  />
                  <Input
                    placeholder="Valor (ej: 35 días)"
                    value={formData.results?.[index]?.value || ''}
                    onChange={(e) => updateResult(index, 'value', e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
              >
                <X size={16} className="mr-2" />
                Cancelar
              </Button>
              <Button 
                onClick={handleSave}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <FloppyDisk size={16} className="mr-2" />
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
