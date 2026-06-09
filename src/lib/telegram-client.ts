import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SESSION_STRING = process.env.TELEGRAM_SESSION || "";
const TARGET_CHANNEL = process.env.TELEGRAM_CHANNEL_ID || "";

let client: TelegramClient | null = null;

export async function getTelegramClient() {
  if (client) return client;

  const session = new StringSession(SESSION_STRING);
  client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();
  
  try {
    await client.getMe();
  } catch (e) {
    console.error("❌ Telegram Client Session Invalid.");
    throw new Error("Invalid Telegram Session");
  }

  return client;
}

export async function uploadFileClient(buffer: Buffer, fileName: string): Promise<{
  fileId: string;
  filePath: string;
  messageId: number;
  chatId: string;
  chunks: null;
}> {
  const client = await getTelegramClient();
  
  // Usamos la forma más simple: (chat, buffer, options)
  // Casting a any para evitar conflictos de tipos en el build
  const result = await (client as any).sendFile(TARGET_CHANNEL, buffer, {
    fileName: fileName,
  });

  return {
    fileId: result.id.toString(),
    filePath: result.id.toString(),
    messageId: result.id,
    chatId: TARGET_CHANNEL,
    chunks: null,
  };
}

export async function deleteMessageClient(messageId: number): Promise<void> {
  const client = await getTelegramClient();
  await (client as any).deleteMessages(TARGET_CHANNEL, [messageId]);
}
