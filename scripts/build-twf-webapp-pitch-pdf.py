"""Generate TWF_WEBAPP_PITCH.pdf — a 17-page internal sales deck.

Purpose: Brian presents the TWF web platform to his company to close a
USD 2500 setup + USD 50/month engagement.

Honest, technical tone. No marketing fluff. Every claim must be backed
by something concrete Brian can point to in a demo.

Tested on Python 3.11 + reportlab 4.4.
"""
from pathlib import Path
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image, KeepTogether,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas

# ─── Paths ─────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SHOTS_DIR = ROOT / 'docs' / 'pitch-screenshots'
LOGO_PATH = ROOT / 'public' / 'images' / 'twf-logo-full-new.png'
OUTPUT_PATH = ROOT / 'TWF_WEBAPP_PITCH.pdf'

# ─── Colors (TWF brand + high-contrast) ────────────────────────────────
TWF_NAVY = HexColor('#0f172a')
TWF_ACCENT = HexColor('#E8965A')
TWF_SEA = HexColor('#2B4162')
TEXT = HexColor('#1f2937')
MUTED = HexColor('#6b7280')
LIGHT = HexColor('#f9fafb')
BORDER = HexColor('#e5e7eb')
GREEN = HexColor('#16a34a')
RED = HexColor('#dc2626')

# ─── Page size ─────────────────────────────────────────────────────────
PAGE_W, PAGE_H = landscape(A4)  # 842 x 595 pt
MARGIN_X = 1.6 * cm
MARGIN_Y = 1.3 * cm

# ─── Styles ────────────────────────────────────────────────────────────
cover_title = ParagraphStyle(
    'cover_title', fontName='Helvetica-Bold', fontSize=40, leading=46,
    textColor=TWF_NAVY, alignment=TA_LEFT, spaceAfter=12,
)
cover_sub = ParagraphStyle(
    'cover_sub', fontName='Helvetica', fontSize=16, leading=22,
    textColor=MUTED, alignment=TA_LEFT, spaceAfter=30,
)
cover_meta = ParagraphStyle(
    'cover_meta', fontName='Helvetica', fontSize=10, leading=14,
    textColor=TWF_ACCENT, alignment=TA_LEFT, spaceBefore=30,
)

section_label = ParagraphStyle(
    'section_label', fontName='Helvetica-Bold', fontSize=9, leading=11,
    textColor=TWF_ACCENT, alignment=TA_LEFT, spaceAfter=4,
)
h1 = ParagraphStyle(
    'h1', fontName='Helvetica-Bold', fontSize=26, leading=32,
    textColor=TWF_NAVY, alignment=TA_LEFT, spaceAfter=8,
)
h2 = ParagraphStyle(
    'h2', fontName='Helvetica-Bold', fontSize=14, leading=18,
    textColor=TWF_NAVY, alignment=TA_LEFT, spaceBefore=8, spaceAfter=4,
)
h3 = ParagraphStyle(
    'h3', fontName='Helvetica-Bold', fontSize=11, leading=14,
    textColor=TWF_SEA, alignment=TA_LEFT, spaceBefore=4, spaceAfter=2,
)
body = ParagraphStyle(
    'body', fontName='Helvetica', fontSize=10.5, leading=15,
    textColor=TEXT, alignment=TA_LEFT, spaceAfter=6,
)
body_small = ParagraphStyle(
    'body_small', fontName='Helvetica', fontSize=9.5, leading=13,
    textColor=TEXT, alignment=TA_LEFT, spaceAfter=4,
)
bullet = ParagraphStyle(
    'bullet', fontName='Helvetica', fontSize=10.5, leading=15,
    textColor=TEXT, alignment=TA_LEFT, spaceAfter=2,
    leftIndent=14, bulletIndent=4, bulletFontName='Helvetica-Bold',
    bulletFontSize=10.5,
)
caption = ParagraphStyle(
    'caption', fontName='Helvetica-Oblique', fontSize=8.5, leading=11,
    textColor=MUTED, alignment=TA_CENTER, spaceBefore=4,
)
strong_num = ParagraphStyle(
    'strong_num', fontName='Helvetica-Bold', fontSize=28, leading=32,
    textColor=TWF_ACCENT, alignment=TA_CENTER, spaceAfter=4,
)
strong_num_label = ParagraphStyle(
    'strong_num_label', fontName='Helvetica', fontSize=9, leading=11,
    textColor=MUTED, alignment=TA_CENTER,
)


