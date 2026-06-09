import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { canEditFolder, getFolderDoc } from "@/lib/sharing";
import { db } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, parentId } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "El nombre de la carpeta es requerido" }, { status: 400 });
    }

    // Verificar permisos si se especifica parentId
    if (parentId) {
      const parentFolder = await getFolderDoc(parentId);
      if (!parentFolder || parentFolder.trashed) {
        return NextResponse.json({ error: "Carpeta padre no encontrada" }, { status: 404 });
      }
      const canEdit = await canEditFolder(user.uid, user.email, parentId);
      if (!canEdit) {
        return NextResponse.json({ error: "No tienes permiso para crear carpetas aquí" }, { status: 403 });
      }
    }

    const folderRef = db.collection("folders").doc();
    await folderRef.set({
      name: name.trim(),
      parentId: parentId || null,
      ownerId: user.uid,
      trashed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ id: folderRef.id });
  } catch (error) {
    console.error("Folder creation error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
