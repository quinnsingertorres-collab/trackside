"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const PhotosContext = createContext(null);

export function PhotosProvider({ children }) {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(undefined); // undefined = closed, null|car = open
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/photos", { cache: "no-store" });
      const data = await res.json();
      setPhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch {
      // leave existing state on transient failure
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Intentional fetch-on-mount to hydrate from the server; refresh()
    // itself sets state once the request resolves, not synchronously here.
      refresh();
  }, [refresh]);

  const photosByCar = useMemo(() => {
    const map = new Map();
    for (const p of photos) {
      if (!map.has(p.carId)) map.set(p.carId, []);
      map.get(p.carId).push(p);
    }
    return map;
  }, [photos]);

  const addLocalPhoto = useCallback((photo) => {
    setPhotos((prev) => [photo, ...prev]);
  }, []);

  const removeLocalPhoto = useCallback((id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const openUpload = useCallback((car) => setUploadTarget(car || null), []);
  const closeUpload = useCallback(() => setUploadTarget(undefined), []);

  const showToast = useCallback((msg) => {
    setToast({ msg, at: Date.now() });
  }, []);

  const value = {
    photos,
    photosByCar,
    loaded,
    refresh,
    addLocalPhoto,
    removeLocalPhoto,
    uploadTarget,
    openUpload,
    closeUpload,
    toast,
    showToast,
  };

  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotos() {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotos must be used inside <PhotosProvider>");
  return ctx;
}
