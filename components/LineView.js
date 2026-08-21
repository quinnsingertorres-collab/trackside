"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LINE_BY_KEY } from "@/lib/lines";
import { carsForLine } from "@/lib/roster";
import { usePhotos } from "@/lib/PhotosContext";

function CarChip({ c, l, photosByCar }) {
  const arr = photosByCar.get(c.id);
  const count = arr ? arr.length : 0;
  const cover = arr && arr[0];
  const delivering = c.status === "delivering";
  return (
    <Link className="car-chip" href={`/car/${c.id}`}>
      <div className="thumb">
        {cover ? (
          <img src={cover.url} alt="" loading="lazy" />
        ) : (
          <div className="noshot">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
              <circle cx="12" cy="13" r="3.4" />
            </svg>
          </div>
        )}
        {count > 0 && <span className="count">{count}</span>}
      </div>
      <div className="num">
        <span>{c.numberDisplay}</span>
        <span className="status-dot" style={{ background: delivering ? "var(--ink-faint)" : l.hex }} />
      </div>
    </Link>
  );
}

export default function LineView({ lineKey }) {
  const l = LINE_BY_KEY[lineKey];
  const { photosByCar } = usePhotos();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("number");

  const allCars = useMemo(() => carsForLine(lineKey), [lineKey]);

  const cars = useMemo(() => {
    let list = allCars;
    if (status !== "all") list = list.filter((c) => c.status === status);
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (c) =>
          c.numberDisplay.toLowerCase().includes(query) ||
          c.series.toLowerCase().includes(query) ||
          c.manufacturer.toLowerCase().includes(query)
      );
    }
    if (sort === "photos") list = [...list].sort((a, b) => (photosByCar.get(b.id)?.length || 0) - (photosByCar.get(a.id)?.length || 0));
    else if (sort === "unphotographed") list = [...list].sort((a, b) => (photosByCar.get(a.id)?.length || 0) - (photosByCar.get(b.id)?.length || 0));
    else list = [...list].sort((a, b) => a.number - b.number);
    return list;
  }, [allCars, status, q, sort, photosByCar]);

  if (!l) return null;

  const showGrouped = sort !== "photos" && sort !== "unphotographed";

  let body;
  if (cars.length === 0) {
    body = (
      <div className="empty-state">
        <h3>No cars match</h3>
        <p>Try a different search or clear the filters.</p>
      </div>
    );
  } else if (showGrouped) {
    const groups = new Map();
    for (const c of cars) {
      if (!groups.has(c.series)) groups.set(c.series, []);
      groups.get(c.series).push(c);
    }
    body = [...groups.entries()].map(([series, list]) => (
      <div className="series-block" key={series}>
        <h4>{series} · {list[0].manufacturer}, {list[0].year}</h4>
        <div className="car-grid">
          {list.map((c) => <CarChip key={c.id} c={c} l={l} photosByCar={photosByCar} />)}
        </div>
      </div>
    ));
  } else {
    body = (
      <div className="car-grid">
        {cars.map((c) => <CarChip key={c.id} c={c} l={l} photosByCar={photosByCar} />)}
      </div>
    );
  }

  return (
    <>
      <div className="breadcrumb"><Link href="/">Trackside</Link> / {l.name}</div>
      <div className="line-banner" style={{ background: l.hex }}>
        <h1>{l.name}</h1>
        <div className="meta">{allCars.length} cars in the roster · {new Set(allCars.map((c) => c.series)).size} series</div>
      </div>
      <div className="toolbar">
        <input type="text" placeholder="Search by car number, series, or manufacturer" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chip-group">
          <span className="chip" data-active={status === "all"} onClick={() => setStatus("all")}>All</span>
          <span className="chip" data-active={status === "active"} onClick={() => setStatus("active")}>Active</span>
          <span className="chip" data-active={status === "delivering"} onClick={() => setStatus("delivering")}>Delivering</span>
        </div>
        <select className="sortsel" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="number">Sort: car number</option>
          <option value="photos">Sort: most photographed</option>
          <option value="unphotographed">Sort: not yet photographed</option>
        </select>
      </div>
      <div>{body}</div>
    </>
  );
}
