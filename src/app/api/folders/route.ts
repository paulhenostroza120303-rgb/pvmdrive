import { NextResponse } from "next/server";
import { db, auth } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    const { name, parentId } = await request.json();
    
    const folderRef = db.collection("folders").doc();
    await folderRef.set({
      name,
      parentId: parentId || null,
      ownerId: userId,
      trashed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    return NextResponse.json({ id: folderRef.id });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