# ─── Helpers ───────────────────────────────────────────────────────────
class ScreenshotFrame(Flowable):
    """An image with a border + caption. Falls back to a gray placeholder if
    the path doesn't exist, so the deck builds even without all screenshots."""

    def __init__(self, path: Path, caption_text: str, w: float, h: float):
        super().__init__()
        self.path = path
        self.caption_text = caption_text
        self.w = w
        self.h = h

    def wrap(self, avail_w, avail_h):
        return (self.w, self.h + 0.55 * cm)

    def draw(self):
        c = self.canv
        # Border
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.6)
        c.roundRect(0, 0.55 * cm, self.w, self.h, 6, stroke=1, fill=0)

        if self.path.exists():
            try:
                c.drawImage(
                    str(self.path),
                    0.1 * cm, 0.65 * cm,
                    width=self.w - 0.2 * cm,
                    height=self.h - 0.2 * cm,
                    preserveAspectRatio=True,
                    mask='auto',
                )
            except Exception:
                self._placeholder(c)
        else:
            self._placeholder(c)

        # Caption
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Oblique', 8.5)
        c.drawCentredString(self.w / 2, 0.15 * cm, self.caption_text)

    def _placeholder(self, c):
        c.setFillColor(LIGHT)
        c.rect(0.1 * cm, 0.65 * cm, self.w - 0.2 * cm, self.h - 0.2 * cm, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont('Helvetica-Oblique', 10)
        c.drawCentredString(self.w / 2, self.h / 2 + 0.3 * cm, '[ screenshot pendiente ]')
        c.setFont('Helvetica', 8)
        c.drawCentredString(
            self.w / 2, self.h / 2 - 0.15 * cm,
            f'esperado: {self.path.name}',
        )


def screenshot(filename: str, caption_text: str, w: float = None, h: float = None):
    if w is None:
        w = PAGE_W - 2 * MARGIN_X
    if h is None:
        h = 11 * cm
    return ScreenshotFrame(SHOTS_DIR / filename, caption_text, w, h)


# ─── Page template (header + footer on every page after cover) ─────────
def _on_inner_page(c: canvas.Canvas, doc):
    # Top accent bar
    c.setFillColor(TWF_ACCENT)
    c.rect(0, PAGE_H - 0.3 * cm, PAGE_W, 0.3 * cm, fill=1, stroke=0)

    # Top line: logo + document label
    if LOGO_PATH.exists():
        try:
            c.drawImage(
                str(LOGO_PATH), MARGIN_X, PAGE_H - MARGIN_Y - 0.35 * cm,
                width=2.4 * cm, height=0.8 * cm,
                preserveAspectRatio=True, mask='auto',
            )
        except Exception:
            pass
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 8)
    c.drawRightString(
        PAGE_W - MARGIN_X, PAGE_H - MARGIN_Y + 0.1 * cm,
        'Plataforma Web TWF · Presentación interna',
    )

    # Footer line
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.3)
    c.line(MARGIN_X, MARGIN_Y, PAGE_W - MARGIN_X, MARGIN_Y)

    # Footer text
    c.setFillColor(MUTED)
    c.setFont('Helvetica', 8)
    c.drawString(MARGIN_X, MARGIN_Y - 0.4 * cm, 'Transit World Forwarding · transitworldforwarding.vercel.app')
    c.drawRightString(
        PAGE_W - MARGIN_X, MARGIN_Y - 0.4 * cm,
        f'{doc.page}',
    )


def _on_cover_page(c: canvas.Canvas, doc):
    # Full-bleed navy background
    c.setFillColor(TWF_NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)

    # Accent bar (right side)
    c.setFillColor(TWF_ACCENT)
    c.rect(PAGE_W - 0.9 * cm, 0, 0.9 * cm, PAGE_H, fill=1, stroke=0)

    # Logo top-left
    if LOGO_PATH.exists():
        try:
            c.drawImage(
                str(LOGO_PATH), MARGIN_X, PAGE_H - 3.5 * cm,
                width=4.5 * cm, height=1.6 * cm,
                preserveAspectRatio=True, mask='auto',
            )
        except Exception:
            pass

    # Title
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 44)
    c.drawString(MARGIN_X, PAGE_H / 2 + 0.6 * cm, 'Plataforma Web TWF')
    c.setFillColor(TWF_ACCENT)
    c.setFont('Helvetica-Bold', 20)
    c.drawString(MARGIN_X, PAGE_H / 2 - 0.5 * cm, 'Presentación interna')

    # Subtitle
    c.setFillColor(HexColor('#cbd5e1'))
    c.setFont('Helvetica', 13)
    c.drawString(
        MARGIN_X, PAGE_H / 2 - 2.3 * cm,
        'Una plataforma para operar tus cargas, atender clientes y coordinar',
    )
    c.drawString(
        MARGIN_X, PAGE_H / 2 - 3.0 * cm,
        'depósitos y transportes — hecha para TWF, en vivo en producción.',
    )

    # Bottom meta
    c.setFillColor(TWF_ACCENT)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(MARGIN_X, 2.5 * cm, 'PROPUESTA DE INVERSIÓN')
    c.setFillColor(white)
    c.setFont('Helvetica', 11)
    c.drawString(MARGIN_X, 1.9 * cm, 'USD 2.500 setup único  ·  USD 50/mes mantenimiento  ·  Bugfixes incluidos')

    c.setFillColor(HexColor('#94a3b8'))
    c.setFont('Helvetica-Oblique', 8)
    c.drawString(MARGIN_X, 1.1 * cm, 'Brian Ridvanovich · bridvanovich@twf.uy · abril 2026')


# ─── Flowable sections ─────────────────────────────────────────────────
def page_header(section: str, title: str):
    """Returns the flowables for a standard content page header."""
    return [
        Paragraph(section.upper(), section_label),
        Paragraph(title, h1),
        HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceBefore=2, spaceAfter=10),
    ]


def two_col(left_flow, right_flow, left_ratio: float = 0.5, gutter: float = 0.6 * cm):
    """Renders two flows side-by-side as a borderless table."""
    usable = PAGE_W - 2 * MARGIN_X
    left_w = usable * left_ratio - gutter / 2
    right_w = usable * (1 - left_ratio) - gutter / 2
    t = Table(
        [[left_flow, right_flow]],
        colWidths=[left_w, right_w],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]),
    )
    return t


