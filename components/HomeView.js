"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LINES } from "@/lib/lines";
import { ROSTER, carsForLine } from "@/lib/roster";
import { usePhotos } from "@/lib/PhotosContext";
import { timeAgo } from "@/lib/image";

export default function HomeView() {
  const { photos, photosByCar, openUpload } = usePhotos();
  const router = useRouter();

  const totalCars = ROSTER.length;
  const totalPhotos = photos.length;
  const photographedCars = photosByCar.size;

  return (
    <>
      <div className="intro">
        <h1>The MBTA fleet, car by car.</h1>
        <p>
          Trackside is a spotting log for the Red, Orange, Blue, and Green Line fleets — every active car has a page
          here. Attach your photos to the exact car you shot, and browse what everyone else has caught.
        </p>
        <div className="stat-row">
          <div className="stat"><b className="mono">{totalCars}</b><span>Cars in roster</span></div>
          <div className="stat"><b className="mono">{totalPhotos}</b><span>Photos logged</span></div>
          <div className="stat"><b className="mono">{photographedCars}</b><span>Cars photographed</span></div>
        </div>
      </div>

      <div className="line-grid">
        {LINES.map((l) => {
          const cars = carsForLine(l.key);
          const shot = cars.filter((c) => photosByCar.has(c.id)).length;
          const pct = cars.length ? Math.round((shot / cars.length) * 100) : 0;
          const thumbs = [];
          for (const c of cars) {
            const arr = photosByCar.get(c.id);
            if (arr && arr[0]) thumbs.push(arr[0]);
            if (thumbs.length >= 4) break;
          }
          return (
            <Link key={l.key} className="line-card" href={`/line/${l.key}`}>
              <span className="bar" style={{ background: l.hex }} />
              <h3 style={{ color: l.hex }}>{l.name}</h3>
              <div className="meta">{cars.length} cars in roster</div>
              <div className="progress"><i style={{ width: `${pct}%`, background: l.hex }} /></div>
              <div className="foot"><span>{shot} of {cars.length} photographed</span><span>{pct}%</span></div>
              {thumbs.length > 0 && (
                <div className="thumbs">
                  {thumbs.map((t) => <img key={t.id} src={t.url} alt="" loading="lazy" />)}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="section-head">
        <h2>Recently added</h2>
        <span className="sub">Latest uploads across all four lines</span>
      </div>

      {photos.length === 0 ? (
        <div className="empty-state">
          <h3>No photos yet</h3>
          <p>Trackside starts empty. Add the first shot from the roster and it&apos;ll show up here for everyone you&apos;ve invited.</p>
          <button className="add-btn" onClick={() => openUpload()}>+ Add the first photo</button>
        </div>
      ) : (
        <div className="feed-grid">
          {photos.slice(0, 12).map((p) => {
            const l = LINES.find((x) => x.key === p.line);
            return (
              <div key={p.id} className="feed-tile" onClick={() => router.push(`/car/${p.carId}`)}>
                <img src={p.url} alt={p.caption || ""} loading="lazy" />
                <span className="badge" style={{ background: l.hex }}>
                  {p.line === "Blue" ? String(p.number).padStart(4, "0") : p.number}
                </span>
                <span className="when">{timeAgo(p.uploadedAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
