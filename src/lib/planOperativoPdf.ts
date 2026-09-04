// PLAN OPERATIVO por cliente (PDF landscape) — versión webapp del PDF que Brian
// ya genera con Jarvis: por cada cliente, las cargas FCL activas que TODAVÍA NO
// llegaron a fiscal, en dos secciones (salida programada / pendiente de
// programar), una fila POR CONTENEDOR. Formato hermano de clientStatusPdf
// (header con logo brand-aware, tabla con header de marca, footer confidencial).
//
// La parte de datos (buildPlanOperativoData / listPlanClientes) es pura y
// testeable; jsPDF + autotable se importan dinámico recién al descargar.
import type { ParsedShipment, OperativasRecord } from './shipmentTypes'
import { parseLocalDate } from './shipmentTypes'
import { mergeFclShipments, type DbShipment } from './operationsTypes'
import { matchesPattern } from './clientMatching'
import { fmtDateDMY, fmtNum } from './format'
import type { Brand } from './brand'
import { logoDataUrl } from './clientStatusPdf'
import { numeroNuestro } from '@/lib/refsCliente'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const HEADER_BLUE = '#4A90D9'                               // azul plan-operativo TWF
const ALT_ROW: [number, number, number] = [240, 244, 250]   // zebra #f0f4fa

// ── Modelo del plan ──────────────────────────────────────────────────

/** Una fila del plan = un contenedor (operativa). Fechas en ISO crudo (o texto
 *  de planilla tipo "DEVUELTO"); se formatean dd/mm/yyyy recién al render. */
export interface PlanRow {
  ref: string          // SIN la "A" inicial — regla de cara al cliente
  cntr: string
  tipo: string
  pkgs: number
  kg: number
  descripcion: string
  etaMvd: string
  terminal: string
  operativa: string
  salida: string
  etaFisc: string
  libre: string        // puede ser texto ("DEVUELTO") — se muestra tal cual
  buque: string
}

export interface PlanClientBlock {
  cliente: string
  programadas: PlanRow[]   // con SALIDA fechada, orden por salida asc
  pendientes: PlanRow[]    // sin SALIDA, orden por ETA MVD asc
}

export interface PlanOperativoData {
  blocks: PlanClientBlock[]
  totals: { contenedores: number; bultos: number; kg: number; programadas: number; pendientes: number }
}

export interface PlanClienteOption { name: string; cargas: number }

// ── Filtro por zona/puerto (pedido Brian 14/07) ──────────────────────
// Zona = PAIS derivado del POD: a veces el plan es solo de las cargas por
// Uruguay, o solo Chile — no siempre todo el plan de todos los puertos.
export type PlanZona = 'UY' | 'CL' | 'AR' | 'OTRO'
export const PLAN_ZONAS: { value: PlanZona; label: string; corto: string }[] = [
  { value: 'UY', label: 'Por Uruguay (Montevideo)', corto: 'Uruguay' },
  { value: 'CL', label: 'Por Chile (San Antonio/Valparaíso)', corto: 'Chile' },
  { value: 'AR', label: 'Buenos Aires directo', corto: 'Buenos Aires' },
  { value: 'OTRO', label: 'Otros puertos', corto: 'Otros' },
]
const zonaOf = (s: ParsedShipment): PlanZona => {
  const p = String(s.PAIS || '').trim().toUpperCase()
  return p === 'UY' || p === 'CL' || p === 'AR' ? p : 'OTRO'
}
/** null = sin filtro (todas las zonas). */
const zonaSetOf = (zonas?: PlanZona[]): Set<PlanZona> | null =>
  zonas && zonas.length > 0 && zonas.length < PLAN_ZONAS.length ? new Set(zonas) : null

// ── Datos (puro) ─────────────────────────────────────────────────────

const midnight = (d: Date): Date => { const t = new Date(d); t.setHours(0, 0, 0, 0); return t }

/** FCL del estado del admin: cache legacy de la planilla + FCL de la DB
 *  (mergeFclShipments dedupea por REF, gana la DB), SIN archivadas. */
function activeFcl(cache: ParsedShipment[], dbShipments: DbShipment[]): ParsedShipment[] {
  return mergeFclShipments(cache || [], (dbShipments || []).filter(d => !d.archived))
}

