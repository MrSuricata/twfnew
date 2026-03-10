import { ParsedShipment } from './shipmentTypes'
import { QuoteFormData } from './quotationTypes'

export function exportToCSV(data: any[], filename: string) {
  if (!data || data.length === 0) {
    return
  }

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) return ''
        const stringValue = String(value)
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`
        }
        return stringValue
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function exportShipmentsToExcel(shipments: ParsedShipment[], filename: string = 'shipments.csv') {
  const exportData = shipments.map(s => ({
    REF: s.REF,
    CLIENTE: s.CLIENTE,
    ETD: s.ETD,
    ETA: s.ETA,
    FT: s.FT,
    LIBRE_HASTA: s.LIBRE_HASTA,
    CNTR: s.CNTR,
    N: s.N,
    MBL: s.MBL,
    LINEA: s.LINEA,
    BUQUE: s.BUQUE,
    TERMINAL: s.TERMINAL,
    C_TERMINAL: s.C_TERMINAL,
    C_DEV: s.C_DEV,
    LOCALES: s.LOCALES,
    FLETE: s.FLETE,
    FORMA_DE_PAGO: s.FORMA_DE_PAGO,
    VTO: s.VTO,
    CR: s.CR ? 'Sí' : 'No',
    BL: s.BL ? 'Sí' : 'No',
    AD: s.AD ? 'Sí' : 'No',
    AT: s.AT ? 'Sí' : 'No'
  }))
  
  exportToCSV(exportData, filename)
}

export function exportQuotesToExcel(quotes: QuoteFormData[], filename: string = 'quotes.csv') {
  const exportData = quotes.map(q => ({
    ID: q.id,
    Fecha: new Date(q.timestamp).toLocaleDateString(),
    Nombre: q.name,
    Email: q.email,
    Telefono: q.phone,
    TipoCarga: q.cargoType,
    Origen: q.origin,
    Destino: q.destination,
    Detalles: q.details,
    Estado: q.status,
    Notas: q.notes.length
  }))
  
  exportToCSV(exportData, filename)
}

export async function exportToPDF(
  title: string,
  data: any[],
  headers: string[],
  filename: string = 'report.pdf'
) {
  const content = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
    }
    h1 {
      color: #1a1a2e;
      margin-bottom: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .footer {
      margin-top: 30px;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>Generado: ${new Date().toLocaleString('es-UY')}</p>
  <table>
    <thead>
      <tr>
        ${headers.map(h => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="footer">
    <p>Transit World Forwarding - Soluciones Logísticas Globales</p>
  </div>
</body>
</html>
  `

  const printWindow = window.open('', '', 'width=800,height=600')
  if (printWindow) {
    printWindow.document.write(content)
    printWindow.document.close()
    printWindow.focus()
    
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}
