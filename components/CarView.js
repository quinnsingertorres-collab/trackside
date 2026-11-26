"use client";

import Link from "next/link";
import { useState } from "react";
import { LINE_BY_KEY } from "@/lib/lines";
import { usePhotos } from "@/lib/PhotosContext";
import Lightbox from "@/components/Lightbox";
import PhotoEditor from "@/components/PhotoEditor";

export default function CarView({ car }) {
  const l = LINE_BY_KEY[car.line];
  const { photosByCar, openUpload, removeLocalPhoto, updateLocalPhoto, showToast } = usePhotos();
  const photos = photosByCar.get(car.id) || [];
  const [lbIndex, setLbIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(null); // the photo being edited, or null
  const [reverting, setReverting] = useState(false);
  const delivering = car.status === "delivering";

  async function handleDelete() {
    const photo = photos[lbIndex];
    if (!photo) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        showToast("Couldn't remove that photo — try again.");
        setDeleting(false);
        return;
      }
      removeLocalPhoto(photo.id);
      showToast("Photo removed");
      setLbIndex(null);
    } catch {
      showToast("Couldn't remove that photo — try again.");
    }
    setDeleting(false);
  }

  async function saveEdit(blob, edits) {
    const form = new FormData();
    form.set("file", blob, "photo.jpg");
    form.set("edits", JSON.stringify(edits));
    const res = await fetch(`/api/photos/${editing.id}`, { method: "PUT", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Couldn't save that edit — try again.");
    updateLocalPhoto(data.photo);
    setEditing(null);
    showToast("Edit saved");
  }

  async function revertEdit() {
    if (!editing || reverting) return;
    setReverting(true);
    try {
      const form = new FormData();
      form.set("revert", "1");
      const res = await fetch(`/api/photos/${editing.id}`, { method: "PUT", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.message || "Couldn't revert — try again.");
      } else {
        updateLocalPhoto(data.photo);
        setEditing(null);
        showToast("Reverted to the original");
      }
    } catch {
      showToast("Couldn't revert — try again.");
    }
    setReverting(false);
  }

  return (
    <>
      <div className="breadcrumb">
        <Link href="/">Trackside</Link> / <Link href={`/line/${car.line}`}>{l.name}</Link> / {car.numberDisplay}
      </div>
      <div className="car-head">
        <div className="car-num-big" style={{ borderColor: l.hex, color: l.hex }}>{car.numberDisplay}</div>
        <div>
          <div className="car-meta-list">
            <span><b>{l.name}</b></span>
            <span>{car.series}</span>
            <span>{car.manufacturer}</span>
            <span>Built {car.year}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span
              className="status-badge"
              style={{
                background: delivering ? "var(--rail-soft)" : l.tint,
                color: delivering ? "var(--ink-soft)" : l.hex,
              }}
            >
              {delivering ? "Delivering" : "Active"}
            </span>
          </div>
        </div>
        <button className="add-btn" style={{ marginLeft: "auto", background: l.hex }} onClick={() => openUpload(car)}>
          + Add photo
        </button>
      </div>

      {photos.length === 0 ? (
        <div className="empty-state">
          <h3>No photos of {car.numberDisplay} yet</h3>
          <p>Be the first to log this car.</p>
          <button className="add-btn" onClick={() => openUpload(car)}>+ Add photo</button>
        </div>
      ) : (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <div className="photo-card" key={p.id} onClick={() => setLbIndex(i)}>
              <div className="ph-img"><img src={p.url} alt={p.caption || ""} loading="lazy" /></div>
              <div className="ph-info">
                <div className="cap">{p.caption || "Untitled"}</div>
                <div className="sub">{[p.photographer, p.location, p.date].filter(Boolean).join(" · ") || "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lbIndex !== null && (
        <Lightbox
          photos={photos}
          index={lbIndex}
          onIndexChange={setLbIndex}
          onClose={() => setLbIndex(null)}
          canDelete
          onDelete={handleDelete}
          deleting={deleting}
          canEdit
          onEdit={() => setEditing(photos[lbIndex])}
          paused={!!editing}
        />
      )}

      {editing && (
        <PhotoEditor
          key={editing.id}
          src={`/api/photos/${editing.id}/image?original=1`}
          initial={editing.edits}
          title={`Edit photo — ${car.numberDisplay}`}
          applyLabel="Save edit"
          onApply={saveEdit}
          onCancel={() => setEditing(null)}
          extra={
            editing.originalPath ? (
              <button type="button" className="btn-ghost" onClick={revertEdit} disabled={reverting}>
                {reverting ? "Reverting…" : "Revert to original"}
              </button>
            ) : null
          }
        />
      )}
    </>
  );
}
