import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

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

class CustomFile {
  constructor(
    public name: string,
    public size: number,
    public path: string | undefined,
    public buffer: Buffer | undefined
  ) {}
}

export async function uploadFileClient(buffer: Buffer, fileName: string): Promise<{
  messageId: number;
  chatId: string;
}> {
  const tgClient = await getTelegramClient();

  const customFile = new CustomFile(fileName, buffer.length, undefined, buffer);

  const message = await (tgClient as TelegramClient & {
    sendFile: (entity: string, options: { file: CustomFile; caption: string }) => Promise<{ id: number }>;
  }).sendFile(TARGET_CHANNEL, {
    file: customFile,
    caption: "",
  });

  return {
    messageId: message.id,
    chatId: TARGET_CHANNEL,
  };
}

export async function downloadFileClient(messageId: number, chatId: string): Promise<Buffer> {
  const tgClient = await getTelegramClient();
  const messages = await tgClient.getMessages(chatId, { ids: [messageId] });

  if (!messages?.length || !messages[0]) {
    throw new Error("Telegram message not found for download");
  }

  const data = await tgClient.downloadMedia(messages[0], {});
  if (!data) {
    throw new Error("Failed to download file from Telegram");
  }

  return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
}

export async function deleteMessageClient(messageId: number): Promise<void> {
  const tgClient = await getTelegramClient();
  await tgClient.deleteMessages(TARGET_CHANNEL, [messageId], { revoke: true });
}
