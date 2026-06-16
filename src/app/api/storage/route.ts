import { NextResponse } from "next/server";
import { getStorageUsage } from "@/lib/storage-server";
import { getAuthUser } from "@/lib/auth-utils";

export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const usage = await getStorageUsage(user.uid);
    return NextResponse.json(usage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("API GET Storage Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
