import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ClipboardText, Warning, CheckCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { DbShipment } from '@/lib/operationsTypes'
import { OPERATION_COLUMNS, EDITABLE_FIELDS } from '@/lib/operationsTypes'

// ── Bulk paste from Excel ────────────────────────────────────────────────
// Paste a TSV block (Excel copy). First row = headers; one column must be the
// ref (identifies the row). Only DB rows (LCL/aéreo/terrestre) are touched —
// FCL refs simply don't match a DB row and are skipped. A preview of every
// change (old → new) is shown before anything is written; applying reuses the
// per-row PATCH path (optimistic + server), so nothing is written blind.

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').trim()

// Header text → grid column key. Built from column labels + common aliases.
const HEADER_TO_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const c of OPERATION_COLUMNS) m[norm(c.label)] = c.key as string
  Object.assign(m, {
    ref: 'ref', referencia: 'ref', refcliente: 'clientRef',
    cnee: 'cliente', cliente: 'cliente', clientecnee: 'cliente',
    bl: 'docNumber', mawb: 'docNumber', hawb: 'docNumber', awb: 'docNumber',
    crt: 'docNumber', doc: 'docNumber', documento: 'docNumber',
    cntr: 'cntr', contenedor: 'cntr', container: 'cntr',
    bultos: 'pkgs', pkgs: 'pkgs', kg: 'kg', peso: 'kg', m3: 'm3', cbm: 'm3',
    deposito: 'deposito', fiscal: 'fiscal', destino: 'destPort',
    transporte: 'transporte', camion: 'camion', despacho: 'despacho',
    descripcion: 'descripcion', origen: 'origin', shipper: 'shipper',
    agente: 'agente', incoterm: 'incoterm', linea: 'linea', buque: 'buque',
    eta: 'eta', etd: 'etd', tlx: 'tlx', wood: 'wood', madera: 'wood',
  })
  return m
})()

function parseNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  // es-UY: '.'=miles, ','=decimal. Disambiguate when both present.
  const x = t.includes('.') && t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t.replace(',', '.')
  const n = parseFloat(x)
  return isFinite(n) ? n : null
}

function parseBool(s: string): boolean {
  return ['si', 'sí', 'yes', 'true', '1', 'x'].includes(s.trim().toLowerCase())
}

interface RowChange {
  ref: string
  dbId: string
  fields: Record<string, unknown>            // DB column → value (to PATCH)
  diffs: { label: string; from: string; to: string }[]
}

interface ParseResult {
  changes: RowChange[]
  skipped: string[]                          // refs not found among DB rows (FCL / unknown)
  unmatchedHeaders: string[]                 // header columns we couldn't map
  noRefColumn: boolean
  totalRows: number
}

function parsePaste(text: string, dbShipments: DbShipment[]): ParseResult {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length > 0)
  const empty: ParseResult = { changes: [], skipped: [], unmatchedHeaders: [], noRefColumn: false, totalRows: 0 }
  if (lines.length < 2) return empty

  const headers = lines[0].split('\t')
  const colKeys: (string | null)[] = headers.map(h => HEADER_TO_KEY[norm(h)] ?? null)
  const unmatchedHeaders = headers.filter((h, i) => h.trim() && colKeys[i] === null)
  const refIdx = colKeys.indexOf('ref')
  if (refIdx === -1) return { ...empty, noRefColumn: true, totalRows: lines.length - 1 }

  // Index DB rows by normalized ref (only DB rows are editable).
  const byRef = new Map<string, DbShipment>()
  for (const s of dbShipments) if (s.ref) byRef.set(s.ref.toUpperCase().trim(), s)

  const colByKey = new Map(OPERATION_COLUMNS.map(c => [c.key as string, c]))
  const changes: RowChange[] = []
  const skipped: string[] = []

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split('\t')
    const ref = (cells[refIdx] ?? '').trim()
    if (!ref) continue
    const db = byRef.get(ref.toUpperCase())
    if (!db) { skipped.push(ref); continue }

    const fields: Record<string, unknown> = {}
    const diffs: RowChange['diffs'] = []
    for (let i = 0; i < headers.length; i++) {
      const key = colKeys[i]
      if (!key || key === 'ref') continue
      const ef = EDITABLE_FIELDS[key as keyof typeof EDITABLE_FIELDS]
      if (!ef) continue
      const raw = (cells[i] ?? '').trim()

      const current = (db as unknown as Record<string, unknown>)[ef.col]
      let next: unknown
      if (ef.type === 'number') next = parseNum(raw)
      else if (ef.type === 'bool') next = parseBool(raw)
      else next = raw

      // Normalize for comparison to avoid no-op writes.
      const same = ef.type === 'number'
        ? Number(current ?? 0) === Number(next ?? 0)
        : ef.type === 'bool'
          ? !!current === !!next
          : String(current ?? '') === String(next ?? '')
      if (same) continue

      fields[ef.col] = next
      const label = colByKey.get(key)?.label ?? key
      const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : ef.type === 'bool' ? (v ? 'SI' : 'NO') : String(v))
      diffs.push({ label, from: fmt(current), to: fmt(next) })
    }

    if (diffs.length > 0) changes.push({ ref, dbId: db.id, fields, diffs })
  }

  return { changes, skipped, unmatchedHeaders, noRefColumn: false, totalRows: lines.length - 1 }
}

