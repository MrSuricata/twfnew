import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Truck, SignOut, User, MagnifyingGlass, Package } from '@phosphor-icons/react'
import { ParsedShipment } from '@/lib/shipmentTypes'

interface TransportDashboardProps {
  shipments: ParsedShipment[]
  transportName: string
  userName: string
  onLogout: () => void
}

export default function TransportDashboard({ shipments, transportName, userName, onLogout }: TransportDashboardProps) {
  const [search, setSearch] = useState('')

  // Filter shipments that have operativas assigned to this transport
  const filteredShipments = useMemo(() => {
    const transportLower = transportName.toLowerCase()

    // Collect shipments where at least one operativa matches this transport
    const matched = shipments.filter(s =>
      s.operativas?.some(op =>
        op.TRANSPORTE && op.TRANSPORTE.toLowerCase().includes(transportLower)
      )
    )

    if (!search) return matched

    const term = search.toLowerCase()
    return matched.filter(s =>
      s.REF?.toLowerCase().includes(term) ||
      s.CLIENTE?.toLowerCase().includes(term) ||
      s.CNTR?.toLowerCase().includes(term) ||
      s.operativas?.some(op =>
        op.DEPOSITO?.toLowerCase().includes(term) ||
        op.CNTR_OP?.toLowerCase().includes(term)
      )
    )
  }, [shipments, transportName, search])

  // Flatten to show per-operativa rows
  const rows = useMemo(() => {
    const transportLower = transportName.toLowerCase()
    const result: Array<{
      ref: string
      cliente: string
      deposito: string
      cntr: string
      tipo: string
      operativa: string
      salida: string
      etaFisc: string
    }> = []

    for (const s of filteredShipments) {
      const ops = s.operativas?.filter(op =>
        op.TRANSPORTE && op.TRANSPORTE.toLowerCase().includes(transportLower)
      ) || []

      for (const op of ops) {
        result.push({
          ref: s.REF || op.REF || '',
          cliente: s.CLIENTE || op.CLIENTE_OP || '',
          deposito: op.DEPOSITO || '',
          cntr: op.CNTR_OP || s.CNTR || '',
          tipo: op.TIPO || '',
          operativa: op.OPERATIVA || '',
          salida: op.SALIDA || '',
          etaFisc: op.ETA_FISC || '',
        })
      }
    }

    return result
  }, [filteredShipments, transportName])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Truck size={24} className="text-primary" weight="duotone" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{transportName}</h1>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User size={14} />
                <span>{userName}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <img src="/images/twf-logo-white.png" alt="TWF" className="h-7 w-auto opacity-60" />
            <Button variant="outline" size="sm" onClick={onLogout}>
              <SignOut size={18} className="mr-1.5" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1600px] mx-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{rows.length}</p>
              <p className="text-xs text-muted-foreground">Operativas asignadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">{filteredShipments.length}</p>
              <p className="text-xs text-muted-foreground">Cargas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">
                {rows.filter(r => r.operativa === 'CONTENEDOR').length}
              </p>
              <p className="text-xs text-muted-foreground">Contenedores</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold">
                {rows.filter(r => r.operativa === 'TRASIEGO').length}
              </p>
              <p className="text-xs text-muted-foreground">Trasiegos</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package size={20} weight="duotone" />
                Operativas Asignadas
              </CardTitle>
              <div className="relative w-64">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar REF, cliente, CNTR..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-center py-12">
                <Truck size={48} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Sin operativas asignadas</h3>
                <p className="text-muted-foreground">No se encontraron cargas asignadas a {transportName}</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>REF</TableHead>
                      <TableHead>CLIENTE</TableHead>
                      <TableHead>DEPOSITO</TableHead>
                      <TableHead>CNTR</TableHead>
                      <TableHead>TIPO</TableHead>
                      <TableHead>OPERATIVA</TableHead>
                      <TableHead>SALIDA</TableHead>
                      <TableHead>ETA FISC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={`${row.ref}-${row.cntr}-${idx}`}>
                        <TableCell className="font-mono font-medium">{row.ref}</TableCell>
                        <TableCell>{row.cliente}</TableCell>
                        <TableCell>{row.deposito}</TableCell>
                        <TableCell className="font-mono text-sm">{row.cntr}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.tipo || '—'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.operativa === 'CONTENEDOR' ? 'default' : 'secondary'}
                          >
                            {row.operativa || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.salida || '—'}</TableCell>
                        <TableCell>{row.etaFisc || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
