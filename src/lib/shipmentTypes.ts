export interface OperativasRecord {
  REF: string
  TLX: string
  DEPOSITO: string
  ETA_OP: string         // ETA from Operativas (arrival to port)
  SALIDA: string         // Departure from Montevideo
  ETA_FISC: string       // Arrival to fiscal deposit
  LIBRE: string          // Free until date
  OPERATIVA: string      // CONTENEDOR | TRASIEGO | DEVUELTO
  CNTR_OP: string        // Container number from Operativas
  PKGS: number           // Packages count
  KG: number             // Weight in kg
  M3: number             // Volume in cubic meters
  DESCRIPCION: string    // Cargo description
  FISCAL: string         // Fiscal deposit: CACEC, ZP RAFAELA, etc.
  DESCARGA: string       // Unloading info
  DEV: string            // Devolution info
  CLIENTE_OP: string     // Client name from Operativas
  TIPO: string           // Container type: 40HQ, 20DV, etc.
  WOOD: string           // Wood marking (SI/NO)
  TRANSPORTE: string     // Transport/trasiego provider
  HORARIO: string        // Schedule
}

export interface ShipmentRecord {
  REF: string
  CLIENTE: string
  ETD: string
  ETA: string
  FT: number
  LIBRE_HASTA: string
  CNTR: string
  N: number
  MBL: string
  LINEA: string
  BUQUE: string
  TERMINAL: string
  C_TERMINAL: number
  C_DEV: number
  LOCALES: number
  FLETE: number
  FORMA_DE_PAGO: 'programado' | 'cuenta corriente' | 'al arribo'
  VTO: string
  CR: boolean
  BL: boolean
  AD: boolean
  AT: boolean
  // SG nuevo (multizona) — los puebla el parser server-side
  POL: string          // puerto de carga (origen)
  POD: string          // puerto de descarga
  PAIS: 'UY' | 'AR' | 'CL' | 'OTRO'
  SEGUIMIENTO: string  // fecha de seguimiento
  TIPO: string         // tipo de contenedor
}

export interface Container {
  number: string
  valid: boolean
}

export interface ParsedShipment extends ShipmentRecord {
  containers: Container[]
  calculatedN: number
  calculatedLibreHasta: string
  operativas?: OperativasRecord[]
}

// ─── Shipment Status Tracking ─────────────────────────────────────────

export type ShipmentStatusCode =
  | 'en_transito'        // Ship at sea, hasn't arrived yet
  | 'en_puerto'          // Arrived at port, waiting for inland departure
  | 'salio_montevideo'   // Left Montevideo heading to frontier/fiscal
  | 'en_frontera'        // Between Montevideo and fiscal (some arrived, some not)
  | 'llego_fiscal'       // Arrived at fiscal deposit
  | 'devuelto'           // Container returned / operation complete

export interface ShipmentStatus {
  code: ShipmentStatusCode
  label: string
  color: string        // tailwind color class suffix (red, orange, yellow, green, blue, gray)
  date?: string        // relevant date for this status
  progress: number     // 0-100 progress percentage
}

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'success'

export type AlertType =
  | 'libre_vencido'
  | 'libre_urgente'
  | 'libre_proximo'
  | 'status_salio'
  | 'status_frontera'
  | 'status_fiscal'
  | 'status_devuelto'
  | 'report_ready'

export interface ShipmentAlert {
  id: string
  shipmentRef: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  date: string
}

/**
 * Parse a date string (YYYY-MM-DD) as a LOCAL date to avoid timezone shift.
 * new Date("2026-03-13") → UTC midnight → in UTC-3 becomes March 12 21:00!
 * This function parses it as local midnight instead.
 */
