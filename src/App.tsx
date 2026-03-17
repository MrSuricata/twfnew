import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { Language } from '@/lib/i18n'
import { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport } from '@/lib/quotationTypes'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { getDemoShipments } from '@/lib/demoShipments'
import { filterShipments } from '@/lib/sheetsSync'
import { verifySession, clearAuth, authFetch } from '@/lib/authClient'
import { loadAdminData, saveQuotes, saveDocuments, saveReports, saveReportWithFile, deleteReport, saveClients } from '@/lib/dataClient'

import Login from './components/Login'
import ClientLogin from './components/ClientLogin'
import DashboardEnhanced from './components/DashboardEnhanced'
import ClientPortal from './components/ClientPortal'
import PublicSiteEnhanced from './components/PublicSiteEnhanced'

type View = 'public' | 'admin-login' | 'admin-dashboard' | 'client-login' | 'client-portal'

// Client accounts are managed server-side via CLIENTS_JSON env var.
// No hardcoded client data in client bundle.
const DEFAULT_CLIENTS: ClientAccount[] = []

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
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error(`Error saving ${key} to localStorage:`, e)
  }
}

function getInitialView(): View {
  const path = window.location.pathname.toLowerCase()
  if (path === '/admin') return 'admin-login'
  if (path === '/portal') return 'client-login'
  return 'public'
}

function App() {
  const [currentView, setCurrentView] = useState<View>(getInitialView)
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)
  const [clientEmail, setClientEmail] = useState<string>('')
  const [language, setLanguage] = useState<Language>('es')

  // Initialize from localStorage (fast local cache), then override from DB
  const [quotes, setQuotes] = useState<QuoteFormData[]>(() => loadFromStorage('twf-quotes', []))
  const [clients, setClients] = useState<ClientAccount[]>(() => loadFromStorage('twf-clients', DEFAULT_CLIENTS))
  const [documents, setDocuments] = useState<ShipmentDocument[]>(() => loadFromStorage('twf-documents', []))
  const [reports, setReports] = useState<OperativeReport[]>(() => loadFromStorage('twf-reports', []))
  const [shipments, setShipments] = useState<ParsedShipment[]>(() => filterShipments(loadFromStorage('twf-shipments', [])))

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dbLoadedRef = useRef(false)

  // ── Load data from Supabase when admin logs in ──
  const loadDataFromDB = useCallback(async () => {
    if (dbLoadedRef.current) return
    try {
      console.log('[DB] Loading data from Supabase...')
      const data = await loadAdminData()
      dbLoadedRef.current = true

      // Update state with DB data (overrides localStorage cache)
      if (data.shipments.length > 0) {
        const filtered = filterShipments(data.shipments)
        setShipments(filtered)
        saveToStorage('twf-shipments', filtered)
        console.log(`[DB] Loaded ${filtered.length} shipments (synced: ${data.syncedAt || 'never'})`)
      }

      if (data.quotes.length > 0 || data.quotes.length === 0) {
        setQuotes(data.quotes)
        saveToStorage('twf-quotes', data.quotes)
        console.log(`[DB] Loaded ${data.quotes.length} quotes`)
      }

      if (data.documents.length > 0 || data.documents.length === 0) {
        setDocuments(data.documents)
        saveToStorage('twf-documents', data.documents)
        console.log(`[DB] Loaded ${data.documents.length} documents`)
      }

      if (data.reports.length > 0 || data.reports.length === 0) {
        setReports(data.reports)
        saveToStorage('twf-reports', data.reports)
        console.log(`[DB] Loaded ${data.reports.length} reports`)
      }

      if (data.clients.length > 0) {
        setClients(data.clients)
        saveToStorage('twf-clients', data.clients)
        console.log(`[DB] Loaded ${data.clients.length} clients`)
      }

      toast.success('Datos sincronizados desde la base de datos')
    } catch (error) {
      console.warn('[DB] Failed to load from Supabase, using local cache:', error)
      // Non-fatal: localStorage data still available
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
  const runBackgroundSync = useCallback(async () => {
    // Only sync if admin is logged in (has valid token)
    if (!isAdminLoggedIn) return

    try {
      const res = await authFetch('/api/sheets/sync')
      if (!res.ok) return

      const data = await res.json()
      const synced = data.shipments || []
      if (synced.length > 0) {
        setShipments(synced)
        saveToStorage('twf-shipments', synced)
        // Note: sync endpoint already caches to Supabase
        console.log(`[Auto-sync] ${synced.length} registros actualizados — ${new Date().toLocaleTimeString('es-UY')}`)
      }
    } catch (error) {
      console.warn('[Auto-sync] Error:', error)
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
    // Save to Supabase so clients are shared across machines + OTP works
    if (isAdminLoggedIn) {
      saveClients(updated).catch(err =>
        console.warn('[DB] Failed to save clients:', err)
      )
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
    // Save to Supabase in background
    if (isAdminLoggedIn) {
      saveDocuments(docs).catch(err =>
        console.warn('[DB] Failed to save documents:', err)
      )
    }
  }

  const handleUpdateReports = (updated: OperativeReport[]) => {
    setReports(updated)
    saveToStorage('twf-reports', updated)
    // Save to Supabase in background
    if (isAdminLoggedIn) {
      saveReports(updated).catch(err => {
        console.warn('[DB] Failed to save reports:', err)
        toast.warning('Error al sincronizar informes con la base de datos', { duration: 5000 })
      })
    }
  }

  const handleUpdateQuotes = (updated: QuoteFormData[]) => {
    setQuotes(updated)
    saveToStorage('twf-quotes', updated)
    // Save to Supabase in background
    if (isAdminLoggedIn) {
      saveQuotes(updated).catch(err =>
        console.warn('[DB] Failed to save quotes:', err)
      )
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
      } else if (path === '/portal') {
        setCurrentView(clientEmail ? 'client-portal' : 'client-login')
      } else {
        setCurrentView('public')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isAdminLoggedIn, clientEmail])

  const handleAdminLogin = () => {
    setIsAdminLoggedIn(true)
    dbLoadedRef.current = false // Reset so data loads from DB
    navigateTo('admin-dashboard')
  }

  const handleAdminLogout = () => {
    clearAuth()
    setIsAdminLoggedIn(false)
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

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
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
      <DashboardEnhanced
        onLogout={handleAdminLogout}
        clients={clients}
        shipments={shipments}
        documents={documents}
        reports={reports}
        onUpdateShipments={handleUpdateShipments}
        onUpdateClients={handleUpdateClients}
        onUpdateDocuments={handleUpdateDocuments}
        onUpdateReports={handleUpdateReports}
      />
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

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { zIndex: 99999 } }} style={{ zIndex: 99999 }} />
      <PublicSiteEnhanced
        language={language || 'es'}
        onLanguageChange={handleLanguageChange}
        onAdminClick={() => setCurrentView('admin-login')}
        onClientPortalClick={() => setCurrentView('client-login')}
        quotes={quotes || []}
        onUpdateQuotes={handleUpdateQuotes}
        shipments={shipments}
      />
    </>
  )
}

export default App