def bullets(items):
    return [Paragraph(f'<b>·</b>&nbsp;&nbsp;{item}', bullet) for item in items]


def stat_tile(number: str, label: str):
    t = Table(
        [[Paragraph(number, strong_num)], [Paragraph(label, strong_num_label)]],
        colWidths=[5 * cm],
        style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
            ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
            ('TOPPADDING', (0, 0), (-1, 0), 14),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
        ]),
    )
    return t


# ─── Content ───────────────────────────────────────────────────────────
story = []

# Page 1 — cover (drawn by _on_cover_page, so we just need a page break)
story.append(Spacer(1, 0.1 * cm))
story.append(PageBreak())

# Page 2 — El problema
story.extend(page_header('01 · Contexto', 'El problema que resolvemos'))
left = [
    Paragraph('Cómo operamos hoy', h2),
    Paragraph(
        'El 100% de la operativa vive en <b>planillas de Google Sheets + WhatsApp + email</b>. '
        'Cada carga genera decenas de mensajes de status del cliente, llamadas de depósitos y '
        'transportes preguntando agenda, y alertas de LIBRE que se ven tarde.',
        body,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Qué cuesta eso hoy', h2),
    *bullets([
        'Tiempo del equipo respondiendo "¿dónde está mi contenedor?"',
        'Demurrage evitable por LIBRE mal monitoreado (USD 150-500 por carga)',
        'Depósitos y transportes llaman <b>1-2 veces por día</b> a ops para preguntar qué sale',
        'Cotizaciones por WhatsApp que se pierden entre mensajes',
        'No hay backup fuera de la planilla: si se corrompe, quedamos ciegos',
    ]),
]
right = [
    Paragraph('Alternativas en el mercado', h2),
    Paragraph(
        '<b>CargoWise</b> (líder mundial): USD 300-1.000+ por usuario/mes. En inglés. '
        'Genérico — no sabe qué es un trasiego ni un check CR.',
        body_small,
    ),
    Paragraph(
        '<b>Descartes</b>, <b>Magaya</b>: cotización enterprise, contrato anual, implementación de meses.',
        body_small,
    ),
    Paragraph(
        '<b>Dev freelance desde cero</b>: USD 8.000-20.000 setup + mantenimiento mensual, con el riesgo de que '
        'nadie entienda nuestro negocio.',
        body_small,
    ),
    Spacer(1, 0.4 * cm),
    Paragraph(
        '<i>Ninguna opción encaja en escala y vocabulario de un forwarder uruguayo operando '
        '150+ cargas mensuales.</i>',
        body_small,
    ),
]
story.append(two_col(left, right, left_ratio=0.58))
story.append(PageBreak())

# Page 3 — La solución
story.extend(page_header('02 · Propuesta', 'Una plataforma, cuatro roles, datos en vivo'))
story.append(Paragraph(
    'Web app propia con dominio <b>twf.uy</b>. Un único lugar donde:',
    body,
))
story.append(Spacer(1, 0.25 * cm))
roles = [
    ['Admin (ops)', 'Ve todo. Gestiona cargas, clientes, partners. Dashboard "HOY" con lo que se mueve, alertas LIBRE, analíticas.'],
    ['Cliente', 'Entra con su email, recibe código por mail (OTP). Ve sólo sus cargas, ETAs, fotos de origen, documentos.'],
    ['Depósito', 'Ve sólo sus operativas (GODILCO, PLANIR, etc.). Agenda calendario de trasiegos y salidas.'],
    ['Transporte', 'Idem depósito pero filtrado por transportista (TRANSCAL, BERRO, etc.).'],
]
t = Table(
    [[Paragraph(f'<b>{r[0]}</b>', body), Paragraph(r[1], body)] for r in roles],
    colWidths=[4 * cm, PAGE_W - 2 * MARGIN_X - 4 * cm],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (0, -1), LIGHT),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]),
)
story.append(t)
story.append(Spacer(1, 0.5 * cm))
story.append(Paragraph(
    'Todo lo que ve cada rol está <b>filtrado por backend</b> — un cliente no puede ver cargas '
    'de otro cliente ni aunque trate. Auditado y alineado con el backend word-boundary match.',
    body_small,
))
story.append(PageBreak())

