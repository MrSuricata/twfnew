import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MagnifyingGlass, Boat, MapPin, CalendarBlank, Package, CheckCircle, X as XIcon, Clock, Info, CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { ParsedShipment, processShipmentRecord } from '@/lib/shipmentTypes'

const SHEETS_CSV_URL = import.meta.env.VITE_GOOGLE_SHEETS_CSV_URL || ''

export default function PublicTracking() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResult, setSearchResult] = useState<ParsedShipment | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchQuery.trim()) {
      toast.error('Ingrese un número de contenedor, MBL o referencia')
      return
    }

    setIsSearching(true)
    setHasSearched(true)

    try {
      // Try Vercel API first, fallback to direct CSV
      let shipments: ParsedShipment[] = []

      try {
        const res = await fetch(`/api/tracking?q=${encodeURIComponent(searchQuery.trim())}`)
        if (res.ok) {
          const data = await res.json()
          shipments = data.results || []
        }
      } catch {
        // Fallback: fetch CSV directly if API not available
        if (SHEETS_CSV_URL) {
          const res = await fetch(SHEETS_CSV_URL)
          const text = await res.text()
          shipments = parseCSV(text)
        }
      }

      const query = searchQuery.toLowerCase().trim()
      const found = shipments.find(
        s => s.CNTR?.toLowerCase().includes(query) ||
             s.REF?.toLowerCase().includes(query) ||
             s.MBL?.toLowerCase().includes(query)
      )

      if (found) {
        setSearchResult(found)
        toast.success('Envío encontrado')
      } else {
        setSearchResult(null)
        toast.error('No se encontró el envío. Verifique el número ingresado.')
      }
    } catch (error) {
      console.error('Error searching:', error)
      toast.error('Error al buscar. Intente nuevamente.')
      setSearchResult(null)
    } finally {
      setIsSearching(false)
    }
  }

  const parseCSV = (csv: string): ParsedShipment[] => {
    const lines = csv.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

    return lines.slice(1).map(line => {
      const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || []
      const record: Record<string, string> = {}

      headers.forEach((header, i) => {
        record[header] = (values[i] || '').replace(/^"|"$/g, '').trim()
      })

      return processShipmentRecord({
        REF: record.REF || '',
        CLIENTE: record.CLIENTE || '',
        ETD: record.ETD || '',
        ETA: record.ETA || '',
        FT: Number(record.FT) || 0,
        LIBRE_HASTA: record.LIBRE_HASTA || '',
        CNTR: record.CNTR || '',
        N: Number(record.N) || 0,
        MBL: record.MBL || '',
        LINEA: record.LINEA || '',
        BUQUE: record.BUQUE || '',
        TERMINAL: record.TERMINAL || '',
        C_TERMINAL: Number(record.C_TERMINAL) || 0,
        C_DEV: Number(record.C_DEV) || 0,
        LOCALES: Number(record.LOCALES) || 0,
        FLETE: Number(record.FLETE) || 0,
        FORMA_DE_PAGO: (record.FORMA_DE_PAGO as any) || 'al arribo',
        VTO: record.VTO || '',
        CR: record.CR === 'true' || record.CR === 'TRUE',
        BL: record.BL === 'true' || record.BL === 'TRUE',
        AD: record.AD === 'true' || record.AD === 'TRUE',
        AT: record.AT === 'true' || record.AT === 'TRUE',
      })
    })
  }

  const getDaysUntilFree = (libreHasta: string): number => {
    if (!libreHasta) return 0
    const freeDate = new Date(libreHasta)
    const today = new Date()
    const diff = Math.floor((freeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  const getUrgencyBadge = (days: number) => {
    if (days < 0) {
      return <Badge className="bg-red-500">Vencido hace {Math.abs(days)} días</Badge>
    } else if (days <= 2) {
      return <Badge className="bg-orange-500">Urgente - {days} días restantes</Badge>
    } else if (days <= 5) {
      return <Badge className="bg-yellow-500">{days} días restantes</Badge>
    }
    return <Badge className="bg-green-500">{days} días libres</Badge>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="search">Número de Contenedor, MBL o Referencia</Label>
              <div className="flex gap-2">
                <Input
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: MSCU1234567, TWF-2024-001"
                  className="flex-1"
                  disabled={isSearching}
                />
                <Button type="submit" disabled={isSearching} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {isSearching ? (
                    <CircleNotch size={20} className="mr-2 animate-spin" />
                  ) : (
                    <MagnifyingGlass size={20} className="mr-2" />
                  )}
                  {isSearching ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Ingrese el número de contenedor, MBL o referencia para rastrear su envío
            </p>
          </form>
        </CardContent>
      </Card>

      {!searchResult && !hasSearched && (
        <Card className="bg-accent/10 border-accent/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-accent/20 p-3 rounded-full">
                <Info size={24} className="text-accent" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2">¿Cómo rastrear su envío?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Puede buscar su carga utilizando cualquiera de los siguientes datos:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li><strong>Número de Contenedor</strong> (Ej: MSCU1234567)</li>
                  <li><strong>Número de MBL</strong> (Conocimiento de embarque)</li>
                  <li><strong>Referencia TWF</strong> (Ej: TWF-2024-001)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  Si no cuenta con estos datos, contáctenos por WhatsApp o email y le proporcionaremos la información de seguimiento.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {hasSearched && !searchResult && !isSearching && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-orange-100 p-3 rounded-full">
                <MagnifyingGlass size={24} className="text-orange-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-2 text-orange-800">No se encontraron resultados</h4>
                <p className="text-sm text-orange-700">
                  No se encontró ningún envío con "{searchQuery}". Verifique el número ingresado o contáctenos por WhatsApp para asistencia.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {searchResult && (
        <>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-xl font-semibold mb-6">Información del Envío</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Package size={18} />
                    <span>Número de Referencia</span>
                  </div>
                  <p className="font-semibold text-lg font-mono">{searchResult.REF}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Boat size={18} />
                    <span>Línea Naviera</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.LINEA || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <CalendarBlank size={18} />
                    <span>Fecha de Salida</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.ETD || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <CalendarBlank size={18} />
                    <span>Fecha Estimada de Arribo</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.ETA || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Clock size={18} />
                    <span>Periodo Libre Hasta</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-lg">{searchResult.LIBRE_HASTA || 'N/A'}</p>
                    {searchResult.LIBRE_HASTA && getUrgencyBadge(getDaysUntilFree(searchResult.LIBRE_HASTA))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <MapPin size={18} />
                    <span>Terminal Portuaria</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.TERMINAL || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Boat size={18} />
                    <span>Nombre del Buque</span>
                  </div>
                  <p className="font-semibold text-lg">{searchResult.BUQUE || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <span>Conocimiento de Embarque</span>
                  </div>
                  <p className="font-semibold text-lg font-mono text-xs">{searchResult.MBL || 'N/A'}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <h4 className="font-semibold mb-4">Números de Contenedores ({searchResult.N})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {searchResult.containers.map((container, index) => (
                    <div key={index} className="flex items-center gap-2 p-3 rounded border border-border bg-muted/30">
                      {container.valid ? (
                        <CheckCircle size={18} className="text-green-500" weight="fill" />
                      ) : (
                        <XIcon size={18} className="text-red-500" weight="bold" />
                      )}
                      <span className="font-mono text-sm">{container.number}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-accent/10 border-accent/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="bg-accent/20 p-3 rounded-full">
                  <Info size={24} className="text-accent" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Información adicional</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Los datos de tracking se sincronizan automáticamente con nuestra base de seguimiento.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Para más información sobre su envío, contacte a nuestro equipo vía WhatsApp o email.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
