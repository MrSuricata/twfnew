import { ParsedShipment, processShipmentRecord } from './shipmentTypes'

// Generic demo data for development — no real client information
const rawDemoData = [
  // EMBARCADO - en tránsito activo
  { REF: 'D1001', CLIENTE: 'DEMO ALPHA SA', ETD: '2026-02-28', ETA: '2026-04-27', CNTR: 'DEMO0000001', N: 1, MBL: 'DEMO00000001', LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL A', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '2026-06-06', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1002', CLIENTE: 'DEMO BETA SRL', ETD: '2026-01-12', ETA: '2026-03-20', CNTR: 'DEMO0000002', N: 1, MBL: 'DEMO00000002', LINEA: 'ONE', BUQUE: 'DEMO VESSEL B', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-04-25', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1003', CLIENTE: 'DEMO GAMMA SA', ETD: '2026-01-09', ETA: '2026-04-11', CNTR: 'DEMO0000003', N: 1, MBL: 'DEMO00000003', LINEA: 'ONE', BUQUE: 'DEMO VESSEL C', TERMINAL: 'MONTECON', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-05-15', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1004', CLIENTE: 'DEMO GAMMA SA', ETD: '2026-01-03', ETA: '2026-04-11', CNTR: 'DEMO0000004 DEMO0000005', N: 2, MBL: 'DEMO00000004', LINEA: 'ONE', BUQUE: 'DEMO VESSEL C', TERMINAL: 'TCP', FT: 7, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-05-15', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1005', CLIENTE: 'DEMO DELTA SA', ETD: '2026-01-10', ETA: '2026-04-11', CNTR: 'DEMO0000006', N: 1, MBL: 'DEMO00000005', LINEA: 'ONE', BUQUE: 'DEMO VESSEL C', TERMINAL: 'MONTECON', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-05-15', CR: true, BL: false, AD: false, AT: false },
  { REF: 'D1006', CLIENTE: 'DEMO EPSILON SA', ETD: '2026-02-03', ETA: '2026-04-11', CNTR: 'DEMO0000007', N: 1, MBL: 'DEMO00000006', LINEA: 'ONE', BUQUE: 'DEMO VESSEL C', TERMINAL: 'MONTECON', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-05-15', CR: true, BL: true, AD: true, AT: true },
  // EN ORIGEN - esperando embarque
  { REF: 'D1007', CLIENTE: 'DEMO ZETA SRL', ETD: '2026-03-02', ETA: '2026-04-18', CNTR: 'DEMO0000008', N: 1, MBL: '', LINEA: 'ONE', BUQUE: 'DEMO VESSEL D', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '', CR: false, BL: false, AD: false, AT: false },
  { REF: 'D1008', CLIENTE: 'DEMO ETA SA', ETD: '2026-01-27', ETA: '2026-03-06', CNTR: 'DEMO0000009', N: 1, MBL: '', LINEA: 'HAPAG', BUQUE: 'DEMO VESSEL E', TERMINAL: 'TCP', FT: 10, FORMA_DE_PAGO: 'al arribo' as const, VTO: '', CR: false, BL: false, AD: true, AT: false },
  { REF: 'D1009', CLIENTE: 'DEMO THETA SA', ETD: '2026-01-22', ETA: '2026-03-07', CNTR: 'DEMO0000010', N: 1, MBL: '', LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL F', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '', CR: true, BL: false, AD: false, AT: false },
  { REF: 'D1010', CLIENTE: 'DEMO IOTA SRL', ETD: '2026-01-10', ETA: '2026-03-07', CNTR: 'DEMO0000011 DEMO0000012', N: 2, MBL: '', LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL F', TERMINAL: 'TCP', FT: 7, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '', CR: false, BL: false, AD: false, AT: false },
  // ARRIBADO - ya llegaron
  { REF: 'D1011', CLIENTE: 'DEMO EPSILON SA', ETD: '2025-11-18', ETA: '2026-02-03', CNTR: 'DEMO0000013', N: 1, MBL: 'DEMO00000007', LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL G', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '2026-03-10', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1012', CLIENTE: 'DEMO KAPPA SA', ETD: '2025-11-06', ETA: '2026-02-03', CNTR: 'DEMO0000014 DEMO0000015', N: 2, MBL: 'DEMO00000008', LINEA: 'ONE', BUQUE: 'DEMO VESSEL H', TERMINAL: 'MONTECON', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2026-03-10', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1013', CLIENTE: 'DEMO LAMBDA SA', ETD: '2026-01-03', ETA: '2026-02-07', CNTR: 'DEMO0000016', N: 1, MBL: 'DEMO00000009', LINEA: 'MAERSK', BUQUE: 'DEMO VESSEL I', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '2026-03-15', CR: true, BL: true, AD: true, AT: true },
  { REF: 'D1014', CLIENTE: 'DEMO ALPHA SA', ETD: '2025-05-10', ETA: '2025-07-14', CNTR: 'DEMO0000017 DEMO0000018', N: 2, MBL: 'DEMO00000010', LINEA: 'ONE', BUQUE: 'DEMO VESSEL J', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'cuenta corriente' as const, VTO: '2025-08-20', CR: true, BL: true, AD: true, AT: true },
  // PENDIENTE FECHAS
  { REF: 'D1015', CLIENTE: 'DEMO MU SRL', ETD: '2026-03-15', ETA: '2026-05-20', CNTR: '', N: 3, MBL: 'DEMO00000011', LINEA: 'MAERSK', BUQUE: '', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '', CR: false, BL: false, AD: false, AT: false },
  { REF: 'D1016', CLIENTE: 'DEMO NU SA', ETD: '2026-02-15', ETA: '2026-05-13', CNTR: 'DEMO0000019', N: 1, MBL: 'DEMO00000012', LINEA: 'MAERSK', BUQUE: '', TERMINAL: 'TCP', FT: 5, FORMA_DE_PAGO: 'programado' as const, VTO: '', CR: false, BL: false, AD: false, AT: false },
]

export function getDemoShipments(): ParsedShipment[] {
  return rawDemoData.map(record => processShipmentRecord(record))
}
