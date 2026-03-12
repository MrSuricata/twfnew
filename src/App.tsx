import { useState, useEffect, useCallback, useRef } from 'react'
import { Toaster, toast } from 'sonner'
import { Language } from '@/lib/i18n'
import { QuoteFormData, ClientAccount, ShipmentDocument, OperativeReport } from '@/lib/quotationTypes'
import { ParsedShipment } from '@/lib/shipmentTypes'
import { getDemoShipments } from '@/lib/demoShipments'
import { filterShipments } from '@/lib/sheetsSync'
import { verifySession, clearAuth, authFetch } from '@/lib/authClient'

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

  const [quotes, setQuotes] = useState<QuoteFormData[]>([])
  const [clients, setClients] = useState<ClientAccount[]>(() => loadFromStorage('twf-clients', DEFAULT_CLIENTS))
  const [documents, setDocuments] = useState<ShipmentDocument[]>(() => loadFromStorage('twf-documents', []))
  const [reports, setReports] = useState<OperativeReport[]>(() => loadFromStorage('twf-reports', []))
  const [shipments, setShipments] = useState<ParsedShipment[]>(() => filterShipments(loadFromStorage('twf-shipments', [])))

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const handleUpdateClients = (updated: ClientAccount[]) => {
    setClients(updated)
    saveToStorage('twf-clients', updated)
  }

  const handleUpdateShipments = (updated: ParsedShipment[]) => {
    setShipments(updated)
    saveToStorage('twf-shipments', updated)
  }

  const handleUpdateDocuments = (docs: ShipmentDocument[]) => {
    setDocuments(docs)
    saveToStorage('twf-documents', docs)
  }

  const handleUpdateReports = (updated: OperativeReport[]) => {
    setReports(updated)
    saveToStorage('twf-reports', updated)
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
    navigateTo('admin-dashboard')
  }

  const handleAdminLogout = () => {
    clearAuth()
    setIsAdminLoggedIn(false)
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
      <Toaster position="top-right" />
      <PublicSiteEnhanced
        language={language || 'es'}
        onLanguageChange={handleLanguageChange}
        onAdminClick={() => setCurrentView('admin-login')}
        onClientPortalClick={() => setCurrentView('client-login')}
        quotes={quotes || []}
        onUpdateQuotes={setQuotes}
        shipments={shipments}
      />
    </>
  )
}

export default App
