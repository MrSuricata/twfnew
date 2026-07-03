// ─── Ficha de facturación — export imprimible ───────────────────────
// Gastos (compra) vs venta con resultado, espejo del diálogo de
// BillingManagement. Sin librería de PDF: igual que truckExport, se
// renderiza un HTML brand-aware (getBrand()) en una pestaña nueva y se
// dispara el diálogo de impresión — el usuario guarda como PDF con
// fidelidad CSS total (columnas redondeadas, banda de resultado, chip).
//
// El renderer jsPDF anterior quedaba frágil: incrustaba el logo como
// bitmap sin comprimir (~1.3MB con el SVG Med rasterizado) y autotable
// paginaba en cadena ante cualquier celda desmesurada (14 páginas).
// ──────────────────────────────────────────────────────────────────────

import { BRANDS } from './brand'
import type { BillingLineItem } from './billingTypes'

// ─── Helpers puros (testeables sin DOM) ─────────────────────────────────

/** Monto USD → string es-UY: punto de miles, coma decimal, 2 decimales. */
export function fmtMoneyUY(n: number): string {
  return new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export interface FichaPdfData {
  /** Renglones saneados (sin filas totalmente vacías; montos no numéricos → 0). */
  gastos: BillingLineItem[]
  ventas: BillingLineItem[]
  totalGastos: number
  totalVentas: number
  /** VENTA − GASTOS. */
  resultado: number
  /** Filas listas para render: [concepto, monto es-UY]. */
  gastosRows: [string, string][]
  ventasRows: [string, string][]
  totalGastosFmt: string
  totalVentasFmt: string
  resultadoFmt: string
}

const sanitize = (lines: BillingLineItem[]): BillingLineItem[] =>
  (lines || [])
    .map(l => ({
      concepto: String(l?.concepto ?? '').trim(),
      monto: Number.isFinite(Number(l?.monto)) ? Number(l?.monto) : 0,
    }))
    .filter(l => l.concepto !== '' || l.monto !== 0)

/** Normaliza los renglones de la ficha y calcula totales + resultado. */
export function buildFichaPdfData(gastos: BillingLineItem[], ventas: BillingLineItem[]): FichaPdfData {
  const g = sanitize(gastos)
  const v = sanitize(ventas)
  const totalGastos = g.reduce((acc, l) => acc + l.monto, 0)
  const totalVentas = v.reduce((acc, l) => acc + l.monto, 0)
  const resultado = totalVentas - totalGastos
  return {
    gastos: g,
    ventas: v,
    totalGastos,
    totalVentas,
    resultado,
    gastosRows: g.map(l => [l.concepto || '—', fmtMoneyUY(l.monto)] as [string, string]),
    ventasRows: v.map(l => [l.concepto || '—', fmtMoneyUY(l.monto)] as [string, string]),
    totalGastosFmt: fmtMoneyUY(totalGastos),
    totalVentasFmt: fmtMoneyUY(totalVentas),
    resultadoFmt: fmtMoneyUY(resultado),
  }
}

/** Datos de cabecera de la carga (lo que ya tiene el ítem facturable). */
export interface FichaCargaInfo {
  ref: string
  cliente: string
  cntr?: string
  modeLabel: string              // FCL / LCL / Aéreo / Terrestre
  eta?: string                   // ETA MVD (ISO o texto)
  arrival?: Date | null          // llegada a fiscal / entrega
  transporte?: string            // transporte de la operativa
  deposito?: string              // depósito de la operativa
  truckCode?: string             // camión consolidado (si aplica)
  invoiceNumber?: string         // nº de factura (si ya está facturada)
  invoicedAt?: string | null     // fecha de facturación (ISO timestamp)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const dmy = (v: string) => (ISO.test(v) ? v.split('-').reverse().join('/') : v)
const fmtDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

/** Campos de la card de datos, en el orden del diálogo (espejo 1:1). */
export function fichaHeaderFields(info: FichaCargaInfo): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [
    { label: 'Cliente', value: info.cliente || '—' },
    { label: 'Modalidad', value: info.modeLabel || '—' },
    { label: 'CNTR', value: info.cntr || '—' },
    { label: 'ETA MVD', value: info.eta ? dmy(info.eta) : '—' },
    { label: 'Llegada a fiscal', value: info.arrival ? fmtDate(info.arrival) : '—' },
    { label: 'Transporte', value: (info.transporte || '').trim() || '—' },
    { label: 'Depósito', value: (info.deposito || '').trim() || '—' },
  ]
  if (info.truckCode) fields.push({ label: 'Camión', value: info.truckCode })
  return fields
}

// ─── Render imprimible (patrón truckExport) ─────────────────────────────

function esc(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Una columna (GASTOS o VENTA) como card redondeada con subtotal al pie. */
function columnHtml(title: string, rows: [string, string][], subtotalLabel: string, subtotalFmt: string, emptyMsg: string): string {
  const body = rows.length === 0
    ? `<div class="line empty">${esc(emptyMsg)}</div>`
    : rows.map(([concepto, monto]) => `
        <div class="line"><span class="concepto">${esc(concepto)}</span><span class="monto">${esc(monto)}</span></div>`).join('')
  return `
    <div class="col">
      <div class="col-head">${esc(title)}</div>
      <div class="col-body">${body}
      </div>
      <div class="col-foot"><span>${esc(subtotalLabel)}</span><span class="monto">USD ${esc(subtotalFmt)}</span></div>
    </div>`
}

/**
 * Abre la ficha "Ficha de facturación — [REF]" en una pestaña nueva lista
 * para imprimir / guardar como PDF (A4 vertical, brand-aware).
 */
export function openFichaFacturacionPrint(
  info: FichaCargaInfo,
  gastos: BillingLineItem[],
  ventas: BillingLineItem[],
  now: Date = new Date()
): void {
  const data = buildFichaPdfData(gastos, ventas)
  // SIEMPRE marca Mediterránea (decisión Brian 03/07, igual que analyticsPdf) —
  // la ficha es un documento de facturación interno de Med, no del dominio activo.
  // NO cambiar a getBrand().
  const brand = BRANDS.med
  const accent = '#261c79'   // índigo Mediterránea
  const accent2 = '#49286b'  // violeta Mediterránea
  // El HTML se escribe en una ventana about:blank — logo con URL absoluta.
  const logoUrl = new URL(brand.logo.full, window.location.origin).href
  const fmtNow = fmtDate(now)
  const refStr = (info.ref || '').trim()

  const fieldsHtml = fichaHeaderFields(info).map(f => `
      <div class="field"><div class="label">${esc(f.label)}</div><div class="value">${esc(f.value)}</div></div>`).join('')

  const invoiceChip = info.invoiceNumber || info.invoicedAt
    ? (() => {
        const d = info.invoicedAt ? new Date(info.invoicedAt) : null
        const when = d && !isNaN(d.getTime()) ? ` · ${fmtDate(d)}` : ''
        return `<div class="doc-status">FACTURADA · Nº ${esc(info.invoiceNumber || 's/nº')}${esc(when)}</div>`
      })()
    : ''

  const positivo = data.resultado >= 0

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ficha ${esc(refStr)} — ${esc(fmtNow)} — ${esc(brand.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font)}:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  body { font-family: '${brand.font}', 'Inter', 'Helvetica', Arial, sans-serif; color: #1f2937; font-size: 12px; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; }
  .header-rule { height: 3px; background: linear-gradient(90deg, ${accent} 0%, ${accent} 55%, ${accent2} 100%); margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 38px; width: auto; }
  .brand .name { font-size: 16px; font-weight: 700; color: ${accent}; letter-spacing: -0.01em; }
  .brand .sub { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-meta { text-align: right; font-size: 10px; color: #6b7280; }
  .doc-meta .doc-title { font-size: 17px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
  .doc-meta .doc-code { font-size: 22px; font-weight: 800; color: ${accent}; margin-top: 2px; }
  .doc-status { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #f0fdf4; border: 1px solid #86efac; color: #15803d; font-size: 10px; font-weight: 700; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 18px; padding: 12px 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 14px; break-inside: avoid; page-break-inside: avoid; }
  .info-grid .field:first-child { grid-column: span 2; }
  .info-grid .label { color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
  .info-grid .value { color: #111827; font-weight: 600; margin-top: 2px; font-size: 11px; overflow-wrap: anywhere; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  .col { border: 1px solid #e2e8f0; border-radius: 10px; }
  .col-head { padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; border-radius: 10px 10px 0 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #334155; }
  .col-body { padding: 6px 12px; }
  .line { display: flex; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px dashed #e5e7eb; break-inside: avoid; page-break-inside: avoid; }
  .line:last-child { border-bottom: none; }
  .line .concepto { color: #374151; overflow-wrap: anywhere; }
  .line .monto { font-variant-numeric: tabular-nums; font-weight: 600; color: #111827; white-space: nowrap; }
  .line.empty { color: #9ca3af; font-style: italic; justify-content: center; }
  .col-foot { display: flex; justify-content: space-between; gap: 10px; padding: 8px 12px; border-top: 2px solid #d1d5db; border-radius: 0 0 10px 10px; background: #f8fafc; font-weight: 700; color: #111827; break-inside: avoid; page-break-inside: avoid; }
  .resultado { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 10px; border: 1px solid; break-inside: avoid; page-break-inside: avoid; }
  .resultado.pos { background: #f0fdf4; border-color: #86efac; }
  .resultado.neg { background: #fef2f2; border-color: #fca5a5; }
  .resultado .res-label { font-size: 12px; font-weight: 600; }
  .resultado.pos .res-label { color: #14532d; }
  .resultado.neg .res-label { color: #7f1d1d; }
  .resultado .res-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .resultado.pos .res-value { color: #15803d; }
  .resultado.neg .res-value { color: #b91c1c; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #9ca3af; }
  @media print {
    .no-print { display: none; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; padding-bottom: 26px; }
    footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; }
  }
</style>
</head>
<body>
  <div class="no-print" style="position:fixed; top:10px; right:10px; z-index:1000;">
    <button onclick="window.print()" style="padding:8px 16px; background:${accent}; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
      🖨 Imprimir / Guardar PDF
    </button>
  </div>

  <header class="header">
    <div class="brand">
      <img src="${esc(logoUrl)}" alt="${esc(brand.name)}" onerror="this.style.display='none'" />
      <div>
        <div class="name">${esc(brand.displayName)}</div>
        <div class="sub">Ficha de facturación</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-title">FICHA DE FACTURACIÓN</div>
      <div class="doc-code">${esc(refStr)}</div>
      ${invoiceChip}
      <div style="margin-top:6px;">Generado: ${esc(fmtNow)}</div>
    </div>
  </header>
  <div class="header-rule"></div>

  <section class="info-grid">${fieldsHtml}
  </section>

  <section class="cols">
    ${columnHtml('Gastos (compra)', data.gastosRows, 'Total gastos', data.totalGastosFmt, 'Sin gastos cargados')}
    ${columnHtml('Venta', data.ventasRows, 'Total venta', data.totalVentasFmt, 'Sin ventas cargadas')}
  </section>

  <section class="resultado ${positivo ? 'pos' : 'neg'}">
    <span class="res-label">Resultado (venta − gastos)</span>
    <span class="res-value">USD ${esc(data.resultadoFmt)}</span>
  </section>

  <footer>
    ${esc(brand.legalName)} — Documento confidencial — Generado el ${esc(fmtNow)}
  </footer>

  <script>
    // Auto-trigger print dialog after the page renders.
    window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });
  </script>
</body>
</html>`

  // Open in a new tab/window so the user can print without leaving the app.
  const win = window.open('', '_blank')
  if (!win) {
    throw new Error('No se pudo abrir la ventana de impresión (¿popup bloqueado?)')
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
}
