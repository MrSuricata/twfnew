import type { VercelRequest, VercelResponse } from '@vercel/node'

const SHEETS_CSV_URL = process.env.GOOGLE_SHEETS_CSV_URL || ''

interface ShipmentRecord {
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
}

function parseCSV(csv: string): ShipmentRecord[] {
  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

  return lines.slice(1).map(line => {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = values[i] || ''
    })

    return {
      REF: record.REF || '',
      CLIENTE: record.CLIENTE || '',
      ETD: record.ETD || '',
      ETA: record.ETA || '',
      FT: Number(record.FT) || 0,
      LIBRE_HASTA: record.LIBRE_HASTA || '',
      CNTR: record.CNTR || '',
      N: Number(record.N) || 0,
      MBL: record.MBL || '',
      LINEA: record.LINEA || '',
      BUQUE: record.BUQUE || '',
      TERMINAL: record.TERMINAL || '',
    }
  })
}

function parseContainers(cntrString: string) {
  if (!cntrString || cntrString.trim() === '') return []
  const CONTAINER_PATTERN = /^[A-Z]{4}[0-9]{7}$/
  return cntrString.split(/[,\s]+/).filter(p => p.trim() !== '').map(p => ({
    number: p.trim(),
    valid: CONTAINER_PATTERN.test(p.trim())
  }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — restrict to configured origin
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')

  if (!SHEETS_CSV_URL) {
    return res.status(500).json({ error: 'Google Sheets URL not configured' })
  }

  try {
    const response = await fetch(SHEETS_CSV_URL)
    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch from Google Sheets' })
    }

    const csv = await response.text()
    const records = parseCSV(csv)

    const q = (req.query.q as string || '').toLowerCase().trim()

    if (q) {
      const filtered = records.filter(r =>
        r.REF?.toLowerCase().includes(q) ||
        r.CNTR?.toLowerCase().includes(q) ||
        r.MBL?.toLowerCase().includes(q)
      )

      // Return with parsed containers, but exclude sensitive financial fields
      const results = filtered.map(r => ({
        REF: r.REF,
        ETD: r.ETD,
        ETA: r.ETA,
        FT: r.FT,
        LIBRE_HASTA: r.LIBRE_HASTA,
        CNTR: r.CNTR,
        N: r.N || parseContainers(r.CNTR).length,
        MBL: r.MBL,
        LINEA: r.LINEA,
        BUQUE: r.BUQUE,
        TERMINAL: r.TERMINAL,
        containers: parseContainers(r.CNTR),
        calculatedN: parseContainers(r.CNTR).length || r.N,
        calculatedLibreHasta: r.LIBRE_HASTA,
        // Exclude: CLIENTE, C_TERMINAL, C_DEV, LOCALES, FLETE, FORMA_DE_PAGO, VTO
      }))

      return res.status(200).json({ results })
    }

    return res.status(400).json({ error: 'Query parameter "q" is required' })
  } catch (error) {
    console.error('Tracking API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
