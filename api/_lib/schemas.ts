import { z } from 'zod'

// ─── Settings allowlist ─────────────────────────────────────────────
// Start empty: no settings keys are currently written by the app.
// To allow a new settings key, add it here AND verify the admin UI writes it.
export const SETTINGS_ALLOWLIST: readonly string[] = [] as const

// ─── Helpers ────────────────────────────────────────────────────────
/** Strip HTML tags. Not bulletproof, but blocks naive injection attempts. */
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '')

// ─── Schemas ────────────────────────────────────────────────────────

/** Public quote form submission */
export const QuoteSubmitSchema = z.object({
  name: z.string().min(1).max(100).transform(s => s.trim()),
  email: z.string().email().max(200).transform(s => s.toLowerCase().trim()),
  phone: z.string().max(40).optional(),
  cargoType: z.string().min(1).max(100),
  origin: z.string().max(200).optional(),
  destination: z.string().max(200).optional(),
  details: z.string().max(2000).transform(stripHtml).optional(),
  language: z.string().max(8).optional(),
})

/** Admin-synced quote row (bulk upsert) */
export const QuoteRowSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().default(''),
  cargoType: z.string().max(100).optional(),
  cargo_type: z.string().max(100).optional(),
  origin: z.string().max(200).optional().default(''),
  destination: z.string().max(200).optional().default(''),
  details: z.string().max(2000).optional().default(''),
  timestamp: z.number().int().positive().optional(),
  status: z.enum(['pending', 'contacted', 'quoted', 'closed', 'lost']).optional(),
  notes: z.array(z.any()).optional(),
  language: z.string().max(8).optional(),
})

/** Client row (admin CRUD).
 *  Nada es obligatorio salvo `name`: el catálogo de clientes existe aunque no
 *  tenga email ni datos legales todavía. El patrón es opcional — si falta, el
 *  login del portal lo deriva de name+aliases (ver admin-login.ts). */
const clientePatternRe = /^[A-Z0-9ÁÉÍÓÚÜÑ .&,/-]+(,[A-Z0-9ÁÉÍÓÚÜÑ .&,/-]+)*$/i
const optTrimmed = (max: number) => z.string().max(max).transform(s => s.trim()).optional()
export const ClientRowSchema = z.object({
  id: z.string().min(1).max(100),
  email: z.string().email().max(200).optional().or(z.literal('')),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().default(''),
  razonSocial: optTrimmed(200),
  razon_social: optTrimmed(200),
  cuitDoc: optTrimmed(100),
  cuit_doc: optTrimmed(100),
  pais: optTrimmed(100),
  direccion: optTrimmed(300),
  aliases: optTrimmed(1000),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  clientePattern: z.string().max(400).regex(clientePatternRe, 'invalid chars').refine(
    (s) => s.split(',').map(t => t.trim()).every(t => t.length >= 4),
    { message: 'cada cliente del patrón (separado por coma) debe tener al menos 4 caracteres' }
  ).optional().or(z.literal('')),
  digestActive: z.boolean().optional(),
  digest_active: z.boolean().optional(),
  digestEmails: optTrimmed(1000),
  digest_emails: optTrimmed(1000),
})

/** Noticias / avisos de la landing (sección Novedades logísticas). */
export const EventoCalendarioSchema = z.object({
  id: z.string().max(64).optional(),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  tipo: z.enum(['feriado', 'paro', 'aviso']).optional(),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(200),
  detalle: optTrimmed(1000),
})

export const NoticiaRowSchema = z.object({
  id: z.string().max(64).optional(),
  titulo: z.string().trim().min(1, 'El título es obligatorio').max(300),
  bajada: optTrimmed(600),
  cuerpo: optTrimmed(8000),
  categoria: optTrimmed(40),
  imagenUrl: optTrimmed(1000),
  imagen_url: optTrimmed(1000),
  alerta: z.boolean().optional(),
  activo: z.boolean().optional(),
  vigenteHasta: optTrimmed(20),
  vigente_hasta: optTrimmed(20),
  // Slide del carrusel de portada
  estilo: optTrimmed(20),
  kicker: optTrimmed(80),
  kickerExtra: optTrimmed(80),
  kicker_extra: optTrimmed(80),
  subtitulo: optTrimmed(200),
  mensaje: optTrimmed(500),
  linkUrl: optTrimmed(1000),
  link_url: optTrimmed(1000),
})

