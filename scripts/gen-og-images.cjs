// Genera los banners OG (1200x630) por marca desde los logos blancos de
// /public/images, compuestos sobre un gradiente de marca. Se usan como
// og:image / twitter:image (preview al compartir el link).
//   Med → gradiente índigo→violeta + lockup blanco Mediterránea.
//   TWF → gradiente slate + logo blanco TWF.
// Correr: node scripts/gen-og-images.cjs
const sharp = require('sharp')
const path = require('path')
const PUB = path.join(__dirname, '..', 'public')

const W = 1200, H = 630

function bgSvg(stops, accent) {
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${stops[0]}"/>
      <stop offset="0.55" stop-color="${stops[1]}"/>
      <stop offset="1" stop-color="${stops[2]}"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <circle cx="1060" cy="110" r="230" fill="${accent}" opacity="0.06"/>
    <circle cx="150" cy="560" r="190" fill="${accent}" opacity="0.05"/>
  </svg>`)
}

function textSvg(text, { size, color, weight = '400', spacing = 1.5 }) {
  return Buffer.from(`<svg width="1000" height="${Math.round(size * 2)}" xmlns="http://www.w3.org/2000/svg">
    <text x="500" y="${Math.round(size * 1.35)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}"
      font-weight="${weight}" fill="${color}" text-anchor="middle" letter-spacing="${spacing}">${text}</text>
  </svg>`)
}

async function banner({ logo, stops, accent, title, tagline, out, logoH }) {
  const fg = await sharp(logo)
    .resize({ height: logoH, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer()
  const meta = await sharp(fg).metadata()
  // Con título (marca sin wordmark en el logo, ej. TWF) el bloque es más alto.
  const blockH = logoH + (title ? 78 : 0) + 52
  const logoTop = Math.round((H - blockH) / 2)
  const logoLeft = Math.round((W - meta.width) / 2)
  const layers = [{ input: fg, top: logoTop, left: logoLeft }]
  let y = logoTop + logoH + 12
  if (title) {
    const t = await sharp(textSvg(title, { size: 52, color: '#ffffff', weight: '700', spacing: 3 })).png().toBuffer()
    layers.push({ input: t, top: y, left: Math.round((W - 1000) / 2) })
    y += 72
  }
  const tag = await sharp(textSvg(tagline, { size: 32, color: '#dfe3f0' })).png().toBuffer()
  layers.push({ input: tag, top: y, left: Math.round((W - 1000) / 2) })
  await sharp(bgSvg(stops, accent)).composite(layers).jpeg({ quality: 90 }).toFile(path.join(PUB, out))
  console.log('✓', out, `(${W}x${H})`)
}

;(async () => {
  // Mediterránea — índigo→violeta (theme #261c79). El logo ya trae el wordmark.
  await banner({
    logo: path.join(PUB, 'images', 'med-logo-white.svg'),
    stops: ['#1e1552', '#2e1a86', '#5b2bb5'], accent: '#ffffff',
    tagline: 'Logística internacional sin fronteras',
    out: 'med-og-image.jpg', logoH: 300,
  })
  // TWF — slate (theme #0f172a). El logo es solo el ícono → agrego el nombre.
  await banner({
    logo: path.join(PUB, 'images', 'twf-logo-white.png'),
    stops: ['#0b1220', '#12203a', '#1e3a5f'], accent: '#ffffff',
    title: 'TRANSIT WORLD FORWARDING',
    tagline: 'Soluciones Logísticas Globales',
    out: 'og-image.jpg', logoH: 150,
  })
})().catch(e => { console.error(e); process.exit(1) })
