import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { revokeShare } from "@/lib/sharing";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.split("Bearer ")[1];
    const decoded = await auth.verifyIdToken(token);
    const shareId = (await params).id;

    await revokeShare(decoded.uid, shareId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