/** Settings upsert (PUT) */
export const SettingsUpsertSchema = z.object({
  key: z.string().refine(
    (k) => (SETTINGS_ALLOWLIST as readonly string[]).includes(k),
    { message: 'key not in SETTINGS_ALLOWLIST' }
  ),
  value: z.unknown(),
})

/** Partner user create (POST) */
export const PartnerUserCreateSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
  role: z.enum(['depot', 'transport']),
  filterValue: z.string().min(2).max(200),
})

/** Partner user patch (PATCH, partial) */
export const PartnerUserPatchSchema = z.object({
  email: z.string().email().max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  password: z.string().min(10).max(200).optional(),
  role: z.enum(['depot', 'transport']).optional(),
  filterValue: z.string().min(2).max(200).optional(),
  active: z.boolean().optional(),
})

/** Document row */
export const DocumentRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(300),
  type: z.string().max(100).optional().default(''),
  uploadedAt: z.number().int().optional(),
  uploaded_at: z.number().int().optional(),
  uploadedBy: z.string().max(200).optional().default(''),
  uploaded_by: z.string().max(200).optional().default(''),
  url: z.string().max(2000).optional().default(''),
  data: z.string().optional().default(''),
}).refine(d => d.shipmentRef || d.shipment_ref, { message: 'shipmentRef required' })

/** Report row */
export const ReportRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  title: z.string().min(1).max(300),
  content: z.string().max(20000).optional().default(''),
  fileName: z.string().max(300).optional(),
  file_name: z.string().max(300).optional(),
  fileType: z.string().max(100).optional(),
  file_type: z.string().max(100).optional(),
  fileData: z.string().optional(),
  file_data: z.string().optional(),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  createdBy: z.string().max(200).optional(),
  created_by: z.string().max(200).optional(),
}).refine(r => r.shipmentRef || r.shipment_ref, { message: 'shipmentRef required' })

/** Origin photo row */
export const OriginPhotoRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  caption: z.string().max(500).optional().default(''),
  // 'uruguay' es la etapa que usa la UI desde siempre (PhotoLocation en
  // quotationTypes.ts); faltaba en el enum y el POST la rechazaba con 400.
  photoType: z.enum(['origen', 'uruguay', 'destino', 'otro']).optional().default('origen'),
  photo_type: z.enum(['origen', 'uruguay', 'destino', 'otro']).optional(),
  fileName: z.string().max(300).optional().default(''),
  file_name: z.string().max(300).optional(),
  fileType: z.string().max(100).optional().default(''),
  file_type: z.string().max(100).optional(),
  fileData: z.string().optional().default(''),
  file_data: z.string().optional(),
  thumbnailData: z.string().optional().default(''),
  thumbnail_data: z.string().optional(),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  createdBy: z.string().max(200).optional().default(''),
  created_by: z.string().max(200).optional(),
}).refine(p => p.shipmentRef || p.shipment_ref, { message: 'shipmentRef required' })

