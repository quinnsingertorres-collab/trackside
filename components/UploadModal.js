"use client";

import { useEffect, useRef, useState } from "react";
import { ROSTER } from "@/lib/roster";
import { LINE_BY_KEY } from "@/lib/lines";
import { compressImage } from "@/lib/image";
import { usePhotos } from "@/lib/PhotosContext";

const PW_KEY = "trackside_upload_password";

export default function UploadModal() {
  const { uploadTarget, closeUpload, addLocalPhoto, showToast } = usePhotos();
  const open = uploadTarget !== undefined;
  const prefilledCar = uploadTarget || null;

  const [carQuery, setCarQuery] = useState("");
  const [chosenCar, setChosenCar] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [password, setPassword] = useState("");
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Reset the form each time the modal opens for a (possibly different) car.
    setCarQuery("");
    setChosenCar(prefilledCar);
    setFile(null);
    setPreviewUrl(null);
    setCaption("");
    setPhotographer("");
    setLocation("");
    setDate("");
    setMsg(null);
    setSaving(false);
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(PW_KEY) : "";
    setPassword(stored || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploadTarget]);

  if (!open) return null;

  const carMatches = carQuery.trim()
    ? ROSTER.filter(
        (c) =>
          c.numberDisplay.toLowerCase().includes(carQuery.trim().toLowerCase()) ||
          c.series.toLowerCase().includes(carQuery.trim().toLowerCase())
      ).slice(0, 8)
    : [];

  function handleFile(f) {
    if (!f.type.startsWith("image/")) {
      setMsg({ text: "That doesn't look like an image file.", err: true });
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setMsg(null);
  }

  async function submit() {
    if (!chosenCar || !file) return;
    setSaving(true);
    setMsg(null);
    try {
      const { blob } = await compressImage(file, 1600, 0.82);
      if (blob.size > 6.5 * 1024 * 1024) {
        throw { message: "That photo is too large even after compression — try a smaller image." };
      }
      const form = new FormData();
      form.set("carId", chosenCar.id);
      form.set("file", blob, "photo.jpg");
      form.set("caption", caption.trim());
      form.set("photographer", photographer.trim());
      form.set("location", location.trim());
      form.set("date", date);

      const res = await fetch("/api/photos", {
        method: "POST",
        body: form,
        headers: password ? { "x-upload-password": password } : {},
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        if (typeof window !== "undefined") window.localStorage.removeItem(PW_KEY);
        setMsg({ text: data.message || "That upload passphrase isn't right.", err: true });
        setSaving(false);
        return;
      }
      if (!res.ok) {
        throw { message: data.message || "Something went wrong saving that photo." };
      }

      if (password && typeof window !== "undefined") window.localStorage.setItem(PW_KEY, password);
      addLocalPhoto(data.photo);
      showToast(`Photo added to ${LINE_BY_KEY[chosenCar.line].name} ${chosenCar.numberDisplay}`);
      closeUpload();
    } catch (err) {
      setMsg({ text: (err && err.message) || "Something went wrong saving that photo.", err: true });
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeUpload(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Add a photo</h3>
          <button className="modal-close" onClick={closeUpload}>&times;</button>
        </div>
        <div className="modal-body">
          {prefilledCar ? (
            <div className="field">
              <label>Car</label>
              <div className="mono" style={{ fontSize: 15 }}>
                {prefilledCar.numberDisplay}{" "}
                <span style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)", fontWeight: 400 }}>
                  — {LINE_BY_KEY[prefilledCar.line].name}, {prefilledCar.series}
                </span>
              </div>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="car-typeahead">Car</label>
              <input
                id="car-typeahead"
                type="text"
                placeholder="Search car number (e.g. 1857, 0722, 3900)"
                autoComplete="off"
                value={carQuery}
                onChange={(e) => setCarQuery(e.target.value)}
              />
              {carMatches.length > 0 && (
                <div className="typeahead-results" style={{ marginTop: 4 }}>
                  {carMatches.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setChosenCar(c);
                        setCarQuery("");
                      }}
                    >
                      {c.numberDisplay} · {LINE_BY_KEY[c.line].name} · {c.series}
                    </div>
                  ))}
                </div>
              )}
              {chosenCar && (
                <div className="mono" style={{ fontSize: 14, marginTop: 6, color: "var(--ink-soft)" }}>
                  Selected: {chosenCar.numberDisplay} — {LINE_BY_KEY[chosenCar.line].name}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Photo</label>
            <div
              className={`dropzone${drag ? " drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
              />
              {previewUrl ? <img src={previewUrl} alt="" /> : "Click to choose a photo, or drag one here"}
            </div>
          </div>

          <div className="field">
            <label htmlFor="f-caption">Caption</label>
            <input id="f-caption" type="text" placeholder="e.g. Outbound at Davis, leading a 6-car train" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-photographer">Photographer</label>
            <input id="f-photographer" type="text" placeholder="Your name or handle" value={photographer} onChange={(e) => setPhotographer(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="f-location">Location</label>
              <input id="f-location" type="text" placeholder="Station or line segment" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="f-date">Date taken</label>
              <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="f-password">Upload passphrase</label>
            <input id="f-password" type="password" placeholder="Ask whoever invited you" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {msg && <div className={`modal-msg ${msg.err ? "err" : "ok"}`}>{msg.text}</div>}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={closeUpload}>Cancel</button>
            <button className="btn-primary" disabled={!chosenCar || !file || saving} onClick={submit}>
              {saving ? "Saving…" : "Add photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
