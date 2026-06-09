import { NextResponse } from "next/server";
import { listFolderContents } from "@/lib/storage-server";
import { listSharedWithUser } from "@/lib/sharing";
import { auth } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email || "";

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    const shared = searchParams.get("shared") === "true";

    if (shared && !parentId) {
      const contents = await listSharedWithUser(userId, userEmail);
      return NextResponse.json({ ...contents, isSharedView: true });
    }

    const contents = await listFolderContents(userId, userEmail, parentId || undefined);
    return NextResponse.json(contents);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("API GET Files Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