/** Notification task row */
export const NotificationTaskRowSchema = z.object({
  id: z.string().min(1).max(100),
  shipmentRef: z.string().min(1).max(100).optional(),
  shipment_ref: z.string().min(1).max(100).optional(),
  containerNumber: z.string().max(50).optional(),
  container_number: z.string().max(50).optional(),
  operativa: z.string().max(100).optional(),
  cliente: z.string().max(200).optional(),
  clientEmail: z.string().email().max(200).optional().or(z.literal('')),
  client_email: z.string().email().max(200).optional().or(z.literal('')),
  clientName: z.string().max(200).optional(),
  client_name: z.string().max(200).optional(),
  step: z.string().min(1).max(100),
  stepNumber: z.number().int().optional(),
  step_number: z.number().int().optional(),
  dueDate: z.string().max(20).optional(),
  due_date: z.string().max(20).optional(),
  salidaDate: z.string().max(20).optional(),
  salida_date: z.string().max(20).optional(),
  photosOk: z.boolean().optional(),
  photos_ok: z.boolean().optional(),
  reportOk: z.boolean().optional(),
  report_ok: z.boolean().optional(),
  emailSent: z.boolean().optional(),
  email_sent: z.boolean().optional(),
  emailSentAt: z.string().optional().nullable(),
  email_sent_at: z.string().optional().nullable(),
  status: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

/** Notification task PATCH (partial) */
export const NotificationTaskPatchSchema = z.object({
  photosOk: z.boolean().optional(),
  reportOk: z.boolean().optional(),
  emailSent: z.boolean().optional(),
  clientEmail: z.string().email().max(200).optional().or(z.literal('')),
  clientName: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
})

/** Truck row (consolidated truck) */
export const TruckRowSchema = z.object({
  id: z.string().min(1).max(100),
  code: z.string().min(1).max(40).optional(),
  status: z.enum(['planning', 'loaded', 'in_transit', 'delivered']).optional(),
  isSider: z.boolean().optional(),
  is_sider: z.boolean().optional(),
  transport: z.string().max(200).optional().default(''),
  driver: z.string().max(200).optional().default(''),
  plate: z.string().max(50).optional().default(''),
  loadDate: z.string().max(20).optional().nullable(),
  load_date: z.string().max(20).optional().nullable(),
  departureDate: z.string().max(20).optional().nullable(),
  departure_date: z.string().max(20).optional().nullable(),
  arrivalDate: z.string().max(20).optional().nullable(),
  arrival_date: z.string().max(20).optional().nullable(),
  notes: z.string().max(4000).optional().default(''),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
  updatedAt: z.number().int().optional(),
  updated_at_ts: z.number().int().optional(),
  draft: z.boolean().optional(),
  pendingEdits: z.record(z.unknown()).nullable().optional(),
  pending_edits: z.record(z.unknown()).nullable().optional(),
  costDespacho: z.number().optional(),
  cost_despacho: z.number().optional(),
  costFlete: z.number().optional(),
  cost_flete: z.number().optional(),
  costCarga: z.number().optional(),
  cost_carga: z.number().optional(),
})

/** Truck load row (a ref inside a truck) */
export const TruckLoadRowSchema = z.object({
  id: z.string().min(1).max(100),
  truckId: z.string().min(1).max(100).optional(),
  truck_id: z.string().min(1).max(100).optional(),
  sourceType: z.enum(['fcl', 'lcl', 'air']).optional(),
  source_type: z.enum(['fcl', 'lcl', 'air']).optional(),
  sourceRef: z.string().min(1).max(100).optional(),
  source_ref: z.string().min(1).max(100).optional(),
  // Contenedor elegido de esa carga ('' = la referencia entera)
  cntr: z.string().max(100).optional().default(''),
  client: z.string().max(200).optional().default(''),
  fiscal: z.string().max(200).optional().default(''),
  kg: z.number().nonnegative().optional().default(0),
  m3: z.number().nonnegative().optional().default(0),
  pkgs: z.number().int().nonnegative().optional().default(0),
  description: z.string().max(1000).optional().default(''),
  mvdArrival: z.string().max(20).optional().nullable(),
  mvd_arrival: z.string().max(20).optional().nullable(),
  desconsolDate: z.string().max(20).optional().nullable(),
  desconsol_date: z.string().max(20).optional().nullable(),
  bl: z.string().max(200).optional().default(''),
  stock: z.string().max(200).optional().default(''),
  wood: z.boolean().optional().default(false),
  overrides: z.record(z.boolean()).optional(),
  position: z.number().int().optional().default(0),
  pending: z.enum(['add', 'remove']).nullable().optional(),
}).refine(l => l.truckId || l.truck_id, { message: 'truckId required' })
  .refine(l => l.sourceRef || l.source_ref, { message: 'sourceRef required' })

/** LCL / Air shipment row */
export const LclAirRowSchema = z.object({
  id: z.string().min(1).max(100),
  ref: z.string().min(1).max(100),
  modality: z.enum(['lcl', 'air']),
  client: z.string().max(200).optional().default(''),
  origin: z.string().max(200).optional().default(''),
  mblHbl: z.string().max(200).optional().default(''),
  mbl_hbl: z.string().max(200).optional(),
  etaMvd: z.string().max(20).optional().nullable(),
  eta_mvd: z.string().max(20).optional().nullable(),
  desconsolDate: z.string().max(20).optional().nullable(),
  desconsol_date: z.string().max(20).optional().nullable(),
  pkgs: z.number().int().nonnegative().optional().default(0),
  kg: z.number().nonnegative().optional().default(0),
  m3: z.number().nonnegative().optional().default(0),
  fiscal: z.string().max(200).optional().default(''),
  description: z.string().max(1000).optional().default(''),
  wood: z.boolean().optional().default(false),
  status: z.enum(['en_origen', 'en_transito', 'arribado', 'desconsolidado', 'despachado']).optional(),
  notes: z.string().max(2000).optional().default(''),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
})

/** Counter increment request */
export const TruckCounterRequestSchema = z.object({
  prefix: z.enum(['C', 'LCL', 'AIR']),
})

/** Renglón de la ficha de compra/venta ({concepto, monto USD}). */
export const BillingLineSchema = z.object({
  concepto: z.string().max(200),
  monto: z.number().finite(),
})

/** Billing overlay row (POST upsert). One row per ref. */
export const BillingRowSchema = z.object({
  ref: z.string().min(1).max(100),
  status: z.enum(['pendiente', 'facturada', 'no_aplica']),
  invoiceNumber: z.string().max(100).optional().default(''),
  invoice_number: z.string().max(100).optional(),
  invoicedAt: z.string().max(40).optional().nullable(),
  invoiced_at: z.string().max(40).optional().nullable(),
  invoicedBy: z.string().max(200).optional().default(''),
  invoiced_by: z.string().max(200).optional(),
  // Ficha de compra/venta — OPCIONALES: si el request no los trae, el upsert
  // no incluye las columnas y la ficha guardada se preserva (marcar facturada
  // desde flujos viejos no puede borrar renglones).
  gastos: z.array(BillingLineSchema).max(200).optional(),
  ventas: z.array(BillingLineSchema).max(200).optional(),
})

/** Operator row (editable list of operativos) */
export const OperatorRowSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  modes: z.array(z.enum(['fcl', 'lcl', 'air', 'land'])).optional().default([]),
  color: z.string().max(20).optional().default(''),
  active: z.boolean().optional().default(true),
  createdAt: z.number().int().optional(),
  created_at_ts: z.number().int().optional(),
})

