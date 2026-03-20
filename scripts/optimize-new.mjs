import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join } from 'path';

const SRC = 'C:/Users/Usuario/Desktop/JARVIS CLAUDE/NUEVASPOSIBLESFOTOS';
const DST = 'C:/Users/Usuario/Desktop/PAPRIKA CLAUDE/twfnew/public/images';
mkdirSync(DST, { recursive: true });

async function optimize(src, dst, opts = {}) {
  const { width = 1200, quality = 80 } = opts;
  try {
    const img = sharp(src);
    const meta = await img.metadata();
    // Auto-rotate based on EXIF
    const pipeline = img.rotate();
    const resized = meta.width > width ? pipeline.resize(width) : pipeline;
    await resized.jpeg({ quality, mozjpeg: true }).toFile(join(DST, dst));
    console.log(`✅ ${dst}`);
  } catch (e) {
    console.error(`❌ ${dst}: ${e.message}`);
  }
}

// Team walking in container yard — Nosotros hero
await optimize(join(SRC, 'extracted/20241118_180838.jpg'), 'team-containers.jpg', { width: 1400, quality: 82 });
// Team walking wide shot — gallery
await optimize(join(SRC, 'extracted/20241118_180827.jpg'), 'team-yard-wide.jpg', { width: 1200, quality: 80 });
// User/owner in container yard with hard hat
await optimize(join(SRC, '396ac154-a7a4-47d1-887a-0806b9c34057.jpg'), 'team-owner.jpg', { width: 800, quality: 80 });
// Loading containers operation
await optimize(join(SRC, 'extracted/20241118_172754.jpg'), 'ops-loading.jpg', { width: 1000, quality: 80 });
// Supervising truck cargo
await optimize(join(SRC, 'extracted/20241118_173139.jpg'), 'ops-supervising.jpg', { width: 800, quality: 78 });
// Container yard with Maersk
await optimize(join(SRC, 'extracted/20241118_174324.jpg'), 'ops-container-yard.jpg', { width: 1000, quality: 78 });

console.log('\n🎉 New images optimized!');
