import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileArrowUp,
  CheckCircle,
  Warning,
  CloudArrowDown,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  ParsedShipment,
  processShipmentRecord
} from '@/lib/shipmentTypes'
import { parseMainSheetCSV, filterShipments } from '@/lib/sheetsSync'
import { authFetch } from '@/lib/authClient'

interface ExcelImportProps {
  onImportComplete?: (records: ParsedShipment[]) => void
  shipmentRecords?: ParsedShipment[]
  onRecordsUpdate?: (records: ParsedShipment[]) => void
}

export default function ExcelImport({ onImportComplete, shipmentRecords = [], onRecordsUpdate }: ExcelImportProps) {
  const [localShipmentRecords, setLocalShipmentRecords] = useState<ParsedShipment[]>(shipmentRecords)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem('twf-auto-sync')
    if (stored === null) return true // ON por defecto
    return stored === 'true'
  })
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    return parseInt(localStorage.getItem('twf-sync-interval') || '5') || 5
  })
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ParsedShipment[]>([])
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  // Persist auto-sync settings
  useEffect(() => {
    localStorage.setItem('twf-auto-sync', String(autoSyncEnabled))
  }, [autoSyncEnabled])

  useEffect(() => {
    localStorage.setItem('twf-sync-interval', String(syncInterval))
  }, [syncInterval])

  // Auto-sync via server API
  useEffect(() => {
    if (!autoSyncEnabled) return

    const syncData = async () => {
      try {
        await performServerSync(true)
      } catch (error) {
        console.error('Auto-sync error:', error)
      }
    }

    syncData()
    const intervalId = setInterval(syncData, (syncInterval || 5) * 60 * 1000)
    return () => clearInterval(intervalId)
  }, [autoSyncEnabled, syncInterval])

  // ── Server-side sync via API ──
  const performServerSync = async (isSilent: boolean = false) => {
    setIsImporting(true)

    try {
      const res = await authFetch('/api/sheets/sync')

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al sincronizar')
      }

      const data = await res.json()
      const processed: ParsedShipment[] = data.shipments || []

      setLocalShipmentRecords(processed)
      setLastSyncTime(new Date())

      if (!isSilent) {
        toast.success(`${processed.length} registros sincronizados desde Google Sheets`, {
          description: `Ultima actualizacion: ${new Date().toLocaleTimeString('es-UY')}`
        })
      }

      if (onImportComplete) {
        onImportComplete(processed)
      }
    } catch (error) {
      if (!isSilent) {
        toast.error(`Error al sincronizar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    } finally {
      setIsImporting(false)
    }
  }

  // ── Manual import via API (same as sync but shows preview) ──
  const handleImport = async () => {
    setIsImporting(true)

    try {
      const res = await authFetch('/api/sheets/sync')

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al importar')
      }

      const data = await res.json()
      const processed: ParsedShipment[] = data.shipments || []

      setImportPreview(processed)
      setShowPreviewDialog(true)
      toast.success(`${processed.length} registros descargados`)
    } catch (error) {
      toast.error(`Error al importar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setIsImporting(false)
    }
  }

  // ── Manual CSV paste (local parsing, no server) ──
  const handleCSVImport = () => {
    if (!csvText.trim()) {
      toast.error('Por favor pegue el contenido CSV')
      return
    }

    try {
      const rawRecords = parseMainSheetCSV(csvText)
      const processed = rawRecords.map(processShipmentRecord)
      const filtered = filterShipments(processed)
      setImportPreview(filtered)
      setShowPreviewDialog(true)
      toast.success(`${filtered.length} registros listos para importar`)
    } catch (error) {
      toast.error(`Error al procesar CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const confirmImport = () => {
    const recordsToImport = [...importPreview]
    setLocalShipmentRecords(recordsToImport)
    setShowPreviewDialog(false)
    setCsvText('')
    setImportPreview([])
    setValidationErrors([])

    toast.success(`${recordsToImport.length} registros importados exitosamente`)

    if (onImportComplete) {
      onImportComplete(recordsToImport)
    }
  }

  const exportToCSV = () => {
    if (!localShipmentRecords || localShipmentRecords.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    const headers = [
      'REF', 'CLIENTE', 'ETD', 'ETA', 'FT', 'LIBRE HASTA', 'CNTR', 'N',
      'MBL', 'LINEA', 'BUQUE', 'TERMINAL'
    ]

    const rows = localShipmentRecords.map(r => [
      r.REF, r.CLIENTE, r.ETD, r.ETA, r.FT, r.LIBRE_HASTA, r.CNTR, r.N,
      r.MBL, r.LINEA, r.BUQUE, r.TERMINAL
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `twf-tracking-${new Date().toISOString().split('T')[0]}.csv`
    link.click()

    toast.success('Archivo CSV descargado')
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      {localShipmentRecords && localShipmentRecords.length > 0 && (
        <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-lg px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle size={20} className="text-accent" />
              <span className="font-medium">{localShipmentRecords.length} registros cargados</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {localShipmentRecords.reduce((sum, r) => sum + r.N, 0)} contenedores &middot; {new Set(localShipmentRecords.map(r => r.CLIENTE)).size} clientes
            </span>
            {lastSyncTime && (
              <span className="text-xs text-muted-foreground">
                Sincronizado: {lastSyncTime.toLocaleTimeString('es-UY')}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <CloudArrowDown size={16} className="mr-1" />
            Exportar
          </Button>
        </div>
      )}

      {/* Main import card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudArrowDown size={24} />
            Importar Datos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Los datos se sincronizan desde Google Sheets configurado en el servidor.
          </p>

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <CloudArrowDown size={20} className="mr-2" />
              {isImporting ? 'Importando...' : 'Importar desde Sheets'}
            </Button>
            <Button
              onClick={() => performServerSync(false)}
              disabled={isImporting}
              variant="outline"
            >
              <ArrowsClockwise size={20} className="mr-2" />
              Sincronizar
            </Button>
          </div>

          {/* Auto-sync toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div className="space-y-0.5">
              <Label htmlFor="auto-sync" className="text-sm">Sincronizacion Automatica</Label>
              <p className="text-xs text-muted-foreground">Actualiza periodicamente desde Google Sheets</p>
            </div>
            <div className="flex items-center gap-2">
              {autoSyncEnabled && (
                <Select
                  value={String(syncInterval || 5)}
                  onValueChange={(value) => setSyncInterval(parseInt(value))}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="10">10 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Switch
                id="auto-sync"
                checked={autoSyncEnabled || false}
                onCheckedChange={setAutoSyncEnabled}
              />
            </div>
          </div>

          {/* Collapsible CSV paste */}
          <details className="border-t pt-4">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Pegar datos CSV manualmente
            </summary>
            <div className="mt-3 space-y-3">
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="REF,CLIENTE,ETD,ETA,CNTR,N,MBL,LINEA,BUQUE,TERMINAL..."
                rows={6}
                className="font-mono text-xs"
              />
              <Button
                onClick={handleCSVImport}
                disabled={!csvText.trim()}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                size="sm"
              >
                <FileArrowUp size={18} className="mr-2" />
                Procesar CSV
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>

      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resumen de Importacion</DialogTitle>
          </DialogHeader>

          {(() => {
            const refCount = new Map<string, number>()
            importPreview.forEach(r => {
              refCount.set(r.REF, (refCount.get(r.REF) || 0) + 1)
            })
            const duplicateRefs = new Set([...refCount.entries()].filter(([, count]) => count > 1).map(([ref]) => ref))
            const duplicateCount = [...duplicateRefs].reduce((sum, ref) => sum + (refCount.get(ref) || 0) - 1, 0)
            const uniqueRecords = importPreview.length - duplicateCount
            const totalContainers = importPreview.reduce((sum, r) => sum + (r.N || r.containers.length), 0)
            const uniqueClients = new Set(importPreview.map(r => r.CLIENTE)).size
            const uniqueLines = new Set(importPreview.filter(r => r.LINEA).map(r => r.LINEA)).size

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-accent/10 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-accent">{uniqueRecords}</div>
                    <div className="text-xs text-muted-foreground">Registros nuevos</div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{totalContainers}</div>
                    <div className="text-xs text-muted-foreground">Contenedores</div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{uniqueClients}</div>
                    <div className="text-xs text-muted-foreground">Clientes</div>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{uniqueLines}</div>
                    <div className="text-xs text-muted-foreground">Navieras</div>
                  </div>
                </div>

                {duplicateCount > 0 && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-yellow-800 font-medium text-sm">
                      <Warning size={16} />
                      {duplicateCount} duplicados ({duplicateRefs.size} REFs repetidas)
                    </div>
                    <p className="text-xs text-yellow-700 mt-1">
                      {[...duplicateRefs].slice(0, 8).join(', ')}{duplicateRefs.size > 8 ? ` y ${duplicateRefs.size - 8} mas` : ''}
                    </p>
                  </div>
                )}

                {validationErrors.length > 0 && (
                  <details className="border rounded-lg p-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground font-medium">
                      {validationErrors.length} advertencias
                    </summary>
                    <ul className="list-disc ml-4 mt-2 text-xs text-muted-foreground max-h-24 overflow-y-auto">
                      {validationErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowPreviewDialog(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={confirmImport}
                    className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    <CheckCircle size={20} className="mr-2" />
                    Importar {importPreview.length}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
