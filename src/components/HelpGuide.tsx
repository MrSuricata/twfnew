// ─── Ayuda en la app (botón "?" del header) ─────────────────────────────
// Guía de uso + preguntas frecuentes para el EQUIPO, siempre a mano y con
// buscador — la idea es que las dudas se respondan acá adentro, sin
// preguntarle a nadie (pedido Brian 15/07/2026). Contenido estático,
// versionado con la app: si cambia una pantalla, se actualiza acá mismo.
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { CaretDown, MagnifyingGlass, Question } from '@phosphor-icons/react'

interface Tema {
  id: string
  emoji: string
  titulo: string
  /** Cada ítem es un paso o tip (texto plano — el buscador filtra sobre esto). */
  items: string[]
}

const TEMAS: Tema[] = [
  {
    id: 'empezar',
    emoji: '🚀',
    titulo: 'Empezar: entrar y tener la app en el celular',
    items: [
      'Entrá con TU usuario y contraseña (no compartas cuenta: todo cambio queda registrado con tu nombre).',
      'En el celular: abrí la web, menú del navegador → "Agregar a pantalla de inicio". Queda instalada como app.',
      'Tocá la campana 🔔 arriba para activar los avisos en ese dispositivo (una sola vez por teléfono/PC).',
      'Tu configuración de columnas y filtros es TUYA: viaja con tu usuario a cualquier computadora.',
    ],
  },
  {
    id: 'hoy',
    emoji: '⚡',
    titulo: 'HOY: el arranque del día',
    items: [
      'Tres columnas: qué SALE hoy, qué está EN FRONTERA y qué LLEGA A FISCAL. Cada tarjeta es un contenedor.',
      'Botón "Aviso" en la tarjeta = ya le avisamos al cliente. Marcalo apenas avises, así nadie avisa dos veces.',
      'Si una carga no aparece acá, revisá que tenga la fecha correspondiente cargada (salida / ETA fiscal).',
    ],
  },
  {
    id: 'alta',
    emoji: '📦',
    titulo: 'Dar de alta una carga (¡acá, no en la planilla!)',
    items: [
      'Operaciones → "+ Nueva carga". Obligatorio: modalidad, ref y cliente. La ref FCL se sugiere sola.',
      'Completá los datos principales: shipper, incoterm, país y puerto de origen, puerto de destino, destino final.',
      'Si el shipper o el puerto no están en la lista, escribilo igual: queda creado para la próxima.',
      'OJO con "País/zona de destino": es por dónde DESCARGA el buque. Una carga a Argentina vía Montevideo va como URUGUAY. Solo va "Argentina" si descarga en Buenos Aires directo.',
      'Si te falta un dato, el botón "Guardar igual" te deja crear la carga y completarlo después.',
    ],
  },
  {
    id: 'grilla',
    emoji: '📋',
    titulo: 'Operaciones: la grilla del día a día',
    items: [
      'Click en la REF o el CLIENTE de una fila → se abre el panel completo de la carga.',
      'El resto de la fila NO abre nada: podés seleccionar y copiar un contenedor o un MBL tranquilo.',
      'La flechita ▸ junto a la ref muestra el resumen completo sin abrir el panel.',
      'Botón "Columnas": elegí cuáles ver y arrastralas para ordenarlas. Queda guardado en tu usuario.',
      '"Solo activas" oculta lo terminado. Si no encontrás una carga vieja, apagá ese filtro.',
      'En el panel todo se edita directo y se guarda solo. Si algo falla, la app lo revierte y te avisa.',
      'Lápiz junto a la ref = renombrar (pide PIN). Tijera = dividir la carga en partes A/B.',
    ],
  },
  {
    id: 'salidas',
    emoji: '🚚',
    titulo: 'Coordinar salidas (FCL)',
    items: [
      'Las fechas se cargan por CONTENEDOR: salida, ETA fiscal, LIBRE, depósito, lugar de salida y transporte.',
      'Se cargan desde el panel de la carga o el lápiz de cada contenedor.',
      'IMPORTANTE: la previsión que les llega por mail a GODILCO, PLANIR y los transportes sale de ESTOS datos, 3 veces al día. Lo que no está cargado acá, para ellos no existe.',
      'Cuando el contenedor vuelve vacío: botón "Devuelto" (queda en el campo LIBRE).',
    ],
  },
  {
    id: 'checks',
    emoji: '✅',
    titulo: 'Checks: 4 documentos por carga',
    items: [
      'BL entregado · Carta entregada · Docs transporte · Docs depósito. Un click para marcar (queda quién y cuándo).',
      'La regla: los 4 listos DOS SEMANAS antes del arribo.',
      'Cada mañana llega un mail con lo que falta para lo que arriba en 2 semanas. Marcaste el check acá → desaparece del mail de mañana.',
      'Los avisos de salida/frontera/fiscal NO van acá: se marcan en HOY.',
    ],
  },
  {
    id: 'pagos',
    emoji: '💰',
    titulo: 'Pagos: vencimientos que se calculan solos',
    items: [
      'La pestaña calcula cuándo vence cada pago (flete, locales, terminal, devolución) según la naviera y la forma de pago. No hay que calcular nada a mano.',
      '"¿Cuánto tengo que pagar hasta el…?": elegí una fecha y te da el total con desglose, exportable a CSV.',
      'Cuando llega la factura: abrí la carga (lápiz) y cargá los montos. Vacío = sin dato · 0 = ya pagado · un monto = pendiente.',
      'Al pagar: botón "Pagado" (queda quién y cuándo, con Deshacer).',
      'Las cargas por Chile no aparecen acá — las maneja el equipo de Chile.',
    ],
  },
  {
    id: 'camiones',
    emoji: '🛻',
    titulo: 'Camiones: consolidados',
    items: [
      'Armador: creá el camión (código, transporte) y agregale las cargas.',
      'Cargá las 3 fechas (carga, salida, llegada): el estado del camión Y el de sus cargas se calculan solos de las fechas. No hay que cambiar estados a mano.',
      'Si dos personas editan el mismo camión, la app avisa y refresca en vivo.',
    ],
  },
  {
    id: 'movil',
    emoji: '📱',
    titulo: 'En el celular',
    items: [
      'Todo funciona igual: HOY, grilla (formato tarjetas), panel, checks, pagos.',
      'Activá la campana en CADA dispositivo donde quieras recibir avisos.',
      'Los avisos llegan aunque la app esté cerrada (si activaste la campana).',
    ],
  },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'No encuentro una carga que sé que existe', a: 'Tres causas típicas: (1) el filtro "Solo activas" está prendido y la carga ya terminó — apagalo; (2) es una carga por Chile o Buenos Aires y tenés un filtro de zona puesto; (3) todavía no se dio de alta en la web — dala de alta vos (¡ya no se abre carpeta en la planilla!).' },
  { q: 'Me equivoqué en algo, ¿cómo lo deshago?', a: 'Casi toda acción muestra un botón "Deshacer" apenas la hacés (en el avisito de abajo). Si ya pasó el momento: los campos se editan de nuevo directamente, y las cargas archivadas se recuperan desde "Ver archivadas". Nada se pierde: todo queda registrado.' },
  { q: '¿Por qué no puedo cambiar el estado de una FCL a mano?', a: 'Porque se calcula solo de las fechas (ETD, ETA, salida, arribo fiscal). Cargá las fechas correctas y el estado se acomoda. Así el estado siempre refleja la realidad y no lo que alguien se acordó de actualizar.' },
  { q: 'La ref que quiero usar ya existe', a: 'Si es la misma operación dividida, usá sufijos: "A8123 A" y "A8123 B" (o la tijera del panel, que lo hace solo). Si es otra operación, usá la ref siguiente libre (el alta te la sugiere).' },
  { q: '¿Qué significa el 0 en los montos de Pagos?', a: 'Cero = YA PAGADO (la convención de siempre). Vacío = sin dato todavía. Un monto = pendiente de pago.' },
  { q: 'No me llegan las notificaciones al celular', a: 'Instalá la app en el inicio (en iPhone es obligatorio), entrá logueado y tocá la campana de arriba para activarla EN ESE dispositivo. Si cambiaste de teléfono, hay que activarla de nuevo.' },
  { q: '¿Los mails automáticos (previsión, checks, pagos) de dónde salen?', a: 'De lo que está cargado ACÁ. Si una salida no se cargó en la web, el depósito no la ve en su mail. Si un check no se marcó, sigue apareciendo como faltante. La web es la fuente.' },
  { q: '¿Puedo romper algo tocando?', a: 'No. Todo cambio queda auditado con tu nombre y casi todo tiene Deshacer. Peor que tocar de más es dejar un dato sin cargar.' },
  { q: 'La página se ve rara o desactualizada', a: 'Refrescá (F5 o deslizar hacia abajo en el celular). Si sigue rara, cerrá sesión y volvé a entrar. Si aún así sigue: avisale a Brian con la ref y una captura.' },
  { q: 'Tengo una duda que no está acá', a: 'Anotala y pasásela a Brian: las dudas repetidas se agregan a esta ayuda para el próximo. Esta guía vive dentro de la app y se actualiza con ella.' },
]

