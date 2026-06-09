import { NextResponse } from "next/server";
import { db, auth } from "@/lib/firebase-admin";
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const body = await request.json();
    const { name, type, starred } = body;

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split("Bearer ")[1];
    await auth.verifyIdToken(token!);

    const collection = type === 'folder' ? "folders" : "files";

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (starred !== undefined) updateData.starred = starred;
    if (name !== undefined || starred !== undefined) updateData.updatedAt = new Date();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.collection(collection).doc(id).update(updateData);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const { type } = await request.json();
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split("Bearer ")[1];
    await auth.verifyIdToken(token!);

    const collection = type === 'folder' ? "folders" : "files";
    await db.collection(collection).doc(id).update({ trashed: true, deletedAt: new Date() });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