export default function PasteImportDialog({
  open,
  onOpenChange,
  dbShipments,
  onPatch,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  dbShipments: DbShipment[]
  onPatch: (id: string, fields: Record<string, unknown>) => void
}) {
  const [text, setText] = useState('')
  const result = useMemo(() => (text.trim() ? parsePaste(text, dbShipments) : null), [text, dbShipments])

  const cellCount = useMemo(
    () => (result ? result.changes.reduce((a, c) => a + c.diffs.length, 0) : 0),
    [result]
  )

  const apply = () => {
    if (!result || result.changes.length === 0) return
    for (const c of result.changes) onPatch(c.dbId, c.fields)
    toast.success(`${result.changes.length} carga${result.changes.length === 1 ? '' : 's'} actualizada${result.changes.length === 1 ? '' : 's'} (${cellCount} celda${cellCount === 1 ? '' : 's'})`)
    setText('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setText(''); onOpenChange(v) }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardText size={20} /> Pegado masivo desde Excel</DialogTitle>
          <DialogDescription>
            Copiá un bloque desde Excel (con encabezados) y pegalo abajo. <strong>Una columna debe ser “Ref”</strong> para
            identificar cada carga. Solo se actualizan cargas de la base (LCL/aéreo/terrestre); las FCL se omiten.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={'Ref\tCliente\tETA\tFiscal\nE22\tPICCINI\t2026-06-20\tZP RAFAELA\n…'}
          rows={6}
          className="w-full rounded-md border border-border bg-background p-2 text-xs font-mono"
        />

        {result && (
          <div className="space-y-3 text-sm">
            {result.noRefColumn ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
                <Warning size={18} className="mt-0.5 shrink-0" />
                <div>No encontré una columna <strong>“Ref”</strong> en los encabezados. Agregá una columna Ref y volvé a pegar.</div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><strong className="text-foreground">{result.changes.length}</strong> cargas a actualizar</span>
                  <span><strong className="text-foreground">{cellCount}</strong> celdas cambian</span>
                  {result.skipped.length > 0 && <span className="text-amber-600">{result.skipped.length} ref no están en la base (omitidas)</span>}
                  {result.unmatchedHeaders.length > 0 && <span className="text-amber-600">columnas ignoradas: {result.unmatchedHeaders.join(', ')}</span>}
                </div>

                {result.changes.length > 0 && (
                  <div className="max-h-[40vh] overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr><th className="text-left px-2 py-1">Ref</th><th className="text-left px-2 py-1">Campo</th><th className="text-left px-2 py-1">Antes</th><th className="text-left px-2 py-1">Después</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.changes.flatMap(c =>
                          c.diffs.map((d, j) => (
                            <tr key={`${c.ref}-${j}`}>
                              {j === 0 && <td className="px-2 py-1 font-semibold align-top" rowSpan={c.diffs.length}>{c.ref}</td>}
                              <td className="px-2 py-1">{d.label}</td>
                              <td className="px-2 py-1 text-muted-foreground line-through">{d.from}</td>
                              <td className="px-2 py-1 text-green-700 font-medium">{d.to}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {result.skipped.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Omitidas (no son cargas de la base): {result.skipped.slice(0, 20).join(', ')}{result.skipped.length > 20 ? '…' : ''}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setText(''); onOpenChange(false) }}>Cancelar</Button>
          <Button onClick={apply} disabled={!result || result.changes.length === 0} className="gap-1.5">
            <CheckCircle size={16} /> Aplicar {result && result.changes.length > 0 ? `(${result.changes.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
