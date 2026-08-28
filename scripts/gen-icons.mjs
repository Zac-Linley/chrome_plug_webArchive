// 生成插件与网页图标（纯 Node，无依赖）
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- PNG 编码 ----------
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const stride = 1 + size * 4;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 图形 ----------
const BG = [9, 105, 218]; // #0969da
const FG = [255, 255, 255];

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const cx = x < x0 + r ? x0 + r : x1 - r;
  const cy = y < y0 + r ? y0 + r : y1 - r;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const BOOKMARK = [
  [0.3, 0.2],
  [0.7, 0.2],
  [0.7, 0.7],
  [0.5, 0.88],
  [0.3, 0.7],
];

function inLine(x, y, x0, x1, y0, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function colorAt(x, y) {
  if (!inRoundedRect(x, y, 0.04, 0.04, 0.96, 0.96, 0.24)) return [0, 0, 0, 0];
  if (inPolygon(x, y, BOOKMARK)) {
    if (
      inLine(x, y, 0.38, 0.62, 0.36, 0.41) ||
      inLine(x, y, 0.38, 0.62, 0.47, 0.52) ||
      inLine(x, y, 0.38, 0.54, 0.58, 0.63)
    ) {
      return [...BG, 255];
    }
    return [...FG, 255];
  }
  return [...BG, 255];
}

function makeIcon(size) {
  const SS = 4; // 超采样抗锯齿
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const [cr, cg, cb, ca] = colorAt(nx, ny);
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, rgba);
}

const sizes = [16, 32, 48, 128];
const targets = [
  join(root, "extension", "icons"),
  join(root, "site", "public", "icons"),
];

for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const size of sizes) {
    writeFileSync(join(dir, `icon${size}.png`), makeIcon(size));
    console.log(`✓ ${dir}/icon${size}.png`);
  }
}