function rowFrom(s: ParsedShipment, o: OperativasRecord | null, db?: DbShipment): PlanRow {
  return {
    ref: numeroNuestro(s.REF),
    cntr: o?.CNTR_OP || s.CNTR || '',
    tipo: o?.TIPO || s.TIPO || '',
    // Carga sin operativas (recién creada): bultos/kg desde la fila de la DB,
    // que dbFclToParsedShipment no baja al nivel carga.
    pkgs: Number(o?.PKGS) || Number(db?.pkgs) || 0,
    kg: Number(o?.KG) || Number(db?.kg) || 0,
    descripcion: o?.DESCRIPCION || (s.operativas || []).map(x => x.DESCRIPCION).find(Boolean) || db?.observacion || '',
    etaMvd: s.ETA || '',
    terminal: s.TERMINAL || '',
    operativa: o?.OPERATIVA || '',
    salida: o?.SALIDA || '',
    etaFisc: o?.ETA_FISC || '',
    libre: o?.LIBRE || s.calculatedLibreHasta || s.LIBRE_HASTA || '',
    buque: s.BUQUE || '',
  }
}

/** Filas activas de una carga (una por contenedor): quedan las operativas cuya
 *  ETA_FISC está vacía o es futura — si ya pasó (o es hoy), ese contenedor ya
 *  llegó a fiscal y sale del plan (mismo corte `<= hoy` que isOperationActive).
 *  OJO: "DEVUELTO" vive en LIBRE y acá NO decide — un contenedor devuelto con
 *  fiscal futura/vacía sigue contando como pendiente del plan. */
function activeRows(s: ParsedShipment, today: Date, db?: DbShipment): PlanRow[] {
  const ops = s.operativas || []
  if (ops.length === 0) {
    // Sin datos de operativa (recién creada / histórica sin tramo): pendiente
    // de programar, salvo ETA pasada hace más de 60 días (mismo corte que
    // isOperationActive para no resucitar históricas de Chile/BA).
    const eta = parseLocalDate(s.ETA || '')
    if (eta && eta.getTime() < today.getTime() - 60 * 86400000) return []
    return [rowFrom(s, null, db)]
  }
  return ops
    .filter(o => {
      const fisc = parseLocalDate(o.ETA_FISC || '')
      return !fisc || fisc.getTime() > today.getTime()
    })
    .map(o => rowFrom(s, o, db))
}

/** ¿La carga pertenece al cliente elegido? Mismo criterio word-boundary del
 *  filtro de clientes (matchesPattern) + igualdad exacta por si el nombre trae
 *  una coma (matchesPattern la partiría en dos tokens). */
function matchesCliente(cliente: string, selected: string): boolean {
  return (
    cliente.trim().toUpperCase() === selected.trim().toUpperCase() ||
    matchesPattern(cliente, selected)
  )
}

const bySalida = (a: PlanRow, b: PlanRow): number =>
  a.salida.localeCompare(b.salida) || a.ref.localeCompare(b.ref)
// ETA vacía / texto no-ISO al final; ISO ordena lexicográfico = cronológico.
const byEta = (a: PlanRow, b: PlanRow): number => {
  const ea = ISO.test(a.etaMvd) ? a.etaMvd : '9999'
  const eb = ISO.test(b.etaMvd) ? b.etaMvd : '9999'
  return ea.localeCompare(eb) || a.ref.localeCompare(b.ref)
}

/**
 * Arma los bloques del plan (uno por cliente elegido) desde el estado del admin.
 * Derive-on-read: se calcula fresco desde shipments/dbShipments al momento de
 * descargar — sin cachés intermedios.
 */
export function buildPlanOperativoData(
  cache: ParsedShipment[],
  dbShipments: DbShipment[],
  clientes: string[],
  today: Date = new Date(),
  zonas?: PlanZona[]
): PlanOperativoData {
  const t0 = midnight(today)
  const zonaSet = zonaSetOf(zonas)
  const all = activeFcl(cache, dbShipments).filter(s => !zonaSet || zonaSet.has(zonaOf(s)))
  const byId = new Map((dbShipments || []).map(d => [d.id, d]))
  const blocks: PlanClientBlock[] = []
  const totals = { contenedores: 0, bultos: 0, kg: 0, programadas: 0, pendientes: 0 }
  for (const cliente of clientes) {
    const rows = all
      .filter(s => matchesCliente(s.CLIENTE || '', cliente))
      .flatMap(s => activeRows(s, t0, s.__dbId ? byId.get(s.__dbId) : undefined))
    const programadas = rows.filter(r => ISO.test(r.salida)).sort(bySalida)
    const pendientes = rows.filter(r => !ISO.test(r.salida)).sort(byEta)
    blocks.push({ cliente, programadas, pendientes })
    totals.contenedores += programadas.length + pendientes.length
    totals.programadas += programadas.length
    totals.pendientes += pendientes.length
    for (const r of [...programadas, ...pendientes]) {
      totals.bultos += r.pkgs
      totals.kg += r.kg
    }
  }
  return { blocks, totals }
}