/** Operator assignment row (ref → operator overlay) */
export const OperatorAssignmentRowSchema = z.object({
  ref: z.string().min(1).max(100),
  operatorId: z.string().max(100).nullable().optional(),
  operator_id: z.string().max(100).nullable().optional(),
})

/** Paso del checklist operativo por ref (pestaña Checks).
 *  `by` se acepta pero el server SIEMPRE lo pisa con el usuario del token. */
export const RefCheckStepSchema = z.object({
  done: z.boolean(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD').optional().or(z.literal('')),
  by: z.string().max(200).optional(),
  // Reclamo del día (paso pendiente reclamado hoy — vence solo al día
  // siguiente). reclamadoBy NO se acepta del body: lo estampa el server.
  reclamado: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha YYYY-MM-DD').optional().or(z.literal('')),
  // Solo pasos-aviso (salida/frontera/fiscal): estado POR CONTENEDOR. `by` de
  // cada contenedor lo pisa el server con el usuario del token. Cap 40 cntr.
  cntrs: z.record(
    z.string().max(20),
    z.object({
      done: z.boolean(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
      by: z.string().max(200).optional(),
    }),
  ).refine(m => Object.keys(m).length <= 40, { message: 'demasiados contenedores' }).optional(),
})

/** Upsert de checks por ref: steps PARCIALES (solo las claves tocadas), que el
 *  server mergea sobre el jsonb existente — nunca pisa todo. Claves fijas: los
 *  4 checks documentarios (Brian 13/07/2026) + los 3 avisos por contenedor de
 *  HOY (espejo de CHECK_STEPS en src/lib/checksTypes.ts); .strict() rechaza
 *  cualquier otra. Las keys del checklist viejo pueden persistir en el jsonb
 *  guardado (se ignoran al leer) pero ya no se aceptan al escribir. */
const checkStep = RefCheckStepSchema.optional()
export const RefChecksUpsertSchema = z.object({
  ref: z.string().min(1).max(100),
  steps: z.object({
    bl_entregado: checkStep,
    carta_entregada: checkStep,
    docs_transporte: checkStep,
    docs_deposito: checkStep,
    pagos_ok: checkStep,
    // Cierre del circuito: lo confirma la naviera y saca la carga del tablero.
    liberado: checkStep,
    // Registro personal de rendimiento (/mirendimiento): el traslado del
    // contenedor al depósito y la visita física de quien fue a verlo.
    aviso_traslado: checkStep,
    visita_deposito: checkStep,
    aviso_salida: checkStep,
    cruce_frontera: checkStep,
    arribo_fiscal: checkStep,
  }).strict().refine(s => Object.values(s).some(v => v !== undefined), { message: 'steps vacío' }),
})

/** Admin login body */
export const AdminLoginSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
})