export function parseLocalDate(s: string): Date | null {
  if (!s || s.trim() === '') return null
  const parts = s.split('-')
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    if (!isNaN(d.getTime())) return d
  }
  // Fallback for other formats
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get today at midnight local time */
function todayLocal(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

/**
 * Check if the ship has arrived (ETA has passed).
 * If ETA is in the future, the cargo is still at sea — operativas data should be ignored.
 */
function hasShipArrived(shipment: ParsedShipment): boolean {
  if (!shipment.ETA) return true // No ETA → assume arrived (can't know)
  const eta = parseLocalDate(shipment.ETA)
  if (!eta) return true // Bad date → assume arrived
  return eta.getTime() <= todayLocal().getTime()
}

/**
 * Validate that a string is a real date (not just non-empty text).
 */
export function isValidDate(s: string): boolean {
  return parseLocalDate(s) !== null
}

/**
 * Check if a date string represents a date that is strictly in the past (before today).
 */
export function isDatePast(s: string): boolean {
  const d = parseLocalDate(s)
  if (!d) return false
  return d.getTime() < todayLocal().getTime()
}

/**
 * Check if a date string represents today's date.
 */
export function isDateToday(s: string): boolean {
  const d = parseLocalDate(s)
  if (!d) return false
  return d.getTime() === todayLocal().getTime()
}

/**
 * Check if a date string represents a date that is today or in the past.
 */
function isDateReached(s: string): boolean {
  return isDatePast(s) || isDateToday(s)
}

/**
 * Check if the day AFTER a given date has been reached (today >= date + 1 day).
 * Used for auto-devolution of trasiegos/desconsolidaciones.
 */
function isDayAfterReached(s: string): boolean {
  const d = parseLocalDate(s)
  if (!d) return false
  const nextDay = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  return todayLocal().getTime() >= nextDay.getTime()
}

/**
 * Check if an operativa is a "contenedor directo" (full container delivery).
 * Non-contenedor types: TRASIEGO, DESCONSOLIDACION, CARGA A PISO, etc.
 */
function isContenedorDirecto(op: OperativasRecord): boolean {
  const tipo = (op.OPERATIVA || '').toUpperCase().trim()
  return tipo === 'CONTENEDOR' || tipo === ''
}

/**
 * For non-contenedor operations (trasiego, desconsolidación, carga a piso),
 * check if it should be considered "devuelto" (day after DESCARGA or SALIDA).
 */
function isAutoDevuelto(op: OperativasRecord): boolean {
  if (isContenedorDirecto(op)) return false
  // Use DESCARGA date if available, otherwise SALIDA
  const refDate = isValidDate(op.DESCARGA) ? op.DESCARGA : op.SALIDA
  return isValidDate(refDate) && isDayAfterReached(refDate)
}

/**
 * Derive shipment status from Operativas dates.
 * Logic: SALIDA = container left Montevideo. If all containers have SALIDA,
 * we consider the shipment effectively in its next phase.
 * IMPORTANT: If ETA hasn't passed (ship still at sea), operativas data is ignored.
 * Date fields are validated to avoid false positives from non-date text.
 */
export function getShipmentStatus(shipment: ParsedShipment): ShipmentStatus {
  const ops = shipment.operativas || []
  const arrived = hasShipArrived(shipment)

  // If ship hasn't arrived yet, it's in transit — ignore operativas data
  if (!arrived) {
    return { code: 'en_transito', label: 'En Tránsito Marítimo', color: 'blue', progress: 10 }
  }

  // Check if all containers are devueltos.
  // - Contenedor directo: requires actual DEV date or OPERATIVA === 'DEVUELTO'
  // - Trasiego/desconsolidación/carga a piso: auto-devuelto the day after DESCARGA (or SALIDA)
  const allDevueltos = ops.length > 0 && ops.every(o => {
    if (!isDateReached(o.SALIDA)) return false
    // Non-contenedor: auto-devuelto day after descarga/salida
    if (!isContenedorDirecto(o)) return isAutoDevuelto(o)
    // Contenedor directo: needs actual DEV date or OPERATIVA='DEVUELTO'
    return isDateReached(o.DEV) || o.OPERATIVA?.toUpperCase() === 'DEVUELTO'
  })
  if (allDevueltos) {
    return { code: 'devuelto', label: 'Contenedor Devuelto', color: 'gray', progress: 100, date: ops.find(o => isValidDate(o.DEV))?.DEV }
  }

  // Check if all containers arrived at fiscal (ETA_FISC today or past)
  const allFiscal = ops.length > 0 && ops.every(o => isDateReached(o.SALIDA) && isDateReached(o.ETA_FISC))
  if (allFiscal) {
    return { code: 'llego_fiscal', label: 'En Depósito Fiscal', color: 'green', progress: 80, date: ops.find(o => isValidDate(o.ETA_FISC))?.ETA_FISC }
  }

  // Check if all containers have SALIDA (today or past)
  const allSalieron = ops.length > 0 && ops.every(o => isDateReached(o.SALIDA))
  if (allSalieron) {
    // Any container leaving today → "Carga Hoy" (active departure takes priority)
    const someToday = ops.some(o => isDateToday(o.SALIDA))
    if (someToday) {
      const todayCount = ops.filter(o => isDateToday(o.SALIDA)).length
      const label = ops.length > 1 && todayCount < ops.length
        ? `Carga Hoy (${todayCount}/${ops.length})`
        : 'Carga Hoy'
      return { code: 'salio_montevideo', label, color: 'blue', progress: 45, date: ops.find(o => isDateToday(o.SALIDA))?.SALIDA }
    }
    // All SALIDA in the past → in transit to fiscal = "En Frontera"
    return { code: 'en_frontera', label: 'En Frontera', color: 'blue', progress: 60, date: ops.find(o => isValidDate(o.SALIDA))?.SALIDA }
  }

  // Some containers left, some still in port
  const someSalieron = ops.some(o => isDateReached(o.SALIDA))
  if (someSalieron) {
    const someSalidaToday = ops.some(o => isDateToday(o.SALIDA))
    if (someSalidaToday) {
      return { code: 'salio_montevideo', label: 'Carga Hoy', color: 'blue', progress: 40 }
    }
    return { code: 'salio_montevideo', label: 'Parcialmente en Frontera', color: 'blue', progress: 40 }
  }

  // Has operativas but no SALIDA → in port/terminal
  if (ops.length > 0) {
    return { code: 'en_puerto', label: 'En Terminal', color: 'yellow', progress: 25 }
  }

  // No operativas - check main shipment dates
  if (shipment.ETA && isDateReached(shipment.ETA)) {
    return { code: 'en_puerto', label: 'En Puerto', color: 'yellow', progress: 25 }
  }

  return { code: 'en_transito', label: 'En Tránsito Marítimo', color: 'blue', progress: 10 }
}

/**
 * Determine if a shipment is completed based on Operativas data.
 * Logic: if all containers have SALIDA date older than 14 days,
 * we assume the container was returned (devuelto).
 * Shipments without ETA_FISC but with SALIDA > 2 weeks = arrived at fiscal already.
 */
export function isShipmentCompleted(shipment: ParsedShipment): boolean {
  const ops = shipment.operativas || []
  if (ops.length === 0) return false

  // If ship hasn't arrived, can't be completed
  if (!hasShipArrived(shipment)) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

  // All containers must have valid SALIDA date
  if (!ops.every(o => isValidDate(o.SALIDA))) return false

  // Check each operativa based on type
  return ops.every(o => {
    // Non-contenedor (trasiego, desconsolidación): completed day after descarga/salida
    if (!isContenedorDirecto(o)) {
      return isAutoDevuelto(o)
    }
    // Contenedor directo: completed if DEV date reached or SALIDA > 2 weeks ago
    if (isDateReached(o.DEV) || o.OPERATIVA?.toUpperCase() === 'DEVUELTO') return true
    const salidaDate = parseLocalDate(o.SALIDA)
    if (!salidaDate) return false
    return (today.getTime() - salidaDate.getTime()) > TWO_WEEKS_MS
  })
}

/**
 * Generate alerts for a list of shipments.
 * Produces libre-expiration warnings, status milestone notifications,
 * and operative report ready alerts.
 */
export function generateShipmentAlerts(shipments: ParsedShipment[], reports?: { id: string; shipmentRef: string; title: string; createdAt: number }[]): ShipmentAlert[] {
  const alerts: ShipmentAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // ── Operative report alerts ──
  if (reports && reports.length > 0) {
    for (const report of reports) {
      const shipment = shipments.find(s => s.REF === report.shipmentRef)
      if (shipment) {
        alerts.push({
          id: `report-${report.id}`,
          shipmentRef: report.shipmentRef,
          type: 'report_ready',
          severity: 'info',
          title: 'Informe operativo disponible',
          message: `${report.shipmentRef}: "${report.title}"`,
          date: new Date(report.createdAt).toISOString().split('T')[0]
        })
      }
    }
  }

  for (const s of shipments) {
    // ── Libre expiration alerts ──
    if (s.LIBRE_HASTA) {
      try {
        const libreDate = parseLocalDate(s.LIBRE_HASTA)
        if (libreDate) {
          const daysUntil = Math.floor((libreDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          if (daysUntil < 0) {
            alerts.push({
              id: `libre-${s.REF}`,
              shipmentRef: s.REF,
              type: 'libre_vencido',
              severity: 'critical',
              title: `Días libres vencidos`,
              message: `${s.REF}: vencido hace ${Math.abs(daysUntil)} día${Math.abs(daysUntil) === 1 ? '' : 's'} (${s.LIBRE_HASTA})`,
              date: s.LIBRE_HASTA
            })
          } else if (daysUntil <= 2) {
            alerts.push({
              id: `libre-${s.REF}`,
              shipmentRef: s.REF,
              type: 'libre_urgente',
              severity: 'warning',
              title: `Días libres por vencer`,
              message: daysUntil === 0
                ? `${s.REF}: los días libres vencen HOY`
                : `${s.REF}: vence en ${daysUntil} día${daysUntil === 1 ? '' : 's'}`,
              date: s.LIBRE_HASTA
            })
          } else if (daysUntil <= 5) {
            alerts.push({
              id: `libre-${s.REF}`,
              shipmentRef: s.REF,
              type: 'libre_proximo',
              severity: 'info',
              title: `Próximo vencimiento`,
              message: `${s.REF}: días libres vencen en ${daysUntil} días (${s.LIBRE_HASTA})`,
              date: s.LIBRE_HASTA
            })
          }
        }
      } catch { /* ignore bad dates */ }
    }

    // ── Status milestone alerts (only if ship has arrived) ──
    const ops = s.operativas || []
    const shipArrived = hasShipArrived(s)
    if (ops.length > 0 && shipArrived) {
      const hasSalida = ops.some(o => isDateReached(o.SALIDA))
      const hasEtaFisc = ops.some(o => isDateReached(o.ETA_FISC))
      const hasDev = ops.some(o => {
        if (!isDateReached(o.SALIDA)) return false
        if (!isContenedorDirecto(o)) return isAutoDevuelto(o)
        return isDateReached(o.DEV) || o.OPERATIVA?.toUpperCase() === 'DEVUELTO'
      })

      if (hasDev) {
        alerts.push({
          id: `status-dev-${s.REF}`,
          shipmentRef: s.REF,
          type: 'status_devuelto',
          severity: 'success',
          title: `Contenedor devuelto`,
          message: `${s.REF}: contenedor devuelto exitosamente`,
          date: ops.find(o => !!o.DEV)?.DEV || ''
        })
      } else if (hasEtaFisc) {
        const fiscalName = ops[0]?.FISCAL || 'depósito fiscal'
        const etaFiscToday = ops.some(o => isDateToday(o.ETA_FISC))
        alerts.push({
          id: `status-fiscal-${s.REF}`,
          shipmentRef: s.REF,
          type: 'status_fiscal',
          severity: 'success',
          title: etaFiscToday ? `Llegando a fiscal hoy` : `En depósito fiscal`,
          message: etaFiscToday
            ? `${s.REF}: su carga llega hoy a ${fiscalName}`
            : `${s.REF}: su carga está en ${fiscalName}`,
          date: ops.find(o => !!o.ETA_FISC)?.ETA_FISC || ''
        })
      } else if (hasSalida) {
        const todayOps = ops.filter(o => isDateToday(o.SALIDA))
        const pastOps = ops.filter(o => isDatePast(o.SALIDA))
        if (todayOps.length > 0) {
          const extra = pastOps.length > 0 ? ` (${pastOps.length} ya en frontera)` : ''
          alerts.push({
            id: `status-salio-${s.REF}`,
            shipmentRef: s.REF,
            type: 'status_salio',
            severity: 'success',
            title: `Carga Hoy`,
            message: `${s.REF}: ${todayOps.length} contenedor${todayOps.length > 1 ? 'es' : ''} sale hoy${extra}`,
            date: todayOps[0]?.SALIDA || ''
          })
        } else {
          alerts.push({
            id: `status-salio-${s.REF}`,
            shipmentRef: s.REF,
            type: 'status_salio',
            severity: 'success',
            title: `En Frontera`,
            message: `${s.REF}: su carga está en frontera`,
            date: ops.find(o => !!o.SALIDA)?.SALIDA || ''
          })
        }
      }
    }
  }

  // Sort: critical first, then warning, info, success
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2, success: 3 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return alerts
}

export const CONTAINER_PATTERN = /^[A-Z]{4}[0-9]{7}$/

export function validateContainerNumber(cntr: string): boolean {
  return CONTAINER_PATTERN.test(cntr.trim())
}

export function parseContainers(cntrString: string): Container[] {
  if (!cntrString || cntrString.trim() === '') {
    return []
  }

  const containers: Container[] = []
  const parts = cntrString.split(/[,\s]+/).filter(p => p.trim() !== '')
  
  for (const part of parts) {
    const trimmed = part.trim()
    containers.push({
      number: trimmed,
      valid: validateContainerNumber(trimmed)
    })
  }
  
  return containers
}

export function calculateLibreHasta(eta: string, ft: number): string {
  if (!eta || !ft) return ''
  const etaDate = parseLocalDate(eta)
  if (!etaDate) return ''
  etaDate.setDate(etaDate.getDate() + ft)
  const y = etaDate.getFullYear()
  const m = String(etaDate.getMonth() + 1).padStart(2, '0')
  const d = String(etaDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function processShipmentRecord(record: Partial<ShipmentRecord>): ParsedShipment {
  const containers = parseContainers(record.CNTR || '')
  const calculatedN = containers.length > 0 ? containers.length : (record.N || 0)
  
  let libreHasta = record.LIBRE_HASTA || ''
  if (!libreHasta && record.ETA && record.FT) {
    libreHasta = calculateLibreHasta(record.ETA, record.FT)
  }

  return {
    REF: record.REF || '',
    CLIENTE: record.CLIENTE || '',
    ETD: record.ETD || '',
    ETA: record.ETA || '',
    FT: record.FT || 0,
    LIBRE_HASTA: libreHasta,
    CNTR: record.CNTR || '',
    N: calculatedN,
    MBL: record.MBL || '',
    LINEA: record.LINEA || '',
    BUQUE: record.BUQUE || '',
    TERMINAL: record.TERMINAL || '',
    C_TERMINAL: record.C_TERMINAL || 0,
    C_DEV: record.C_DEV || 0,
    LOCALES: record.LOCALES || 0,
    FLETE: record.FLETE || 0,
    FORMA_DE_PAGO: record.FORMA_DE_PAGO || 'al arribo',
    VTO: record.VTO || '',
    CR: record.CR || false,
    BL: record.BL || false,
    AD: record.AD || false,
    AT: record.AT || false,
    POL: record.POL || '',
    POD: record.POD || '',
    PAIS: record.PAIS || 'OTRO',
    SEGUIMIENTO: record.SEGUIMIENTO || '',
    TIPO: record.TIPO || '',
    containers,
    calculatedN,
    calculatedLibreHasta: libreHasta
  }
}
