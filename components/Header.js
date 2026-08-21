"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { LINES } from "@/lib/lines";
import { ROSTER } from "@/lib/roster";
import { usePhotos } from "@/lib/PhotosContext";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { openUpload } = usePhotos();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const activeLine = useMemo(() => {
    const m = pathname.match(/^\/line\/([^/]+)/) || pathname.match(/^\/car\/([^-]+)-/);
    return m ? m[1] : null;
  }, [pathname]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return ROSTER.filter((c) => c.numberDisplay.toLowerCase().includes(query)).slice(0, 8);
  }, [q]);

  return (
    <header className="top">
      <div className="top-inner" ref={boxRef}>
        <Link href="/" className="brand">
          <span className="mark">Trackside</span>
          <span className="tag">MBTA fleet photo log</span>
        </Link>
        <nav className="lines">
          {LINES.map((l) => (
            <Link
              key={l.key}
              href={`/line/${l.key}`}
              className="line-pill"
              data-active={activeLine === l.key}
              style={activeLine === l.key ? { background: l.hex, color: "#fff", borderColor: "transparent" } : undefined}
            >
              <span className="dot" style={{ background: activeLine === l.key ? "#fff" : l.hex }} />
              {l.name.replace(" Line", "")}
            </Link>
          ))}
        </nav>
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Jump to car #"
            autoComplete="off"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {open && results.length > 0 && (
            <div className="typeahead-results" style={{ position: "absolute", top: 38, width: "100%", zIndex: 20 }}>
              {results.map((c) => (
                <div
                  key={c.id}
                  onMouseDown={() => {
                    router.push(`/car/${c.id}`);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {c.numberDisplay} · {c.line} Line
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="add-btn" onClick={() => openUpload()}>
          + Add photo
        </button>
      </div>
    </header>
  );
}
