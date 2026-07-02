import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Language, getStoredLanguage, setStoredLanguage } from '@/lib/i18n'
import { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport, OriginPhoto } from '@/lib/quotationTypes'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { Truck, TruckLoad, LclAirShipment } from '@/lib/truckTypes'
import { getBrand } from '@/lib/brand'
import { canApplyTrucksRefresh, createTrucksWriteWindow } from '@/lib/trucksRefreshGuard'
import { BillingRecord } from '@/lib/billingTypes'
import { Operator, OperatorAssignment, DbShipment, UnifiedOperation, dbFclToParsedShipment } from '@/lib/operationsTypes'
import { withRollupColumns } from '@/lib/operativasRollup'
import { subscribeTrucksLive } from '@/lib/realtimeBus'
import { getDemoShipments } from '@/lib/demoShipments'
import { filterShipments } from '@/lib/sheetsSync'
import { verifySession, clearAuth, authFetch } from '@/lib/authClient'
import { loadAdminData, saveQuotes, saveDocuments, saveReports, saveClients, saveTrucks, saveTruckLoads, saveLclAir, deleteTruck as apiDeleteTruck, deleteTruckLoad as apiDeleteTruckLoad, deleteLclAir as apiDeleteLclAir, saveBilling, deleteBilling as apiDeleteBilling, saveOperators, saveOperatorAssignment, deleteOperator as apiDeleteOperator, patchDbShipment, createDbShipment, deleteDbShipment, patchFclShipment, renameShipmentRef, fetchTrucks, fetchTruckLoads } from '@/lib/dataClient'

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