# Page 4 — Arquitectura
story.extend(page_header('03 · Arquitectura', 'Cómo fluye la información'))
story.append(Paragraph(
    'Sin magia. Tu planilla actual sigue siendo la fuente de verdad para la operativa; la web lee de ahí '
    'y agrega capas de experiencia, seguridad y automatización.',
    body,
))
story.append(Spacer(1, 0.3 * cm))
arch = [
    ['Google Sheets', '→', 'Supabase (DB + RLS)', '→', 'Web App (Vercel)', '→', 'Cliente / Partner / Admin'],
]
t = Table(
    arch,
    colWidths=[3.5 * cm, 0.8 * cm, 3.5 * cm, 0.8 * cm, 3.5 * cm, 0.8 * cm, 4 * cm],
    style=TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (0, 0), HexColor('#dcfce7')),
        ('BACKGROUND', (2, 0), (2, 0), HexColor('#dbeafe')),
        ('BACKGROUND', (4, 0), (4, 0), HexColor('#fef3c7')),
        ('BACKGROUND', (6, 0), (6, 0), HexColor('#fce7f3')),
        ('FONT', (0, 0), (-1, -1), 'Helvetica-Bold', 11),
        ('TEXTCOLOR', (0, 0), (-1, -1), TWF_NAVY),
        ('TOPPADDING', (0, 0), (-1, -1), 18),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 18),
        ('BOX', (0, 0), (0, 0), 0.6, BORDER),
        ('BOX', (2, 0), (2, 0), 0.6, BORDER),
        ('BOX', (4, 0), (4, 0), 0.6, BORDER),
        ('BOX', (6, 0), (6, 0), 0.6, BORDER),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]),
)
story.append(t)
story.append(Spacer(1, 0.5 * cm))
story.append(Paragraph('Componentes', h2))
comp = [
    ['Google Sheets', 'Seguimiento General + Operativas. Se mantiene como fuente primaria para el equipo.'],
    ['Supabase', 'Base de datos (Postgres 17) con Row-Level Security. Guarda clientes, partners, fotos, reportes, OTPs, rate limits.'],
    ['Web App', 'React + TypeScript + Vite. Deployada en Vercel con SSL automático.'],
    ['n8n', 'Workflow del resumen diario de Telegram (8:47 AM) + hooks auxiliares.'],
    ['EmailJS', 'Envío de cotizaciones desde el formulario público.'],
    ['Cloudflare Turnstile', 'Captcha anti-bot en cotizaciones.'],
]
t = Table(
    [[Paragraph(f'<b>{r[0]}</b>', body_small), Paragraph(r[1], body_small)] for r in comp],
    colWidths=[4 * cm, PAGE_W - 2 * MARGIN_X - 4 * cm],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]),
)
story.append(t)
story.append(PageBreak())

