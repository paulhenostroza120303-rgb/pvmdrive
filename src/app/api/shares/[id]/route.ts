import { NextResponse } from "next/server";
import { revokeShare } from "@/lib/sharing";
import { getAuthUser } from "@/lib/auth-utils";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const shareId = (await params).id;

    await revokeShare(user.uid, shareId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
