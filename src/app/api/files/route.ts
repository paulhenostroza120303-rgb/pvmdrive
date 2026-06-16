import { NextResponse } from "next/server";
import { listFolderContents, listStarred, listRecent } from "@/lib/storage-server";
import { listSharedWithUser } from "@/lib/sharing";
import { getAuthUser } from "@/lib/auth-utils";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    const shared = searchParams.get("shared") === "true";
    const starred = searchParams.get("starred") === "true";
    const recent = searchParams.get("recent") === "true";

    if (starred && !parentId) {
      return NextResponse.json(await listStarred(user.uid));
    }

    if (recent && !parentId) {
      return NextResponse.json(await listRecent(user.uid));
    }

    if (shared && !parentId) {
      const contents = await listSharedWithUser(user.uid, user.email);
      return NextResponse.json({ ...contents, isSharedView: true });
    }

    const contents = await listFolderContents(user.uid, user.email, parentId || undefined);
    return NextResponse.json(contents);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("API GET Files Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
