"use client";

import { useEffect } from "react";
import { timeAgo } from "@/lib/image";

export default function Lightbox({ photos, index, onIndexChange, onClose, canDelete, onDelete, deleting, canEdit, onEdit, paused }) {
  const p = photos[index];

  useEffect(() => {
    if (paused) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && photos.length > 1) onIndexChange((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight" && photos.length > 1) onIndexChange((index + 1) % photos.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, photos.length, onClose, onIndexChange, paused]);

  if (!p) return null;

  return (
    <div className="lb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lb-close" onClick={onClose}>&times;</button>
      {canDelete && (
        <button className="lb-del" onClick={onDelete} disabled={deleting}>
          {deleting ? "Removing…" : "Remove photo"}
        </button>
      )}
      {canEdit && (
        <button className="lb-edit" onClick={onEdit}>Edit photo</button>
      )}
      {photos.length > 1 && (
        <>
          <button className="lb-nav prev" onClick={() => onIndexChange((index - 1 + photos.length) % photos.length)}>&larr;</button>
          <button className="lb-nav next" onClick={() => onIndexChange((index + 1) % photos.length)}>&rarr;</button>
        </>
      )}
      <div className="lb-inner">
        <img src={p.url} alt={p.caption || ""} />
        <div className="lb-caption">
          <div className="cap">{p.caption || "Untitled"}</div>
          <div className="sub">
            {[p.photographer, p.location, p.date].filter(Boolean).join(" · ") || timeAgo(p.uploadedAt)}
            {p.edits ? " · edited" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
