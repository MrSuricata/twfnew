import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FilePdf, FileXls, Boat, Package, Clock, Users, Truck as TruckIcon, Warehouse, Cube, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { buildOperations, DbShipment, MODALITY_LABELS } from '@/lib/operationsTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import {
  ModeFilter, ZoneFilter, filterOperations, zoneOf, opYear, kpisGenerales, volumenes,
  porModalidad, porZona, porMes, topClientes, porLinea, porTerminal, porOperativa,
  porTransporte, porFiscal, porTipoContenedor, truckYear, kpisConsolidados,
  consolidadosPorMes, volumenPorTransportista,
} from '@/lib/analyticsUtils'
import { buildAnalyticsReport, downloadAnalyticsPdf } from '@/lib/analyticsPdf'
import { exportToCSV } from '@/lib/exportUtils'
import { toast } from 'sonner'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface AnalyticsDashboardProps {
  shipments: ParsedShipment[]
  dbShipments?: DbShipment[]
  trucks?: Truck[]
  truckLoads?: TruckLoad[]
}

// Paleta de charts — referencia las CSS custom properties de src/index.css.
const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'oklch(0.55 0.12 30)',
  'oklch(0.50 0.08 200)',
]

const CHART_PRIMARY = 'var(--chart-1)'
const CHART_SECONDARY = 'var(--chart-2)'
const CHART_TERTIARY = 'var(--chart-3)'

const MODE_CHIPS: { value: ModeFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
  { value: 'air', label: 'Aéreo' },
  { value: 'land', label: 'Terrestre' },
]
const ZONE_CHIPS: { value: ZoneFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'UY', label: '🇺🇾 UY' },
  { value: 'AR', label: '🇦🇷 AR' },
  { value: 'CL', label: '🇨🇱 CL' },
  { value: 'OTRO', label: 'Otros' },
]

