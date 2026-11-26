import { NextResponse } from "next/server";
import { deletePhotoById, replacePhotoImage, revertPhoto } from "@/lib/photos-store";
import { sanitizeAdjustments } from "@/lib/image-adjust.mjs";

export const runtime = "nodejs";

const MAX_BYTES = 7 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** DELETE /api/photos/:id */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const removed = await deletePhotoById(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found", message: "That photo is already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** PUT /api/photos/:id (multipart/form-data)
 *  fields: file (the edited image), edits (JSON of the slider values used)
 *  or:     revert=1 (go back to the original image)
 * Replaces the stored image; the pre-edit original is kept so it can be re-edited or reverted.
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Couldn't read that edit." }, { status: 400 });
  }

  if (form.get("revert") === "1") {
    const photo = await revertPhoto(id);
    if (!photo) {
      return NextResponse.json({ error: "nothing_to_revert", message: "That photo hasn't been edited." }, { status: 404 });
    }
    return NextResponse.json({ photo });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no_file", message: "No edited image came through." }, { status: 400 });
  }
  if (!TYPES.has(file.type)) {
    return NextResponse.json({ error: "bad_type", message: "Photos only (JPEG, PNG, or WebP)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large", message: "That edited photo is too large." }, { status: 413 });
  }
  let edits;
  try {
    edits = sanitizeAdjustments(JSON.parse(String(form.get("edits") || "{}")));
  } catch {
    edits = sanitizeAdjustments({});
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const photo = await replacePhotoImage({ id, buffer, contentType: file.type, edits });
    if (!photo) {
      return NextResponse.json({ error: "not_found", message: "That photo is gone." }, { status: 404 });
    }
    return NextResponse.json({ photo });
  } catch {
    return NextResponse.json({ error: "save_failed", message: "Couldn't save that edit — try again." }, { status: 500 });
  }
}
