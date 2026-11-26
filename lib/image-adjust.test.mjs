// node lib/image-adjust.test.mjs
import assert from "node:assert/strict";
import { applyAdjustments, autoWhiteBalance, isNeutral, sanitizeAdjustments, DEFAULT_ADJUSTMENTS } from "./image-adjust.mjs";

const px = (r, g, b, a = 255) => new Uint8ClampedArray([r, g, b, a]);
const run = (p, adj) => Array.from(applyAdjustments(p, adj));
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// neutral settings leave every byte exactly as it was
const src = new Uint8ClampedArray(Array.from({ length: 256 * 4 }, (_, i) => (i % 4 === 3 ? 200 : (i >> 2) % 256)));
const before = Array.from(src);
assert.deepEqual(Array.from(applyAdjustments(src.slice(), DEFAULT_ADJUSTMENTS)), before);
assert(isNeutral({}) && isNeutral(null) && !isNeutral({ exposure: 0.1 }));

// exposure: brighter / darker, alpha untouched
let out = run(px(100, 100, 100, 77), { exposure: 1 });
assert(out[0] > 100 && out[3] === 77, "exposure +1 brightens, alpha kept");
assert(run(px(100, 100, 100), { exposure: -1 })[0] < 100, "exposure -1 darkens");
// one stop doubles linear light: sRGB 128 (linear ~.216) -> ~.433 linear = sRGB ~174
assert(Math.abs(run(px(128, 128, 128), { exposure: 1 })[0] - 174) <= 2);
assert.equal(run(px(255, 255, 255), { exposure: 2 })[0], 255, "clips cleanly");
assert.equal(run(px(0, 0, 0), { exposure: 2 })[0], 0, "black stays black");

// contrast: spreads tones around mid-gray, mid-gray stays put
assert(run(px(60, 60, 60), { contrast: 50 })[0] < 60);
assert(run(px(200, 200, 200), { contrast: 50 })[0] > 200);
assert(Math.abs(run(px(128, 128, 128), { contrast: 50 })[0] - 128) <= 1);
assert(run(px(60, 60, 60), { contrast: -50 })[0] > 60 && run(px(200, 200, 200), { contrast: -50 })[0] < 200);

// white balance: warm = more red, less blue, brightness roughly kept; cool is the opposite
const warm = run(px(128, 128, 128), { temperature: 60 });
assert(warm[0] > 128 && warm[2] < 128, "warm shifts red up and blue down");
assert(Math.abs(lum(warm) - 128) < 6, "brightness roughly preserved: " + lum(warm));
const cool = run(px(128, 128, 128), { temperature: -60 });
assert(cool[2] > 128 && cool[0] < 128);
const magenta = run(px(128, 128, 128), { tint: 60 });
assert(magenta[1] < magenta[0] && magenta[1] < magenta[2], "tint + reduces green");
const green = run(px(128, 128, 128), { tint: -60 });
assert(green[1] > green[0]);

// shadows: lifts dark tones a lot and bright tones barely at all; negative deepens shadows
const lifted = run(px(30, 30, 30), { shadows: 80 })[0];
assert(lifted > 55, "dark pixel lifted: " + lifted);
assert(Math.abs(run(px(240, 240, 240), { shadows: 80 })[0] - 240) <= 2, "highlights untouched");
const midShift = run(px(128, 128, 128), { shadows: 80 })[0] - 128;
assert(midShift >= 0 && midShift < lifted - 30, "mids affected less than shadows");
assert(run(px(60, 60, 60), { shadows: -80 })[0] < 60, "negative shadows deepen");

// auto white balance neutralizes a color cast
const bluish = new Uint8ClampedArray(4 * 64);
for (let i = 0; i < 64; i++) bluish.set([100 + (i % 8) * 4, 120 + (i % 5) * 3, 160 + (i % 7) * 3, 255], i * 4);
const wb = autoWhiteBalance(bluish);
assert(wb.temperature > 10, "bluish photo -> warm it: " + JSON.stringify(wb));
const fixed = applyAdjustments(bluish.slice(), wb);
const avg = (d, o) => { let s = 0; for (let i = o; i < d.length; i += 4) s += d[i]; return s / (d.length / 4); };
assert(Math.abs(avg(fixed, 0) - avg(fixed, 2)) < Math.abs(avg(bluish, 0) - avg(bluish, 2)) / 2, "red/blue closer after auto WB");
assert.deepEqual(autoWhiteBalance(new Uint8ClampedArray(0)), { temperature: 0, tint: 0 });

// sanitizing: junk in, safe numbers out
const clean = sanitizeAdjustments({ exposure: 99, contrast: "40", temperature: NaN, tint: -500, shadows: null, evil: 1 });
assert.deepEqual(clean, { exposure: 2, contrast: 40, temperature: 0, tint: -100, shadows: 0 });

// speed: a 2-megapixel image should take well under a second
const big = new Uint8ClampedArray(1600 * 1250 * 4).fill(120);
const t0 = performance.now();
applyAdjustments(big, { exposure: 0.4, contrast: 20, temperature: 15, tint: -5, shadows: 40 });
const ms = performance.now() - t0;
assert(ms < 1000, "2MP adjust took " + ms.toFixed(0) + "ms");
console.log("image-adjust tests OK (2MP in " + ms.toFixed(0) + "ms)");
