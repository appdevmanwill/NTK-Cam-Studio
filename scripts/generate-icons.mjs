import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIcoFromPngs(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size >= 256 ? 0 : entry.size;
    dir[1] = entry.size >= 256 ? 0 : entry.size;
    dir[2] = 0;
    dir[3] = 0;
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(entry.png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirEntries.push(dir);
    offset += entry.png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const outX = Math.max(qx, 0);
  const outY = Math.max(qy, 0);
  return Math.hypot(outX, outY) + Math.min(Math.max(qx, qy), 0) - r;
}

function sampleIconPixel(nx, ny, options = { circular: false, transparentBg: false }) {
  // Normalized coordinate space: [-1, 1] x [-1, 1]
  let bgAlpha = 1;
  if (options.circular) {
    const dCircle = Math.hypot(nx, ny) - 0.94;
    bgAlpha = 1 - smoothstep(-0.015, 0.015, dCircle);
  } else if (!options.transparentBg) {
    const dBox = sdRoundedBox(nx, ny, 0.92, 0.92, 0.36);
    bgAlpha = 1 - smoothstep(-0.015, 0.015, dBox);
  }

  if (options.transparentBg) {
    bgAlpha = 0;
  }

  // Deep studio indigo/slate radial + linear gradient
  const gradT = clamp01((nx + 1) * 0.32 + (ny + 1) * 0.42);
  let r = mix(17, 30, gradT);
  let g = mix(24, 58, gradT);
  let b = mix(49, 138, gradT);

  // Subtle top-left glow
  const glow = Math.exp(-((nx + 0.35) ** 2 + (ny + 0.42) ** 2) * 2.2) * 0.36;
  r = mix(r, 99, glow);
  g = mix(g, 132, glow);
  b = mix(b, 255, glow);

  let a = bgAlpha;

  const blendOver = (fr, fg, fb, fa) => {
    const k = clamp01(fa);
    if (k <= 0) return;
    if (options.transparentBg) {
      const outA = k + a * (1 - k);
      if (outA > 0) {
        r = (fr * k + r * a * (1 - k)) / outA;
        g = (fg * k + g * a * (1 - k)) / outA;
        b = (fb * k + b * a * (1 - k)) / outA;
      }
      a = outA;
    } else {
      r = mix(r, fr, k);
      g = mix(g, fg, k);
      b = mix(b, fb, k);
    }
  };

  // Viewfinder brackets in light indigo
  const bracketDist = (x, y) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const inCorner =
      (ax >= 0.42 && ax <= 0.64 && ay >= 0.56 && ay <= 0.63) ||
      (ay >= 0.42 && ay <= 0.64 && ax >= 0.56 && ax <= 0.63);
    return inCorner ? 1 : 0;
  };
  if (bracketDist(nx, ny) > 0) {
    blendOver(147, 197, 253, 0.32);
  }

  // Outer lens ring
  const dist = Math.hypot(nx, ny);
  const outerRingMask =
    (1 - smoothstep(0.47, 0.51, dist)) * smoothstep(0.37, 0.41, dist);
  const ringGrad = clamp01((nx + ny + 1) * 0.5);
  blendOver(mix(96, 129, ringGrad), mix(165, 140, ringGrad), 250, outerRingMask);

  // Dark lens housing
  const lensHousingMask = 1 - smoothstep(0.36, 0.39, dist);
  if (lensHousingMask > 0) {
    blendOver(11, 15, 28, lensHousingMask);
  }

  // Inner optical cyan/indigo iris
  const irisMask = 1 - smoothstep(0.24, 0.27, dist);
  if (irisMask > 0) {
    const irisGrad = clamp01((nx + 0.3) * 0.9 + (ny + 0.3) * 0.9);
    const ir = mix(56, 37, irisGrad);
    const ig = mix(189, 99, irisGrad);
    const ib = mix(248, 235, irisGrad);
    blendOver(ir, ig, ib, irisMask * 0.92);
  }

  // Aperture core
  const coreMask = 1 - smoothstep(0.11, 0.135, dist);
  if (coreMask > 0) {
    blendOver(9, 13, 24, coreMask);
  }

  // Specular highlight
  const specDist = Math.hypot(nx + 0.11, ny + 0.11);
  const specMask = 1 - smoothstep(0.045, 0.075, specDist);
  if (specMask > 0) {
    blendOver(248, 250, 252, specMask * 0.92);
  }

  // Live REC red dot at top-right
  const recDist = Math.hypot(nx - 0.50, ny + 0.50);
  const recGlow = Math.exp(-(recDist * recDist) * 28) * 0.45;
  if (recGlow > 0.01 && (!options.transparentBg || a > 0.01)) {
    blendOver(244, 63, 94, recGlow);
  }
  const recMask = 1 - smoothstep(0.105, 0.13, recDist);
  if (recMask > 0) {
    blendOver(244, 63, 94, recMask);
  }

  return [
    Math.round(Math.max(0, Math.min(255, r))),
    Math.round(Math.max(0, Math.min(255, g))),
    Math.round(Math.max(0, Math.min(255, b))),
    Math.round(clamp01(a) * 255),
  ];
}

