"use client";

import { useEffect, useState } from "react";
import { usePhotos } from "@/lib/PhotosContext";

export default function Toast() {
  const { toast } = usePhotos();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast || !visible) return null;
  return <div className="toast">{toast.msg}</div>;
}
