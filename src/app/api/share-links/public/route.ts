import { NextResponse } from "next/server";
import { resolvePublicLink, listPublicFolderContents } from "@/lib/sharing";

/** GET /api/share-links/public?token=xxx */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const link = await resolvePublicLink(token);
    if (!link) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

    // Si es carpeta, listar contenido
    if (link.resourceType === "folder") {
      const contents = await listPublicFolderContents(link.resourceId);
      return NextResponse.json({ link, ...contents });
    }

    return NextResponse.json({ link });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
