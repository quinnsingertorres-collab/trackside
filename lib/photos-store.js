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

/** Remove a photo by id: drops it from the index and deletes its blob. */
export async function deletePhotoById(id) {
  let removed = null;
  await updateIndex((photos) => {
    removed = photos.find((p) => p.id === id) || null;
    return photos.filter((p) => p.id !== id);
  });
  if (removed) {
    try {
      await del(removed.path);
    } catch (err) {
      // Index is already updated; a stray blob isn't worth failing the request over.
    }
  }
  return removed;
}
