import { NextResponse } from "next/server";
import { readPhotos } from "@/lib/photos-store";

export const runtime = "nodejs";

/** GET /api/photos/:id/image            -> the photo's current image bytes
 *  GET /api/photos/:id/image?original=1 -> the image from before any edits (falls back to current)
 * Served from this origin so the editor can draw it on a canvas without cross-origin restrictions.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const wantOriginal = new URL(request.url).searchParams.get("original") === "1";
  const photo = (await readPhotos()).find((p) => p.id === id);
  if (!photo) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = wantOriginal && photo.originalUrl ? photo.originalUrl : photo.url;
  const upstream = await fetch(url, { cache: "no-store" });
  if (!upstream.ok) return NextResponse.json({ error: "image_unavailable" }, { status: 502 });
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "private, max-age=60",
    },
  });
}
