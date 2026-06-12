import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { Language, getStoredLanguage, setStoredLanguage } from '@/lib/i18n'
import { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import { getBrand } from '@/lib/brand'
import { BillingRecord } from '@/lib/billingTypes'
import { Operator, OperatorAssignment, DbShipment, UnifiedOperation } from '@/lib/operationsTypes'
import { getDemoShipments } from '@/lib/demoShipments'
import { filterShipments } from '@/lib/sheetsSync'
import { verifySession, clearAuth, authFetch } from '@/lib/authClient'
import { loadAdminData, saveQuotes, saveDocuments, saveReports, saveClients, saveTrucks, saveTruckLoads, saveLclAir, deleteTruck as apiDeleteTruck, deleteTruckLoad as apiDeleteTruckLoad, deleteLclAir as apiDeleteLclAir, saveBilling, deleteBilling as apiDeleteBilling, saveOperators, saveOperatorAssignment, deleteOperator as apiDeleteOperator, patchDbShipment, createDbShipment, deleteDbShipment, patchFclShipment } from '@/lib/dataClient'

import Login from './components/Login'
import ClientLogin from './components/ClientLogin'
import PartnerLogin from './components/PartnerLogin'
import DashboardEnhanced from './components/DashboardEnhanced'
import ClientPortal from './components/ClientPortal'
import DepotDashboard from './components/DepotDashboard'
import TransportDashboard from './components/TransportDashboard'
import PublicSiteEnhanced from './components/PublicSiteEnhanced'
import MediterraneaLanding from './components/MediterraneaLanding'
import TermsPage from './components/TermsPage'
import PrivacyPage from './components/PrivacyPage'
import NotFoundPage from './components/NotFoundPage'

type View = 'public' | 'admin-login' | 'admin-dashboard' | 'client-login' | 'client-portal' | 'partner-login' | 'depot-dashboard' | 'transport-dashboard' | 'terms' | 'privacy' | 'not-found'

const KNOWN_PATHS = new Set(['/', '/admin', '/portal', '/depot', '/transport', '/partner', '/terminos', '/privacidad'])

// Client accounts are managed server-side via CLIENTS_JSON env var.
// No hardcoded client data in client bundle.
const DEFAULT_CLIENTS: ClientAccount[] = []

// ── localStorage helpers with write queue to prevent concurrent writes ──

let _writeQueue: Promise<void> = Promise.resolve()

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.error(`Error loading ${key} from localStorage:`, e)
  }
  return fallback
}

function saveToStorage(key: string, data: unknown) {
  // Queue writes to prevent concurrent localStorage corruption
  _writeQueue = _writeQueue.then(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data))
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e)
    }
  })
}

function getInitialView(): View {
  const path = window.location.pathname.toLowerCase()
  const portalsEnabled = getBrand().capabilities.portals
  if (path === '/admin') return 'admin-login'
  if (portalsEnabled) {
    if (path === '/portal') return 'client-login'
    if (path === '/depot' || path === '/transport' || path === '/partner') return 'partner-login'
  }
  if (path === '/terminos') return 'terms'
  if (path === '/privacidad') return 'privacy'
  if (path === '/') return 'public'
  return 'not-found'
}

