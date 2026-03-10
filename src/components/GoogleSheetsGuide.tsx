import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info, CheckCircle, Warning } from '@phosphor-icons/react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export default function GoogleSheetsGuide() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info size={24} className="text-accent" />
          Guía de Configuración de Google Sheets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info size={18} />
          <AlertDescription>
            <strong>Importante:</strong> La primera fila debe contener los encabezados exactos.
            Las filas siguientes contendrán los datos de cada envío.
          </AlertDescription>
        </Alert>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="headers">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <CheckCircle size={20} className="text-green-500" />
                Encabezados Requeridos (Primera Fila)
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge>Obligatorio</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">REF</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Número de referencia único</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge>Obligatorio</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">CLIENTE</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Nombre del cliente</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">ETD</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Fecha de salida (YYYY-MM-DD)</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">ETA</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Fecha de llegada (YYYY-MM-DD)</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">FT</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Días de Free Time (número)</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">LIBRE HASTA</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Fecha límite (YYYY-MM-DD)</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">CNTR</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Contenedores (separados por coma)</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">N°</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Cantidad de contenedores</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">MBL</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Master Bill of Lading</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">LÍNEA</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Línea naviera</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">BUQUE</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Nombre del buque</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Opcional</Badge>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">TERMINAL</code>
                    </div>
                    <p className="text-sm text-muted-foreground">Terminal portuaria</p>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="example">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <CheckCircle size={20} className="text-blue-500" />
                Ejemplo de Estructura del Sheet
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="p-4 bg-muted rounded-lg overflow-x-auto">
                <table className="text-xs font-mono w-full border-collapse">
                  <thead>
                    <tr className="bg-accent/20">
                      <th className="border border-border px-2 py-1">REF</th>
                      <th className="border border-border px-2 py-1">CLIENTE</th>
                      <th className="border border-border px-2 py-1">ETD</th>
                      <th className="border border-border px-2 py-1">ETA</th>
                      <th className="border border-border px-2 py-1">FT</th>
                      <th className="border border-border px-2 py-1">LIBRE HASTA</th>
                      <th className="border border-border px-2 py-1">CNTR</th>
                      <th className="border border-border px-2 py-1">N°</th>
                      <th className="border border-border px-2 py-1">LÍNEA</th>
                      <th className="border border-border px-2 py-1">TERMINAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-border px-2 py-1">MVD-001</td>
                      <td className="border border-border px-2 py-1">Acme Corp</td>
                      <td className="border border-border px-2 py-1">2024-03-01</td>
                      <td className="border border-border px-2 py-1">2024-03-15</td>
                      <td className="border border-border px-2 py-1">7</td>
                      <td className="border border-border px-2 py-1">2024-03-22</td>
                      <td className="border border-border px-2 py-1">MSCU1234567</td>
                      <td className="border border-border px-2 py-1">1</td>
                      <td className="border border-border px-2 py-1">MSC</td>
                      <td className="border border-border px-2 py-1">TCP</td>
                    </tr>
                    <tr>
                      <td className="border border-border px-2 py-1">MVD-002</td>
                      <td className="border border-border px-2 py-1">Global Trade</td>
                      <td className="border border-border px-2 py-1">2024-03-05</td>
                      <td className="border border-border px-2 py-1">2024-03-20</td>
                      <td className="border border-border px-2 py-1">10</td>
                      <td className="border border-border px-2 py-1">2024-03-30</td>
                      <td className="border border-border px-2 py-1">MAEU9876543, MAEU9876544</td>
                      <td className="border border-border px-2 py-1">2</td>
                      <td className="border border-border px-2 py-1">Maersk</td>
                      <td className="border border-border px-2 py-1">Montecon</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="permissions">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Warning size={20} className="text-orange-500" />
                Configuración de Permisos en Google Sheets
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 p-4">
                <Alert>
                  <Warning size={18} />
                  <AlertDescription>
                    El archivo debe ser <strong>público</strong> para que el sistema pueda leerlo.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Pasos para hacer público el Sheet:</h4>
                  <ol className="list-decimal ml-4 space-y-2 text-sm">
                    <li>Abre tu Google Sheet</li>
                    <li>Click en el botón <strong>"Compartir"</strong> (esquina superior derecha)</li>
                    <li>En la sección "Acceso general", cambiar de "Restringido" a <strong>"Cualquier persona con el enlace"</strong></li>
                    <li>Asegurar que el rol sea <strong>"Lector"</strong> (viewer)</li>
                    <li>Click en "Copiar enlace"</li>
                    <li>Pegar el enlace completo en el campo "URL de Google Sheets" arriba</li>
                  </ol>
                </div>

                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <CheckCircle size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <strong className="text-green-700 dark:text-green-400">Seguridad:</strong>
                      <p className="text-muted-foreground mt-1">
                        Solo se comparte el enlace para lectura. Nadie puede editar tu hoja sin permiso.
                        Los datos de costos no se muestran en el tracking público de clientes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sync">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Info size={20} className="text-blue-500" />
                Sincronización Automática
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">
                  La sincronización automática actualiza los datos desde Google Sheets en intervalos regulares.
                </p>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Ventajas:</h4>
                  <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                    <li>Dashboard siempre actualizado sin intervención manual</li>
                    <li>Ideal para equipos que actualizan el Sheet frecuentemente</li>
                    <li>Reduce errores por olvido de sincronización manual</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Recomendaciones:</h4>
                  <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                    <li><strong>1 minuto:</strong> Solo para testing o cambios muy frecuentes</li>
                    <li><strong>5-10 minutos:</strong> Balance ideal para operaciones activas</li>
                    <li><strong>30-60 minutos:</strong> Para actualizaciones menos frecuentes</li>
                    <li>Desactivar si los datos son estáticos (actualizar manualmente cuando sea necesario)</li>
                  </ul>
                </div>

                <Alert>
                  <Info size={18} />
                  <AlertDescription>
                    <strong>Nota:</strong> La sincronización automática solo funciona mientras la pestaña del navegador 
                    esté abierta. Para sincronización verdaderamente automática 24/7, se requeriría configuración de servidor.
                  </AlertDescription>
                </Alert>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <CheckCircle size={20} className="text-accent" />
            Checklist de Configuración
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Sheet creado con encabezados correctos</span>
            </li>
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Permisos configurados como "Cualquier persona con el enlace"</span>
            </li>
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>URL copiada y pegada en el campo arriba</span>
            </li>
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Primera importación realizada con éxito</span>
            </li>
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>Datos verificados en "Cargas Activas"</span>
            </li>
            <li className="flex items-center gap-2">
              <input type="checkbox" className="rounded" />
              <span>(Opcional) Sincronización automática configurada</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
