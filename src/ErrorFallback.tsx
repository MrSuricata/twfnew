import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert"
import { Button } from "./components/ui/button"
import { Warning } from "@phosphor-icons/react"

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

export default function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Alert variant="destructive" className="mb-6">
          <Warning size={20} />
          <AlertTitle>Ha ocurrido un error</AlertTitle>
          <AlertDescription>
            Algo inesperado sucedió mientras se ejecutaba la aplicación. Los detalles del error se muestran a continuación.
          </AlertDescription>
        </Alert>
        
        <div className="bg-card border rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Detalles del Error:</h3>
          <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32">
            {error.message}
          </pre>
        </div>

        <Button 
          onClick={resetErrorBoundary} 
          className="w-full"
        >
          Reintentar
        </Button>
      </div>
    </div>
  )
}
