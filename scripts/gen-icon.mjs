// Draws the Folio app icon (a cream "F" with a bookmark ribbon on a terracotta rounded square)
// and writes a 1024x1024 PNG with real transparent corners. No dependencies.
//
//   node scripts/gen-icon.mjs            -> icons-source/app-icon.png
//   pnpm tauri icon icons-source/app-icon.png   (generates every platform size into src-tauri/icons)

import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const SIZE = 1024;
const SS = 4; // 4x4 samples per pixel for smooth edges

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TOP_LEFT = hex("#d36d45");
const BOTTOM_RIGHT = hex("#86371c");
const CREAM = hex("#fff4e0");
const GOLD = hex("#f2c96b");

// ---- shapes, in unit coordinates (0..1, y down) ----
const roundedRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r);
  const dy = Math.abs(y - cy) - (hh - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh;
  return dx * dx + dy * dy <= r * r;
};
const box = (x, y, x0, y0, x1, y1, r = 0.022) =>
  roundedRect(x, y, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, r);

const inPolygon = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const background = (x, y) => roundedRect(x, y, 0.5, 0.5, 0.47, 0.47, 0.21);
const letterF = (x, y) =>
  box(x, y, 0.33, 0.34, 0.45, 0.8) || // stem
  box(x, y, 0.33, 0.34, 0.68, 0.45) || // top arm
  box(x, y, 0.33, 0.55, 0.6, 0.65); // middle arm
const RIBBON = [[0.6, 0.03], [0.72, 0.03], [0.72, 0.3], [0.66, 0.235], [0.6, 0.3]];
const ribbon = (x, y) => inPolygon(x, y, RIBBON);

const gradient = (x, y) => {
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  return TOP_LEFT.map((c, i) => c + (BOTTOM_RIGHT[i] - c) * t);
};

// ---- rasterise ----
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  const row = py * (SIZE * 4 + 1);
  raw[row] = 0; // PNG filter: none
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SIZE;
        const y = (py + (sy + 0.5) / SS) / SIZE;
        if (!background(x, y)) continue;
        const c = letterF(x, y) ? CREAM : ribbon(x, y) ? GOLD : gradient(x, y);
        r += c[0]; g += c[1]; b += c[2]; n++;
      }
    }
    const o = row + 1 + px * 4;
    if (n) {
      raw[o] = Math.round(r / n);
      raw[o + 1] = Math.round(g / n);
      raw[o + 2] = Math.round(b / n);
    }
    raw[o + 3] = Math.round((n / (SS * SS)) * 255);
  }
}

// ---- PNG encode ----
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = new URL("../icons-source/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("app-icon.png", outDir), png);
console.log(`Wrote icons-source/app-icon.png (${png.length} bytes)`);