# Page 5 — Admin HOY
story.extend(page_header('04 · Panel Admin', 'Dashboard "HOY" — lo que se mueve ahora'))
left = [
    Paragraph(
        'Pantalla de arranque del admin. Resume en una página lo que tiene que mirar el equipo de ops apenas abre la compu:',
        body,
    ),
    Spacer(1, 0.2 * cm),
    *bullets([
        '<b>LIBRE vencido / crítico</b> — las cargas que vencen hoy o ya vencieron, con alerta visible',
        '<b>Saliendo hoy</b> — camiones que dejan Uruguay',
        '<b>En frontera hoy</b> — estimado según salida hace 1-2 días',
        '<b>Llegando a fiscal hoy</b> — arribos a depósito fiscal',
    ]),
    Spacer(1, 0.2 * cm),
    Paragraph(
        'Cada fila tiene REF + contenedor + tipo + ruta depósito→fiscal + transportista. '
        'Click en cualquiera abre el detalle completo.',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Atajo de teclado', h3),
    Paragraph(
        '<b>Ctrl+K</b> desde cualquier pantalla → buscador instantáneo por REF, cliente, o salto rápido entre tabs.',
        body_small,
    ),
]
right = [screenshot('admin-hoy.png', 'Panel "HOY" del admin — dashboard de apertura', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 6 — Admin Agenda + Analíticas
story.extend(page_header('04 · Panel Admin', 'Agenda calendario + Analíticas'))
left = [
    Paragraph('Agenda', h2),
    Paragraph(
        'Vista calendario (día / semana / mes / año) con todas las cargas en una sola línea de tiempo. '
        'Filtros por depósito y por transportista. Sidebar con pendientes que todavía no tienen salida asignada.',
        body,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Analíticas', h2),
    *bullets([
        'Cargas por mes — ver temporada alta/baja de un vistazo',
        'Top clientes por volumen',
        'Distribución por modo de transporte (marítimo / terrestre / aéreo)',
        'Distribución por origen y destino',
        'Tiempo promedio de tránsito',
        'Tasa de conversión de cotizaciones',
    ]),
]
right = [screenshot('admin-analiticas.png', 'Analíticas — 630 operaciones 2026, arribos por mes, top clientes por volumen', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 7 — Admin Cargas + Clientes + Partners
story.extend(page_header('04 · Panel Admin', 'Detalle de carga · Clientes · Partners'))
left = [
    Paragraph('Detalle de carga', h2),
    Paragraph(
        'Un modal con tabs: General, Operativa, Costos, Estado, Fotos. Edición directa de campos con guardado inmediato. '
        'Muestra cada contenedor con bultos + peso + volumen + tipo. '
        'Guarda cambios sin salir del contexto gracias al footer fijo.',
        body_small,
    ),
    Spacer(1, 0.2 * cm),
    Paragraph('Gestión de Clientes', h2),
    Paragraph(
        'Crear/editar/eliminar clientes. Cada cliente tiene un "patrón" (ej. <i>PERETTI, CHIAPERO</i>) '
        'que define qué cargas ve en su portal. El sistema muestra cuántas cargas matchean en tiempo real.',
        body_small,
    ),
    Paragraph(
        '<b>Impersonar</b>: botón para ver el portal <i>como lo ve</i> el cliente. '
        'Sirve para QA antes de mandarle acceso al cliente real.',
        body_small,
    ),
    Spacer(1, 0.2 * cm),
    Paragraph('Gestión de Partners', h2),
    Paragraph(
        'Depósitos y transportes reciben su propio usuario con password. Ellos entran y ven sólo la agenda filtrada por su nombre.',
        body_small,
    ),
]
right = [screenshot('admin-detalle-carga.png', 'Detalle de Carga — tabs, contenedores con bultos/peso, footer fijo', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 8 — Portal Cliente
story.extend(page_header('05 · Portal Cliente', 'Lo que el cliente ve sin molestar a ops'))
left = [
    Paragraph('Cómo entra el cliente', h2),
    Paragraph(
        'Va a <b>twf.uy/portal</b>, escribe su email corporativo. Si está autorizado, le llega un código '
        'de 6 dígitos por mail. Ingresa el código y listo — sesión por JWT.',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Qué puede hacer', h2),
    *bullets([
        '<b>Activas</b>: tarjeta por carga con ETA, ruta, estado',
        '<b>Agenda</b>: sus cargas en un calendario',
        '<b>Alertas</b>: notificaciones de LIBRE vencido, arribos, cruces',
        '<b>Historial</b>: cargas ya completadas',
        'Ver <b>fotos de origen</b> subidas por ops',
        'Descargar <b>informes</b> de operativa (PDFs, docs)',
    ]),
    Spacer(1, 0.2 * cm),
    Paragraph(
        '<b>Nunca</b> ve precios internos, flete, costos de devolución, ni datos de otros clientes — '
        'los campos financieros se filtran antes de llegar al cliente.',
        body_small,
    ),
]
right = [screenshot('client-portal.png', 'Portal Cliente — tabs Activas / Agenda / Alertas / Historial', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 8b — Flujo OTP del cliente (3 pasos)
story.extend(page_header('05 · Portal Cliente', 'Seguridad del acceso — flujo OTP en 3 pasos'))
story.append(Paragraph(
    'Sin passwords que se olvidan o se comparten. Cada vez que el cliente entra, recibe un código único de 6 dígitos '
    'a su email corporativo. Si el email no está autorizado en la base, el sistema no manda nada (previene '
    'enumeración). Válido 10 minutos, un solo uso, con lockout tras 5 intentos fallidos.',
    body,
))
story.append(Spacer(1, 0.3 * cm))
otp_w = (PAGE_W - 2 * MARGIN_X - 2 * 0.4 * cm) / 3
otp_h = 9.5 * cm
otp_row = Table(
    [[
        screenshot('client-login-email.png', '1. Ingresa email corporativo', w=otp_w, h=otp_h),
        screenshot('client-login-email-gmail.png', '2. Código llega al mail (10 min validez)', w=otp_w, h=otp_h),
        screenshot('client-login-otp.png', '3. Ingresa 6 dígitos y entra al portal', w=otp_w, h=otp_h),
    ]],
    colWidths=[otp_w, otp_w, otp_w],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]),
)
story.append(otp_row)
story.append(PageBreak())

# Page 9 — Portales Depósito + Transporte
story.extend(page_header('06 · Portales Partner', 'Depósitos y transportes — cada uno ve lo suyo'))
left = [
    Paragraph('Portal Depósito', h2),
    Paragraph(
        'GODILCO, PLANIR, LOBRAUS, etc. — cada depósito tiene su usuario. Ve la agenda calendario '
        'filtrada sólo por sus cargas. Puede navegar por día/semana/mes.',
        body_small,
    ),
    Paragraph(
        'URL: <b>twf.uy/depot</b>',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Portal Transporte', h2),
    Paragraph(
        'TRANSCAL, BERRO, CARRARA, DIBIAGI, MAERSK, etc. — idéntico al de depósito pero filtrado por transportista.',
        body_small,
    ),
    Paragraph(
        'URL: <b>twf.uy/transport</b>',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph(
        '<b>Impacto directo:</b> eliminamos las <b>1-2 llamadas por día</b> que los depósitos y '
        'transportes hacían a ops preguntando "¿qué sale hoy?" o "¿cuándo cruza ese contenedor?".',
        body_small,
    ),
]
right = [screenshot('partner-dashboard.png', 'Dashboard depósito/transporte — agenda filtrada', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 10 — Landing + Tracking público
story.extend(page_header('07 · Sitio público', 'Landing + tracking sin login'))
left = [
    Paragraph('Tracking público', h2),
    Paragraph(
        'Cualquiera con un número de contenedor, MBL o REF puede entrar a <b>twf.uy</b> y ver el '
        'estado de su carga. Sin login, sin registro. Datos filtrados — no expone información '
        'financiera ni contactos.',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Landing + cotizaciones', h2),
    Paragraph(
        'Formulario público para cotizar carga. Protegido con <b>Cloudflare Turnstile</b> (captcha invisible) y '
        'rate limit por IP — si un bot intenta, se rebota solo. La cotización entra por email a tu bandeja.',
        body_small,
    ),
    Spacer(1, 0.3 * cm),
    Paragraph('Multi-idioma', h2),
    Paragraph(
        'Toda la landing + tracking + portal cliente en <b>español, inglés y portugués</b>. '
        'Importante para clientes de Brasil y para prospectos internacionales.',
        body_small,
    ),
]
right = [screenshot('public-landing.png', 'Landing pública — tracking por contenedor / MBL / REF', w=14 * cm, h=11.5 * cm)]
story.append(two_col(left, right, left_ratio=0.45))
story.append(PageBreak())

# Page 11 — Automatizaciones
story.extend(page_header('08 · Automatizaciones', 'Lo que corre solo'))
autos = [
    ['Resumen Telegram 8:47 AM',
     'Todos los días, un bot en Telegram manda un brief a Brian con pagos vencidos, LIBRE críticos, cargas llegando y checks pendientes. Sin abrir la web.'],
    ['Emails de bienvenida',
     'Cuando creas un cliente o partner nuevo en admin, la plataforma le manda un email automático con sus credenciales / instrucciones.'],
    ['Cotizaciones por email',
     'El formulario público de cotización manda por email a ops usando EmailJS. Incluye tipo de carga, origen, destino, detalles.'],
    ['Sincronización con Google Sheets',
     'La web lee cada X minutos la planilla y actualiza la base de datos. No hay que "apretar un botón" para refrescar.'],
    ['Alertas en portal cliente',
     'Cuando una carga cambia de estado (sale, cruza, arriba) el cliente ve la alerta en su portal sin que nadie le mande un mail.'],
]
t = Table(
    [[Paragraph(f'<b>{r[0]}</b>', body), Paragraph(r[1], body_small)] for r in autos],
    colWidths=[5 * cm, PAGE_W - 2 * MARGIN_X - 5 * cm],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (0, -1), LIGHT),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]),
)
story.append(t)
story.append(PageBreak())

# Page 12 — Ahorros concretos (honest)
story.extend(page_header('09 · Impacto medible', 'Qué ahorramos, sin exagerar'))
story.append(Paragraph(
    'Números conservadores sobre <b>volumen actual de TWF (~150 cargas/mes)</b>. El objetivo es ser '
    'creíbles en la presentación, no vender humo.',
    body_small,
))
story.append(Spacer(1, 0.3 * cm))
savings = [
    ['Qué', 'Cómo', 'Impacto honesto'],
    [
        'Llamadas de depósitos / transportes',
        'Cada depot y transport ve su agenda filtrada en su portal, con día/semana/mes',
        '<b>1-2 llamadas por día</b> que ya no entran a ops — ~30-40 por mes',
    ],
    [
        'Demurrage por LIBRE vencido',
        'Alerta visible 5 días antes + panel HOY + resumen Telegram matutino',
        'Si evitamos <b>1 carga/mes</b> con demurrage USD 150-500, la plataforma se paga sola',
    ],
    [
        'Emails de status del cliente',
        'Portal cliente con Activas + Alertas + ETA actualizada',
        'Clientes <b>con información al día sin pedirla</b>. Reducción concreta variable según cliente',
    ],
    [
        'Cotizaciones por WhatsApp',
        'Formulario público, entra por email estructurado con fecha y campos',
        'Historial auditable. Nada más se pierde entre mensajes',
    ],
    [
        'Backup de datos',
        'Supabase replica y guarda historial; planillas siguen en Drive como copia',
        'Riesgo de corrupción de datos prácticamente <b>cero</b>',
    ],
]
t = Table(
    [[Paragraph(f'<b>{c}</b>', body_small) if i == 0 else Paragraph(c, body_small) for c in row]
     for i, row in enumerate(savings)],
    colWidths=[5 * cm, 8.2 * cm, 12 * cm],
    style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TWF_NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 10),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.4, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]),
)
story.append(t)
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph(
    '<b>Nota honesta:</b> las ETAs de buques siguen requiriendo que alguien las cargue en la planilla '
    '(Marine Traffic manualmente). La plataforma no automatiza ese scraping — pero sí hace que el cliente '
    'y el equipo vean el dato actualizado sin volver a preguntarlo.',
    body_small,
))
story.append(PageBreak())

# Page 13 — Seguridad
story.extend(page_header('10 · Seguridad', 'Qué protege la plataforma'))
sec = [
    ['Contraseñas', 'Hash <b>bcrypt</b> con salt (12 rounds). Nunca se guarda la pass en texto claro. Reset por email si se olvida.'],
    ['Sesiones', 'Tokens <b>JWT firmados HS256</b>, expiración configurable. Guardados en sessionStorage (no persiste al cerrar).'],
    ['Acceso a DB', '<b>Row-Level Security</b> activa en todas las tablas de Supabase. Sólo el backend con service role puede leer/escribir.'],
    ['Rate limiting', 'Por IP + por endpoint. Protege contra brute force en login y spam en formularios.'],
    ['Captcha anti-bot', '<b>Cloudflare Turnstile</b> invisible en cotizaciones públicas. No molesta al usuario real.'],
    ['Aislamiento por cliente', 'Matching de cliente con <b>word-boundary regex</b>. Un cliente con patrón "PERETTI" <b>no</b> puede ver cargas de "PERETTIANI". Validado en frontend y backend.'],
    ['CORS + HTTPS', 'CORS restringido al dominio productivo. SSL/TLS automático via Vercel + Let\'s Encrypt.'],
    ['Auditoría de datos', 'Timestamps de creación y actualización en cada registro. Service role keys rotables sin downtime.'],
]
t = Table(
    [[Paragraph(f'<b>{r[0]}</b>', body), Paragraph(r[1], body_small)] for r in sec],
    colWidths=[4.5 * cm, PAGE_W - 2 * MARGIN_X - 4.5 * cm],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (0, -1), LIGHT),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]),
)
story.append(t)
story.append(PageBreak())

# Page 14 — Comparación con alternativas
story.extend(page_header('11 · Alternativas', 'Contra qué comparamos'))
comp = [
    ['', 'CargoWise', 'Magaya', 'Dev freelance', '<b>TWF Web (esta)</b>'],
    ['Costo anual', 'USD 3.600-12.000', 'USD 3.000+', 'USD 5.000+', '<b>USD 2.500 + 600 = USD 3.100</b>'],
    ['Idioma', 'Inglés', 'Inglés', 'A definir', '<b>ES / EN / PT</b>'],
    ['Vocabulario freight UY', 'Genérico', 'Genérico', 'A definir', '<b>LIBRE, trasiego, fiscal, checks</b>'],
    ['Implementación', 'Semanas', 'Semanas', 'Meses', '<b>Ya está en producción</b>'],
    ['Portal cliente + partner', 'Add-on pago', 'Add-on pago', 'A desarrollar', '<b>Incluido</b>'],
    ['Tracking público', 'No nativo', 'No nativo', 'A desarrollar', '<b>Incluido</b>'],
    ['Bugfixes', 'Incluido', 'Incluido', 'Cotiza aparte', '<b>Incluido</b>'],
    ['Updates nuevas features', 'Ciclo producto', 'Ciclo producto', 'Cotiza aparte', '<b>Cotiza aparte</b>'],
]
t = Table(
    [[Paragraph(c, body_small) if i > 0 else Paragraph(f'<b>{c}</b>', body_small)
      for c in row] for i, row in enumerate(comp)],
    colWidths=[5 * cm, 4 * cm, 4 * cm, 4 * cm, 8.2 * cm],
    style=TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), TWF_NAVY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 10),
        ('BACKGROUND', (4, 1), (4, -1), HexColor('#fef3c7')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]),
)
story.append(t)
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph(
    'El objetivo no es "reemplazar CargoWise completo" (no es lo mismo). Es darle a TWF una plataforma '
    'específica al tamaño y vocabulario de la operación, por un orden de magnitud menos.',
    body_small,
))
story.append(PageBreak())

