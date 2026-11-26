import { put, list, del, head, BlobNotFoundError } from "@vercel/blob";

const INDEX_PATH = "data/photos-index.json";
const MAX_RETRIES = 3;

async function readIndexWithEtag() {
  try {
    const info = await head(INDEX_PATH);
    const res = await fetch(info.url, { cache: "no-store" });
    if (!res.ok) return { photos: [], etag: null };
    const data = await res.json();
    return { photos: Array.isArray(data) ? data : [], etag: info.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { photos: [], etag: null };
    // Some environments surface a 404 as a generic error rather than BlobNotFoundError.
    return { photos: [], etag: null };
  }
}

/** Public read: the full photo index, newest first. */
export async function readPhotos() {
  const { photos } = await readIndexWithEtag();
  return photos;
}

async function writeIndex(photos, etag) {
  return put(INDEX_PATH, JSON.stringify(photos), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

/**
 * Apply `mutate(photos) -> photos` to the index with optimistic-concurrency
 * retries (etag compare-and-set). Small, low-traffic app, so a few retries
 * is plenty rather than a full queue/lock.
 */
async function updateIndex(mutate) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { photos, etag } = await readIndexWithEtag();
    const next = mutate(photos);
    try {
      await writeIndex(next, etag);
      return next;
    } catch (err) {
      lastErr = err;
      // Precondition failed (someone else wrote first) -> loop and retry.
    }
  }
  throw lastErr || new Error("Could not save — too much concurrent activity, try again.");
}

/** Add a new photo: uploads the image blob, then records it in the index. */
export async function addPhoto({ entry, buffer, contentType }) {
  const blob = await put(entry.path, buffer, {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  const full = { ...entry, url: blob.url };
  await updateIndex((photos) => [full, ...photos]);
  return full;
}

/**
 * Replace a photo's image with an edited version. The first edit keeps the original
 * file (originalPath/originalUrl) so it can be re-edited from scratch or reverted; later
 * edits replace only the previous edited file. Every edit gets a new path, so the old
 * image can never be served from cache. `edits` holds the slider values used.
 */
export async function replacePhotoImage({ id, buffer, contentType, edits }) {
  const existing = (await readPhotos()).find((p) => p.id === id);
  if (!existing) return null;
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const newPath = `photos/${existing.carId}/${id}-e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const blob = await put(newPath, buffer, { access: "public", contentType, addRandomSuffix: false });

  let updated = null;
  let replacedPath = null;
  try {
    await updateIndex((photos) => {
      updated = null;
      replacedPath = null;
      return photos.map((p) => {
        if (p.id !== id) return p;
        // Already edited once: its current file is an edit, safe to delete. First edit: current file is the original.
        const hadOriginal = !!p.originalPath;
        const base = hadOriginal ? p : { ...p, originalPath: p.path, originalUrl: p.url };
        replacedPath = hadOriginal ? p.path : null;
        updated = { ...base, path: newPath, url: blob.url, edits, editedAt: new Date().toISOString() };
        return updated;
      });
    });
  } catch (err) {
    try { await del(newPath); } catch {}
    throw err;
  }
  if (!updated) {
    try { await del(newPath); } catch {}
    return null;
  }
  if (replacedPath && replacedPath !== newPath) {
    try { await del(replacedPath); } catch {}
  }
  return updated;
}

/** Put a photo back to its original image and drop the edited file. */
export async function revertPhoto(id) {
  let reverted = null;
  let editedPath = null;
  await updateIndex((photos) => {
    reverted = null;
    editedPath = null;
    return photos.map((p) => {
      if (p.id !== id || !p.originalPath) return p;
      editedPath = p.path;
      const { originalPath, originalUrl, edits, editedAt, ...rest } = p;
      reverted = { ...rest, path: originalPath, url: originalUrl };
      return reverted;
    });
  });
  if (editedPath) {
    try { await del(editedPath); } catch {}
  }
  return reverted;
}

/** Remove a photo by id: drops it from the index and deletes its blob(s), including the pre-edit original. */
export async function deletePhotoById(id) {
  let removed = null;
  await updateIndex((photos) => {
    removed = photos.find((p) => p.id === id) || null;
    return photos.filter((p) => p.id !== id);
  });
  if (removed) {
    for (const path of [removed.path, removed.originalPath].filter(Boolean)) {
      try {
        await del(path);
      } catch (err) {
        // Index is already updated; a stray blob isn't worth failing the request over.
      }
    }
  }
  return removed;
}
