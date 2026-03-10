import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  FileArrowUp, 
  FileCsv, 
  CheckCircle, 
  Warning,
  X,
  Trash,
  Eye,
  CloudArrowDown,
  ArrowsClockwise,
  Link as LinkIcon
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  ShipmentRecord,
  ParsedShipment,
  processShipmentRecord
} from '@/lib/shipmentTypes'
import GoogleSheetsGuide from './GoogleSheetsGuide'

interface ExcelImportProps {
  onImportComplete?: (records: ParsedShipment[]) => void
  shipmentRecords?: ParsedShipment[]
  onRecordsUpdate?: (records: ParsedShipment[]) => void
}

export default function ExcelImport({ onImportComplete, shipmentRecords = [], onRecordsUpdate }: ExcelImportProps) {
  const [localShipmentRecords, setLocalShipmentRecords] = useState<ParsedShipment[]>(shipmentRecords)
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState<string>('')
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false)
  const [syncInterval, setSyncInterval] = useState<number>(5)
  const [isImporting, setIsImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<ParsedShipment[]>([])
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  useEffect(() => {
    if (!autoSyncEnabled || !googleSheetsUrl) return

    const syncData = async () => {
      try {
        await performGoogleSheetsSync(true)
      } catch (error) {
        console.error('Auto-sync error:', error)
      }
    }

    syncData()
    const intervalId = setInterval(syncData, (syncInterval || 5) * 60 * 1000)

    return () => clearInterval(intervalId)
  }, [autoSyncEnabled, googleSheetsUrl, syncInterval])

  const performGoogleSheetsSync = async (isSilent: boolean = false) => {
    if (!googleSheetsUrl || googleSheetsUrl.trim() === '') {
      if (!isSilent) toast.error('No hay URL de Google Sheets configurada')
      return
    }

    setIsImporting(true)

    try {
      let csvUrl: string = googleSheetsUrl
      
      if (csvUrl.includes('/edit')) {
        const sheetId = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
        if (!sheetId) {
          throw new Error('URL de Google Sheets inválida')
        }
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
      }

      const response = await fetch(csvUrl)
      if (!response.ok) {
        throw new Error('No se pudo acceder al archivo. Asegúrese que el link sea público.')
      }

      const csvData = await response.text()
      const rawRecords = parseCSVData(csvData)
      const processed = rawRecords.map(processShipmentRecord)
      
      const processedCopy = [...processed]
      setLocalShipmentRecords(() => processedCopy)
      setLastSyncTime(new Date())
      
      if (!isSilent) {
        toast.success(`${processedCopy.length} registros sincronizados desde Google Sheets`, {
          description: `Última actualización: ${new Date().toLocaleTimeString('es-UY')}`
        })
      }

      if (onImportComplete) {
        onImportComplete(processedCopy)
      }
    } catch (error) {
      if (!isSilent) {
        toast.error(`Error al sincronizar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
      }
    } finally {
      setIsImporting(false)
    }
  }

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    
    result.push(current.trim())
    return result
  }

  const parseDate = (dateStr: string): string => {
    if (!dateStr || dateStr.trim() === '') return ''
    
    const cleaned = dateStr.trim().replace(/"/g, '')
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
      return cleaned
    }
    
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cleaned)) {
      const parts = cleaned.split('/')
      const day = parts[0].padStart(2, '0')
      const month = parts[1].padStart(2, '0')
      let year = parts[2]
      
      if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`
      }
      
      return `${year}-${month}-${day}`
    }
    
    try {
      const date = new Date(cleaned)
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0]
      }
    } catch {
      return cleaned
    }
    
    return cleaned
  }

  const parseCSVData = (csvData: string): Partial<ShipmentRecord>[] => {
    const lines = csvData.split('\n').filter(line => line.trim() !== '')
    if (lines.length < 2) {
      throw new Error('El archivo CSV debe contener al menos una fila de encabezados y una fila de datos')
    }

    const headers = parseCSVLine(lines[0])
    console.log('Headers detectados:', headers)
    const records: Partial<ShipmentRecord>[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      
      if (values.length === 0 || values.every(v => v === '')) continue

      const record: Partial<ShipmentRecord> = {}

      headers.forEach((header, index) => {
        const value = values[index] || ''
        const normalizedHeader = header.trim().toUpperCase().replace(/\s+/g, '_').replace(/\./g, '').replace(/°/g, '')

        switch (normalizedHeader) {
          case 'REF':
          case 'REFERENCIA':
            record.REF = value.trim()
            break
          case 'CLIENTE':
          case 'CLIENT':
            record.CLIENTE = value.trim()
            break
          case 'ETD':
            record.ETD = parseDate(value)
            break
          case 'ETA':
            record.ETA = parseDate(value)
            break
          case 'FT':
          case 'FREE_TIME':
            record.FT = parseInt(value) || 0
            break
          case 'LIBRE_HASTA':
          case 'FREE_UNTIL':
            record.LIBRE_HASTA = parseDate(value)
            break
          case 'CNTR':
          case 'CONTAINER':
          case 'CONTENEDOR':
          case 'CONTENEDORES':
            record.CNTR = value.trim()
            break
          case 'N':
          case 'N':
          case 'N':
          case 'NUM':
          case 'CANTIDAD':
            const parsed = parseInt(value)
            record.N = isNaN(parsed) ? 0 : parsed
            break
          case 'MBL':
          case 'MASTER':
          case 'BL':
            record.MBL = value.trim()
            break
          case 'LINEA':
          case 'LÍNEA':
          case 'LINE':
          case 'SHIPPING_LINE':
            record.LINEA = value.trim()
            break
          case 'BUQUE':
          case 'VESSEL':
          case 'SHIP':
            record.BUQUE = value.trim()
            break
          case 'TERMINAL':
          case 'TERMIN':
          case 'PORT':
          case 'PUERTO':
            record.TERMINAL = value.trim()
            break
          case 'C_TERMINAL':
          case 'C_TERMINAL':
          case 'COST_TERMINAL':
            record.C_TERMINAL = parseFloat(value.replace(/,/g, '')) || 0
            break
          case 'C_DEV':
          case 'C_DEV':
          case 'C_DEV':
          case 'COST_DEV':
            record.C_DEV = parseFloat(value.replace(/,/g, '')) || 0
            break
          case 'LOCALES':
          case 'LOCAL':
            record.LOCALES = parseFloat(value.replace(/,/g, '')) || 0
            break
          case 'FLETE':
          case 'FREIGHT':
            record.FLETE = parseFloat(value.replace(/,/g, '')) || 0
            break
          case 'FORMA_DE_PAGO':
          case 'PAYMENT_FORM':
            const formaPago = value.toLowerCase()
            if (formaPago.includes('programado')) record.FORMA_DE_PAGO = 'programado'
            else if (formaPago.includes('cuenta corriente')) record.FORMA_DE_PAGO = 'cuenta corriente'
            else record.FORMA_DE_PAGO = 'al arribo'
            break
          case 'VTO':
            record.VTO = value
            break
          case 'CR':
            record.CR = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
            break
          case 'BL':
            record.BL = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
            break
          case 'AD':
            record.AD = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
            break
          case 'AT':
            record.AT = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'sí' || value.toLowerCase() === 'si'
            break
        }
      })

      if (record.REF && record.CLIENTE) {
        records.push(record)
      } else {
        errors.push(`Fila ${i + 1}: Faltan campos obligatorios (REF y CLIENTE)`)
      }
    }

    console.log('Registros parseados:', records.length)
    console.log('Primer registro:', records[0])
    setValidationErrors(errors)
    return records
  }

  const handleCSVImport = () => {
    if (!csvText.trim()) {
      toast.error('Por favor pegue el contenido CSV')
      return
    }

    try {
      const rawRecords = parseCSVData(csvText)
      const processed = rawRecords.map(processShipmentRecord)
      setImportPreview(processed)
      setShowPreviewDialog(true)
      toast.success(`${processed.length} registros listos para importar`)
    } catch (error) {
      toast.error(`Error al procesar CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleGoogleSheetsImport = async () => {
    if (!googleSheetsUrl || googleSheetsUrl.trim() === '') {
      toast.error('Por favor ingrese la URL de Google Sheets')
      return
    }

    setIsImporting(true)

    try {
      let csvUrl: string = googleSheetsUrl
      
      if (csvUrl.includes('/edit')) {
        const sheetId = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1]
        if (!sheetId) {
          throw new Error('URL de Google Sheets inválida')
        }
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
      }

      const response = await fetch(csvUrl)
      if (!response.ok) {
        throw new Error('No se pudo acceder al archivo. Asegúrese que el link sea público.')
      }

      const csvData = await response.text()
      const rawRecords = parseCSVData(csvData)
      const processed = rawRecords.map(processShipmentRecord)
      
      setImportPreview(processed)
      setShowPreviewDialog(true)
      toast.success(`${processed.length} registros descargados desde Google Sheets`)
    } catch (error) {
      toast.error(`Error al importar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setIsImporting(false)
    }
  }

  const confirmImport = () => {
    const recordsToImport = [...importPreview]
    setLocalShipmentRecords(() => recordsToImport)
    setShowPreviewDialog(false)
    setCsvText('')
    setImportPreview([])
    setValidationErrors([])
    
    toast.success(`${recordsToImport.length} registros importados exitosamente`)
    
    if (onImportComplete) {
      onImportComplete(recordsToImport)
    }
  }

  const handleDeleteRecord = (ref: string) => {
    setLocalShipmentRecords((current) => 
      (current || []).filter(r => r.REF !== ref)
    )
    toast.success('Registro eliminado')
  }

  const exportToCSV = () => {
    if (!localShipmentRecords || localShipmentRecords?.length === 0) {
      toast.error('No hay datos para exportar')
      return
    }

    const headers = [
      'REF', 'CLIENTE', 'ETD', 'ETA', 'FT', 'LIBRE HASTA', 'CNTR', 'N°',
      'MBL', 'LÍNEA', 'BUQUE', 'TERMINAL', 'C. TERMINAL', 'C. DEV.', 'LOCALES',
      'FLETE', 'FORMA DE PAGO', 'VTO', 'CR', 'BL', 'AD', 'AT'
    ]

    const rows = localShipmentRecords.map(r => [
      r.REF,
      r.CLIENTE,
      r.ETD,
      r.ETA,
      r.FT,
      r.LIBRE_HASTA,
      r.CNTR,
      r.N,
      r.MBL,
      r.LINEA,
      r.BUQUE,
      r.TERMINAL,
      r.C_TERMINAL,
      r.C_DEV,
      r.LOCALES,
      r.FLETE,
      r.FORMA_DE_PAGO,
      r.VTO,
      r.CR ? 'TRUE' : 'FALSE',
      r.BL ? 'TRUE' : 'FALSE',
      r.AD ? 'TRUE' : 'FALSE',
      r.AT ? 'TRUE' : 'FALSE'
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
      <Tabs defaultValue="google-sheets" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="google-sheets">
            <FileCsv size={20} className="mr-2" />
            Google Sheets
          </TabsTrigger>
          <TabsTrigger value="csv-paste">
            <FileArrowUp size={20} className="mr-2" />
            Pegar CSV
          </TabsTrigger>
          <TabsTrigger value="view-data">
            <Eye size={20} className="mr-2" />
            Ver Datos ({shipmentRecords?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="google-sheets">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCsv size={24} />
                  Importar desde Google Sheets
                </div>
                {lastSyncTime && (
                  <span className="text-sm font-normal text-muted-foreground">
                    Última sincronización: {lastSyncTime.toLocaleTimeString('es-UY')}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertDescription>
                  <strong>Instrucciones:</strong>
                  <ol className="list-decimal ml-4 mt-2 space-y-1 text-sm">
                    <li>Asegúrese que su Google Sheet sea <strong>público</strong> (cualquiera con el enlace puede ver)</li>
                    <li>Copie el enlace completo de la hoja</li>
                    <li>Péguelo abajo y presione "Importar"</li>
                    <li>Opcionalmente, active la sincronización automática para mantener los datos actualizados</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="google-sheets-url">URL de Google Sheets</Label>
                <div className="flex gap-2">
                  <Input
                    id="google-sheets-url"
                    value={googleSheetsUrl || ''}
                    onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="font-mono text-sm"
                  />
                  {googleSheetsUrl && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(googleSheetsUrl, '_blank')}
                      title="Abrir Google Sheet"
                    >
                      <LinkIcon size={20} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Button
                  onClick={handleGoogleSheetsImport}
                  disabled={isImporting || !googleSheetsUrl || googleSheetsUrl.trim() === ''}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <CloudArrowDown size={20} className="mr-2" />
                  {isImporting ? 'Importando...' : 'Importar Ahora'}
                </Button>

                {googleSheetsUrl && googleSheetsUrl.trim() !== '' && (
                  <Button
                    onClick={() => performGoogleSheetsSync(false)}
                    disabled={isImporting}
                    variant="outline"
                    className="w-full"
                  >
                    <ArrowsClockwise size={20} className="mr-2" />
                    Sincronizar Datos
                  </Button>
                )}
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-sync">Sincronización Automática</Label>
                    <p className="text-sm text-muted-foreground">
                      Actualiza automáticamente los datos desde Google Sheets
                    </p>
                  </div>
                  <Switch
                    id="auto-sync"
                    checked={autoSyncEnabled || false}
                    onCheckedChange={setAutoSyncEnabled}
                    disabled={!googleSheetsUrl || googleSheetsUrl.trim() === ''}
                  />
                </div>

                {autoSyncEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="sync-interval">Intervalo de Sincronización (minutos)</Label>
                    <Select 
                      value={String(syncInterval || 5)} 
                      onValueChange={(value) => setSyncInterval(parseInt(value))}
                    >
                      <SelectTrigger id="sync-interval">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 minuto</SelectItem>
                        <SelectItem value="5">5 minutos</SelectItem>
                        <SelectItem value="10">10 minutos</SelectItem>
                        <SelectItem value="15">15 minutos</SelectItem>
                        <SelectItem value="30">30 minutos</SelectItem>
                        <SelectItem value="60">1 hora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <GoogleSheetsGuide />
        </TabsContent>

        <TabsContent value="csv-paste">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileArrowUp size={24} />
                Pegar Datos CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  <strong>Instrucciones:</strong>
                  <ol className="list-decimal ml-4 mt-2 space-y-1 text-sm">
                    <li>Seleccione todas las celdas en Excel/Google Sheets (incluyendo encabezados)</li>
                    <li>Copie (Ctrl+C o Cmd+C)</li>
                    <li>Pegue en el área de texto abajo</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="csv-text">Contenido CSV</Label>
                <Textarea
                  id="csv-text"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="REF,CLIENTE,ETD,ETA,FT,LIBRE HASTA,CNTR,N°,MBL,LÍNEA,BUQUE,TERMINAL..."
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>

              <Button
                onClick={handleCSVImport}
                disabled={!csvText.trim()}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <FileArrowUp size={20} className="mr-2" />
                Procesar CSV
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="view-data">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye size={24} />
                  Datos Importados ({shipmentRecords?.length || 0})
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={exportToCSV}
                    disabled={!localShipmentRecords || localShipmentRecords?.length === 0}
                  >
                    <CloudArrowDown size={20} className="mr-2" />
                    Exportar CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!localShipmentRecords || localShipmentRecords?.length === 0 ? (
                <div className="text-center py-12">
                  <FileCsv size={48} className="mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No hay datos importados</h3>
                  <p className="text-muted-foreground mb-4">
                    Importe datos desde Google Sheets o pegando CSV
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-accent">{localShipmentRecords?.length}</div>
                        <div className="text-sm text-muted-foreground">Total Referencias</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-accent">
                          {localShipmentRecords.reduce((sum, r) => sum + r.N, 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">Total Contenedores</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-accent">
                          {new Set(localShipmentRecords.map(r => r.CLIENTE)).size}
                        </div>
                        <div className="text-sm text-muted-foreground">Clientes Únicos</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-accent">
                          {new Set(localShipmentRecords.map(r => r.LINEA)).size}
                        </div>
                        <div className="text-sm text-muted-foreground">Líneas Navieras</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>REF</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>ETD</TableHead>
                          <TableHead>ETA</TableHead>
                          <TableHead>FT</TableHead>
                          <TableHead>Libre Hasta</TableHead>
                          <TableHead>CNTR</TableHead>
                          <TableHead>N°</TableHead>
                          <TableHead>MBL</TableHead>
                          <TableHead>Línea</TableHead>
                          <TableHead>Buque</TableHead>
                          <TableHead>Terminal</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localShipmentRecords.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-xs font-semibold">{record.REF}</TableCell>
                            <TableCell>{record.CLIENTE}</TableCell>
                            <TableCell className="text-sm">{record.ETD}</TableCell>
                            <TableCell className="text-sm">{record.ETA}</TableCell>
                            <TableCell className="text-sm">{record.FT}</TableCell>
                            <TableCell className="text-sm">{record.LIBRE_HASTA}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[150px] truncate" title={record.CNTR}>
                              {record.CNTR}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.N}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{record.MBL}</TableCell>
                            <TableCell className="text-sm">{record.LINEA}</TableCell>
                            <TableCell className="text-sm">{record.BUQUE}</TableCell>
                            <TableCell className="text-sm">{record.TERMINAL}</TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {record.CR && <Badge variant="outline" className="text-xs">CR</Badge>}
                                {record.BL && <Badge variant="outline" className="text-xs">BL</Badge>}
                                {record.AD && <Badge variant="outline" className="text-xs">AD</Badge>}
                                {record.AT && <Badge variant="outline" className="text-xs">AT</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteRecord(record.REF)}
                              >
                                <Trash size={16} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vista Previa de Importación</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {validationErrors.length > 0 && (
              <Alert>
                <Warning size={20} />
                <AlertDescription>
                  <strong>Advertencias:</strong>
                  <ul className="list-disc ml-4 mt-2 text-sm">
                    {validationErrors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{importPreview.length}</div>
                  <div className="text-sm text-muted-foreground">Registros a importar</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-500">
                    {importPreview.reduce((sum, r) => sum + r.containers.filter(c => c.valid).length, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Contenedores válidos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-500">
                    {importPreview.reduce((sum, r) => sum + r.containers.filter(c => !c.valid).length, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Contenedores inválidos</div>
                </CardContent>
              </Card>
            </div>

            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>REF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>ETD</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>FT</TableHead>
                    <TableHead>Libre Hasta</TableHead>
                    <TableHead>CNTR</TableHead>
                    <TableHead>N°</TableHead>
                    <TableHead>MBL</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Buque</TableHead>
                    <TableHead>Terminal</TableHead>
                    <TableHead>Validación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview.map((record, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs">{record.REF}</TableCell>
                      <TableCell>{record.CLIENTE}</TableCell>
                      <TableCell className="text-sm">{record.ETD}</TableCell>
                      <TableCell className="text-sm">{record.ETA}</TableCell>
                      <TableCell className="text-sm">{record.FT}</TableCell>
                      <TableCell className="text-sm">{record.LIBRE_HASTA}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[150px] truncate" title={record.CNTR}>
                        {record.CNTR}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.N}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{record.MBL}</TableCell>
                      <TableCell className="text-sm">{record.LINEA}</TableCell>
                      <TableCell className="text-sm">{record.BUQUE}</TableCell>
                      <TableCell className="text-sm">{record.TERMINAL}</TableCell>
                      <TableCell>
                        {record.containers.length > 0 ? (
                          record.containers.every(c => c.valid) ? (
                            <Badge className="bg-green-500">OK</Badge>
                          ) : (
                            <Badge className="bg-yellow-500">Revisar</Badge>
                          )
                        ) : (
                          <Badge variant="outline">Sin CNTR</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={confirmImport}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <CheckCircle size={20} className="mr-2" />
                Confirmar Importación ({importPreview.length} registros)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
