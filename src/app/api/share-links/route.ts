import { NextResponse } from "next/server";
import { createPublicLink, getPublicLink, deletePublicLink, type ResourceType } from "@/lib/sharing";
import { getAuthUser } from "@/lib/auth-utils";

/** GET /api/share-links?resourceId=xxx&resourceType=file */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const resourceId = searchParams.get("resourceId");
    const resourceType = searchParams.get("resourceType") as ResourceType | null;

    if (!resourceId || !resourceType) {
      return NextResponse.json({ error: "Missing resourceId or resourceType" }, { status: 400 });
    }

    const link = await getPublicLink(resourceId, resourceType);
    return NextResponse.json({ link });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/share-links  { resourceId, resourceType, permission } */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { resourceId, resourceType, permission } = await request.json();
    if (!resourceId || !resourceType) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const link = await createPublicLink(
      user.uid,
      resourceId,
      resourceType as ResourceType,
      permission === "download" ? "download" : "view"
    );

    return NextResponse.json({ link });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/share-links  { resourceId, resourceType } */
export async function DELETE(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { resourceId, resourceType } = await request.json();
    if (!resourceId || !resourceType) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await deletePublicLink(user.uid, resourceId, resourceType as ResourceType);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
