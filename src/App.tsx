import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { Language } from '@/lib/i18n'
import { QuoteFormData } from '@/lib/quotationTypes'
import { ClientAccount } from '@/lib/quotationTypes'

import Login from './components/Login'
import ClientLogin from './components/ClientLogin'
import DashboardEnhanced from './components/DashboardEnhanced'
import ClientPortal from './components/ClientPortal'
import PublicSiteEnhanced from './components/PublicSiteEnhanced'

type View = 'public' | 'admin-login' | 'admin-dashboard' | 'client-login' | 'client-portal'

function App() {
  const [currentView, setCurrentView] = useState<View>('public')
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false)
  const [clientEmail, setClientEmail] = useState<string>('')
  const [language, setLanguage] = useState<Language>('es')

  const [quotes, setQuotes] = useState<QuoteFormData[]>([])
  const [clients, setClients] = useState<ClientAccount[]>([])

  useEffect(() => {
    if (!clients || clients.length === 0) {
      const demoClients: ClientAccount[] = [
        {
          id: '1',
          email: 'demo@cliente.com',
          password: 'demo123',
          name: 'Juan Pérez',
          company: 'Importadora Demo SRL',
          createdAt: Date.now(),
          assignedShipments: []
        }
      ]
      setClients(demoClients)
    }
  }, [clients, setClients])

  const handleAdminLogin = () => {
    setIsAdminLoggedIn(true)
    setCurrentView('admin-dashboard')
  }

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false)
    setCurrentView('public')
  }

  const handleClientLogin = (email: string) => {
    setClientEmail(email)
    setCurrentView('client-portal')
  }

  const handleClientLogout = () => {
    setClientEmail('')
    setCurrentView('public')
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
      />
    </>
  )
}

export default App
