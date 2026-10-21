// Colour summaries in OKLab, used for placeholders and for the faint tint each
// collection's page takes from its own photographs.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function linearToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const hex = (v) =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0');

/**
 * @param {Buffer} raw  8-bit sRGB pixels, 3 channels
 * @returns {{ hex: string, l: number, a: number, b: number, c: number, h: number }}
 *   hex: the average colour; l/a/b/c/h: OKLab lightness, chroma-weighted hue direction.
 */
export function summarise(raw) {
  let r = 0, g = 0, bl = 0, n = 0;
  let wa = 0, wb = 0, wc = 0, lsum = 0;
  for (let i = 0; i + 2 < raw.length; i += 3) {
    const lr = toLinear(raw[i] / 255), lg = toLinear(raw[i + 1] / 255), lb = toLinear(raw[i + 2] / 255);
    r += lr; g += lg; bl += lb; n++;
    const [L, A, B] = linearToOklab(lr, lg, lb);
    const c = Math.hypot(A, B);
    wa += A * c; wb += B * c; wc += c; lsum += L;
  }
  r /= n; g /= n; bl /= n;
  const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const a = wc ? wa / wc : 0;
  const b = wc ? wb / wc : 0;
  return {
    hex: `#${hex(enc(r))}${hex(enc(g))}${hex(enc(bl))}`,
    l: +(lsum / n).toFixed(4),
    a: +a.toFixed(4),
    b: +b.toFixed(4),
    c: +(wc / n).toFixed(4),
    h: +(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360).toFixed(1),
  };
}

/** OKLab of a #rrggbb colour. */
export function hexToOklab(hexColour) {
  const n = parseInt(hexColour.slice(1), 16);
  return linearToOklab(toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255));
}
