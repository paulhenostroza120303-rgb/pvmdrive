const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";
const API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const MAX_CHUNK_SIZE = 50 * 1024 * 1024;

function shouldChunk(size: number): boolean {
  return size > MAX_CHUNK_SIZE;
}

export interface TelegramChunk {
  index: number;
  fileId: string;
  filePath: string;
  messageId: number;
  chatId: string;
  size: number;
}

export interface UploadResult {
  fileId: string;
  filePath: string;
  messageId: number;
  chatId: string;
  chunks: TelegramChunk[] | null;
}

async function sendFileChunk(buffer: Buffer, fileName: string, index: number): Promise<TelegramChunk> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)]);
  formData.append("chat_id", TELEGRAM_CHANNEL_ID);
  formData.append("document", blob, fileName);

  const res = await fetch(`${API_BASE}/sendDocument`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Telegram upload failed: ${res.statusText}`);
  const data = await res.json();
  
  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description}`);
  }

  const doc = data.result.document || data.result.audio || data.result.video;
  
  // Intentar obtener el file_path con un pequeño reintento si falla
  let fileInfoData;
  let attempts = 0;
  while (attempts < 3) {
    try {
      const fileInfoRes = await fetch(`${API_BASE}/getFile?file_id=${doc.file_id}`);
      const info = await fileInfoRes.json();
      if (info.ok && info.result) {
        fileInfoData = info;
        break;
      }
    } catch (e) {
      console.error(`Retry ${attempts + 1} for file path...`);
    }
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo entre reintentos
  }

  if (!fileInfoData || !fileInfoData.result) {
    throw new Error("Could not retrieve file path from Telegram after multiple attempts");
  }

  return {
    index,
    fileId: doc.file_id,
    filePath: fileInfoData.result.file_path,
    messageId: data.result.message_id,
    chatId: TELEGRAM_CHANNEL_ID,
    size: doc.file_size || buffer.length,
  };
}

export async function uploadFile(buffer: Buffer, fileName: string): Promise<UploadResult> {
  if (shouldChunk(buffer.length)) {
    const chunks: TelegramChunk[] = [];
    const totalChunks = Math.ceil(buffer.length / MAX_CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, buffer.length);
      const chunk = await sendFileChunk(buffer.subarray(start, end), `${fileName}.part${i + 1}`, i);
      chunks.push(chunk);
    }
    return { fileId: chunks[0].fileId, filePath: chunks[0].filePath, messageId: chunks[0].messageId, chatId: chunks[0].chatId, chunks };
  }

  const chunk = await sendFileChunk(buffer, fileName, 0);
  return { fileId: chunk.fileId, filePath: chunk.filePath, messageId: chunk.messageId, chatId: chunk.chatId, chunks: null };
}

export async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/getFile?file_id=${fileId}`);
  if (!res.ok) {
    const errorData = await res.text();
    console.error("DEBUG: Telegram getFile error response:", errorData);
    throw new Error(`Failed to get file URL from Telegram: ${res.statusText} - ${errorData}`);
  }
  const data = await res.json();
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

export async function deleteMessage(messageId: number): Promise<void> {
  await fetch(`${API_BASE}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, message_id: messageId }),
  });
}

export async function getFileInfo(fileId: string): Promise<{ fileSize: number; filePath: string }> {
  const res = await fetch(`${API_BASE}/getFile?file_id=${fileId}`);
  if (!res.ok) throw new Error("Failed to get file info");
  const data = await res.json();
  return { fileSize: data.result.file_size, filePath: data.result.file_path };
}
