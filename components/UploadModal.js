"use client";

import { useEffect, useRef, useState } from "react";
import { ROSTER } from "@/lib/roster";
import { LINE_BY_KEY } from "@/lib/lines";
import { compressImage } from "@/lib/image";
import { usePhotos } from "@/lib/PhotosContext";

const MAX_ITEMS = 20;

/** Best-effort AI read of the car number in a photo. Never throws —
 * callers just get back { number: null, matches: [] } on any failure. */
async function detectCarNumber(file) {
  try {
    const { blob } = await compressImage(file, 1200, 0.75);
    const form = new FormData();
    form.set("file", blob, "photo.jpg");
    const res = await fetch("/api/detect-car-number", { method: "POST", body: form });
    if (!res.ok) return { number: null, matches: [] };
    const data = await res.json().catch(() => ({}));
    return { number: data.number || null, matches: Array.isArray(data.matches) ? data.matches : [] };
  } catch {
    return { number: null, matches: [] };
  }
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** One row in the multi-photo queue: a thumbnail plus (when the car isn't
 * already fixed for the whole batch) its own car search + AI suggestion. */
function QueueRow({ item, locked, onRemove, onQueryChange, onPick }) {
  const q = item.carQuery.trim().toLowerCase();
  const matches = !locked && q
    ? ROSTER.filter((c) => c.numberDisplay.toLowerCase().includes(q) || c.series.toLowerCase().includes(q)).slice(0, 6)
    : [];

  return (
    <div className={`queue-row${item.status === "done" ? " done" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="queue-thumb" src={item.previewUrl} alt="" />
      <div className="queue-main">
        <div className="queue-top">
          {!locked &&
            (item.chosenCar ? (
              <span className="mono" style={{ fontSize: 13 }}>
                {item.chosenCar.numberDisplay} — {LINE_BY_KEY[item.chosenCar.line].name}{" "}
                <button
                  type="button"
                  className="queue-remove"
                  style={{ fontSize: 11.5, fontFamily: "var(--font-body)" }}
                  onClick={() => onPick(item.id, null)}
                >
                  change
                </button>
              </span>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Pick a car…</span>
            ))}
          {item.status !== "uploading" && (
            <button type="button" className="queue-remove" onClick={() => onRemove(item.id)} aria-label="Remove photo">
              &times;
            </button>
          )}
        </div>

        {!locked && !item.chosenCar && (
          <>
            <input
              type="text"
              placeholder="Search car number"
              value={item.carQuery}
              onChange={(e) => onQueryChange(item.id, e.target.value)}
            />
            {matches.length > 0 && (
              <div className="typeahead-results" style={{ marginTop: 4 }}>
                {matches.map((c) => (
                  <div key={c.id} onClick={() => onPick(item.id, c)}>
                    {c.numberDisplay} · {LINE_BY_KEY[c.line].name} · {c.series}
                  </div>
                ))}
              </div>
            )}
            {item.detecting && <div className="queue-status">Reading car number…</div>}
            {!item.detecting && item.suggestion && item.suggestion.matches.length > 0 && (
              <div className="queue-suggest">
                <span style={{ color: "var(--ink-faint)" }}>Looks like</span>
                {item.suggestion.matches.map((c) => (
                  <button key={c.id} type="button" className="btn-ghost" onClick={() => onPick(item.id, c)}>
                    {c.numberDisplay} · {LINE_BY_KEY[c.line].name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {item.status === "error" && <div className="queue-status err">{item.error || "Couldn't save this one."}</div>}
        {item.status === "uploading" && <div className="queue-status">Saving…</div>}
        {item.status === "done" && <div className="queue-status ok">Added</div>}
      </div>
    </div>
  );
}

export default function UploadModal() {
  const { uploadTarget, closeUpload, addLocalPhoto, showToast } = usePhotos();
  const open = uploadTarget !== undefined;
  const prefilledCar = uploadTarget || null;

  const [items, setItems] = useState([]);
  const [photographer, setPhotographer] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const itemsRef = useRef(items);
  const addFilesRef = useRef(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    // Reset the form each time the modal opens (possibly for a different
    // car), releasing any preview URLs left over from the last session.
    itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setPhotographer("");
    setLocation("");
    setDate("");
    setMsg(null);
    setSaving(false);
  }, [open, uploadTarget]);

  // Let people paste one or more copied/screenshotted images (Cmd/Ctrl+V)
  // straight into the form, anywhere in the modal.
  useEffect(() => {
    if (!open) return;
    function onPaste(e) {
      const clip = e.clipboardData && e.clipboardData.items;
      if (!clip) return;
      const files = [];
      for (const it of clip) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFilesRef.current && addFilesRef.current(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  // Keep the paste listener's callback current without re-subscribing it.
  useEffect(() => {
    addFilesRef.current = addFiles;
  });

  if (!open) return null;

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!incoming.length) {
      setMsg({ text: "That doesn't look like an image file.", err: true });
      return;
    }
    const room = MAX_ITEMS - itemsRef.current.length;
    const accepted = incoming.slice(0, Math.max(room, 0));
    if (accepted.length < incoming.length) {
      setMsg({ text: `Photos added, but a batch tops out at ${MAX_ITEMS} — the rest were skipped.`, err: true });
    } else {
      setMsg(null);
    }
    if (!accepted.length) return;

    const newItems = accepted.map((f) => ({
      id: newId(),
      file: f,
      previewUrl: URL.createObjectURL(f),
      carQuery: "",
      chosenCar: prefilledCar,
      detecting: false,
      suggestion: null,
      status: "idle",
      error: null,
    }));
    setItems((prev) => [...prev, ...newItems]);

    if (!prefilledCar) {
      newItems.forEach((it) => {
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, detecting: true } : p)));
        detectCarNumber(it.file).then((result) => {
          setItems((prev) =>
            prev.map((p) => (p.id === it.id ? { ...p, detecting: false, suggestion: result.matches.length ? result : null } : p))
          );
        });
      });
    }
  }

  function removeItem(id) {
    setItems((prev) => {
      const it = prev.find((p) => p.id === id);
      if (it && it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function updateItemQuery(id, q) {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, carQuery: q } : p)));
  }

  function pickItemCar(id, car) {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, chosenCar: car, carQuery: "", suggestion: car ? null : p.suggestion } : p))
    );
  }

  function closeAndReset() {
    itemsRef.current.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
    closeUpload();
  }

  const pendingItems = items.filter((it) => it.status !== "done");
  const disabled =
    saving || pendingItems.length === 0 || (!prefilledCar && pendingItems.some((it) => !it.chosenCar));

  async function submit() {
    if (disabled) return;
    setSaving(true);
    setMsg(null);

    let successCount = 0;
    for (const it of pendingItems) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: "uploading", error: null } : p)));
      try {
        const { blob } = await compressImage(it.file, 1600, 0.82);
        if (blob.size > 6.5 * 1024 * 1024) {
          throw { message: "That photo is too large even after compression — try a smaller image." };
        }
        const form = new FormData();
        form.set("carId", it.chosenCar.id);
        form.set("file", blob, "photo.jpg");
        form.set("photographer", photographer.trim());
        form.set("location", location.trim());
        form.set("date", date);

        const res = await fetch("/api/photos", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw { message: data.message || "Something went wrong saving that photo." };

        addLocalPhoto(data.photo);
        successCount += 1;
        setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: "done" } : p)));
      } catch (err) {
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id ? { ...p, status: "error", error: (err && err.message) || "Something went wrong." } : p
          )
        );
      }
    }

    setSaving(false);
    const remaining = pendingItems.length - successCount;
    if (remaining === 0) {
      if (pendingItems.length === 1) {
        const it = pendingItems[0];
        showToast(`Photo added to ${LINE_BY_KEY[it.chosenCar.line].name} ${it.chosenCar.numberDisplay}`);
      } else {
        showToast(`${successCount} photos added.`);
      }
      closeAndReset();
    } else {
      setMsg({
        text: `${successCount} of ${pendingItems.length} saved. Fix the ones below and try again.`,
        err: true,
      });
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAndReset();
      }}
    >
      <div className={`modal${items.length > 1 ? " multi" : ""}`}>
        <div className="modal-head">
          <h3>Add photos</h3>
          <button className="modal-close" onClick={closeAndReset}>&times;</button>
        </div>
        <div className="modal-body">
          {prefilledCar && (
            <div className="field">
              <label>Car</label>
              <div className="mono" style={{ fontSize: 15 }}>
                {prefilledCar.numberDisplay}{" "}
                <span style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                  — {LINE_BY_KEY[prefilledCar.line].name}, {prefilledCar.series}
                </span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Photos</label>
            <div
              className={`dropzone${drag ? " drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {items.length > 0
                ? "Add more, drag more in, or paste (⌘V)"
                : "Click to choose photos, drag them here, or paste (⌘V) — add as many as you like"}
            </div>

            {!prefilledCar && items.length > 1 && (
              <div style={{ fontSize: 12.5, color: "var(--ink-faint)", marginTop: 6 }}>
                Pick (or confirm) a car for each photo below.
              </div>
            )}

            {items.length > 0 && (
              <div className="queue">
                {items.map((it) => (
                  <QueueRow
                    key={it.id}
                    item={it}
                    locked={!!prefilledCar}
                    onRemove={removeItem}
                    onQueryChange={updateItemQuery}
                    onPick={pickItemCar}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="f-photographer">Photographer</label>
            <input
              id="f-photographer"
              type="text"
              placeholder="Your name or handle"
              value={photographer}
              onChange={(e) => setPhotographer(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="f-location">Location</label>
              <input
                id="f-location"
                type="text"
                placeholder="Station or line segment"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="f-date">Date taken</label>
              <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {items.length > 1 && (
            <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>
              Photographer, location, and date apply to every photo in this batch.
            </div>
          )}

          {msg && <div className={`modal-msg ${msg.err ? "err" : "ok"}`}>{msg.text}</div>}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={closeAndReset}>Cancel</button>
            <button className="btn-primary" disabled={disabled} onClick={submit}>
              {saving ? "Saving…" : pendingItems.length > 1 ? `Add ${pendingItems.length} photos` : "Add photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