export default function HelpGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const needle = q.trim().toLowerCase()
  const temas = useMemo(
    () => (needle
      ? TEMAS.map(t => ({ ...t, items: t.items.filter(i => i.toLowerCase().includes(needle) || t.titulo.toLowerCase().includes(needle)) }))
          .filter(t => t.items.length > 0)
      : TEMAS),
    [needle],
  )
  const faq = useMemo(
    () => (needle ? FAQ.filter(f => f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle)) : FAQ),
    [needle],
  )
  // Con búsqueda activa, los temas quedan expandidos para ver los resultados.
  const expanded = (id: string) => (needle ? true : openId === id)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[440px] sm:max-w-[90vw] overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 pt-4 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Question size={20} weight="fill" className="text-primary" />
            Ayuda
          </SheetTitle>
          <SheetDescription>Cómo se usa cada pantalla y las dudas más comunes.</SheetDescription>
          <div className="relative pt-1">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 translate-y-[1px] text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar… (ej: aviso, pagado, columnas, ref)"
              className="h-9 pl-8"
              autoFocus
            />
          </div>
        </SheetHeader>

        <div className="p-4 space-y-4 text-sm">
          <div className="rounded-lg border divide-y overflow-hidden">
            {temas.map(t => (
              <div key={t.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(cur => (cur === t.id ? null : t.id))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                  aria-expanded={expanded(t.id)}
                >
                  <span>{t.emoji}</span>
                  <span className="flex-1 font-medium">{t.titulo}</span>
                  <CaretDown size={13} className={`text-muted-foreground transition-transform ${expanded(t.id) ? 'rotate-180' : ''}`} />
                </button>
                {expanded(t.id) && (
                  <ul className="px-4 pb-3 pt-0.5 space-y-1.5 bg-muted/20">
                    {t.items.map((i, n) => (
                      <li key={n} className="flex gap-2 text-[13px] leading-snug">
                        <span className="text-primary shrink-0">·</span>
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {temas.length === 0 && faq.length === 0 && (
              <p className="px-3 py-6 text-center text-muted-foreground text-sm">
                Nada para «{q.trim()}» — probá con otra palabra, o anotá la duda y pasásela a Brian.
              </p>
            )}
          </div>

          {faq.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Preguntas frecuentes</p>
              <div className="rounded-lg border divide-y overflow-hidden">
                {faq.map((f, i) => (
                  <details key={i} open={!!needle} className="group">
                    <summary className="cursor-pointer list-none px-3 py-2.5 hover:bg-muted/40 transition-colors flex items-center gap-2">
                      <span className="flex-1 font-medium text-[13px]">{f.q}</span>
                      <CaretDown size={13} className="text-muted-foreground transition-transform group-open:rotate-180 shrink-0" />
                    </summary>
                    <p className="px-4 pb-3 text-[13px] leading-snug text-foreground/85 bg-muted/20">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Regla de oro: <strong>la web es la fuente</strong> — lo que no está cargado acá, para el sistema (y para los mails automáticos) no existe.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
