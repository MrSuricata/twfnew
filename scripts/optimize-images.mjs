import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/Usuario/Desktop/JARVIS CLAUDE';
const DST = 'C:/Users/Usuario/Desktop/PAPRIKA CLAUDE/twfnew/public/images';

mkdirSync(DST, { recursive: true });

async function optimize(src, dst, opts = {}) {
  const { width = 1920, quality = 80, format = 'jpeg' } = opts;
  try {
    const img = sharp(src);
    const meta = await img.metadata();
    const pipeline = meta.width > width ? img.resize(width) : img;
    if (format === 'jpeg') {
      await pipeline.jpeg({ quality, mozjpeg: true }).toFile(join(DST, dst));
    } else if (format === 'png') {
      await pipeline.png({ quality: Math.min(quality, 100), compressionLevel: 9 }).toFile(join(DST, dst));
    } else if (format === 'webp') {
      await pipeline.webp({ quality }).toFile(join(DST, dst));
    }
    const { size } = await sharp(join(DST, dst)).metadata();
    console.log(`✅ ${dst} done`);
  } catch (e) {
    console.error(`❌ ${dst}: ${e.message}`);
  }
}

// Logo assets (keep as PNG for transparency, just resize)
await optimize(join(SRC, 'CANVA ORIENTADO/COMPLETO.png'), 'twf-logo-full-new.png', { width: 400, format: 'png' });
await optimize(join(SRC, 'CANVA ORIENTADO/LOGO SOLO.png'), 'twf-icon-dark.png', { width: 80, format: 'png' });
await optimize(join(SRC, 'CANVA ORIENTADO/LOGO SOLOblanco.png'), 'twf-icon-white.png', { width: 80, format: 'png' });
await optimize(join(SRC, 'CANVA ORIENTADO/LETRAS SOLAS blancas.png'), 'twf-text-white-new.png', { width: 300, format: 'png' });
await optimize(join(SRC, 'CANVA ORIENTADO/LETRAS SOLAS.png'), 'twf-text-dark-new.png', { width: 300, format: 'png' });

// Hero background — large landscape with plane, ship, truck
await optimize(join(SRC, 'CANVA ORIENTADO/HORIZONTAL CON LOGO FLOTANTE 2.0.jpg'), 'hero-bg.jpg', { width: 1920, quality: 82 });

// Section backgrounds
await optimize(join(SRC, 'CANVA ORIENTADO/IZQUIERDA.jpg'), 'section-truck.jpg', { width: 1200, quality: 80 });
await optimize(join(SRC, 'CANVA ORIENTADO/DERECHA.jpg'), 'section-ship.jpg', { width: 1200, quality: 80 });
await optimize(join(SRC, 'CANVA ORIENTADO/PUERTO HIPERREALISTA.png'), 'section-port.jpg', { width: 1400, quality: 82 });

// Real operational photos
await optimize(join(SRC, 'reportes/A7450/WhatsApp Image 2026-02-26 at 1.19.52 PM.jpeg'), 'ops-truck-loaded.jpg', { width: 800, quality: 78 });
await optimize(join(SRC, 'reportes/A7533/WhatsApp Image 2026-02-26 at 3.37.29 PM.jpeg'), 'ops-crane-port.jpg', { width: 800, quality: 78 });
await optimize(join(SRC, 'reportes/C405/WhatsApp Image 2026-02-25 at 4.32.58 PM.jpeg'), 'ops-warehouse.jpg', { width: 800, quality: 78 });
await optimize(join(SRC, 'reportes/C405/WhatsApp Image 2026-02-25 at 4.33.00 PM.jpeg'), 'ops-warehouse-2.jpg', { width: 800, quality: 78 });
await optimize(join(SRC, 'reportes/C405/WhatsApp Image 2026-02-25 at 4.39.42 PM.jpeg'), 'ops-forklift.jpg', { width: 800, quality: 78 });
await optimize(join(SRC, 'reportes/A7450/WhatsApp Image 2026-02-26 at 1.19.53 PM.jpeg'), 'ops-truck-loaded-2.jpg', { width: 800, quality: 78 });

console.log('\n🎉 All images optimized!');
