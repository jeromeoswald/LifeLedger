// Draws the LifeLedger icon set (no image libraries): a white "L" with an amber coin on brand teal.
// Run: node scripts/make-icons.mjs   (writes into apps/mobile/assets/images and apps/mobile/public/icons)
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const TEAL = [15, 118, 110, 255];
const WHITE = [255, 255, 255, 255];
const AMBER = [245, 158, 11, 255];

/** Is unit point (x, y) inside the glyph? Returns its colour or null. Glyph spans ~[0.24, 0.76]. */
function glyph(x, y, color) {
  const inRect = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inRect(0.3, 0.22, 0.43, 0.78) || inRect(0.3, 0.65, 0.72, 0.78)) return color; // the "L"
  if ((x - 0.64) ** 2 + (y - 0.36) ** 2 <= 0.1 ** 2) return AMBER; // the coin
  return null;
}

function roundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * bg: 'full' (square, the OS rounds it), 'rounded', or 'none' (transparent).
 * scale: glyph size inside the canvas (Android/maskable icons need a safe zone).
 */
function render(size, { bg = 'full', scale = 1, glyphColor = WHITE } = {}) {
  const SS = 4; // 4x4 supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // PNG filter: none
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const gx = (x - 0.5) / scale + 0.5;
          const gy = (y - 0.5) / scale + 0.5;
          let c = glyph(gx, gy, glyphColor);
          if (!c && (bg === 'full' || (bg === 'rounded' && roundedRect(x, y, 0.22)))) c = TEAL;
          if (c) {
            r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
          }
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const IMG = 'apps/mobile/assets/images';
const PWA = 'apps/mobile/public/icons';
mkdirSync(PWA, { recursive: true });
const out = {
  [`${IMG}/icon.png`]: render(1024, { bg: 'full' }), // iOS/Android: the OS applies its own mask
  [`${IMG}/android-icon-foreground.png`]: render(1024, { bg: 'none', scale: 0.62 }), // adaptive safe zone
  [`${IMG}/android-icon-background.png`]: render(1024, { bg: 'full', scale: 0.0001 }),
  [`${IMG}/android-icon-monochrome.png`]: render(1024, { bg: 'none', scale: 0.62 }),
  [`${IMG}/splash-icon.png`]: render(512, { bg: 'none' }),
  [`${IMG}/favicon.png`]: render(48, { bg: 'rounded' }),
  [`${PWA}/icon-192.png`]: render(192, { bg: 'rounded' }),
  [`${PWA}/icon-512.png`]: render(512, { bg: 'rounded' }),
  [`${PWA}/maskable-512.png`]: render(512, { bg: 'full', scale: 0.8 }), // maskable safe zone
  [`${PWA}/apple-touch-icon.png`]: render(180, { bg: 'full' }),
};
for (const [file, png] of Object.entries(out)) {
  writeFileSync(file, png);
  console.log(`${file}  ${png.length} bytes`);
}
