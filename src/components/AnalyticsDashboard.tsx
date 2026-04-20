import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FilePdf, FileXls, Boat, Package, Clock, Users, Truck, Warehouse, Cube, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { ParsedShipment, OperativasRecord, parseLocalDate } from '@/lib/shipmentTypes'
import { exportToCSV, exportToPDF } from '@/lib/exportUtils'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface AnalyticsDashboardProps {
  shipments: ParsedShipment[]
}

// Chart palette — references the CSS custom properties defined in src/index.css
// so that changing a theme token in CSS updates every chart at once.
// See `--chart-1..5` in :root. Extras (6, 7) fall back to earth tones.
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

function getYearFromDate(dateStr: string): number | null {
  if (!dateStr) return null
  try {
    const d = parseLocalDate(dateStr)
    if (!d) return null
    return d.getFullYear()
  } catch {
    return null
  }
}

export default function AnalyticsDashboard({ shipments }: AnalyticsDashboardProps) {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Filter shipments by selected year (based on ETA)
  const yearShipments = useMemo(() =>
    shipments.filter(s => {
      const y = getYearFromDate(s.ETA)
      return y === selectedYear
    }),
    [shipments, selectedYear]
  )

  // Available years for navigation
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    shipments.forEach(s => {
      const y = getYearFromDate(s.ETA)
      if (y) years.add(y)
    })
    // Always include current year
    years.add(now.getFullYear())
    return Array.from(years).sort()
  }, [shipments])

  const getShipmentsPerMonth = () => {
    const monthCounts: Record<string, number> = {}

    yearShipments.forEach(s => {
      if (s.ETA) {
        const date = parseLocalDate(s.ETA)
        if (!date) return
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        if (monthKey <= currentMonth) {
          monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1
        }
      }
    })

    return Object.entries(monthCounts)
      .sort()
      .slice(-12)
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString('es-UY', { month: 'short' }),
        cargas: count
      }))
  }

  const getTopClients = () => {
    const clientCounts: Record<string, number> = {}

    yearShipments.forEach(s => {
      if (s.CLIENTE) {
        clientCounts[s.CLIENTE] = (clientCounts[s.CLIENTE] || 0) + s.N
      }
    })

    return Object.entries(clientCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([cliente, contenedores]) => ({
        cliente: cliente.length > 15 ? cliente.substring(0, 15) + '...' : cliente,
        contenedores
      }))
  }

  const getByShippingLine = () => {
    const lines: Record<string, number> = {}

    yearShipments.forEach(s => {
      if (s.LINEA) {
        lines[s.LINEA] = (lines[s.LINEA] || 0) + 1
      }
    })

    return Object.entries(lines)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }))
  }

  const getByTerminal = () => {
    const terminals: Record<string, number> = {}

    yearShipments.forEach(s => {
      if (s.TERMINAL) {
        terminals[s.TERMINAL] = (terminals[s.TERMINAL] || 0) + 1
      }
    })

    return Object.entries(terminals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }

  const getAverageTransitTime = () => {
    const transits: number[] = []

    yearShipments.forEach(s => {
      if (s.ETD && s.ETA) {
        const etd = parseLocalDate(s.ETD)
        const eta = parseLocalDate(s.ETA)
        if (!etd || !eta) return
        const days = Math.floor((eta.getTime() - etd.getTime()) / (1000 * 60 * 60 * 24))
        if (days > 0 && days < 365) {
          transits.push(days)
        }
      }
    })

    if (transits.length === 0) return 0
    return Math.round(transits.reduce((sum, t) => sum + t, 0) / transits.length)
  }

  // Flatten all operativas records from filtered shipments
  const allOperativas: OperativasRecord[] = yearShipments.flatMap(s => s.operativas || [])
  const hasOperativas = allOperativas.length > 0

  const getByOperationType = () => {
    const types: Record<string, number> = {}
    allOperativas.forEach(o => {
      if (o.OPERATIVA) {
        types[o.OPERATIVA] = (types[o.OPERATIVA] || 0) + 1
      }
    })
    return Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }

  const getByTransport = () => {
    const transports: Record<string, number> = {}
    allOperativas.forEach(o => {
      if (o.TRANSPORTE) {
        transports[o.TRANSPORTE] = (transports[o.TRANSPORTE] || 0) + 1
      }
    })
    return Object.entries(transports)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))
  }

  const getByFiscal = () => {
    const fiscals: Record<string, number> = {}
    allOperativas.forEach(o => {
      if (o.FISCAL) {
        fiscals[o.FISCAL] = (fiscals[o.FISCAL] || 0) + 1
      }
    })
    return Object.entries(fiscals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({
        name: name.length > 18 ? name.substring(0, 18) + '…' : name,
        value
      }))
  }

  const getByContainerType = () => {
    const types: Record<string, number> = {}
    allOperativas.forEach(o => {
      if (o.TIPO) {
        types[o.TIPO] = (types[o.TIPO] || 0) + 1
      }
    })
    return Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }

  const getTotalVolumes = () => {
    const totalKg = allOperativas.reduce((sum, o) => sum + o.KG, 0)
    const totalM3 = allOperativas.reduce((sum, o) => sum + o.M3, 0)
    const totalPkgs = allOperativas.reduce((sum, o) => sum + o.PKGS, 0)
    return { totalKg, totalM3, totalPkgs }
  }

  const handleExportPDF = () => {
    const data = yearShipments.map(s => ({
      REF: s.REF,
      CLIENTE: s.CLIENTE,
      ETA: s.ETA,
      TERMINAL: s.TERMINAL,
      N: s.N,
      LIBRE_HASTA: s.LIBRE_HASTA
    }))
    exportToPDF(`Reporte de Cargas ${selectedYear} - TWF`, data, ['REF', 'CLIENTE', 'ETA', 'TERMINAL', 'N', 'LIBRE_HASTA'], `cargas-twf-${selectedYear}.pdf`)
  }

  const handleExportExcel = () => {
    const data = yearShipments.map(s => ({
      REF: s.REF, CLIENTE: s.CLIENTE, ETD: s.ETD, ETA: s.ETA,
      FT: s.FT, LIBRE_HASTA: s.LIBRE_HASTA, CNTR: s.CNTR,
      N: s.N, MBL: s.MBL, LINEA: s.LINEA, BUQUE: s.BUQUE,
      TERMINAL: s.TERMINAL, FLETE: s.FLETE
    }))
    exportToCSV(data, `cargas-twf-${selectedYear}.csv`)
  }

  const shipmentsPerMonth = getShipmentsPerMonth()
  const topClients = getTopClients()
  const byLine = getByShippingLine()
  const byTerminal = getByTerminal()
  const avgTransit = getAverageTransitTime()
  const uniqueClients = new Set(yearShipments.map(s => s.CLIENTE)).size
  const totalContainers = yearShipments.reduce((sum, s) => sum + s.N, 0)
  const byOperationType = getByOperationType()
  const byTransport = getByTransport()
  const byFiscal = getByFiscal()
  const byContainerType = getByContainerType()
  const volumes = getTotalVolumes()

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold">Estadísticas</h2>
            <p className="text-sm text-muted-foreground">{yearShipments.length} operaciones en {selectedYear}</p>
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
          <Button onClick={handleExportPDF} variant="outline" size="sm">
            <FilePdf size={18} className="mr-2" />
            PDF
          </Button>
          <Button onClick={handleExportExcel} variant="outline" size="sm">
            <FileXls size={18} className="mr-2" />
            Excel
          </Button>
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
                <div className="text-2xl font-bold">{shipments.length}</div>
                <div className="text-xs text-muted-foreground">Operaciones</div>
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
                <div className="text-2xl font-bold">{totalContainers}</div>
                <div className="text-xs text-muted-foreground">Contenedores</div>
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
                <div className="text-2xl font-bold">{avgTransit}<span className="text-sm font-normal text-muted-foreground ml-1">días</span></div>
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
                <div className="text-2xl font-bold">{uniqueClients}</div>
                <div className="text-xs text-muted-foreground">Clientes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operativas KPI Cards — only when data available */}
      {hasOperativas && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Cube size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{volumes.totalPkgs.toLocaleString()}</div>
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
                  <div className="text-2xl font-bold">{(volumes.totalKg / 1000).toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">ton</span></div>
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
                  <div className="text-2xl font-bold">{volumes.totalM3.toFixed(0)}<span className="text-sm font-normal text-muted-foreground ml-1">m³</span></div>
                  <div className="text-xs text-muted-foreground">Volumen Total</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2.5">
                  <Truck size={22} className="text-blue-600" weight="fill" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{new Set(allOperativas.filter(o => o.TRANSPORTE).map(o => o.TRANSPORTE)).size}</div>
                  <div className="text-xs text-muted-foreground">Transportistas</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            <CardTitle className="text-base">Top Clientes por Volumen</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topClients} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="cliente" type="category" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="contenedores" fill={CHART_SECONDARY} radius={[0, 4, 4, 0]} />
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
      {hasOperativas && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Truck size={22} className="text-accent" />
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
    </div>
  )
}