export default function AnalyticsDashboard({ shipments, dbShipments = [], trucks = [], truckLoads = [] }: AnalyticsDashboardProps) {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all')
  const [exportingPdf, setExportingPdf] = useState(false)

  // Misma fuente que la grilla de Operaciones → mismos números. Archivadas
  // incluidas: las estadísticas son historia, no operación viva.
  const operations = useMemo(
    () => buildOperations(shipments, dbShipments, new Map(), true),
    [shipments, dbShipments]
  )

  const filtered = useMemo(
    () => filterOperations(operations, selectedYear, modeFilter, zoneFilter),
    [operations, selectedYear, modeFilter, zoneFilter]
  )

  // Años con datos (cargas por ETA + camiones por fecha de carga) + año actual.
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    operations.forEach(o => { const y = opYear(o); if (y) years.add(y) })
    trucks.forEach(t => { const y = truckYear(t); if (y) years.add(y) })
    years.add(now.getFullYear())
    return Array.from(years).sort()
  }, [operations, trucks])

  const kpis = useMemo(() => kpisGenerales(filtered), [filtered])
  const vols = useMemo(() => volumenes(filtered), [filtered])
  const dataModalidad = useMemo(() => porModalidad(filtered), [filtered])
  const dataZona = useMemo(() => porZona(filtered), [filtered])
  const shipmentsPerMonth = useMemo(() => porMes(filtered, now), [filtered])
  const dataClientes = useMemo(() => topClientes(filtered), [filtered])
  const byLine = useMemo(() => porLinea(filtered), [filtered])
  const byTerminal = useMemo(() => porTerminal(filtered), [filtered])
  const byOperationType = useMemo(() => porOperativa(filtered), [filtered])
  const byTransport = useMemo(() => porTransporte(filtered), [filtered])
  const byFiscal = useMemo(() => porFiscal(filtered), [filtered])
  const byContainerType = useMemo(() => porTipoContenedor(filtered), [filtered])

  // Consolidados: por año (no dependen de modalidad/zona); ocultos si el
  // filtro es FCL o Terrestre (consolidados = LCL/aéreo).
  const showConsolidados = modeFilter !== 'fcl' && modeFilter !== 'land'
  const consKpis = useMemo(() => kpisConsolidados(trucks, truckLoads, selectedYear), [trucks, truckLoads, selectedYear])
  const consPorMes = useMemo(() => consolidadosPorMes(trucks, selectedYear, now), [trucks, selectedYear])
  const consTransportistas = useMemo(() => volumenPorTransportista(trucks, truckLoads, selectedYear), [trucks, truckLoads, selectedYear])

  const handleExportPDF = async () => {
    if (exportingPdf) return
    setExportingPdf(true)
    try {
      const report = buildAnalyticsReport(filtered, trucks, truckLoads, {
        year: selectedYear, mode: modeFilter, zone: zoneFilter, now,
      })
      await downloadAnalyticsPdf(report)
    } catch (e) {
      console.error('PDF export:', e)
      toast.error('No se pudo generar el PDF. Probá de nuevo.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportExcel = () => {
    const data = filtered.map(o => ({
      REF: o.ref, CLIENTE: o.cliente, MODO: MODALITY_LABELS[o.mode] || o.mode,
      ZONA: zoneOf(o), ETD: o.etd, ETA: o.eta, 'CNTR/DOC': o.cntr || o.docNumber,
      BULTOS: o.pkgs, KG: o.kg, M3: o.m3, ESTADO: o.status,
    }))
    exportToCSV(data, `cargas-${selectedYear}.csv`)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Estadísticas</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} cargas en {selectedYear}</p>
          </div>
          {/* Year selector */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={!availableYears.includes(selectedYear - 1)}
              onClick={() => setSelectedYear(y => y - 1)}
            >
              <CaretLeft size={14} weight="bold" />
            </Button>
            <span className="px-3 text-sm font-semibold min-w-[50px] text-center">{selectedYear}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={selectedYear >= now.getFullYear()}
              onClick={() => setSelectedYear(y => y + 1)}
            >
              <CaretRight size={14} weight="bold" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportPDF} variant="outline" size="sm" disabled={exportingPdf}>
            <FilePdf size={18} className="mr-2" />
            {exportingPdf ? 'Generando…' : 'PDF'}
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <FileXls size={18} className="mr-2" />
            Excel
          </Button>
        </div>
      </div>

      {/* Filtros: modalidad + zona (combinables con el año) */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1">
          {MODE_CHIPS.map(c => (
            <Button
              key={c.value}
              size="sm"
              variant={modeFilter === c.value ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setModeFilter(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {ZONE_CHIPS.map(c => (
            <Button
              key={c.value}
              size="sm"
              variant={zoneFilter === c.value ? 'default' : 'outline'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setZoneFilter(c.value)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2.5">
                <Boat size={22} className="text-accent" weight="fill" />
              </div>
              <div>
                <div className="text-2xl font-bold">{kpis.cargas}</div>
                <div className="text-xs text-muted-foreground">Cargas</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2.5">
                <Package size={22} className="text-accent" weight="fill" />
              </div>
              <div>
                <div className="text-2xl font-bold">{kpis.contenedores}</div>
                <div className="text-xs text-muted-foreground">Contenedores FCL</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2.5">
                <Clock size={22} className="text-accent" weight="fill" />
              </div>
              <div>
                <div className="text-2xl font-bold">{kpis.transitoPromedio}<span className="text-sm font-normal text-muted-foreground ml-1">días</span></div>
                <div className="text-xs text-muted-foreground">Tránsito Promedio</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2.5">
                <Users size={22} className="text-accent" weight="fill" />
              </div>
              <div>
                <div className="text-2xl font-bold">{kpis.clientes}</div>
                <div className="text-xs text-muted-foreground">Clientes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operativas KPI Cards — only when data available */}
      {(vols.pkgs > 0 || vols.kg > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Cube size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{vols.pkgs.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Bultos Totales</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Cube size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{(vols.kg / 1000).toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">ton</span></div>
                  <div className="text-xs text-muted-foreground">Peso Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Warehouse size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{vols.m3.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">m³</span></div>
                  <div className="text-xs text-muted-foreground">Volumen Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <TruckIcon size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{new Set(filtered.filter(o => o.transporte).map(o => o.transporte)).size}</div>
                  <div className="text-xs text-muted-foreground">Transportistas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por modalidad */}
        <Card className="animate-in slide-in-from-left duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por Modalidad</CardTitle>
          </CardHeader>
          <CardContent>
            {dataModalidad.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dataModalidad} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {dataModalidad.map((_entry, index) => (
                      <Cell key={`cell-mod-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
            )}
          </CardContent>
        </Card>

        {/* Por zona */}
        <Card className="animate-in slide-in-from-right duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Por Zona</CardTitle>
          </CardHeader>
          <CardContent>
            {dataZona.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={dataZona} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {dataZona.map((_entry, index) => (
                      <Cell key={`cell-zona-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
            )}
          </CardContent>
        </Card>

        {/* Shipments per month */}
        <Card className="animate-in slide-in-from-left duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Arribos por Mes</CardTitle>
          </CardHeader>
          <CardContent>
            {shipmentsPerMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={shipmentsPerMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="cargas" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top clients */}
        <Card className="animate-in slide-in-from-right duration-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {dataClientes.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dataClientes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="value" fill={CHART_SECONDARY} radius={[0, 4, 4, 0]} name="Cargas" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* By shipping line */}
        <Card className="animate-in slide-in-from-left duration-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Navieras</CardTitle>
          </CardHeader>
          <CardContent>
            {byLine.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={byLine}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {byLine.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>

        {/* By terminal */}
        <Card className="animate-in slide-in-from-right duration-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Terminales</CardTitle>
          </CardHeader>
          <CardContent>
            {byTerminal.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={byTerminal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="value" fill={CHART_TERTIARY} radius={[4, 4, 0, 0]} name="Operaciones" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No hay datos suficientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operativas Charts — only when data available */}
      {(byOperationType.length > 0 || byTransport.length > 0 || byFiscal.length > 0) && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TruckIcon size={22} className="text-accent" />
              Analíticas Operativas
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Operation type distribution */}
            <Card className="animate-in slide-in-from-left duration-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tipo de Operativa</CardTitle>
              </CardHeader>
              <CardContent>
                {byOperationType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={byOperationType}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {byOperationType.map((_entry, index) => (
                          <Cell key={`cell-op-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    No hay datos
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transport providers */}
            <Card className="animate-in slide-in-from-right duration-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Transportistas / Trasiegos</CardTitle>
              </CardHeader>
              <CardContent>
                {byTransport.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byTransport} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="value" fill="#5B8C5A" radius={[0, 4, 4, 0]} name="Operaciones" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    No hay datos
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fiscal deposits */}
            <Card className="animate-in slide-in-from-left duration-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Depósitos Fiscales</CardTitle>
              </CardHeader>
              <CardContent>
                {byFiscal.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byFiscal} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="value" fill="#D4A373" radius={[0, 4, 4, 0]} name="Contenedores" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    No hay datos
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Container types */}
            <Card className="animate-in slide-in-from-right duration-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tipos de Contenedor</CardTitle>
              </CardHeader>
              <CardContent>
                {byContainerType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={byContainerType}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {byContainerType.map((_entry, index) => (
                          <Cell key={`cell-ct-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                    No hay datos
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Consolidados (camiones) — por año; ocultos si el filtro es FCL/Terrestre */}
      {showConsolidados && consKpis.camiones > 0 && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TruckIcon size={22} className="text-accent" />
              Consolidados
            </h3>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <TruckIcon size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.camiones}</div>
                    <div className="text-xs text-muted-foreground">Camiones Armados</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Cube size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(consKpis.kg / 1000).toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">ton</span></div>
                    <div className="text-xs text-muted-foreground">Peso Transportado</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Warehouse size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.m3.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">m³</span></div>
                    <div className="text-xs text-muted-foreground">Volumen Transportado</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="overflow-hidden">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <Package size={22} className="text-emerald-600" weight="fill" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{consKpis.cargasPorCamion}</div>
                    <div className="text-xs text-muted-foreground">Cargas por Camión</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Camiones por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                {consPorMes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={consPorMes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="camiones" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} name="Camiones" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Kg por Transportista</CardTitle>
              </CardHeader>
              <CardContent>
                {consTransportistas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={consTransportistas} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="value" fill={CHART_SECONDARY} radius={[0, 4, 4, 0]} name="Kg" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground">No hay datos</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
