import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
class CustomFile {
  constructor(
    public name: string,
    public size: number,
    public path: string | undefined,
    public buffer: Buffer | undefined
  ) {}
}

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

export async function uploadFileClient(filePath: string, fileName: string, fileSize: number): Promise<{
  fileId: string;
  filePath: string;
  messageId: number;
  chatId: string;
  chunks: null;
}> {
  const client = await getTelegramClient();

  // Crear un CustomFile con la ruta del archivo para que GramJS lo lea directamente
  // GramJS usa el buffer si es menor a 20MB y la ruta si es mayor
  const customFile = new CustomFile(fileName, fileSize, filePath, undefined);
  
  const result = await (client as any).sendFile(TARGET_CHANNEL, {
    file: customFile,
    fileName: fileName,
  });

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
