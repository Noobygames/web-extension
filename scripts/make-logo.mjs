/**
 * Renders OGBI's emblem to the PNG sizes the manifests need.
 *
 * The mark itself is defined here as geometry rather than committed as an opaque
 * bitmap, so the icon has a source in the repo: change a radius, re-run, get every
 * size back in step. `src/assets/images/logo-mark.svg` and `logo-text.svg` draw the
 * same shapes for the in-page CSS, where a vector is the better answer - the PNGs
 * exist only because Chrome's `icons` manifest key will not take an SVG.
 *
 *   node scripts/make-logo.mjs
 *
 * Zero dependencies: PNG is a handful of length-prefixed chunks around a zlib stream,
 * and pulling in an image library to write four of them is not worth the supply chain.
 *
 * The design, and why it is not upstream's: two touching rings make the infinity
 * symbol, and a chevron breaks out past the right-hand one - "beyond infinity", which
 * is the name. Upstream's mark is an "OG" monogram drawn as a lemniscate; the family
 * resemblance is deliberate (this is a fork) but nothing is copied.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { crc32 } from "./crc32.mjs";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "images");

/** The design, in a 512x512 space. Every size is rendered by scaling this. */
const DESIGN = Object.freeze({
  size: 512,
  center: 256,
  ring: { radius: 245, width: 13, color: [74, 168, 221] },
  disc: { radius: 238, inner: [13, 20, 32], outer: [22, 39, 63] },
  infinity: {
    radius: 64,
    width: 22,
    color: [242, 247, 251],
    centers: [
      [160, 256],
      [288, 256],
    ],
  },
  chevron: {
    width: 22,
    color: [99, 207, 255],
    points: [
      [382, 196],
      [434, 256],
      [382, 316],
    ],
  },
});

/**
 * Star field.
 *
 * A fixed sequence rather than `Math.random()`: the icon has to come out identical on
 * every machine, or a rebuild produces a diff nobody can review.
 */
function stars() {
  let seed = 20260905;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const { infinity, chevron } = DESIGN;

  const placed = [];
  let guard = 0;
  while (placed.length < 34 && guard++ < 20000) {
    const x = next() * 512;
    const y = next() * 512;

    // Inside the disc.
    if (Math.hypot(x - 256, y - 256) > 226) continue;

    // Clear of the mark, and of the holes inside the two rings - a star in there does
    // not read as a star, it reads as dirt on the glyph.
    const insideARing = infinity.centers.some(
      ([cx, cy]) => Math.hypot(x - cx, y - cy) < infinity.radius + infinity.width
    );
    if (insideARing) continue;

    const nearChevron =
      Math.min(
        distanceToSegment(x, y, chevron.points[0], chevron.points[1]),
        distanceToSegment(x, y, chevron.points[1], chevron.points[2])
      ) <
      chevron.width / 2 + 16;
    if (nearChevron) continue;

    placed.push({ x, y, radius: 1.6 + next() * 3.2, alpha: 0.35 + next() * 0.6 });
  }

  return placed;
}

const STARS = stars();

/** Distance from a point to a segment - the whole of what the chevron needs. */
function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 0..1 coverage for a shape whose signed distance is `d`, over `scale` device pixels. */
function coverage(d, scale) {
  // One design unit is `scale` output pixels, so the antialiased band has to shrink
  // with the size or a 32px icon comes out blurred.
  const edge = 0.75 / scale;

  return Math.max(0, Math.min(1, 0.5 - d / (2 * edge)));
}

function blend(dst, index, [r, g, b], alpha) {
  if (alpha <= 0) return;

  const a = Math.min(1, alpha);
  dst[index] = Math.round(dst[index] * (1 - a) + r * a);
  dst[index + 1] = Math.round(dst[index + 1] * (1 - a) + g * a);
  dst[index + 2] = Math.round(dst[index + 2] * (1 - a) + b * a);
  dst[index + 3] = Math.round(dst[index + 3] * (1 - a) + 255 * a);
}

/**
 * @param {number} size output edge length in pixels
 * @returns {Buffer} RGBA pixels, row-major
 */
function render(size) {
  const scale = size / DESIGN.size;
  const pixels = Buffer.alloc(size * size * 4, 0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample at the pixel centre, in design units.
      const dx = (x + 0.5) / scale;
      const dy = (y + 0.5) / scale;
      const index = (y * size + x) * 4;
      const fromCenter = Math.hypot(dx - DESIGN.center, dy - DESIGN.center);

      blend(pixels, index, discColor(fromCenter), coverage(fromCenter - DESIGN.disc.radius, scale));

      for (const star of STARS) {
        const d = Math.hypot(dx - star.x, dy - star.y) - star.radius;
        blend(pixels, index, [255, 255, 255], coverage(d, scale) * star.alpha);
      }

      const ringEdge = Math.abs(fromCenter - DESIGN.ring.radius) - DESIGN.ring.width / 2;
      blend(pixels, index, DESIGN.ring.color, coverage(ringEdge, scale));

      for (const [cx, cy] of DESIGN.infinity.centers) {
        const d = Math.abs(Math.hypot(dx - cx, dy - cy) - DESIGN.infinity.radius) - DESIGN.infinity.width / 2;
        blend(pixels, index, DESIGN.infinity.color, coverage(d, scale));
      }

      const { points, width, color } = DESIGN.chevron;
      const chevron = Math.min(
        distanceToSegment(dx, dy, points[0], points[1]),
        distanceToSegment(dx, dy, points[1], points[2])
      );
      blend(pixels, index, color, coverage(chevron - width / 2, scale));
    }
  }

  return pixels;
}

/** The disc's radial shade, dark in the middle so the glyph stays legible on it. */
function discColor(fromCenter) {
  const t = Math.min(1, fromCenter / DESIGN.disc.radius);
  const { inner, outer } = DESIGN.disc;

  return [0, 1, 2].map((i) => Math.round(inner[i] + (outer[i] - inner[i]) * t));
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
}

/** RGBA pixels to a PNG file. Filter type 0 on every scanline - no prediction. */
function toPng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [128, 512]) {
  const file = path.join(OUT_DIR, `logo${size}.png`);
  writeFileSync(file, toPng(render(size), size));
  console.log(`wrote ${file}`);
}
