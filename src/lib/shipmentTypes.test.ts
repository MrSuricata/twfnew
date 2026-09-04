import { describe, it, expect } from 'vitest'
import { getShipmentStatus, generateShipmentAlerts, type ParsedShipment, type OperativasRecord } from './shipmentTypes'

const base = (ops: any[]) => ({ REF: 'A1', ETA: '2020-01-01', operativas: ops } as any)

describe('getShipmentStatus — En [lugar]', () => {
  it('arribado + LUGAR_SALIDA marcado + sin SALIDA → En [lugar]', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', ETA_FISC: '', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En GODILCO')
    expect(s.code).toBe('en_puerto')
  })
  it('directo desde terminal (TCP) sin SALIDA → En TCP', () => {
    const s = getShipmentStatus(base([{ SALIDA: '', LUGAR_SALIDA: 'TCP' }]))
    expect(s.label).toBe('En TCP')
  })
  it('con SALIDA alcanzada → NO usa LUGAR_SALIDA (sigue a frontera)', () => {
    const s = getShipmentStatus(base([{ SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' }]))
    expect(s.label).toBe('En Frontera')
  })
  it('mezcla: uno en depósito, otro ya salió → parcial', () => {
    const s = getShipmentStatus(base([
      { SALIDA: '2020-02-01', LUGAR_SALIDA: 'GODILCO' },
      { SALIDA: '', LUGAR_SALIDA: 'GODILCO' },
    ]))
    expect(s.label).toBe('Parcialmente en Frontera')
  })
})

// ── generateShipmentAlerts ────────────────────────────────────────────────
// Rediseño 04/09 (D2): la ref NO va embebida en el texto de la alerta. La
// carga se identifica por `shipmentRef` y la UI decide cómo pintarla (en el
// portal manda la ref del cliente). Estos tests fijan ese contrato.

/** ISO local a N días de hoy (las alertas comparan con la medianoche local). */
const hoyMas = (n: number): string => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const REF = 'A8045'
const op = (o: Partial<OperativasRecord>): OperativasRecord =>
  ({ REF, OPERATIVA: 'CONTENEDOR', SALIDA: '', ETA_FISC: '', DEV: '', DESCARGA: '', FISCAL: '', CNTR_OP: 'X1', ...o } as OperativasRecord)
const carga = (c: Partial<ParsedShipment>, ops: OperativasRecord[] = []): ParsedShipment =>
  ({ REF, ETA: hoyMas(-10), LIBRE_HASTA: '', operativas: ops, ...c } as unknown as ParsedShipment)

type Informe = { id: string; shipmentRef: string; title: string; createdAt: number }

describe('generateShipmentAlerts — la ref viaja en shipmentRef, no en el texto', () => {
  const casos: { nombre: string; s: ParsedShipment; reports?: Informe[]; type: string; message: string }[] = [
    { nombre: 'libre vencido', s: carga({ LIBRE_HASTA: hoyMas(-3) }), type: 'libre_vencido', message: `Vencido hace 3 días (${hoyMas(-3)})` },
    { nombre: 'libre vence hoy', s: carga({ LIBRE_HASTA: hoyMas(0) }), type: 'libre_urgente', message: 'Los días libres vencen HOY' },
    { nombre: 'libre vence mañana', s: carga({ LIBRE_HASTA: hoyMas(1) }), type: 'libre_urgente', message: 'Vence en 1 día' },
    { nombre: 'libre próximo', s: carga({ LIBRE_HASTA: hoyMas(4) }), type: 'libre_proximo', message: `Días libres vencen en 4 días (${hoyMas(4)})` },
    { nombre: 'sale hoy (uno ya en frontera)', s: carga({}, [op({ SALIDA: hoyMas(0) }), op({ SALIDA: hoyMas(-1), CNTR_OP: 'X2' })]), type: 'status_salio', message: '1 contenedor sale hoy (1 ya en frontera)' },
    { nombre: 'salen hoy (plural bien conjugado)', s: carga({}, [op({ SALIDA: hoyMas(0) }), op({ SALIDA: hoyMas(0), CNTR_OP: 'X2' })]), type: 'status_salio', message: '2 contenedores salen hoy' },
    { nombre: 'en frontera', s: carga({}, [op({ SALIDA: hoyMas(-1) })]), type: 'status_salio', message: 'Su carga está en frontera' },
    { nombre: 'llega hoy a fiscal', s: carga({}, [op({ SALIDA: hoyMas(-3), ETA_FISC: hoyMas(0), FISCAL: 'CACEC' })]), type: 'status_fiscal', message: 'Su carga llega hoy a CACEC' },
    { nombre: 'en fiscal', s: carga({}, [op({ SALIDA: hoyMas(-3), ETA_FISC: hoyMas(-1), FISCAL: 'CACEC' })]), type: 'status_fiscal', message: 'Su carga está en CACEC' },
    { nombre: 'devuelto', s: carga({}, [op({ SALIDA: hoyMas(-3), OPERATIVA: 'DEVUELTO' })]), type: 'status_devuelto', message: 'Contenedor devuelto exitosamente' },
    { nombre: 'informe listo', s: carga({}), reports: [{ id: 'r1', shipmentRef: REF, title: 'Trasiego en GODILCO', createdAt: Date.now() }], type: 'report_ready', message: '"Trasiego en GODILCO"' },
  ]

  for (const c of casos) {
    it(`${c.nombre}: message sin la ref, shipmentRef con la ref`, () => {
      const alerts = generateShipmentAlerts([c.s], c.reports)
      const a = alerts.find(x => x.type === c.type)
      expect(a, `no generó ${c.type}`).toBeTruthy()
      expect(a!.shipmentRef).toBe(REF)
      expect(a!.message).toBe(c.message)
      expect(a!.message).not.toContain(REF)
      expect(a!.title).not.toContain(REF)
    })
  }

  it('ninguna alerta, de ningún tipo, repite la ref en el texto', () => {
    const todas = casos.flatMap(c => generateShipmentAlerts([c.s], c.reports))
    expect(todas.length).toBeGreaterThan(0)
    for (const a of todas) expect(a.message, a.type).not.toContain(a.shipmentRef)
  })

  it('el informe solo alerta si la carga está en la lista; el id lleva el del informe', () => {
    const informe: Informe = { id: 'r9', shipmentRef: REF, title: 'T', createdAt: Date.now() }
    const [a] = generateShipmentAlerts([carga({})], [informe])
    expect(a.id).toBe('report-r9')
    expect(generateShipmentAlerts([], [informe])).toHaveLength(0)
  })
})
