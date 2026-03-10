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
}

export interface Container {
  number: string
  valid: boolean
}

export interface ParsedShipment extends ShipmentRecord {
  containers: Container[]
  calculatedN: number
  calculatedLibreHasta: string
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
  
  try {
    const etaDate = new Date(eta)
    if (isNaN(etaDate.getTime())) return ''
    
    etaDate.setDate(etaDate.getDate() + ft)
    return etaDate.toISOString().split('T')[0]
  } catch {
    return ''
  }
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
    containers,
    calculatedN,
    calculatedLibreHasta: libreHasta
  }
}