# Page 15 — Costos
story.extend(page_header('12 · Propuesta económica', 'Cuánto vale y qué incluye'))
cost_left = [
    Paragraph('Setup (una sola vez)', h2),
    Paragraph(
        '<font size="24" color="#E8965A"><b>USD 2.500</b></font>',
        body,
    ),
    Spacer(1, 0.1 * cm),
    Paragraph('Incluye:', h3),
    *bullets([
        'Plataforma completa funcionando (ya desplegada en transitworldforwarding.vercel.app)',
        'Migración al dominio <b>twf.uy</b> con SSL automático',
        'Configuración inicial de usuarios (clientes + partners)',
        'Carga inicial de datos desde la planilla existente',
        'Capacitación al equipo (sesión por Zoom/presencial)',
        'Código fuente en GitHub (MrSuricata/twfnew)',
    ]),
]
cost_right = [
    Paragraph('Mantenimiento mensual', h2),
    Paragraph(
        '<font size="24" color="#E8965A"><b>USD 50/mes</b></font>',
        body,
    ),
    Spacer(1, 0.1 * cm),
    Paragraph('Incluye:', h3),
    *bullets([
        'Hosting en Vercel (proyecto + dominio + SSL)',
        'Supabase (base de datos + storage de fotos)',
        'Cloudflare Turnstile',
        'n8n (automatizaciones + resumen Telegram)',
        '<b>Bugfixes</b> — sin costo adicional',
        'Monitoreo + respuesta a incidentes',
    ]),
    Spacer(1, 0.2 * cm),
    Paragraph('<b>Aparte se cotizan:</b>', h3),
    Paragraph(
        '<b>Actualizaciones grandes manuales</b> — nuevas features que salgan del roadmap (facturación electrónica, '
        'multi-moneda, edición bidireccional con Drive, app móvil, etc.). Se cotiza cada una por separado con estimación de horas.',
        body_small,
    ),
]
story.append(two_col(cost_left, cost_right, left_ratio=0.48))
story.append(Spacer(1, 0.4 * cm))
story.append(HRFlowable(width='100%', thickness=0.8, color=TWF_ACCENT, spaceBefore=2, spaceAfter=8))
story.append(Paragraph(
    'Total primer año: <b>USD 2.500 + (USD 50 × 12) = USD 3.100</b>. Menos que un mes de CargoWise para 3 usuarios.',
    body,
))
story.append(PageBreak())