function App() {
  const [currentView, setCurrentView] = useState<View>(getInitialView)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)
  const [clientEmail, setClientEmail] = useState<string>('')
  const [partnerData, setPartnerData] = useState<{ role: string; name: string; filterValue: string } | null>(null)
  const [partnerShipments, setPartnerShipments] = useState<ParsedShipment[]>([])
  const [language, setLanguage] = useState<Language>(() => getStoredLanguage())

  // Initialize from localStorage (fast local cache), then override from DB
  const [quotes, setQuotes] = useState<QuoteFormData[]>(() => loadFromStorage('twf-quotes', []))
  const [clients, setClients] = useState<ClientAccount[]>(() => loadFromStorage('twf-clients', DEFAULT_CLIENTS))
  const [documents, setDocuments] = useState<ShipmentDocument[]>(() => loadFromStorage('twf-documents', []))
  const [reports, setReports] = useState<OperativeReport[]>(() => loadFromStorage('twf-reports', []))
  const [shipments, setShipments] = useState<ParsedShipment[]>(() => filterShipments(loadFromStorage('twf-shipments', [])))
  const [originPhotos, setOriginPhotos] = useState<OriginPhoto[]>(() => loadFromStorage('twf-origin-photos', []))
  const [trucks, setTrucks] = useState<Truck[]>(() => loadFromStorage('twf-trucks', []))
  const [truckLoads, setTruckLoads] = useState<TruckLoad[]>(() => loadFromStorage('twf-truck-loads', []))
  const [lclAir, setLclAir] = useState<LclAirShipment[]>(() => loadFromStorage('twf-lcl-air', []))
  const [billing, setBilling] = useState<BillingRecord[]>(() => loadFromStorage('twf-billing', []))
  const [operators, setOperators] = useState<Operator[]>(() => loadFromStorage('twf-operators', []))
  const [assignments, setAssignments] = useState<OperatorAssignment[]>(() => loadFromStorage('twf-operator-assignments', []))
  const [dbShipments, setDbShipments] = useState<DbShipment[]>(() => loadFromStorage('twf-db-shipments', []))

  // Track whether fresh data has loaded from Supabase
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [dataFresh, setDataFresh] = useState(false)
  const [dbSyncError, setDbSyncError] = useState<string | null>(null)

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dbLoadedRef = useRef(false)
  const dbLoadingRef = useRef(false) // Guard against concurrent calls

  // Track pending writes so loadDataFromDB doesn't clobber local edits made
  // by the user before the initial DB load completes.
  const pendingClientWritesRef = useRef(0)
  const pendingDocumentsWritesRef = useRef(0)
  const pendingReportsWritesRef = useRef(0)
  const pendingQuotesWritesRef = useRef(0)
  const pendingTrucksWritesRef = useRef(0)
  const pendingTruckLoadsWritesRef = useRef(0)
  const pendingLclAirWritesRef = useRef(0)
  const pendingBillingWritesRef = useRef(0)

  // ── Load data from Supabase when admin logs in ──
  const loadDataFromDB = useCallback(async () => {
    if (dbLoadedRef.current || dbLoadingRef.current) return
    dbLoadingRef.current = true
    setIsDataLoading(true)
    try {
      const data = await loadAdminData()
      dbLoadedRef.current = true

      // Update state with DB data (overrides localStorage cache)
      if (data.shipments.length > 0) {
        const filtered = filterShipments(data.shipments)
        setShipments(filtered)
        saveToStorage('twf-shipments', filtered)
      }

      if (pendingQuotesWritesRef.current === 0) {
        setQuotes(data.quotes)
        saveToStorage('twf-quotes', data.quotes)
      }

      if (pendingDocumentsWritesRef.current === 0) {
        setDocuments(data.documents)
        saveToStorage('twf-documents', data.documents)
      }

      if (pendingReportsWritesRef.current === 0) {
        setReports(data.reports)
        saveToStorage('twf-reports', data.reports)
      }

      // If the user performed (or is performing) a client write locally before
      // DB load completed, don't clobber their changes with the older DB snapshot.
      if (pendingClientWritesRef.current === 0 && data.clients.length > 0) {
        setClients(data.clients)
        saveToStorage('twf-clients', data.clients)
      }

      if (data.originPhotos.length >= 0) {
        setOriginPhotos(data.originPhotos)
        saveToStorage('twf-origin-photos', data.originPhotos)
      }

      if (pendingTrucksWritesRef.current === 0) {
        setTrucks(data.trucks)
        saveToStorage('twf-trucks', data.trucks)
      }

      if (pendingTruckLoadsWritesRef.current === 0) {
        setTruckLoads(data.truckLoads)
        saveToStorage('twf-truck-loads', data.truckLoads)
      }

      if (pendingLclAirWritesRef.current === 0) {
        setLclAir(data.lclAir)
        saveToStorage('twf-lcl-air', data.lclAir)
      }

      if (pendingBillingWritesRef.current === 0) {
        setBilling(data.billing)
        saveToStorage('twf-billing', data.billing)
      }

      setOperators(data.operators)
      saveToStorage('twf-operators', data.operators)
      setAssignments(data.assignments)
      saveToStorage('twf-operator-assignments', data.assignments)
      setDbShipments(data.dbShipments)
      saveToStorage('twf-db-shipments', data.dbShipments)

      setDataFresh(true)
      setDbSyncError(null)
      toast.success('Datos sincronizados desde la base de datos')
    } catch (error) {
      console.warn('[DB] Failed to load from Supabase, using local cache:', error)
      setDataFresh(false)
      setDbSyncError('No se pudo conectar con la base de datos')
      // Non-fatal: localStorage data still available
    } finally {
      dbLoadingRef.current = false
      setIsDataLoading(false)
    }
  }, [])

  // ── Session restore on mount ──
  useEffect(() => {
    verifySession().then(result => {
      if (result.valid) {
        const path = window.location.pathname.toLowerCase()
        if (result.role === 'admin' && path === '/admin') {
          setIsAdminLoggedIn(true)
          setCurrentView('admin-dashboard')
        } else if (result.role === 'client' && path === '/portal') {
          setClientEmail(result.data?.email || '')
          setCurrentView('client-portal')
        } else if (result.role === 'depot' && (path === '/depot' || path === '/partner')) {
          setPartnerData({ role: 'depot', name: result.data?.name || '', filterValue: result.data?.filterValue || '' })
          loadPartnerShipments()
          setCurrentView('depot-dashboard')
        } else if (result.role === 'transport' && (path === '/transport' || path === '/partner')) {
          setPartnerData({ role: 'transport', name: result.data?.name || '', filterValue: result.data?.filterValue || '' })
          loadPartnerShipments()
          setCurrentView('transport-dashboard')
        }
      }
    })
  }, [])

  // Load from DB when admin becomes logged in
  useEffect(() => {
    if (isAdminLoggedIn) {
      loadDataFromDB()
    }
  }, [isAdminLoggedIn, loadDataFromDB])

  useEffect(() => {
    // Load demo shipments only if no persisted data
    if (shipments.length === 0) {
      setShipments(getDemoShipments())
    }
  }, [])

  // ── Background Auto-Sync via server API ──
  const syncConsecutiveFailuresRef = useRef<number>(0)
  const runBackgroundSync = useCallback(async () => {
    // Only sync if admin is logged in (has valid token)
    if (!isAdminLoggedIn) return

    const markFailure = () => {
      syncConsecutiveFailuresRef.current += 1
      if (syncConsecutiveFailuresRef.current >= 3) {
        toast.error('El sync de Google Sheets viene fallando. Verificá conexión.', { duration: 10_000, id: 'sync-error' })
      }
    }

    const markSuccess = () => {
      if (syncConsecutiveFailuresRef.current >= 3) {
        toast.success('Sync restaurado')
      }
      syncConsecutiveFailuresRef.current = 0
    }

    try {
      const res = await authFetch('/api/sheets/sync')
      if (!res.ok) {
        markFailure()
        return
      }

      const data = await res.json()
      const synced = data.shipments || []
      if (synced.length > 0) {
        setShipments(synced)
        saveToStorage('twf-shipments', synced)
        // Note: sync endpoint already caches to Supabase
      }
      markSuccess()
    } catch (error) {
      console.warn('[Auto-sync] Error:', error)
      markFailure()
    }
  }, [isAdminLoggedIn])

  useEffect(() => {
    // Check auto-sync settings from localStorage
    const checkAndStartSync = () => {
      const autoSync = localStorage.getItem('twf-auto-sync') === 'true'
      const intervalMin = parseInt(localStorage.getItem('twf-sync-interval') || '10') || 10

      // Clear existing interval
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }

      if (autoSync) {
        // Run first sync after 5 seconds (let app load first)
        const initialTimeout = setTimeout(() => runBackgroundSync(), 5000)
        // Then repeat at interval
        syncIntervalRef.current = setInterval(runBackgroundSync, intervalMin * 60 * 1000)

        return () => {
          clearTimeout(initialTimeout)
          if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
        }
      }
    }

    const cleanup = checkAndStartSync()

    // Listen for changes to auto-sync settings
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'twf-auto-sync' || e.key === 'twf-sync-interval') {
        checkAndStartSync()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      if (cleanup) cleanup()
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [runBackgroundSync])

  // ── Data update handlers (save to localStorage + Supabase) ──

  const handleUpdateClients = (updated: ClientAccount[]) => {
    setClients(updated)
    saveToStorage('twf-clients', updated)
    // Save to Supabase so clients are shared across machines + OTP works.
    // Always persist when admin is logged in (even if initial DB load hasn't
    // finished) — otherwise explicit user deletes/edits would only hit
    // localStorage and get reverted when loadDataFromDB resolves.
    if (isAdminLoggedIn) {
      pendingClientWritesRef.current += 1
      saveClients(updated)
        .catch(err => console.warn('[DB] Failed to save clients:', err))
        .finally(() => {
          pendingClientWritesRef.current = Math.max(0, pendingClientWritesRef.current - 1)
        })
    }
  }

  const handleUpdateShipments = (updated: ParsedShipment[]) => {
    setShipments(updated)
    saveToStorage('twf-shipments', updated)
    // Note: shipments are cached to Supabase by the sync endpoint
  }

  const handleUpdateDocuments = (docs: ShipmentDocument[]) => {
    setDocuments(docs)
    saveToStorage('twf-documents', docs)
    // Save to Supabase. Always persist when admin is logged in (even if initial
    // DB load hasn't finished) — otherwise explicit user edits would only hit
    // localStorage and get reverted when loadDataFromDB resolves.
    if (isAdminLoggedIn) {
      pendingDocumentsWritesRef.current += 1
      saveDocuments(docs)
        .catch(err => console.warn('[DB] Failed to save documents:', err))
        .finally(() => {
          pendingDocumentsWritesRef.current = Math.max(0, pendingDocumentsWritesRef.current - 1)
        })
    }
  }

  const handleUpdateReports = (updated: OperativeReport[]) => {
    setReports(updated)
    saveToStorage('twf-reports', updated)
    // Save to Supabase. Always persist when admin is logged in (even if initial
    // DB load hasn't finished) — otherwise explicit user edits would only hit
    // localStorage and get reverted when loadDataFromDB resolves.
    if (isAdminLoggedIn) {
      pendingReportsWritesRef.current += 1
      saveReports(updated)
        .catch(err => {
          console.warn('[DB] Failed to save reports:', err)
          toast.warning('Error al sincronizar informes con la base de datos', { duration: 5000 })
        })
        .finally(() => {
          pendingReportsWritesRef.current = Math.max(0, pendingReportsWritesRef.current - 1)
        })
    }
  }

  const handleUpdateOriginPhotos = (updated: OriginPhoto[]) => {
    setOriginPhotos(updated)
    saveToStorage('twf-origin-photos', updated)
    // Note: individual photos are saved directly via saveOriginPhoto/deleteOriginPhoto
    // This handler is for local state sync only
  }

  const handleUpdateTrucks = (updated: Truck[]) => {
    setTrucks(updated)
    saveToStorage('twf-trucks', updated)
    if (isAdminLoggedIn && updated.length > 0) {
      pendingTrucksWritesRef.current += 1
      saveTrucks(updated)
        .catch(err => {
          console.warn('[DB] Failed to save trucks:', err)
          // Mostrar el motivo REAL y fuerte: un guardado fallido silencioso
          // hace que el camión "exista" en pantalla pero se pierda al recargar.
          toast.error(`⚠️ El camión NO se guardó: ${err?.message || 'error de conexión'}. Reintentá o recargá la página.`, { duration: 10000 })
        })
        .finally(() => {
          pendingTrucksWritesRef.current = Math.max(0, pendingTrucksWritesRef.current - 1)
        })
    }
  }

  const handleDeleteTruck = async (id: string) => {
    const next = trucks.filter(t => t.id !== id)
    const nextLoads = truckLoads.filter(l => l.truckId !== id)
    setTrucks(next)
    setTruckLoads(nextLoads)
    saveToStorage('twf-trucks', next)
    saveToStorage('twf-truck-loads', nextLoads)
    if (isAdminLoggedIn) {
      try {
        await apiDeleteTruck(id)
      } catch (err) {
        console.warn('[DB] Failed to delete truck:', err)
        toast.warning('Error al borrar camión en la base de datos', { duration: 4000 })
      }
    }
  }

  const handleUpdateTruckLoads = (updated: TruckLoad[]) => {
    setTruckLoads(updated)
    saveToStorage('twf-truck-loads', updated)
    if (isAdminLoggedIn && updated.length > 0) {
      pendingTruckLoadsWritesRef.current += 1
      saveTruckLoads(updated)
        .catch((err: any) => {
          console.warn('[DB] Failed to save truck loads:', err)
          toast.error(`⚠️ Las cargas del camión NO se guardaron: ${err?.message || 'error de conexión'}`, { duration: 10000 })
        })
        .finally(() => {
          pendingTruckLoadsWritesRef.current = Math.max(0, pendingTruckLoadsWritesRef.current - 1)
        })
    }
  }

  const handleDeleteTruckLoad = async (id: string) => {
    setTruckLoads(prev => {
      const next = prev.filter(l => l.id !== id)
      saveToStorage('twf-truck-loads', next)
      return next
    })
    if (isAdminLoggedIn) {
      try {
        await apiDeleteTruckLoad(id)
      } catch (err) {
        console.warn('[DB] Failed to delete truck load:', err)
      }
    }
  }

  const handleUpdateLclAir = (updated: LclAirShipment[]) => {
    setLclAir(updated)
    saveToStorage('twf-lcl-air', updated)
    if (isAdminLoggedIn && updated.length > 0) {
      pendingLclAirWritesRef.current += 1
      saveLclAir(updated)
        .catch(err => console.warn('[DB] Failed to save LCL/Air:', err))
        .finally(() => {
          pendingLclAirWritesRef.current = Math.max(0, pendingLclAirWritesRef.current - 1)
        })
    }
  }

  const handleDeleteLclAir = async (id: string) => {
    const next = lclAir.filter(l => l.id !== id)
    setLclAir(next)
    saveToStorage('twf-lcl-air', next)
    if (isAdminLoggedIn) {
      try {
        await apiDeleteLclAir(id)
      } catch (err) {
        console.warn('[DB] Failed to delete LCL/Air:', err)
      }
    }
  }

  // ── Billing overlay ──
  // upsert one ref's billing row (mark facturada / pendiente / no_aplica).
  // Reversible: marking facturada stamps invoiced_at/by; any other status
  // clears them server-side. Passing status=undefined deletes the overlay
  // (back to derived "pendiente" when applicable).
  const handleUpdateBilling = (row: BillingRecord) => {
    const next = (() => {
      const existing = billing.findIndex(b => b.ref === row.ref)
      if (existing >= 0) {
        const copy = [...billing]
        copy[existing] = row
        return copy
      }
      return [...billing, row]
    })()
    setBilling(next)
    saveToStorage('twf-billing', next)
    if (isAdminLoggedIn) {
      pendingBillingWritesRef.current += 1
      saveBilling([row])
        .catch(err => {
          console.warn('[DB] Failed to save billing:', err)
          toast.warning('Error al sincronizar facturación', { duration: 4000 })
        })
        .finally(() => {
          pendingBillingWritesRef.current = Math.max(0, pendingBillingWritesRef.current - 1)
        })
    }
  }

  // Remove the overlay row entirely → ref returns to its derived state.
  const handleClearBilling = async (ref: string) => {
    const next = billing.filter(b => b.ref !== ref)
    setBilling(next)
    saveToStorage('twf-billing', next)
    if (isAdminLoggedIn) {
      try {
        await apiDeleteBilling(ref)
      } catch (err) {
        console.warn('[DB] Failed to delete billing:', err)
      }
    }
  }

  // ── Operators + assignments (TAREA C) ──
  const handleUpdateOperators = (updated: Operator[]) => {
    setOperators(updated)
    saveToStorage('twf-operators', updated)
    if (isAdminLoggedIn && updated.length > 0) {
      saveOperators(updated).catch(err => {
        console.warn('[DB] Failed to save operators:', err)
        toast.warning('Error al sincronizar operativos', { duration: 4000 })
      })
    }
  }

  const handleDeleteOperator = async (id: string) => {
    const next = operators.filter(o => o.id !== id)
    setOperators(next)
    saveToStorage('twf-operators', next)
    if (isAdminLoggedIn) {
      try { await apiDeleteOperator(id) }
      catch (err) { console.warn('[DB] Failed to delete operator:', err) }
    }
  }

  // Patch a DB shipment row (operator_id, or future inline cell edits).
  const handlePatchShipment = (id: string, fields: Record<string, unknown>) => {
    const next = dbShipments.map(s => s.id === id ? { ...s, ...fields } as DbShipment : s)
    setDbShipments(next)
    saveToStorage('twf-db-shipments', next)
    if (isAdminLoggedIn) {
      patchDbShipment(id, fields).catch(err => {
        console.warn('[DB] Failed to patch shipment:', err)
        toast.warning('Error al guardar el cambio', { duration: 4000 })
      })
    }
  }

  // Create a new DB shipment (LCL/aéreo/terrestre/FCL) from the web.
  const handleCreateShipment = (row: DbShipment) => {
    const next = [row, ...dbShipments]
    setDbShipments(next)
    saveToStorage('twf-db-shipments', next)
    if (isAdminLoggedIn) {
      createDbShipment(row)
        .then(() => toast.success(`Carga ${row.ref || row.mode.toUpperCase()} creada`))
        .catch(err => {
          console.warn('[DB] Failed to create shipment:', err)
          toast.warning('Error al crear la carga', { duration: 4000 })
        })
    }
  }

  // Etapa 3 migración: editar un campo de una FCL espejo. Optimista en el
  // estado local (merge sobre el ParsedShipment por __dbId) + PATCH al overlay
  // web_edits — el sync de la planilla nunca pisa estas ediciones.
  const handlePatchFclField = (dbId: string, edits: Record<string, unknown>) => {
    const next = shipments.map(s => {
      if (s.__dbId !== dbId) return s
      const edited = new Set([...(s.__webEdited || []), ...Object.keys(edits)])
      return { ...s, ...edits, __webEdited: [...edited] } as ParsedShipment
    })
    setShipments(next)
    saveToStorage('twf-shipments', next)
    if (isAdminLoggedIn) {
      patchFclShipment(dbId, edits).catch(err => {
        console.warn('[DB] Failed to patch FCL web edit:', err)
        toast.warning(`Error al guardar la edición FCL: ${err?.message || ''}`, { duration: 5000 })
      })
    }
  }

  // Eliminar definitivo de una carga DB. NO es optimista: espera la validación
  // del backend (camión / facturada / fotos → 409 con motivo) antes de sacarla.
  const handleDeleteShipment = (op: UnifiedOperation) => {
    const id = op.dbId
    if (!id) return
    deleteDbShipment(id)
      .then(() => {
        setDbShipments(prev => {
          const next = prev.filter(s => s.id !== id)
          saveToStorage('twf-db-shipments', next)
          return next
        })
        toast.success(`Carga ${op.ref || ''} eliminada definitivamente`)
      })
      .catch(err => {
        toast.error(err?.message || 'No se pudo eliminar la carga', { duration: 6000 })
      })
  }

  // Assign an operativo to a ref (overlay). operatorId=null clears it.
  const handleAssignOperator = (ref: string, operatorId: string | null) => {
    const next = (() => {
      const i = assignments.findIndex(a => a.ref === ref)
      const row: OperatorAssignment = { ref, operatorId, updatedAt: new Date().toISOString() }
      if (i >= 0) { const c = [...assignments]; c[i] = row; return c }
      return [...assignments, row]
    })()
    setAssignments(next)
    saveToStorage('twf-operator-assignments', next)
    if (isAdminLoggedIn) {
      saveOperatorAssignment(ref, operatorId).catch(err => console.warn('[DB] Failed to save assignment:', err))
    }
  }

  const handleUpdateQuotes = (updated: QuoteFormData[]) => {
    setQuotes(updated)
    saveToStorage('twf-quotes', updated)
    // Save to Supabase. Always persist when admin is logged in (even if initial
    // DB load hasn't finished) — otherwise explicit user edits would only hit
    // localStorage and get reverted when loadDataFromDB resolves.
    if (isAdminLoggedIn) {
      pendingQuotesWritesRef.current += 1
      saveQuotes(updated)
        .catch(err => console.warn('[DB] Failed to save quotes:', err))
        .finally(() => {
          pendingQuotesWritesRef.current = Math.max(0, pendingQuotesWritesRef.current - 1)
        })
    }
  }

  // Sync URL with view changes
  const navigateTo = useCallback((view: View) => {
    setCurrentView(view)
    const pathMap: Partial<Record<View, string>> = {
      'public': '/',
      'admin-login': '/admin',
      'admin-dashboard': '/admin',
      'client-login': '/portal',
      'client-portal': '/portal',
      'terms': '/terminos',
      'privacy': '/privacidad',
    }
    const targetPath = pathMap[view] || '/'
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath)
    }
  }, [])

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase()
      if (path === '/admin') {
        setCurrentView(isAdminLoggedIn ? 'admin-dashboard' : 'admin-login')
      } else if (path === '/portal' && getBrand().capabilities.portals) {
        setCurrentView(clientEmail ? 'client-portal' : 'client-login')
      } else if (path === '/terminos') {
        setCurrentView('terms')
      } else if (path === '/privacidad') {
        setCurrentView('privacy')
      } else if (path === '/') {
        setCurrentView('public')
      } else if (!KNOWN_PATHS.has(path)) {
        setCurrentView('not-found')
      } else {
        setCurrentView('public')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isAdminLoggedIn, clientEmail])

  const handleAdminLogin = () => {
    setIsAdminLoggedIn(true)
    setDataFresh(false) // Reset freshness on new login
    dbLoadedRef.current = false // Reset so data loads from DB
    navigateTo('admin-dashboard')
  }

  const handleAdminLogout = () => {
    clearAuth()
    setIsAdminLoggedIn(false)
    setDataFresh(false)
    dbLoadedRef.current = false
    navigateTo('public')
  }

  const handleClientLogin = (email: string) => {
    setClientEmail(email)
    navigateTo('client-portal')
  }

  const handleClientLogout = () => {
    clearAuth()
    setClientEmail('')
    navigateTo('public')
  }

  // ── Partner (depot/transport) handlers ──
  const loadPartnerShipments = async () => {
    try {
      const res = await authFetch('/api/data/partner-shipments')
      if (res.ok) {
        const data = await res.json()
        setPartnerShipments(data.shipments || [])
      }
    } catch (err) {
      console.error('Error loading partner shipments:', err)
    }
  }

  const handlePartnerLogin = (_token: string, role: string, userData: any) => {
    setPartnerData({ role, name: userData.name, filterValue: userData.filterValue })
    loadPartnerShipments()
    if (role === 'depot') {
      navigateTo('depot-dashboard')
    } else {
      navigateTo('transport-dashboard')
    }
  }

  const handlePartnerLogout = () => {
    clearAuth()
    setPartnerData(null)
    setPartnerShipments([])
    navigateTo('public')
  }

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    setStoredLanguage(lang)
  }

  if (currentView === 'admin-login') {
    return (
      <Login
        onLogin={handleAdminLogin}
        onBack={() => setCurrentView('public')}
      />
    )
  }

  if (currentView === 'admin-dashboard' && isAdminLoggedIn) {
    return (
      <>
        {/* Sync status banner */}
        {(isDataLoading || (!dataFresh && isAdminLoggedIn)) && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50000,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          }}>
            <div style={{
              background: isDataLoading ? '#2563eb' : '#f59e0b',
              color: 'white', padding: '6px 20px',
              borderRadius: '0 0 8px 8px', fontSize: '13px', fontWeight: 500,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              {isDataLoading ? (
                <>
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
                    borderRadius: '50%', animation: 'twf-spin 0.8s linear infinite',
                  }} />
                  Sincronizando datos...
                </>
              ) : (
                <>&#9888; Usando cache local &mdash; no se pudo conectar a la base de datos</>
              )}
            </div>
          </div>
        )}
        {isDataLoading && <style>{`@keyframes twf-spin { to { transform: rotate(360deg); } }`}</style>}
        <DashboardEnhanced
          onLogout={handleAdminLogout}
          clients={clients}
          shipments={shipments}
          documents={documents}
          reports={reports}
          originPhotos={originPhotos}
          quotes={quotes}
          trucks={trucks}
          truckLoads={truckLoads}
          lclAir={lclAir}
          billing={billing}
          operators={operators}
          assignments={assignments}
          dbShipments={dbShipments}
          dbSyncError={dbSyncError}
          onUpdateShipments={handleUpdateShipments}
          onUpdateClients={handleUpdateClients}
          onUpdateDocuments={handleUpdateDocuments}
          onUpdateReports={handleUpdateReports}
          onUpdateOriginPhotos={handleUpdateOriginPhotos}
          onUpdateQuotes={handleUpdateQuotes}
          onUpdateTrucks={handleUpdateTrucks}
          onDeleteTruck={handleDeleteTruck}
          onUpdateTruckLoads={handleUpdateTruckLoads}
          onDeleteTruckLoad={handleDeleteTruckLoad}
          onUpdateLclAir={handleUpdateLclAir}
          onDeleteLclAir={handleDeleteLclAir}
          onUpdateBilling={handleUpdateBilling}
          onClearBilling={handleClearBilling}
          onUpdateOperators={handleUpdateOperators}
          onDeleteOperator={handleDeleteOperator}
          onAssignOperator={handleAssignOperator}
          onPatchShipment={handlePatchShipment}
          onCreateShipment={handleCreateShipment}
          onDeleteShipment={handleDeleteShipment}
          onPatchFclField={handlePatchFclField}
        />
      </>
    )
  }

  if (currentView === 'client-login') {
    return (
      <ClientLogin
        onLogin={handleClientLogin}
        onBack={() => setCurrentView('public')}
      />
    )
  }

  if (currentView === 'partner-login') {
    return (
      <PartnerLogin
        onLogin={handlePartnerLogin}
        onBack={() => navigateTo('public')}
      />
    )
  }

  if (currentView === 'depot-dashboard' && partnerData?.role === 'depot') {
    return (
      <DepotDashboard
        shipments={partnerShipments}
        depotName={partnerData.filterValue}
        userName={partnerData.name}
        onLogout={handlePartnerLogout}
      />
    )
  }

  if (currentView === 'transport-dashboard' && partnerData?.role === 'transport') {
    return (
      <TransportDashboard
        shipments={partnerShipments}
        transportName={partnerData.filterValue}
        userName={partnerData.name}
        onLogout={handlePartnerLogout}
      />
    )
  }

  if (currentView === 'client-portal' && clientEmail) {
    return (
      <ClientPortal
        clientEmail={clientEmail}
        onLogout={handleClientLogout}
        clients={clients}
        reports={reports}
        shipments={shipments}
      />
    )
  }

  if (currentView === 'terms') {
    return <TermsPage onBack={() => navigateTo('public')} />
  }

  if (currentView === 'privacy') {
    return <PrivacyPage onBack={() => navigateTo('public')} />
  }

  if (currentView === 'not-found') {
    return <NotFoundPage onGoHome={() => navigateTo('public')} />
  }

  // Mediterránea brand gets its own landing; TWF keeps PublicSiteEnhanced.
  if (getBrand().id === 'med') {
    return (
      <>
        <Toaster position="top-right" toastOptions={{ style: { zIndex: 99999 } }} style={{ zIndex: 99999 }} />
        <MediterraneaLanding />
      </>
    )
  }

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { zIndex: 99999 } }} style={{ zIndex: 99999 }} />
      <PublicSiteEnhanced
        language={language || 'es'}
        onLanguageChange={handleLanguageChange}
        onAdminClick={() => setCurrentView('admin-login')}
        onClientPortalClick={() => setCurrentView('client-login')}
        quotes={[]}
        onUpdateQuotes={handleUpdateQuotes}
        shipments={[]}
      />
    </>
  )
}

export default App
