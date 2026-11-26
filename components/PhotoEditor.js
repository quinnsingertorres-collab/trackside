"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyAdjustments,
  autoWhiteBalance,
  DEFAULT_ADJUSTMENTS,
  isNeutral,
  sanitizeAdjustments,
} from "@/lib/image-adjust.mjs";

const PREVIEW_MAX = 1000; // longest side of the live preview
const OUTPUT_MAX = 1600; // longest side of the saved result (same cap as uploads)

const SLIDERS = [
  { key: "exposure", label: "Exposure", min: -2, max: 2, step: 0.05, format: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} EV` },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
  { key: "temperature", label: "Temperature", hint: "cooler ← → warmer", min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
  { key: "tint", label: "Tint", hint: "greener ← → magenta", min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, format: (v) => `${v > 0 ? "+" : ""}${Math.round(v)}` },
];

function fit(width, height, max) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/**
 * Basic photo editor: exposure, contrast, white balance (temperature + tint), shadows.
 *  src       image URL (blob: or same-origin) to edit
 *  initial   slider values to start from (e.g. the ones saved with an earlier edit)
 *  onApply   async (blob, adjustments) => void — called with the rendered JPEG
 *  onCancel  close without saving
 *  extra     optional extra buttons for the footer (e.g. "Revert to original")
 */
export default function PhotoEditor({ src, initial, title = "Edit photo", applyLabel = "Apply", extra, onApply, onCancel }) {
  const [adj, setAdj] = useState(() => sanitizeAdjustments(initial));
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [showBefore, setShowBefore] = useState(false);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const baseRef = useRef(null); // ImageData of the downscaled original
  const frameRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const { w, h } = fit(img.naturalWidth, img.naturalHeight, PREVIEW_MAX);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      baseRef.current = ctx.getImageData(0, 0, w, h);
      setLoaded(true);
    };
    img.onerror = () => {
      if (!cancelled) setError("Couldn't load that photo.");
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Redraw the preview whenever a slider moves (one redraw per animation frame).
  useEffect(() => {
    if (!loaded) return undefined;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const base = baseRef.current;
      if (!canvas || !base) return;
      if (canvas.width !== base.width || canvas.height !== base.height) {
        canvas.width = base.width;
        canvas.height = base.height;
      }
      const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
      if (!showBefore) applyAdjustments(out.data, adj);
      canvas.getContext("2d").putImageData(out, 0, 0);
    });
    return () => cancelAnimationFrame(frameRef.current);
  }, [loaded, adj, showBefore]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !working) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, working]);

  function setValue(key, value) {
    setAdj((a) => ({ ...a, [key]: Number(value) }));
  }

  function autoWB() {
    if (!baseRef.current) return;
    const { temperature, tint } = autoWhiteBalance(baseRef.current.data);
    setAdj((a) => ({ ...a, temperature, tint }));
  }

  async function apply() {
    const img = imgRef.current;
    if (!img || working) return;
    setWorking(true);
    setError("");
    try {
      const { w, h } = fit(img.naturalWidth, img.naturalHeight, OUTPUT_MAX);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      applyAdjustments(data.data, adj);
      ctx.putImageData(data, 0, 0);
      const blob = await new Promise((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that photo."))), "image/jpeg", 0.9)
      );
      await onApply(blob, adj);
    } catch (err) {
      setError((err && err.message) || "Couldn't save that edit.");
      setWorking(false);
    }
  }

  return (
    <div className="ed-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !working) onCancel(); }}>
      <div className="ed-panel" role="dialog" aria-label={title}>
        <div className="ed-stage">
          {!loaded && !error && <div className="ed-msg">Loading photo…</div>}
          {error && !loaded && <div className="ed-msg err">{error}</div>}
          <canvas ref={canvasRef} className="ed-canvas" style={{ display: loaded ? "block" : "none" }} />
        </div>
        <div className="ed-controls">
          <div className="ed-head">
            <h3>{title}</h3>
            <button type="button" className="modal-close" onClick={onCancel} disabled={working} aria-label="Close">&times;</button>
          </div>

          {SLIDERS.map((s) => (
            <div className="ed-row" key={s.key}>
              <div className="ed-label">
                <span onDoubleClick={() => setValue(s.key, 0)} title="Double-click to reset">{s.label}</span>
                <output>{s.format(adj[s.key])}</output>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={adj[s.key]}
                disabled={!loaded || working}
                onChange={(e) => setValue(s.key, e.target.value)}
                onDoubleClick={() => setValue(s.key, 0)}
                aria-label={s.label}
              />
              {s.hint && <div className="ed-hint">{s.hint}</div>}
            </div>
          ))}

          <div className="ed-tools">
            <button type="button" className="btn-ghost" disabled={!loaded || working} onClick={autoWB}>Auto white balance</button>
            <button type="button" className="btn-ghost" disabled={working || isNeutral(adj)} onClick={() => setAdj({ ...DEFAULT_ADJUSTMENTS })}>Reset</button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!loaded || working}
              onPointerDown={() => setShowBefore(true)}
              onPointerUp={() => setShowBefore(false)}
              onPointerLeave={() => setShowBefore(false)}
              onPointerCancel={() => setShowBefore(false)}
            >
              Hold to compare
            </button>
          </div>

          {error && loaded && <div className="modal-msg err">{error}</div>}
          {extra}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onCancel} disabled={working}>Cancel</button>
            <button type="button" className="btn-primary" onClick={apply} disabled={!loaded || working || isNeutral(adj)}>
              {working ? "Saving…" : applyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