# Page 16 — Roadmap
story.extend(page_header('13 · Roadmap', 'Lo que está, lo que viene'))
left = [
    Paragraph('Ya está shipped (abril 2026)', h2),
    *bullets([
        'Landing pública + tracking · <b>ES/EN/PT</b>',
        'Admin: HOY, Agenda, Analíticas, Cargas, Clientes, Partners',
        'Portal Cliente: Activas, Agenda, Alertas, Historial',
        'Portales Depósito + Transporte',
        'Autenticación bcrypt + JWT + OTP',
        'Automatizaciones Telegram + emails + cotizaciones',
        'Ctrl+K command palette',
        'Seguridad hardening (RLS, rate limit, Turnstile)',
    ]),
]
right = [
    Paragraph('Próximas funcionalidades (cotizan aparte)', h2),
    *bullets([
        '<b>Edición bidireccional web ↔ Drive</b> — cambiar campos desde la web y que se reflejen en la planilla',
        '<b>Facturación electrónica UY DGI + AR AFIP</b> — e-factura integrada',
        '<b>Multi-moneda + FX</b> — UYU / ARS / BRL además de USD',
        '<b>CRM pipeline</b> — cotizaciones con estados, follow-ups, conversión',
        '<b>Auditoría</b> — log de cambios admin para compliance',
        '<b>Mobile PWA</b> — instalable en el celular con offline-first',
        '<b>API + webhooks</b> — para clientes enterprise que quieran integrar',
    ]),
]
story.append(two_col(left, right, left_ratio=0.5))
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph(
    'El roadmap se prioriza con TWF — las features que salen primero son las que más impactan el día a día.',
    body_small,
))
story.append(PageBreak())