function renderIconPng(size, options = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = options.scale ?? 1;
  // 2x2 supersampling for smooth edges
  const offsets = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const nx = (((x + ox) / size) * 2 - 1) / scale;
          const ny = (((y + oy) / size) * 2 - 1) / scale;
          const [pr, pg, pb, pa] = sampleIconPixel(nx, ny, options);
          sr += pr;
          sg += pg;
          sb += pb;
          sa += pa;
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(sr / 4);
      rgba[idx + 1] = Math.round(sg / 4);
      rgba[idx + 2] = Math.round(sb / 4);
      rgba[idx + 3] = Math.round(sa / 4);
    }
  }
  return encodePng(size, size, rgba);
}

const SVG_SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#111831"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
    <linearGradient id="ring" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA"/>
      <stop offset="100%" stop-color="#818CF8"/>
    </linearGradient>
    <linearGradient id="iris" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#2563EB"/>
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="472" height="472" rx="110" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="114" fill="#0B0F1C" stroke="url(#ring)" stroke-width="24"/>
  <circle cx="256" cy="256" r="66" fill="url(#iris)"/>
  <circle cx="256" cy="256" r="30" fill="#090D18"/>
  <circle cx="228" cy="228" r="15" fill="#F8FAFC" opacity="0.92"/>
  <circle cx="384" cy="128" r="28" fill="#F43F5E"/>
</svg>
`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const buildAssetsDir = path.join(ROOT, 'build-assets');
  const publicDir = path.join(ROOT, 'public');
  ensureDir(buildAssetsDir);
  ensureDir(publicDir);

  fs.writeFileSync(path.join(buildAssetsDir, 'icon.svg'), SVG_SOURCE, 'utf8');

  const png512 = renderIconPng(512);
  const png192 = renderIconPng(192);
  fs.writeFileSync(path.join(buildAssetsDir, 'icon.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoEntries = icoSizes.map((size) => ({
    size,
    png: renderIconPng(size),
  }));
  const icoBuffer = encodeIcoFromPngs(icoEntries);
  fs.writeFileSync(path.join(buildAssetsDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  // If Android project already exists, generate mipmaps cleanly
  const androidResDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidResDir)) {
    const densities = [
      { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
      { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
      { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
      { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
      { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 },
    ];
    for (const d of densities) {
      const targetDir = path.join(androidResDir, d.folder);
      ensureDir(targetDir);
      fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), renderIconPng(d.size));
      fs.writeFileSync(
        path.join(targetDir, 'ic_launcher_round.png'),
        renderIconPng(d.size, { circular: true })
      );
      fs.writeFileSync(
        path.join(targetDir, 'ic_launcher_foreground.png'),
        renderIconPng(d.fgSize, { transparentBg: true, scale: 0.66 })
      );
    }

    const bgXmlPath = path.join(androidResDir, 'values', 'ic_launcher_background.xml');
    ensureDir(path.dirname(bgXmlPath));
    fs.writeFileSync(
      bgXmlPath,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#111831</color>\n</resources>\n`,
      'utf8'
    );
    console.log('Generated Android mipmap icons.');
  }

  console.log('Generated NTK Cam Studio icons in build-assets/ and public/.');
}

main();
