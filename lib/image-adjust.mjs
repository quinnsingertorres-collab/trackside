// Pixel math for the photo editor: exposure, contrast, white balance (temperature + tint)
// and shadows. Pure functions on RGBA bytes (a canvas ImageData.data), so the same code
// drives the live preview, the final render, and the tests.
//
// Order: sRGB -> linear light, then exposure, white balance and shadows (all physical, so
// they behave like a camera), then back to sRGB, then contrast around mid-gray.

export const DEFAULT_ADJUSTMENTS = { exposure: 0, contrast: 0, temperature: 0, tint: 0, shadows: 0 };

// Ranges the sliders use (exposure in stops, the rest -100..100).
export const ADJUSTMENT_LIMITS = {
  exposure: [-2, 2],
  contrast: [-100, 100],
  temperature: [-100, 100],
  tint: [-100, 100],
  shadows: [-100, 100],
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Keep only the known keys, as finite numbers inside their ranges. */
export function sanitizeAdjustments(a) {
  const out = { ...DEFAULT_ADJUSTMENTS };
  if (a && typeof a === "object") {
    for (const k of Object.keys(DEFAULT_ADJUSTMENTS)) {
      const n = Number(a[k]);
      if (Number.isFinite(n)) out[k] = clamp(n, ADJUSTMENT_LIMITS[k][0], ADJUSTMENT_LIMITS[k][1]);
    }
  }
  return out;
}

export function isNeutral(a) {
  const s = sanitizeAdjustments(a);
  return Object.keys(DEFAULT_ADJUSTMENTS).every((k) => s[k] === 0);
}

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LUT_SIZE = 4096;
const LINEAR_TO_SRGB = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  const l = i / LUT_SIZE;
  LINEAR_TO_SRGB[i] = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}
const toSrgb = (l) => LINEAR_TO_SRGB[(clamp(l, 0, 1) * LUT_SIZE + 0.5) | 0];

const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** White-balance channel gains for temperature/tint sliders (-100..100). Temperature > 0 warms
 *  (more red, less blue); tint > 0 pushes magenta (less green). Normalized to keep brightness. */
export function whiteBalanceGains(temperature, tint) {
  const t = clamp(temperature / 100, -1, 1);
  const ti = clamp(tint / 100, -1, 1);
  let r = 1 + 0.35 * t;
  let b = 1 - 0.35 * t;
  let g = 1 - 0.25 * ti;
  const norm = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { r: r / norm, g: g / norm, b: b / norm };
}

/** Adjust RGBA bytes in place. `data` is a Uint8ClampedArray (ImageData.data). Alpha is untouched. */
export function applyAdjustments(data, adjustments) {
  const a = sanitizeAdjustments(adjustments);
  if (isNeutral(a)) return data;

  const exposureGain = Math.pow(2, a.exposure);
  const wb = whiteBalanceGains(a.temperature, a.tint);
  const rGain = exposureGain * wb.r;
  const gGain = exposureGain * wb.g;
  const bGain = exposureGain * wb.b;
  const shadows = a.shadows / 100;
  const c = a.contrast / 100;
  const contrastFactor = c >= 0 ? 1 + c * 1.2 : 1 + c * 0.9;
  const doContrast = contrastFactor !== 1;

  for (let i = 0; i < data.length; i += 4) {
    let r = SRGB_TO_LINEAR[data[i]] * rGain;
    let g = SRGB_TO_LINEAR[data[i + 1]] * gGain;
    let b = SRGB_TO_LINEAR[data[i + 2]] * bGain;

    if (shadows !== 0) {
      // Lift (or deepen) only the dark tones: strongest near black, fading out by upper mid-gray.
      const perceptual = toSrgb(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const weight = 1 - smoothstep(0, 0.6, perceptual);
      const gain = Math.pow(2, shadows * 2.2 * weight);
      r *= gain; g *= gain; b *= gain;
    }

    let sr = toSrgb(r);
    let sg = toSrgb(g);
    let sb = toSrgb(b);
    if (doContrast) {
      sr = 0.5 + (sr - 0.5) * contrastFactor;
      sg = 0.5 + (sg - 0.5) * contrastFactor;
      sb = 0.5 + (sb - 0.5) * contrastFactor;
    }
    data[i] = sr * 255 + 0.5;      // Uint8ClampedArray clamps to 0..255
    data[i + 1] = sg * 255 + 0.5;
    data[i + 2] = sb * 255 + 0.5;
  }
  return data;
}

/** "Gray world" auto white balance: temperature/tint that make the average color neutral. */
export function autoWhiteBalance(data) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
    r += SRGB_TO_LINEAR[data[i]]; g += SRGB_TO_LINEAR[data[i + 1]]; b += SRGB_TO_LINEAR[data[i + 2]]; n++;
  }
  if (!n || r <= 0 || g <= 0 || b <= 0) return { temperature: 0, tint: 0 };
  r /= n; g /= n; b /= n;
  // Solve for the temperature that equalizes red and blue, then the tint that equalizes green.
  // With rGain = 1 + .35t and bGain = 1 - .35t: r(1+.35t) = b(1-.35t)  =>  t = (b - r) / (.35 (r + b)).
  const t = clamp((b - r) / (0.35 * (r + b)), -1, 1);
  const rg = 1 + 0.35 * t, bg = 1 - 0.35 * t;
  const rbAvg = (r * rg + b * bg) / 2;
  // gGain = 1 - .25 tint so that g(1 - .25 tint) = rbAvg  =>  tint = (1 - rbAvg / g) / .25.
  const ti = clamp((1 - rbAvg / g) / 0.25, -1, 1);
  return { temperature: Math.round(t * 100), tint: Math.round(ti * 100) };
}
