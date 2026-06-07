import { NextResponse } from "next/server";
import { listFolderContents } from "@/lib/storage-server";
import { auth } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    
    const contents = await listFolderContents(userId, parentId || undefined);
    return NextResponse.json(contents);
  } catch (error: any) {
    console.error("API GET Files Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
