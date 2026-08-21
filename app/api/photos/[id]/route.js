import { NextResponse } from "next/server";
import { deletePhotoById } from "@/lib/photos-store";

export const runtime = "nodejs";

function checkPassword(request) {
  const required = process.env.UPLOAD_PASSWORD;
  if (!required) return true;
  const supplied = request.headers.get("x-upload-password") || "";
  return supplied === required;
}

/** DELETE /api/photos/:id — header: x-upload-password (when configured) */
export async function DELETE(request, { params }) {
  if (!checkPassword(request)) {
    return NextResponse.json({ error: "wrong_password", message: "That upload passphrase isn't right." }, { status: 401 });
  }
  const { id } = await params;
  const removed = await deletePhotoById(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found", message: "That photo is already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
