import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION_STRING = process.env.TELEGRAM_SESSION || "";
const TARGET_CHANNEL = process.env.TELEGRAM_CHANNEL_ID || "";

let client: TelegramClient | null = null;

export function hasGramJsConfig(): boolean {
  return Boolean(API_ID && API_HASH && SESSION_STRING && TARGET_CHANNEL);
}

function assertGramJsConfig() {
  if (!hasGramJsConfig()) {
    throw new Error(
      "Large file upload requires TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION and TELEGRAM_CHANNEL_ID"
    );
  }
}

export async function getTelegramClient() {
  assertGramJsConfig();

  if (client) return client;

  const session = new StringSession(SESSION_STRING);
  client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();

  try {
    await client.getMe();
  } catch {
    console.error("Telegram Client Session Invalid.");
    throw new Error("Invalid Telegram Session");
  }

  return client;
}

export async function uploadFileClient(buffer: Buffer, fileName: string): Promise<{
  messageId: number;
  chatId: string;
}> {
  const tgClient = await getTelegramClient();

  // GramJS necesita un path de archivo, no un objeto CustomFile
  // Escribimos el buffer a un archivo temporal y pasamos la ruta
  const tempDir = path.join(os.tmpdir(), "pvm-uploads");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${crypto.randomUUID()}_${fileName}`);
  fs.writeFileSync(tempPath, buffer);

  try {
    const messages = await tgClient.sendFile(TARGET_CHANNEL, {
      file: tempPath,
      caption: "",
    });

    const msg = Array.isArray(messages) ? messages[0] : messages;

    return {
      messageId: msg.id as number,
      chatId: TARGET_CHANNEL,
    };
  } finally {
    try { fs.unlinkSync(tempPath); } catch { /* ignorar error de limpieza */ }
  }
}

export async function downloadFileClient(messageId: number, chatId: string): Promise<Buffer> {
  const tgClient = await getTelegramClient();
  const messages = await tgClient.getMessages(chatId, { ids: [messageId] });

  if (!messages?.length || !messages[0]) {
    throw new Error("Telegram message not found for download");
  }

  const data: unknown = await tgClient.downloadMedia(messages[0], {});
  if (!data) {
    throw new Error("Failed to download file from Telegram");
  }

  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (typeof data === "string") return Buffer.from(data, "binary");
  throw new Error("Unexpected download format from Telegram");
}

export async function deleteMessageClient(messageId: number): Promise<void> {
  const tgClient = await getTelegramClient();
  await tgClient.deleteMessages(TARGET_CHANNEL, [messageId], { revoke: true });
}
