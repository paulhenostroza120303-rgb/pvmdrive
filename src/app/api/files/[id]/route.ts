import { NextResponse } from "next/server";
import { buildFileDownloadResponse } from "@/lib/storage-server";
import { canAccessFile } from "@/lib/sharing";
import { contentDispositionHeader } from "@/lib/filename";
import { getAuthUser } from "@/lib/auth-utils";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allowed = await canAccessFile(user.uid, user.email, id, "view");
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
