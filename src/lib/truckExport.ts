// ─── Truck PDF export ──────────────────────────────────────────────
// No PDF library is bundled in the app — we keep the bundle slim and
// rely on the browser's native "Print → Save as PDF" instead. This
// renders a brand-aware print-only HTML (TWF o Mediterránea según el
// hostname, vía getBrand()) in a new tab and triggers the print dialog.
// ───────────────────────────────────────────────────────────────────

import { getBrand } from './brand'
import type { Truck, TruckLoad, TruckTotals } from './truckTypes'
import { TRUCK_STATUS_LABELS, getTruckLimits, truckCostPerM3, costColor } from './truckTypes'
import { formatKg, formatM3, formatPkgs } from './truckUtils'

function fmtDate(iso: string): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function esc(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function exportTruckPdf(
  truck: Truck,
  loads: TruckLoad[],
  totals: TruckTotals
): Promise<void> {
  const brand = getBrand()
  // Acentos por marca: índigo/violeta Mediterránea · azules TWF.
  const accent = brand.id === 'med' ? '#261c79' : '#1e40af'
  const accent2 = brand.id === 'med' ? '#49286b' : '#3b82f6'
  // El HTML se escribe en una ventana about:blank — logo con URL absoluta.
  const logoUrl = new URL(brand.logo.full, window.location.origin).href
  const limits = getTruckLimits(truck.isSider)
  const today = new Date()
  const fmtNow = today.toLocaleDateString('es-UY')

  const rowsHtml = loads.length === 0
    ? `<tr><td colspan="10" class="empty">Sin cargas asignadas</td></tr>`
    : loads.map(l => `
        <tr>
          <td><strong>${esc(l.sourceRef)}</strong><br/><span class="muted upper">${esc(l.sourceType)}</span></td>
          <td>${esc(l.client) || '—'}</td>
          <td>${esc(l.fiscal) || '—'}</td>
          <td class="num">${formatKg(l.kg)}</td>
          <td class="num">${formatM3(l.m3)}</td>
          <td class="num">${formatPkgs(l.pkgs)}</td>
          <td>${esc(l.bl) || '—'}</td>
          <td>${esc(l.stock) || '—'}</td>
          <td>${l.wood ? '<span class="wood-badge">Sí</span>' : '<span class="muted">No</span>'}</td>
          <td class="small">${esc(l.description)}</td>
        </tr>
      `).join('')

  const multifiscalWarning = totals.multifiscal
    ? `<div class="warn">⚠ Múltiples destinos fiscales: ${esc(totals.fiscals.join(' · '))}</div>`
    : ''
  const overWarning = (totals.overKg || totals.overM3)
    ? `<div class="warn err">⚠ ${totals.overKg ? 'Peso' : ''}${totals.overKg && totals.overM3 ? ' y ' : ''}${totals.overM3 ? 'Volumen' : ''} por encima del límite del camión</div>`
    : ''

  // ── Costos del flete ──────────────────────────────────────────────────
  const costInfo = truckCostPerM3(truck, loads)
  const fmtUSD = (v: number) =>
    v.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  let costsBlockHtml = ''
  if (costInfo.total > 0) {
    const lineItems: string[] = []
    if (truck.costDespacho > 0)
      lineItems.push(`<div class="costs-row"><span class="item-label">Despacho</span><span class="item-value">USD ${fmtUSD(truck.costDespacho)}</span></div>`)
    if (truck.costFlete > 0)
      lineItems.push(`<div class="costs-row"><span class="item-label">Flete terrestre</span><span class="item-value">USD ${fmtUSD(truck.costFlete)}</span></div>`)
    if (truck.costCarga > 0)
      lineItems.push(`<div class="costs-row"><span class="item-label">Carga sobre camión</span><span class="item-value">USD ${fmtUSD(truck.costCarga)}</span></div>`)

    const perM3Html = costInfo.perM3 !== null
      ? (() => {
          const color = costColor(costInfo.perM3)
          const perM3Str = costInfo.perM3.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return `<div class="costs-perm3 ${color}">USD/m³: ${perM3Str}</div>`
        })()
      : ''

    costsBlockHtml = `
    <div class="costs">
      <div class="section-title">Costos del flete</div>
      ${lineItems.join('\n      ')}
      <div class="costs-total">
        <span>Total</span>
        <span>USD ${fmtUSD(costInfo.total)}</span>
      </div>
      ${perM3Html}
    </div>`
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Plan Camión ${esc(truck.code)} — ${esc(fmtNow)} — ${esc(brand.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(brand.font)}:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: A4 landscape; margin: 14mm 10mm; }
  body { font-family: '${brand.font}', 'Inter', 'Helvetica', Arial, sans-serif; color: #1f2937; font-size: 11px; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; }
  .header-rule { height: 3px; background: linear-gradient(90deg, ${accent} 0%, ${accent} 55%, ${accent2} 100%); margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 38px; width: auto; }
  .brand .name { font-size: 16px; font-weight: 700; color: ${accent}; letter-spacing: -0.01em; }
  .brand .sub { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-meta { text-align: right; font-size: 10px; color: #6b7280; }
  .doc-meta .doc-title { font-size: 18px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
  .doc-meta .doc-code { font-size: 22px; font-weight: 800; color: ${accent}; margin-top: 2px; }
  .doc-meta .doc-status { display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${accent}14; color: ${accent}; font-size: 10px; font-weight: 600; margin-top: 4px; }
  .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 18px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 12px; }
  .info-grid .field { font-size: 10px; }
  .info-grid .label { color: #6b7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
  .info-grid .value { color: #111827; font-weight: 600; margin-top: 2px; }
  .totals { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
  .totals .cell { background: white; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; text-align: center; }
  .totals .cell .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .totals .cell .value { font-size: 18px; font-weight: 700; color: ${accent}; line-height: 1.1; }
  .totals .cell .hint { font-size: 9px; color: #6b7280; margin-top: 2px; }
  .totals .cell.over .value { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
  thead { background: ${accent}; color: white; }
  thead th { padding: 6px 8px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  thead th.num { text-align: right; }
  tbody tr { border-bottom: 1px solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 5px 8px; vertical-align: top; overflow-wrap: anywhere; }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td.empty { text-align: center; color: #9ca3af; padding: 20px; }
  tbody td.small { font-size: 9px; color: #6b7280; max-width: 220px; }
  .muted { color: #6b7280; }
  .upper { text-transform: uppercase; font-size: 8px; letter-spacing: 0.05em; }
  .warn { background: #fef3c7; color: #92400e; padding: 6px 10px; border-radius: 4px; font-size: 10px; margin-top: 6px; border: 1px solid #fde68a; }
  .warn.err { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
  .wood-badge { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; border-radius: 3px; padding: 1px 6px; font-weight: 700; }
  .notes { margin-top: 14px; padding: 10px 12px; background: #f8fafc; border-left: 3px solid ${accent}; border-radius: 4px; break-inside: avoid; page-break-inside: avoid; }
  .notes .label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .notes .value { font-size: 10px; color: #111827; white-space: pre-wrap; margin-top: 2px; }
  footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 9px; color: #9ca3af; }
  .costs { margin-top: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; break-inside: avoid; page-break-inside: avoid; }
  .costs .section-title { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 8px; }
  .costs-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e5e7eb; font-size: 10px; }
  .costs-row:last-child { border-bottom: none; }
  .costs-row .item-label { color: #374151; }
  .costs-row .item-value { font-variant-numeric: tabular-nums; font-weight: 600; color: #111827; }
  .costs-total { display: flex; justify-content: space-between; padding: 6px 0 4px; margin-top: 4px; border-top: 2px solid #d1d5db; font-size: 11px; font-weight: 700; color: #111827; }
  .costs-perm3 { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; padding: 5px 12px; border-radius: 6px; border: 1px solid; font-size: 11px; font-weight: 700; }
  .costs-perm3.green { background: #f0fdf4; border-color: #86efac; color: #15803d; }
  .costs-perm3.yellow { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
  .costs-perm3.red { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
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
        <div class="sub">Plan de carga de camión</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-title">PLAN DE CAMIÓN</div>
      <div class="doc-code">${esc(truck.code)}</div>
      <div class="doc-status">${esc(TRUCK_STATUS_LABELS[truck.status])}${truck.isSider ? ' · SIDER' : ''}</div>
      <div style="margin-top:6px;">Emitido: ${esc(fmtNow)}</div>
    </div>
  </header>
  <div class="header-rule"></div>

  <section class="info-grid">
    <div class="field"><div class="label">Transporte</div><div class="value">${esc(truck.transport) || '—'}</div></div>
    <div class="field"><div class="label">Chofer</div><div class="value">${esc(truck.driver) || '—'}</div></div>
    <div class="field"><div class="label">Patente</div><div class="value">${esc(truck.plate) || '—'}</div></div>
    <div class="field"><div class="label">Tipo</div><div class="value">${truck.isSider ? 'Sider' : 'Estándar'}</div></div>
    <div class="field"><div class="label">Fecha de carga</div><div class="value">${fmtDate(truck.loadDate)}</div></div>
    <div class="field"><div class="label">Fecha de salida</div><div class="value">${fmtDate(truck.departureDate)}</div></div>
    <div class="field"><div class="label">Arribo a fiscal</div><div class="value">${fmtDate(truck.arrivalDate)}</div></div>
    <div class="field"><div class="label">Capacidad</div><div class="value">${formatKg(limits.kgMax)} kg · ${formatM3(limits.m3Max)} m³</div></div>
  </section>

  <section class="totals">
    <div class="cell"><div class="label">Cargas</div><div class="value">${totals.loadCount}</div></div>
    <div class="cell ${totals.overKg ? 'over' : ''}"><div class="label">Peso total</div><div class="value">${formatKg(totals.kg)}</div><div class="hint">kg / ${formatKg(limits.kgMax)}</div></div>
    <div class="cell ${totals.overM3 ? 'over' : ''}"><div class="label">Volumen</div><div class="value">${formatM3(totals.m3)}</div><div class="hint">m³ / ${formatM3(limits.m3Max)}</div></div>
    <div class="cell"><div class="label">Bultos</div><div class="value">${formatPkgs(totals.pkgs)}</div></div>
    <div class="cell ${totals.multifiscal ? 'over' : ''}"><div class="label">Fiscales</div><div class="value">${totals.fiscals.length || '—'}</div><div class="hint">destinos</div></div>
  </section>

  ${overWarning}
  ${multifiscalWarning}

  <table style="margin-top:10px;">
    <colgroup>
      <col style="width:9%" />   <!-- Ref -->
      <col style="width:12%" />  <!-- Cliente -->
      <col style="width:10%" />  <!-- Fiscal -->
      <col style="width:7%" />   <!-- Kg -->
      <col style="width:6%" />   <!-- m³ -->
      <col style="width:6%" />   <!-- Bultos -->
      <col style="width:10%" />  <!-- BL -->
      <col style="width:7%" />   <!-- Stock -->
      <col style="width:5%" />   <!-- Madera -->
      <col />                    <!-- Descripción: resto -->
    </colgroup>
    <thead>
      <tr>
        <th>Ref</th>
        <th>Cliente</th>
        <th>Fiscal</th>
        <th class="num">Kg</th>
        <th class="num">m³</th>
        <th class="num">Bultos</th>
        <th>BL</th>
        <th>Stock</th>
        <th>Madera</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  ${truck.notes ? `
    <div class="notes">
      <div class="label">Notas</div>
      <div class="value">${esc(truck.notes)}</div>
    </div>
  ` : ''}

  ${costsBlockHtml}

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
