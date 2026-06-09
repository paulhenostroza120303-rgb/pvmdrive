import { NextResponse } from "next/server";
import { uploadUserFile } from "@/lib/storage-server";
import { auth } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    const { fileUrl, fileName, mimeType, size, folderId } = await request.json();
    
    if (!fileUrl) return NextResponse.json({ error: "No file URL provided" }, { status: 400 });
    
    const response = await fetch(fileUrl);
    if (!response.ok) return NextResponse.json({ error: "Failed to fetch file from ImageKit" }, { status: 500 });
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const result = await uploadUserFile(userId, buffer, fileName, mimeType, folderId || undefined);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Upload proxy error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
