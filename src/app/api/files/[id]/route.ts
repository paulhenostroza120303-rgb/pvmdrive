import { NextResponse } from "next/server";
import { getFileDoc } from "@/lib/storage-server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  try {
    const file = await getFileDoc(id);
    if (!file || !file.telegramFilePath) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.telegramFilePath}`;
    
    // Hacemos fetch a Telegram y devolvemos el stream
    const response = await fetch(url);
    if (!response.body) return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${file.originalName}"`,
      },
    });
  } catch (error) {
    console.error("Backend Error en GET:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
