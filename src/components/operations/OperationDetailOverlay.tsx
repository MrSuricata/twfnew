// OperationDetailOverlay — abre el panel de detalle COMPLETO (OperationDetailPanel,
// el drawer lateral con todos los campos editables) como overlay sobre CUALQUIER
// pestaña, sin navegar a Operaciones. Lo usa "Más datos →" del quick-edit de
// Agenda/HOY.
//
// Resuelve la operación de forma robusta (post-flip las FCL viven en dbShipments
// con uid = id de la fila, NO `fcl-${ref}`): primero por dbId (la clave que pasa
// el quick-edit, = shipment.__dbId), luego por uid, luego por ref FCL. Reusa el
// MISMO buildOperations que la grilla para que la op tenga la forma exacta que el
// panel espera (incl. el array `operativas` por contenedor).
//
// No expone "Eliminar" (sin onRequestDelete): el borrado vive en la grilla con su
// confirmación por PIN. Archivar (reversible) sí está disponible.

import { useMemo } from 'react'
import OperationDetailPanel from './OperationDetailPanel'
import {
  buildOperations,
  deriveKnownTransportes,
  deriveKnownValues,
  indexAssignments,
  buildTruckByRef,
  type Operator,
  type OperatorAssignment,
  type DbShipment,
  type UnifiedOperation,
} from '@/lib/operationsTypes'
import { canonicalizarLista, DEV_ALIASES } from '@/lib/fuzzyCatalog'
import type { ParsedShipment } from '@/lib/shipmentTypes'
import type { Truck, TruckLoad } from '@/lib/truckTypes'
import type { OriginPhoto, OperativeReport } from '@/lib/quotationTypes'

export interface OperationDetailOverlayProps {
  /** Clave de la operación a abrir: dbId (preferida), uid, o ref FCL. null = cerrado. */
  detailKey: string | null
  shipments: ParsedShipment[]
  dbShipments: DbShipment[]
  trucks: Truck[]
  truckLoads: TruckLoad[]
  operators: Operator[]
  assignments: OperatorAssignment[]
  /** Fotos de carga + informes PDF → sección "Fotos e informes" del panel. */
  originPhotos?: OriginPhoto[]
  reports?: OperativeReport[]
  onUpdateOriginPhotos?: (photos: OriginPhoto[]) => void
  onUpdateReports?: (reports: OperativeReport[]) => void
  onPatch: (id: string, fields: Record<string, unknown>) => void
  onPatchFcl?: (dbId: string, edits: Record<string, unknown>) => void
  onAssignOperator: (ref: string, operatorId: string | null) => void
  onRenameRef?: (op: UnifiedOperation, newRef: string, pin: string) => Promise<void>
  onClose: () => void
}

export default function OperationDetailOverlay({
  detailKey,
  shipments,
  dbShipments,
  trucks,
  truckLoads,
  operators,
  assignments,
  originPhotos,
  reports,
  onUpdateOriginPhotos,
  onUpdateReports,
  onPatch,
  onPatchFcl,
  onAssignOperator,
  onRenameRef,
  onClose,
}: OperationDetailOverlayProps) {
  const assignMap = useMemo(() => indexAssignments(assignments), [assignments])
  // includeArchived=true: el overlay debe poder resolver cualquier carga clickeada
  // aunque esté archivada (la grilla la oculta, pero el chip de Agenda puede no).
  const operations = useMemo(
    () => buildOperations(shipments, dbShipments, assignMap, true),
    [shipments, dbShipments, assignMap],
  )

  const op = useMemo<UnifiedOperation | null>(() => {
    if (!detailKey) return null
    return (
      operations.find(o => o.dbId === detailKey) ??
      operations.find(o => o.uid === detailKey) ??
      operations.find(o => o.mode === 'fcl' && o.ref === detailKey) ??
      null
    )
  }, [operations, detailKey])

  // Fila cruda de shipments de la op → sección Pagos del panel (los montos
  // y pago_*_at viven en la fila, no en UnifiedOperation).
  const dbRow = useMemo(
    () => (op?.dbId ? dbShipments.find(s => s.id === op.dbId) ?? null : null),
    [dbShipments, op],
  )

  const operatorById = useMemo(() => {
    const m = new Map<string, Operator>()
    for (const o of operators) m.set(o.id, o)
    return m
  }, [operators])

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  const truckByRef = useMemo(
    () => buildTruckByRef(trucks, truckLoads, hoy),
    [trucks, truckLoads, hoy],
  )

  const knownDepositos = useMemo(
    () => Array.from(new Set(operations.map(o => o.deposito).filter(Boolean))),
    [operations],
  )

  // Transportes ya usados → combobox de Transporte (datos clave de la carga).
  const knownTransportes = useMemo(
    () => deriveKnownTransportes(operations.map(o => o.transporte)),
    [operations],
  )

  // Fiscales y devoluciones ya usados → combos con catálogo (DEV unifica APM=MPS).
  const knownFiscales = useMemo(() => deriveKnownValues(operations.map(o => o.fiscal)), [operations])
  const knownDevs = useMemo(() => canonicalizarLista(operations.map(o => o.dev), DEV_ALIASES), [operations])
  const knownLugaresDescarga = useMemo(() => deriveKnownValues(operations.map(o => o.descarga)), [operations])

  // Asignación de operativo: igual que la grilla — filas DB patchean operator_id;
  // FCL espejo / no-DB usan el overlay por ref.
  const assignOp = (o: UnifiedOperation, operatorId: string | null) => {
    if (o.source === 'db' && o.dbId) onPatch(o.dbId, { operator_id: operatorId })
    else onAssignOperator(o.ref, operatorId)
  }

  // OperationDetailPanel ya maneja op=null (renderiza un Sheet cerrado), así que
  // es seguro montarlo siempre; el overlay "se abre" cuando detailKey resuelve una op.
  return (
    <OperationDetailPanel
      op={op}
      truckStatus={op ? truckByRef.get(op.ref) : undefined}
      operators={operators}
      operatorById={operatorById}
      hoy={hoy}
      knownDepositos={knownDepositos}
      knownTransportes={knownTransportes}
      knownFiscales={knownFiscales}
      knownDevs={knownDevs}
      knownLugaresDescarga={knownLugaresDescarga}
      dbRow={dbRow}
      originPhotos={originPhotos}
      reports={reports}
      onUpdateOriginPhotos={onUpdateOriginPhotos}
      onUpdateReports={onUpdateReports}
      onAssign={assignOp}
      onPatch={onPatch}
      onPatchFcl={onPatchFcl}
      onRenameRef={onRenameRef}
      onClose={onClose}
    />
  )
}
