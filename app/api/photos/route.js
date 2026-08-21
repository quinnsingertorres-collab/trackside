import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCar } from "@/lib/roster";
import { readPhotos, addPhoto } from "@/lib/photos-store";

export const runtime = "nodejs";

const MAX_BYTES = 7 * 1024 * 1024; // server-side backstop; client compresses before sending
const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function checkPassword(request) {
  const required = process.env.UPLOAD_PASSWORD;
  if (!required) return true; // no passphrase configured -> uploads open (e.g. local dev)
  const supplied = request.headers.get("x-upload-password") || "";
  return supplied === required;
}

/** GET /api/photos            -> { photos: [...] } all photos, newest first
 *  GET /api/photos?carId=X    -> { photos: [...] } just that car's photos
 * Public and unauthenticated on purpose — this is the feed another app can read.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const carId = searchParams.get("carId");
  const photos = await readPhotos();
  const filtered = carId ? photos.filter((p) => p.carId === carId) : photos;
  return NextResponse.json(
    { photos: filtered },
    { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } }
  );
}

/** POST /api/photos (multipart/form-data)
 * fields: carId, file, caption?, photographer?, location?, date?
 * header: x-upload-password (when UPLOAD_PASSWORD is configured)
 */
export async function POST(request) {
  if (!checkPassword(request)) {
    return NextResponse.json({ error: "wrong_password", message: "That upload passphrase isn't right." }, { status: 401 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Couldn't read that upload." }, { status: 400 });
  }

  const carId = form.get("carId");
  const file = form.get("file");
  const caption = String(form.get("caption") || "").slice(0, 300);
  const photographer = String(form.get("photographer") || "").slice(0, 120);
  const location = String(form.get("location") || "").slice(0, 120);
  const date = String(form.get("date") || "").slice(0, 20);

  if (!carId || typeof carId !== "string" || !getCar(carId)) {
    return NextResponse.json({ error: "bad_car", message: "That car isn't in the roster." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no_file", message: "Attach a photo first." }, { status: 400 });
  }
  if (!EXT_BY_TYPE[file.type]) {
    return NextResponse.json({ error: "bad_type", message: "Photos only (JPEG, PNG, or WebP)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "That photo is too large — try a smaller one." }, { status: 413 });
  }

  const car = getCar(carId);
  const id = randomUUID();
  const ext = EXT_BY_TYPE[file.type];
  const path = `photos/${car.id}/${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const entry = {
    id,
    carId: car.id,
    line: car.line,
    number: car.number,
    path,
    caption,
    photographer,
    location,
    date,
    uploadedAt: new Date().toISOString(),
  };

  try {
    const saved = await addPhoto({ entry, buffer, contentType: file.type });
    return NextResponse.json({ photo: saved }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "save_failed", message: "Couldn't save that photo — try again." }, { status: 500 });
  }
}