// Persistencia a localStorage con DEBOUNCE por key: coalesce las escrituras
// rápidas para no bloquear el main thread con un JSON.stringify de arrays grandes
// (~1400 cargas) en CADA edición — era la causa del freeze al editar varias celdas
// seguidas. El localStorage es solo cache (la DB es la fuente y el PATCH al backend
// es inmediato), así que una escritura tardía no pierde datos.
const _saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const _pendingSaves: Record<string, unknown> = {}

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
  _pendingSaves[key] = data
  if (_saveTimers[key]) clearTimeout(_saveTimers[key])
  _saveTimers[key] = setTimeout(() => {
    const payload = _pendingSaves[key]
    delete _pendingSaves[key]
    delete _saveTimers[key]
    try {
      localStorage.setItem(key, JSON.stringify(payload))
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e)
    }
  }, 400)
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
  // Generación de escrituras de camiones: si AVANZÓ mientras el refresh estaba
  // en vuelo, el snapshot es viejo y NO se aplica (mata la carrera residual
  // que resucitaba/duplicaba cargas).
  const trucksWriteGenRef = useRef(0)
  // Marca de tiempo de la última escritura local de camiones/cargas. Un refresh
  // de fondo NO pisa el estado local si su fetch arrancó dentro de la ventana de
  // recencia posterior a una escritura (el GET pudo leer la DB antes del commit
  // del POST → datos stale que borrarían lo recién creado). Ver trucksRefreshGuard.
  const lastTrucksWriteTsRef = useRef(0)
  const lastTruckLoadsWriteTsRef = useRef(0)
  // Ventana de escritura COMPARTIDA del dominio camiones (trucks + loads +
  // DELETEs): se abre al INICIO de cada escritura y deja una cola de ~2s
  // después de que termina la última. Mientras esté abierta, ningún refresh de
  // fondo aplica NADA (ni la mitad trucks ni la mitad loads). Cierra los agujeros
  // que las guardas por mitad no cubrían: (1) los DELETE no contaban como
  // escritura en vuelo, (2) una mitad podía aplicarse mientras la otra seguía
  // en vuelo (snapshot "torn") — letal con el timbre Realtime disparando
  // refetches en plena secuencia multi-paso del guardado.
  const trucksWriteWindowRef = useRef(createTrucksWriteWindow())
  // Refetch descartado (ventana abierta / gen viejo / recencia): se re-agenda
  // UNO para después de la ventana, así el timbre no se pierde y el estado
  // converge igual al del server. Ref a la función para cortar el ciclo
  // refresh → schedule → refresh entre useCallbacks.
  const trucksRefreshRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTrucksFromDbRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))
  const pendingLclAirWritesRef = useRef(0)
  const pendingBillingWritesRef = useRef(0)

  // ── Load data from Supabase when admin logs in ──
  // `force`: saltea el guard de "ya cargué" para refetches explícitos (rename de
  // REF, botón Refrescar post-flip). Nunca corre dos cargas en paralelo.
  const loadDataFromDB = useCallback(async (force = false) => {
    if ((dbLoadedRef.current && !force) || dbLoadingRef.current) return
    dbLoadingRef.current = true
    setIsDataLoading(true)
    const loadStartTs = Date.now()
    try {
      const data = await loadAdminData()
      dbLoadedRef.current = true

      // Update state with DB data (overrides localStorage cache).
      // Flip Etapa 4: si la web es master de FCL (flipped), las FCL llegan como
      // dbShipments → vaciar el cache de FCL-espejo (si no, quedan filas viejas
      // read-only conviviendo con las horneadas editables).
      if (data.shipmentsFlipped) {
        setShipments([])
        saveToStorage('twf-shipments', [])
      } else if (data.shipments.length > 0) {
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

      // Además de la guarda por mitad, la ventana compartida de escritura de
      // camiones: si hay un guardado en vuelo (o terminó hace <2s), NO pisar.
      const trucksWindowOpen = trucksWriteWindowRef.current.isOpen()
      if (!trucksWindowOpen && canApplyTrucksRefresh(pendingTrucksWritesRef.current, loadStartTs, lastTrucksWriteTsRef.current)) {
        // softFetch devuelve [] si el GET de trucks falló (500/red): NO pisar un estado
        // no-vacío con un snapshot vacío — reproducía el "las cargas desaparecieron".
        // Mirror del guard de clients (línea ~171).
        setTrucks(prev => (data.trucks.length === 0 && prev.length > 0) ? prev : data.trucks)
        if (data.trucks.length > 0) saveToStorage('twf-trucks', data.trucks)
      }

      if (!trucksWindowOpen && canApplyTrucksRefresh(pendingTruckLoadsWritesRef.current, loadStartTs, lastTruckLoadsWriteTsRef.current)) {
        setTruckLoads(prev => (data.truckLoads.length === 0 && prev.length > 0) ? prev : data.truckLoads)
        if (data.truckLoads.length > 0) saveToStorage('twf-truck-loads', data.truckLoads)
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

  // Flip Etapa 4: FCL reconstruidas desde dbShipments para las vistas que esperan
  // el modelo de la planilla (Portal Cliente). Pre-flip dbShipments no trae FCL →
  // queda idéntico a `shipments`.
  const fclShipments = useMemo(
    () => [...shipments, ...dbShipments.filter(d => d.mode === 'fcl').map(dbFclToParsedShipment)],
    [shipments, dbShipments],
  )

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
    // Demo cargo SOLO en desarrollo: en producción no debe parpadear "DEMO ALPHA/
    // BETA" antes de que llegue la data real de la DB/sync (ej. login admin Med).
    if (import.meta.env.DEV && shipments.length === 0) {
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
      // Flip Etapa 4: con la web como master, el Sheet ya no manda las FCL → vaciar
      // el cache de FCL-espejo en vez de repoblarlo.
      if (data.flipped) {
        setShipments([])
        saveToStorage('twf-shipments', [])
      } else {
        const synced = data.shipments || []
        if (synced.length > 0) {
          setShipments(synced)
          saveToStorage('twf-shipments', synced)
          // Note: sync endpoint already caches to Supabase
        }
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
      // Post-flip (Etapa 4): la web es la fuente de verdad y la planilla de Google
      // Sheets quedó fuera. El auto-sync desde Sheets se DESACTIVA para TODOS —
      // volver a traer del sheet pisaría la data editada en la web (divergencia).
      // (No depende de localStorage: se apaga aunque el equipo lo tenga en 'true'.)
      const autoSync = false
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

  const handleUpdateClients = async (updated: ClientAccount[]) => {
    const prev = clients
    setClients(updated)
    saveToStorage('twf-clients', updated)
    // Save to Supabase so clients are shared across machines + OTP works.
    // Always persist when admin is logged in (even if initial DB load hasn't
    // finished) — otherwise explicit user deletes/edits would only hit
    // localStorage and get reverted when loadDataFromDB resolves.
    if (isAdminLoggedIn) {
      pendingClientWritesRef.current += 1
      try {
        await saveClients(updated)
      } catch (err) {
        // Si el backend rechaza (ej. patrón inválido) revertimos el optimista y
        // avisamos. Antes se tragaba el error (console.warn) → quedaba un falso
        // éxito que se "des-guardaba" solo al refrescar. Se re-lanza para que el
        // formulario del cliente NO se cierre y muestre el motivo.
        setClients(prev)
        saveToStorage('twf-clients', prev)
        toast.error(`No se pudo guardar el cliente: ${(err as Error)?.message || 'error desconocido'}`)
        throw err
      } finally {
        pendingClientWritesRef.current = Math.max(0, pendingClientWritesRef.current - 1)
      }
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
        .catch(err => { console.warn('[DB] Failed to save documents:', err); toast.error('No se pudieron guardar los documentos') })
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

  const handleUpdateTrucks = (updated: Truck[], changedIds?: string[]) => {
    trucksWriteGenRef.current += 1
    lastTrucksWriteTsRef.current = Date.now()
    // Ventana compartida: abre AL INICIO (antes del estado optimista) y cierra
    // recién cuando el POST resuelve (+2s de cola). Un guardado multi-paso
    // mantiene la ventana abierta de punta a punta.
    const endWrite = trucksWriteWindowRef.current.begin()
    setTrucks(updated)
    saveToStorage('twf-trucks', updated)
    const toSave = changedIds ? updated.filter(t => changedIds.includes(t.id)) : updated
    if (isAdminLoggedIn && toSave.length > 0) {
      pendingTrucksWritesRef.current += 1
      saveTrucks(toSave)
        .catch(err => {
          console.warn('[DB] Failed to save trucks:', err)
          // Mostrar el motivo REAL y fuerte: un guardado fallido silencioso
          // hace que el camión "exista" en pantalla pero se pierda al recargar.
          toast.error(`⚠️ El camión NO se guardó: ${err?.message || 'error de conexión'}. Reintentá o recargá la página.`, { duration: 10000 })
        })
        .finally(() => {
          pendingTrucksWritesRef.current = Math.max(0, pendingTrucksWritesRef.current - 1)
          // Re-marcar al commitear: extiende la ventana de recencia desde el momento
          // en que la DB realmente quedó consistente.
          lastTrucksWriteTsRef.current = Date.now()
          endWrite()
        })
    } else {
      // Sin POST (no logueado / nada que guardar): cerrar ya — la cola de 2s
      // igual protege el setState optimista de un refetch pegado.
      endWrite()
    }
  }

  const handleDeleteTruck = async (id: string) => {
    trucksWriteGenRef.current += 1
    lastTrucksWriteTsRef.current = Date.now()
    lastTruckLoadsWriteTsRef.current = Date.now()
    // El DELETE también cuenta como escritura en vuelo (antes NO: un DELETE
    // lento era invisible para las guardas y un refetch podía resucitarlo).
    const endWrite = trucksWriteWindowRef.current.begin()
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
        console.warn('[DB] Failed to delete truck:', err); toast.error('No se pudo borrar el camión')
        toast.warning('Error al borrar camión en la base de datos', { duration: 4000 })
      } finally {
        lastTrucksWriteTsRef.current = Date.now()
        lastTruckLoadsWriteTsRef.current = Date.now()
        endWrite()
      }
    } else {
      endWrite()
    }
  }

  const handleUpdateTruckLoads = (updated: TruckLoad[], changedIds?: string[]) => {
    trucksWriteGenRef.current += 1
    lastTruckLoadsWriteTsRef.current = Date.now()
    const endWrite = trucksWriteWindowRef.current.begin()
    setTruckLoads(updated)
    saveToStorage('twf-truck-loads', updated)
    const toSave = changedIds ? updated.filter(l => changedIds.includes(l.id)) : updated
    if (isAdminLoggedIn && toSave.length > 0) {
      pendingTruckLoadsWritesRef.current += 1
      saveTruckLoads(toSave)
        .catch((err: any) => {
          console.warn('[DB] Failed to save truck loads:', err)
          toast.error(`⚠️ Las cargas del camión NO se guardaron: ${err?.message || 'error de conexión'}`, { duration: 10000 })
        })
        .finally(() => {
          pendingTruckLoadsWritesRef.current = Math.max(0, pendingTruckLoadsWritesRef.current - 1)
          lastTruckLoadsWriteTsRef.current = Date.now()
          endWrite()
        })
    } else {
      endWrite()
    }
  }

  // Refresco liviano SOLO de camiones (al entrar a la pestaña / volver el foco /
  // timbre Realtime): trae la verdad de la DB sin pisar escrituras en vuelo.
  // Devuelve true si el round-trip fue exitoso (aunque no se haya aplicado),
  // false si hubo un error de red — el caller usa esto para el throttle.
  //
  // Si el snapshot NO se puede aplicar (ventana de escritura abierta, generación
  // vieja o recencia), el timbre NO se pierde: se re-agenda UN refetch para
  // después de la ventana → el estado siempre converge al del server.
  const scheduleTrucksRefreshRetry = useCallback(() => {
    if (trucksRefreshRetryTimerRef.current) return // ya hay un retry agendado
    const wait = Math.max(600, trucksWriteWindowRef.current.remainingMs() + 250)
    trucksRefreshRetryTimerRef.current = setTimeout(() => {
      trucksRefreshRetryTimerRef.current = null
      void refreshTrucksFromDbRef.current()
    }, wait)
  }, [])

  const refreshTrucksFromDb = useCallback(async (): Promise<boolean> => {
    if (!isAdminLoggedIn) return true
    try {
      const gen = trucksWriteGenRef.current
      const fetchStartTs = Date.now()
      const [freshTrucks, freshLoads] = await Promise.all([fetchTrucks(), fetchTruckLoads()])
      // Snapshot viejo o escritura en curso → NO aplicar NADA (las dos mitades
      // juntas o ninguna: aplicar solo una era el snapshot "torn" que mezclaba
      // camiones de un momento con cargas de otro) y reintentar después.
      const staleGen = trucksWriteGenRef.current !== gen // hubo escrituras durante el fetch
      const windowOpen = trucksWriteWindowRef.current.isOpen() // guardado en vuelo o <2s de terminado
      const canTrucks = canApplyTrucksRefresh(pendingTrucksWritesRef.current, fetchStartTs, lastTrucksWriteTsRef.current)
      const canLoads = canApplyTrucksRefresh(pendingTruckLoadsWritesRef.current, fetchStartTs, lastTruckLoadsWriteTsRef.current)
      if (staleGen || windowOpen || !canTrucks || !canLoads) {
        scheduleTrucksRefreshRetry()
        return true // el fetch en sí fue OK
      }
      setTrucks(freshTrucks)
      saveToStorage('twf-trucks', freshTrucks)
      setTruckLoads(freshLoads)
      saveToStorage('twf-truck-loads', freshLoads)
      return true
    } catch (err) {
      console.warn('[DB] refresh trucks failed:', err)
      return false
    }
  }, [isAdminLoggedIn, scheduleTrucksRefreshRetry])

  // Ref siempre-actual para el retry (evita cerrar sobre una versión vieja) y
  // limpieza del timer al desmontar/desloguear.
  useEffect(() => {
    refreshTrucksFromDbRef.current = refreshTrucksFromDb
  }, [refreshTrucksFromDb])
  useEffect(() => () => {
    if (trucksRefreshRetryTimerRef.current) {
      clearTimeout(trucksRefreshRetryTimerRef.current)
      trucksRefreshRetryTimerRef.current = null
    }
  }, [])

  // Co-edición Fase 1: "timbre" Realtime → al recibir aviso de cambio de un
  // camión/carga (de otro usuario), refetchar en vivo. Debounce para colapsar
  // ráfagas (carga múltiple) en un solo refetch. Si no hay env vars de Realtime,
  // subscribeTrucksLive es no-op → la app sigue con el refresco on-focus.
  useEffect(() => {
    if (!isAdminLoggedIn) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeTrucksLive(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void refreshTrucksFromDb() }, 400)
    })
    return () => { if (timer) clearTimeout(timer); unsub() }
  }, [isAdminLoggedIn, refreshTrucksFromDb])

  const handleDeleteTruckLoad = async (id: string) => {
    trucksWriteGenRef.current += 1
    lastTruckLoadsWriteTsRef.current = Date.now()
    // El guardado del armador arranca con los DELETE de las cargas quitadas:
    // tienen que sostener la ventana abierta hasta que el server confirme.
    const endWrite = trucksWriteWindowRef.current.begin()
    setTruckLoads(prev => {
      const next = prev.filter(l => l.id !== id)
      saveToStorage('twf-truck-loads', next)
      return next
    })
    if (isAdminLoggedIn) {
      try {
        await apiDeleteTruckLoad(id)
      } catch (err) {
        console.warn('[DB] Failed to delete truck load:', err); toast.error('No se pudo borrar la carga del camión')
      } finally {
        lastTruckLoadsWriteTsRef.current = Date.now()
        endWrite()
      }
    } else {
      endWrite()
    }
  }

  const handleUpdateLclAir = (updated: LclAirShipment[]) => {
    setLclAir(updated)
    saveToStorage('twf-lcl-air', updated)
    if (isAdminLoggedIn && updated.length > 0) {
      pendingLclAirWritesRef.current += 1
      saveLclAir(updated)
        .catch(err => { console.warn('[DB] Failed to save LCL/Air:', err); toast.error('No se pudo guardar la carga LCL/aérea') })
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
        console.warn('[DB] Failed to delete LCL/Air:', err); toast.error('No se pudo borrar la carga LCL/aérea')
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
        console.warn('[DB] Failed to delete billing:', err); toast.error('No se pudo deshacer la facturación')
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
      catch (err) { console.warn('[DB] Failed to delete operator:', err); toast.error('No se pudo borrar el operativo') }
    }
  }

  // Patch a DB shipment row (operator_id, or future inline cell edits).
  const handlePatchShipment = (id: string, fields: Record<string, unknown>) => {
    // Si el patch trae el array por contenedor, recomputar las columnas sueltas
    // (salida/eta_fiscal/deposito/…) en el estado local — el servidor hace lo mismo
    // (rollupFromOperativasApi). Sin esto, la grilla de Operaciones (que lee las
    // columnas, no el array) quedaba stale hasta recargar la página.
    const optimistic = withRollupColumns(fields)
    const prev = dbShipments // snapshot para revertir si el guardado falla
    const next = dbShipments.map(s => s.id === id ? { ...s, ...optimistic } as DbShipment : s)
    setDbShipments(next)
    saveToStorage('twf-db-shipments', next)
    if (isAdminLoggedIn) {
      patchDbShipment(id, fields).catch(err => {
        console.warn('[DB] Failed to patch shipment:', err)
        // La DB NO guardó: revertir el update optimista para no dejar la grilla
        // (y localStorage) mostrando un valor que no se persistió.
        setDbShipments(prev)
        saveToStorage('twf-db-shipments', prev)
        toast.error('No se pudo guardar el cambio — se revirtió. Reintentá.', { duration: 5000 })
      })
    }
  }

  // Renombrar la REF de una carga (flip Etapa 4): PIN 0000 + cascada server-side.
  // Tira el error (PIN/duplicado) para que el panel lo muestre; al éxito recarga
  // todo (la ref cambió en varias tablas: camiones, fotos, billing…).
  const handleRenameRef = async (op: UnifiedOperation, newRef: string, pin: string): Promise<void> => {
    if (!op.dbId) return
    await renameShipmentRef(op.dbId, newRef, pin)
    // force=true: sin esto el guard de loadDataFromDB lo convertía en no-op
    // (dbLoadedRef ya es true) y la UI quedaba mostrando la REF vieja hasta F5.
    await loadDataFromDB(true)
    toast.success(`REF cambiada: ${op.ref} → ${newRef}`)
  }

  // Create a new DB shipment (LCL/aéreo/terrestre/FCL) from the web.
  // Devuelve false si el alta se abortó (REF duplicada y el usuario canceló) —
  // los callers (diálogo Nueva carga, armador de camiones) lo usan para no
  // seguir con el flujo post-alta (cerrar diálogo / subir la carga al camión).
  const handleCreateShipment = (row: DbShipment): boolean => {
    // Anti-duplicado de REF: el alta NO chequeaba (a diferencia del rename con su RPC),
    // así que crear "A7990" dos veces hacía 2 filas en silencio. Avisamos antes de crear.
    const newRef = (row.ref || '').trim().toUpperCase()
    if (newRef && dbShipments.some(s => (s.ref || '').trim().toUpperCase() === newRef)) {
      const ok = window.confirm(`Ya existe una carga con la REF "${row.ref}".\n\n¿Crearla igual? Si es una carga partida, cancelá y usá un sufijo (ej. ${row.ref} A / ${row.ref} B).`)
      if (!ok) return false
    }
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
    return true
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
      saveOperatorAssignment(ref, operatorId).catch(err => { console.warn('[DB] Failed to save assignment:', err); toast.error('No se pudo guardar la asignación de operativo') })
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
                  <span className="animate-pulse">Sincronizando datos...</span>
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
          isDataLoading={isDataLoading}
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
          onRefreshTrucks={refreshTrucksFromDb}
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
          onRenameRef={handleRenameRef}
          onReloadFromDB={() => loadDataFromDB(true)}
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
        shipments={fclShipments}
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
        <MediterraneaLanding />
      </>
    )
  }

  return (
    <>
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
