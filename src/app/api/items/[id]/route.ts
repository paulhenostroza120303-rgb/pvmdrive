import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { buildFileDownloadResponse, softDeleteItem } from "@/lib/storage-server";
import { canAccessFile, canEditFolder } from "@/lib/sharing";
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = (await params).id;
    const body = await request.json();
    const { name, type, starred, folderId } = body;

    if (type === "file") {
      const allowed = await canAccessFile(user.uid, user.email, id, "edit");
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const allowed = await canEditFolder(user.uid, user.email, id);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const collection = type === "folder" ? "folders" : "files";
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData.name = name;
      if (type === "file") updateData.originalName = name;
    }
    if (starred !== undefined) updateData.starred = starred;
    if (folderId !== undefined) {
      // Mover archivo/carpeta a otra carpeta
      updateData[type === "folder" ? "parentId" : "folderId"] = folderId || null;
    }
    if (Object.keys(updateData).length > 0) updateData.updatedAt = new Date();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await db.collection(collection).doc(id).update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Backend Error en PATCH:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = (await params).id;
    const { type } = await request.json();

    if (type === "file") {
      const allowed = await canAccessFile(user.uid, user.email, id, "edit");
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      const allowed = await canEditFolder(user.uid, user.email, id);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await softDeleteItem(id, type);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Backend Error en DELETE:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