/** Partner login body */
export const PartnerLoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  type: z.literal('partner'),
})

/** Client login body (portal de clientes por email + contraseña — reemplaza OTP) */
export const ClientLoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  type: z.literal('client'),
})

/** Suscripción Web Push (JSON estándar de PushSubscription.toJSON()).
 *  El navegador manda también expirationTime — Zod la descarta solo
 *  (strip por default): guardamos únicamente endpoint + claves. */
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
})

/** PATCH de preferencias de alertas de una suscripción push (switches del
 *  popover de la campana) — el endpoint identifica al dispositivo. */
export const PushPrefsPatchSchema = z.object({
  endpoint: z.string().url().max(1000),
  alert_libre: z.boolean().optional(),
  alert_salidas: z.boolean().optional(),
  alert_fiscal: z.boolean().optional(),
  alert_frontera: z.boolean().optional(),
})

/** Cuotas objetivo de reparto por transporte (PUT reemplaza el set completo). */
export const TransporteCuotasSchema = z.object({
  cuotas: z.array(z.object({
    transporte: z.string().trim().min(1).max(60),
    porcentaje: z.number().min(0).max(100),
    activo: z.boolean().optional(),
    orden: z.number().int().min(0).max(999).optional(),
  })).max(30)
    // Dos variantes del mismo nombre ('Rigatosso' y 'RIGATOSSO ') colisionan en
    // el upsert por PK y devolvían un 500 pelado (hallazgo revisión 12/08).
    .refine(cs => {
      const vistos = new Set<string>()
      for (const c of cs) {
        const k = c.transporte.trim().toUpperCase()
        if (vistos.has(k)) return false
        vistos.add(k)
      }
      return true
    }, { message: 'Hay transportes repetidos (mismo nombre con otra escritura)' }),
})

// ─── validate() helper ──────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

/** Parse and return a clean result object. Never throws. */
export function validate<T>(schema: z.ZodSchema<T>, body: unknown): ValidationResult<T> {
  const r = schema.safeParse(body)
  if (!r.success) {
    const error = r.error.issues
      .map(i => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ')
    return { ok: false, error }
  }
  return { ok: true, data: r.data }
}