# Page 17 — Escalabilidad + mejoras
story.extend(page_header('14 · Escalabilidad', 'El producto crece con TWF'))
left = [
    Paragraph('Diseñado para crecer', h2),
    *bullets([
        'La base actual soporta fácilmente <b>10x</b> el volumen de cargas actual sin cambios de infraestructura',
        'Vercel y Supabase escalan automáticamente — no hay servidores que administrar',
        'Agregar nuevos clientes, depósitos o transportes se hace en segundos desde admin <b>sin tocar código</b>',
        'Nuevos idiomas se suman en un día (hoy ya están ES / EN / PT)',
        'Cualquier cambio se deploya en minutos — no hay ventanas de mantenimiento largas',
    ]),
    Spacer(1, 0.2 * cm),
    Paragraph('Multi-usuario y roles', h3),
    Paragraph(
        'Hoy hay 1 admin. El sistema está preparado para múltiples admins con permisos granulares '
        '(ver / editar / sólo-lectura) cuando TWF crezca el equipo.',
        body_small,
    ),
]
right = [
    Paragraph('Mejoras y modificaciones a medida', h2),
    Paragraph(
        'La plataforma es <b>de TWF</b> (código fuente propio en GitHub). No depende de un vendor externo '
        'que decida qué features salen. Si mañana necesitás:',
        body_small,
    ),
    *bullets([
        'Un campo nuevo en la planilla → se integra',
        'Un nuevo tipo de reporte o KPI → se suma',
        'Integrar con el sistema contable (QuickBooks, Alegra) → se conecta por API',
        'Nuevo idioma para un cliente grande → se agrega',
        'Cambios de marca o branding → flexibles via tokens CSS',
        'Automatización nueva (WhatsApp, SMS, Slack) → viable con n8n',
    ]),
    Spacer(1, 0.2 * cm),
    Paragraph(
        '<b>Cotización por feature:</b> cada modificación grande se estima con horas y se acuerda antes. '
        'Sin letra chica. Bugfixes siempre gratis.',
        body_small,
    ),
]
story.append(two_col(left, right, left_ratio=0.5))
story.append(PageBreak())

# Page 18 — CTA
story.extend(page_header('15 · Próximos pasos', 'Cómo arrancamos'))
steps = [
    ['1', 'Aprobación interna', 'Revisión del presupuesto por la dirección. Podemos adaptar el scope si hace falta.'],
    ['2', 'Firma + primer pago', 'Acuerdo simple por escrito. Primer pago de setup (USD 2.500) contra entrega.'],
    ['3', 'Migración al dominio twf.uy', 'Apunto los DNS, confirmo SSL, actualizo CORS y env vars. Tarda 24-48 h por propagación.'],
    ['4', 'Capacitación al equipo', 'Sesión de 1 h por Zoom explicando cada panel y atajos.'],
    ['5', 'Ops en vivo', 'Plataforma en producción. Bugfixes inmediatos si aparece algo.'],
    ['6', 'Iteración continua', 'Reuniones mensuales breves para priorizar próximas features. Cualquier actualización grande cotiza aparte.'],
]
t = Table(
    [[Paragraph(f'<font size="18" color="#E8965A"><b>{r[0]}</b></font>', body),
      Paragraph(f'<b>{r[1]}</b>', body),
      Paragraph(r[2], body_small)] for r in steps],
    colWidths=[1.5 * cm, 5 * cm, PAGE_W - 2 * MARGIN_X - 6.5 * cm],
    style=TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]),
)
story.append(t)
story.append(Spacer(1, 0.5 * cm))
story.append(HRFlowable(width='100%', thickness=0.8, color=TWF_ACCENT, spaceBefore=2, spaceAfter=10))
story.append(Paragraph('Contacto', h2))
story.append(Paragraph(
    '<b>Brian Ridvanovich</b> · bridvanovich@twf.uy · <font color="#E8965A">Transit World Forwarding</font>',
    body,
))
story.append(Paragraph(
    'Plataforma demo en vivo: <font color="#2B4162"><b>transitworldforwarding.vercel.app</b></font> · '
    'Repositorio: <font color="#2B4162"><b>github.com/MrSuricata/twfnew</b></font>',
    body_small,
))


# ─── Build ─────────────────────────────────────────────────────────────
def on_first_page(c, doc):
    _on_cover_page(c, doc)


def on_later_page(c, doc):
    _on_inner_page(c, doc)


doc = SimpleDocTemplate(
    str(OUTPUT_PATH),
    pagesize=landscape(A4),
    leftMargin=MARGIN_X,
    rightMargin=MARGIN_X,
    topMargin=MARGIN_Y + 0.8 * cm,
    bottomMargin=MARGIN_Y + 0.4 * cm,
    title='Plataforma Web TWF — Presentación interna',
    author='Brian Ridvanovich',
    subject='TWF Web App — Internal sales pitch',
)
doc.build(story, onFirstPage=on_first_page, onLaterPages=on_later_page)
print(f'[OK] PDF generated: {OUTPUT_PATH}')
print(f'     Expected screenshots at: {SHOTS_DIR}')
print('     Missing screenshots render as "[ screenshot pendiente ]" placeholders.')
