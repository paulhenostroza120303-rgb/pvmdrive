import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { buildFileDownloadResponse } from "@/lib/storage-server";
import { canAccessFile } from "@/lib/sharing";
import { contentDispositionHeader } from "@/lib/filename";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);

    const allowed = await canAccessFile(decoded.uid, decoded.email || "", id, "view");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const download = await buildFileDownloadResponse(id);
    if (!download) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(download.stream, {
      headers: {
        "Content-Type": download.mimeType,
        "Content-Disposition": contentDispositionHeader(download.fileName),
      },
    });
  } catch (error) {
    console.error("Backend Error en GET:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
