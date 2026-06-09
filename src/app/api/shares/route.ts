import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { createShare, listSharesForResource, listSharedWithUser, type ResourceType } from "@/lib/sharing";

async function getAuthUser(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  const decoded = await auth.verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email || "" };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const shared = searchParams.get("shared") === "true";
    const resourceId = searchParams.get("resourceId");
    const resourceType = searchParams.get("resourceType") as ResourceType | null;

    if (shared) {
      const contents = await listSharedWithUser(user.uid, user.email);
      return NextResponse.json(contents);
    }

    if (resourceId && resourceType) {
      const shares = await listSharesForResource(user.uid, resourceId, resourceType);
      return NextResponse.json({ shares });
    }

    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { resourceId, resourceType, email, permission } = await request.json();
    if (!resourceId || !resourceType || !email) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const result = await createShare(
      user.uid,
      user.email,
      resourceId,
      resourceType,
      email,
      permission === "edit" ? "edit" : "view"
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
