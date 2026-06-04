// Genera los íconos PWA por marca desde los assets de /public/images.
// Med: emblema blanco sobre violeta. TWF: ícono sobre slate oscuro.
const sharp = require('sharp')
const path = require('path')
const PUB = path.join(__dirname, '..', 'public')

async function iconOnBg(svgOrPng, size, bg, out, scale = 0.62) {
  const inner = Math.round(size * scale)
  const fg = await sharp(svgOrPng)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: fg, gravity: 'center' }])
    .png().toFile(path.join(PUB, out))
  console.log('✓', out)
}

;(async () => {
  const MED = '#261c79', TWF = '#0f172a'
  const medEmblem = path.join(PUB, 'images', 'med-emblem-white.svg')
  const twfIcon = path.join(PUB, 'images', 'twf-icon-white.png')
  // Mediterránea
  await iconOnBg(medEmblem, 192, MED, 'med-icon-192.png')
  await iconOnBg(medEmblem, 512, MED, 'med-icon-512.png')
  await iconOnBg(medEmblem, 180, MED, 'med-apple-touch.png')
  // TWF (apple-touch faltaba)
  await iconOnBg(twfIcon, 180, TWF, 'apple-touch-icon.png')
  await iconOnBg(twfIcon, 180, TWF, 'twf-apple-touch.png')
})().catch(e => { console.error(e); process.exit(1) })
