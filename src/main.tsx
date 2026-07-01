import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from 'sonner'

import App from './App.tsx'
import ErrorFallback from './ErrorFallback.tsx'
import { applyBrand } from './lib/brand'

import "./main.css"
import "./index.css"

// Resolve + apply the active brand (data-brand attr drives the CSS theme,
// document title) before first paint.
applyBrand()

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <App />
    {/* Toaster ÚNICO a nivel raíz: antes vivía dentro de las ramas del sitio
        público de App.tsx, así que el admin (que retorna antes) no montaba
        ninguno y NINGÚN toast de guardado/error se veía en la operativa. */}
    <Toaster position="top-right" toastOptions={{ style: { zIndex: 99999 } }} style={{ zIndex: 99999 }} />
  </ErrorBoundary>
)
