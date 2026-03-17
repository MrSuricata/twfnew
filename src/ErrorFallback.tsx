import { Warning } from "@phosphor-icons/react"

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export default function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
    >
      <div className="w-full max-w-lg text-center">
        {/* Error icon */}
        <div
          className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full"
          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid rgba(239, 68, 68, 0.3)' }}
        >
          <Warning size={40} weight="bold" color="#ef4444" />
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: '#f1f5f9' }}>
          Algo salio mal
        </h1>
        <p className="text-base mb-6" style={{ color: '#94a3b8' }}>
          Ha ocurrido un error inesperado en la aplicacion.
          Puedes intentar recuperarte o volver al inicio.
        </p>

        {/* Error details box */}
        <div
          className="mb-8 rounded-lg p-4 text-left"
          style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: '#fca5a5' }}>
            Detalles del error:
          </p>
          <pre
            className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-32 font-mono"
            style={{ color: '#fda4af' }}
          >
            {error.message}
          </pre>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={resetErrorBoundary}
            className="px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            }}
          >
            Reintentar
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            className="px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer"
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            Volver al inicio
          </button>
        </div>

        <p className="mt-8 text-xs" style={{ color: '#475569' }}>
          Si el problema persiste, intenta recargar la pagina o contacta al administrador.
        </p>
      </div>
    </div>
  )
}
