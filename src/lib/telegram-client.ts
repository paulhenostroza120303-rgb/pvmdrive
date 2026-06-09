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
  
  // Verificar si la sesión es válida
  try {
    await client.getMe();
  } catch (e) {
    console.error("❌ Telegram Client Session Invalid. Please generate a new session string.");
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
  
  // Subir el archivo como un único documento (Hasta 2GB)
  const result = await client.sendFile(TARGET_CHANNEL, {
    file: buffer,
    fileName: fileName,
  } as any);

  // En MTProto, el fileId es el ID del mensaje o la referencia al documento
  // Guardamos la info necesaria para la base de datos
  return {
    fileId: result.id.toString(),
    filePath: result.id.toString(), // En cuenta personal usamos el ID del mensaje
    messageId: result.id,
    chatId: TARGET_CHANNEL,
    chunks: null,
  };
}

export async function deleteMessageClient(messageId: number): Promise<void> {
  const client = await getTelegramClient();
  await (client as any).deleteMessages(TARGET_CHANNEL, [messageId]);
}
