import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import ErrorFallback from './ErrorFallback.tsx'
import { initCapacitor } from './lib/capacitor.ts'

import "./main.css"
import "./index.css"

// Initialize Capacitor plugins (safe no-op on web)
initCapacitor()

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
  </ErrorBoundary>
)
