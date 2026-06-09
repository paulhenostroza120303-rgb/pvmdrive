import { NextResponse } from "next/server";
import { buildFileDownloadResponse } from "@/lib/storage-server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  try {
    const download = await buildFileDownloadResponse(id);
    if (!download) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(download.stream, {
      headers: {
        "Content-Type": download.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(download.fileName)}"`,
      },
    });
  } catch (error) {
    console.error("Backend Error en GET:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