/** Clientes distintos con al menos un contenedor activo sin llegar a fiscal
 *  (alimenta el multi-select del diálogo), con conteo, orden alfabético. */
export function listPlanClientes(
  cache: ParsedShipment[],
  dbShipments: DbShipment[],
  today: Date = new Date(),
  zonas?: PlanZona[]
): PlanClienteOption[] {
  const t0 = midnight(today)
  const zonaSet = zonaSetOf(zonas)
  const byId = new Map((dbShipments || []).map(d => [d.id, d]))
  const m = new Map<string, PlanClienteOption>()
  for (const s of activeFcl(cache, dbShipments)) {
    if (zonaSet && !zonaSet.has(zonaOf(s))) continue
    const name = (s.CLIENTE || '').trim()
    if (!name) continue
    const n = activeRows(s, t0, s.__dbId ? byId.get(s.__dbId) : undefined).length
    if (!n) continue
    const cur = m.get(name.toUpperCase())
    if (cur) cur.cargas += n
    else m.set(name.toUpperCase(), { name, cargas: n })
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

// ── PDF (jsPDF + autotable, import dinámico) ─────────────────────────

const HEAD = ['Ref', 'CNTR', 'Tipo', 'Bultos', 'Kg', 'Descripción', 'ETA MVD', 'Terminal', 'Operativa', 'Salida', 'ETA Fiscal', 'LIBRE', 'Buque']

function rowCells(r: PlanRow): string[] {
  return [
    r.ref,
    r.cntr,
    r.tipo,
    r.pkgs ? fmtNum(r.pkgs) : '',
    r.kg ? fmtNum(Math.round(r.kg)) : '',
    r.descripcion,
    fmtDateDMY(r.etaMvd),
    r.terminal,
    r.operativa,
    fmtDateDMY(r.salida),
    fmtDateDMY(r.etaFisc),
    fmtDateDMY(r.libre),   // "DEVUELTO" y otros textos pasan tal cual
    r.buque,
  ]
}

function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Cliente'
}

/**
 * Genera y descarga el PDF "PLAN OPERATIVO — [CLIENTE]" (o "VARIOS CLIENTES").
 * Devuelve los totales para que el caller pueda informar en el toast.
 */
export async function downloadPlanOperativoPdf(
  cache: ParsedShipment[],
  dbShipments: DbShipment[],
  clientes: string[],
  brand: Brand,
  now: Date = new Date(),
  zonas?: PlanZona[]
): Promise<PlanOperativoData['totals']> {
  const data = buildPlanOperativoData(cache, dbShipments, clientes, now, zonas)
  const zonaSet = zonaSetOf(zonas)
  const zonaLabel = zonaSet
    ? PLAN_ZONAS.filter(z => zonaSet.has(z.value)).map(z => z.corto).join(' + ')
    : ''
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12

  // Acento por marca: índigo Mediterránea · azul plan-operativo TWF.
  const ACCENT = brand.id === 'med' ? '#261c79' : HEADER_BLUE
  const ACCENT_RGB: [number, number, number] = brand.id === 'med' ? [38, 28, 121] : [74, 144, 217]

  // Header página 1: logo arriba-izquierda + título + fecha (patrón clientStatusPdf)
  const logo = await logoDataUrl(brand.logo.full)
  if (logo) {
    const h = 12, w = (logo.w / logo.h) * h
    doc.addImage(logo.png, 'PNG', margin, 9, w, h)
    if (brand.id === 'med') {
      // El emblema Med es cuadrado y no dice quiénes somos — wordmark al lado.
      doc.setTextColor(ACCENT)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(brand.displayName.toUpperCase(), margin + w + 4, 17)
    }
  } else {
    doc.setTextColor(ACCENT)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(brand.displayName.toUpperCase(), margin, 17)
  }
  const multi = clientes.length > 1
  const title = `PLAN OPERATIVO — ${multi ? 'VARIOS CLIENTES' : (clientes[0] || '').toUpperCase()}${zonaLabel ? ` (${zonaLabel.toUpperCase()})` : ''}`
  doc.setTextColor(ACCENT)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  if (doc.getTextWidth(title) > pageW - margin * 2) doc.setFontSize(13)
  doc.text(title, margin, 28)
  doc.setTextColor(90)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const generado = now.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const zonaSub = zonaLabel ? `Cargas por: ${zonaLabel}  ·  ` : ''
  const sub = multi
    ? `${zonaSub}${clientes.length} clientes  ·  ${data.totals.contenedores} contenedor(es) activo(s)  ·  Generado: ${generado}`
    : `${zonaSub}${data.totals.contenedores} contenedor(es) activo(s)  ·  Generado: ${generado}`
  doc.text(sub, margin, 33)
  doc.setDrawColor(...ACCENT_RGB)
  doc.setLineWidth(0.6)
  doc.line(margin, 35.5, pageW - margin, 35.5)

  let y = 40
  // Salto de página ANTES de un título si no queda lugar (título huérfano).
  const ensure = (needed: number) => {
    if (y + needed > pageH - 14) { doc.addPage(); y = 16 }
  }
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  const section = (label: string, rows: PlanRow[], emptyText: string) => {
    ensure(22)
    doc.setTextColor(ACCENT)
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`${label} (${rows.length})`, margin, y)
    autoTable(doc, {
      startY: y + 2,
      head: [HEAD],
      body: rows.length
        ? rows.map(rowCells)
        : [[{
            content: emptyText,
            colSpan: HEAD.length,
            styles: { halign: 'center' as const, textColor: [156, 163, 175] as [number, number, number], fontStyle: 'italic' as const },
          }]],
      margin: { left: margin, right: margin, top: 16 },
      styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'ellipsize', valign: 'middle' },
      headStyles: { fillColor: ACCENT, textColor: '#ffffff', fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: ALT_ROW },
      rowPageBreak: 'avoid',   // una fila no se corta entre páginas
      columnStyles: {
        0: { cellWidth: 13 },                     // Ref
        1: { cellWidth: 23 },                     // CNTR
        2: { cellWidth: 13 },                     // Tipo
        3: { cellWidth: 12, halign: 'right' },    // Bultos
        4: { cellWidth: 15, halign: 'right' },    // Kg
        5: { cellWidth: 49, overflow: 'linebreak' }, // Descripción
        6: { cellWidth: 17 },                     // ETA MVD
        7: { cellWidth: 18 },                     // Terminal
        8: { cellWidth: 21 },                     // Operativa
        9: { cellWidth: 17 },                     // Salida
        10: { cellWidth: 17 },                    // ETA Fiscal
        11: { cellWidth: 17 },                    // LIBRE
      },                                          // Buque: ancho restante
    })
    y = finalY() + 6
  }

  for (const block of data.blocks) {
    if (multi) {
      ensure(30)
      doc.setTextColor(ACCENT)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(block.cliente.toUpperCase(), margin, y)
      doc.setDrawColor(...ACCENT_RGB)
      doc.setLineWidth(0.3)
      doc.line(margin, y + 1.5, margin + 60, y + 1.5)
      y += 7
    }
    section('CARGAS CON SALIDA PROGRAMADA', block.programadas, 'Sin cargas con salida programada')
    section('CARGAS PENDIENTES DE PROGRAMAR', block.pendientes, 'Sin cargas pendientes de programar')
    y += 2
  }

  // Resumen final
  ensure(20)
  doc.setTextColor(ACCENT)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMEN', margin, y)
  doc.setTextColor(60)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const t = data.totals
  doc.text(
    `Total: ${fmtNum(t.contenedores)} contenedor(es)  ·  ${fmtNum(t.bultos)} bultos  ·  ${fmtNum(Math.round(t.kg))} kg  ·  ` +
    `Con salida programada: ${fmtNum(t.programadas)}  ·  Pendientes de programar: ${fmtNum(t.pendientes)}`,
    margin, y + 5.5
  )

  // Footer en todas las páginas (patrón clientStatusPdf)
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setTextColor(130)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Página ${i} de ${pages}  —  Documento confidencial — ${brand.legalName}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' }
    )
  }

  const who = multi ? 'Varios' : slugify(clientes[0] || '')
  const zonaFile = zonaLabel ? `_${slugify(zonaLabel)}` : ''
  doc.save(`Plan_Operativo_${who}${zonaFile}_${now.toISOString().slice(0, 10)}.pdf`)
  return data.totals
}
