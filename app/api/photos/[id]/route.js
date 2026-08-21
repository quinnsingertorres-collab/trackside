import { NextResponse } from "next/server";
import { deletePhotoById } from "@/lib/photos-store";

export const runtime = "nodejs";

/** DELETE /api/photos/:id */
export async function DELETE(request, { params }) {
  const { id } = await params;
  const removed = await deletePhotoById(id);
  if (!removed) {
    return NextResponse.json({ error: "not_found", message: "That photo is already gone." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
