"""Generate PITCH_ONE_PAGER.pdf from the TWF SaaS pitch content.

A professional 1-page pitch PDF optimized for sending to freight-forwarder
prospects via WhatsApp / email.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable,
)

# ─── Colors (TWF brand + high-contrast) ────────────────────────────────
TWF_NAVY = HexColor('#0f172a')       # deep navy (brand primary)
TWF_ACCENT = HexColor('#E8965A')      # warm orange (brand accent)
TWF_SEA = HexColor('#2B4162')         # sea blue
TEXT = HexColor('#1f2937')
MUTED = HexColor('#6b7280')
LIGHT = HexColor('#f9fafb')
BORDER = HexColor('#e5e7eb')

# ─── Styles ────────────────────────────────────────────────────────────
title = ParagraphStyle(
    'title', fontName='Helvetica-Bold', fontSize=22, leading=26,
    textColor=TWF_NAVY, spaceAfter=4, alignment=TA_LEFT,
)
subtitle = ParagraphStyle(
    'subtitle', fontName='Helvetica', fontSize=11, leading=14,
    textColor=MUTED, spaceAfter=10, alignment=TA_LEFT,
    italic=True,
)
section = ParagraphStyle(
    'section', fontName='Helvetica-Bold', fontSize=12, leading=14,
    textColor=TWF_ACCENT, spaceAfter=4, spaceBefore=8, alignment=TA_LEFT,
)
body = ParagraphStyle(
    'body', fontName='Helvetica', fontSize=9.5, leading=13,
    textColor=TEXT, spaceAfter=4, alignment=TA_LEFT,
)
bullet = ParagraphStyle(
    'bullet', fontName='Helvetica', fontSize=9.5, leading=13,
    textColor=TEXT, spaceAfter=2, leftIndent=12, alignment=TA_LEFT,
)
footer = ParagraphStyle(
    'footer', fontName='Helvetica-Oblique', fontSize=8, leading=10,
    textColor=MUTED, alignment=TA_CENTER, spaceBefore=6,
)

# ─── Content build ─────────────────────────────────────────────────────
story = []

story.append(Paragraph('TWF — Sistema Operativo para Agentes de Carga LATAM', title))
story.append(Paragraph(
    'El software que usás todos los días para operar tu forwarder — '
    'ahora sin gastar USD 500/mes en CargoWise.',
    subtitle,
))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=0, spaceAfter=6))

# ─── Problem & solution (two-column) ──────────────────────────────────
story.append(Paragraph('EL PROBLEMA', section))
story.append(Paragraph(
    'Tu operación vive en <b>Excel + WhatsApp + Gmail</b>. '
    'Cada carga = 15 mails de <i>"¿dónde está mi contenedor?"</i>, '
    'planillas que no ves fuera del compu, y clientes que se enteran del LIBRE '
    'recién cuando ya venció. CargoWise cuesta USD 500+/mes, Magaya USD 3,000+. '
    'Ambos son genéricos, en inglés, y no saben qué es un <b>trasiego</b> o un '
    '<b>check CR</b>.',
    body,
))

story.append(Paragraph('LA SOLUCIÓN', section))
story.append(Paragraph(
    'Plataforma web <b>hecha por un forwarder uruguayo</b>, en español voseo, '
    'con los campos que realmente usás: LIBRE, CDEV, VTO, trasiego, checks '
    'CR/BL/AD/AT, fiscal, operativa por contenedor.',
    body,
))

bullets = [
    '<b>Importá tu planilla actual en 60 seg</b> — conectamos tu Google Sheet, no migrás datos.',
    '<b>Vista HOY</b> al abrir el dashboard: qué sale, qué está en frontera, qué llega a fiscal.',
    '<b>Portal cliente con OTP</b> — tus clientes ven su carga sin mails ida y vuelta.',
    '<b>Portales depósito + transporte</b> — cada uno ve solo lo suyo.',
    '<b>Resumen Telegram 7 AM</b> — LIBRE vencido, cargas saliendo, todo en un mensaje.',
    '<b>Seguridad enterprise</b> — RLS Supabase, bcrypt, captcha, CSP, audit por tenant.',
]
for b in bullets:
    story.append(Paragraph(f'•  {b}', bullet))

# ─── Pricing table ─────────────────────────────────────────────────────
story.append(Spacer(1, 6))
story.append(Paragraph('PRECIOS', section))
pricing_data = [
    ['STARTER', 'PRO  ⭐', 'BUSINESS'],
    ['USD 89/mes', 'USD 249/mes', 'USD 549/mes'],
    [
        '1 admin\n40 shipments/mes\nTracking público\nQuote form',
        '5 users\n200 shipments/mes\n+ Portales cliente / depósito / transporte\n+ Analytics\n+ Resumen Telegram',
        '15 users\nUnlimited shipments\n+ White-label\n+ API\n+ Soporte prioritario',
    ],
]
pricing_table = Table(pricing_data, colWidths=[5.5*cm, 6*cm, 5.5*cm], hAlign='LEFT')
pricing_table.setStyle(TableStyle([
    # Header row
    ('BACKGROUND', (0, 0), (-1, 0), TWF_NAVY),
    ('TEXTCOLOR', (0, 0), (-1, 0), white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('TOPPADDING', (0, 0), (-1, 0), 6),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
    # Highlight PRO column
    ('BACKGROUND', (1, 0), (1, 0), TWF_ACCENT),
    # Price row
    ('FONTNAME', (0, 1), (-1, 1), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 1), (-1, 1), 12),
    ('TEXTCOLOR', (0, 1), (-1, 1), TWF_SEA),
    ('ALIGN', (0, 1), (-1, 1), 'CENTER'),
    ('BACKGROUND', (0, 1), (-1, 1), LIGHT),
    ('TOPPADDING', (0, 1), (-1, 1), 6),
    ('BOTTOMPADDING', (0, 1), (-1, 1), 6),
    # Body row
    ('FONTNAME', (0, 2), (-1, 2), 'Helvetica'),
    ('FONTSIZE', (0, 2), (-1, 2), 8.5),
    ('TEXTCOLOR', (0, 2), (-1, 2), TEXT),
    ('TOPPADDING', (0, 2), (-1, 2), 8),
    ('BOTTOMPADDING', (0, 2), (-1, 2), 8),
    ('LEFTPADDING', (0, 2), (-1, 2), 10),
    ('RIGHTPADDING', (0, 2), (-1, 2), 10),
    # Borders
    ('LINEBELOW', (0, 0), (-1, 0), 1, white),
    ('LINEBELOW', (0, 1), (-1, 1), 0.5, BORDER),
    ('LINEAFTER', (0, 0), (0, -1), 0.5, BORDER),
    ('LINEAFTER', (1, 0), (1, -1), 0.5, BORDER),
    ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
]))
story.append(pricing_table)
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<b>10× más barato que CargoWise</b>, con mayor profundidad para '
    'operaciones Mercosur. Setup USD 300–600 (waive primeros 5 clientes). '
    'Billing anual → 2 meses gratis.',
    body,
))

# ─── Trust + CTA ───────────────────────────────────────────────────────
story.append(Paragraph('POR QUÉ AHORA', section))
story.append(Paragraph(
    '✓ <b>Producción real</b> — construido y usado todos los días en TWF desde 2026 (caso real, no demo)<br/>'
    '✓ <b>Security-hardened</b> — audit completo, findings crítico+alto cerrados, 46 tests unitarios<br/>'
    '✓ <b>Stack moderno</b> — React 19, Supabase, Vercel — zero vendor lock-in, exportás todo cuando quieras<br/>'
    '✓ <b>Onboarding 72h</b> — del contrato a producción, 2 calls de 1h. Tu planilla sigue intacta si cancelás.',
    body,
))

story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceBefore=10, spaceAfter=6))

# ─── CTA box ───────────────────────────────────────────────────────────
cta_data = [[Paragraph(
    '<b><font size="12" color="#0f172a">Agendá una demo de 20 minutos.</font></b><br/>'
    '<font size="10" color="#1f2937">Llevá tu planilla actual. Te muestro tu operación corriendo en vivo.</font>',
    ParagraphStyle('cta', fontName='Helvetica', fontSize=10, leading=14, alignment=TA_LEFT)
)]]
cta_table = Table(cta_data, colWidths=[17*cm], hAlign='LEFT')
cta_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), LIGHT),
    ('LEFTPADDING', (0, 0), (-1, -1), 12),
    ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ('TOPPADDING', (0, 0), (-1, -1), 10),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ('BOX', (0, 0), (-1, -1), 1.5, TWF_ACCENT),
]))
story.append(cta_table)

story.append(Spacer(1, 8))
story.append(Paragraph(
    '<b>Brian Ridavanovich</b>  ·  brianridv@gmail.com  ·  +598 [WhatsApp]  ·  [LinkedIn]',
    ParagraphStyle('contact', fontName='Helvetica-Bold', fontSize=9.5, leading=12,
                   textColor=TWF_NAVY, alignment=TA_CENTER)
))

story.append(Paragraph(
    'Transit World Forwarding  ·  transitworldforwarding.com  ·  2026',
    footer,
))

# ─── Build ─────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    'PITCH_ONE_PAGER.pdf',
    pagesize=A4,
    leftMargin=1.8*cm,
    rightMargin=1.8*cm,
    topMargin=1.5*cm,
    bottomMargin=1.5*cm,
    title='TWF — Pitch One-Pager',
    author='Brian Ridavanovich',
    subject='TWF SaaS Sales One-Pager',
)
doc.build(story)
print('PITCH_ONE_PAGER.pdf generated')
