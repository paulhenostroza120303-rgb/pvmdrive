const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";
const API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Telegram Bot API: getFile/download limit is 20 MB per file
export const BOT_API_MAX_BYTES = 20 * 1024 * 1024;
const MAX_CHUNK_SIZE = 18 * 1024 * 1024;

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

export async function resolveFilePath(fileId: string, maxAttempts = 15): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const fileInfoRes = await fetch(`${API_BASE}/getFile?file_id=${fileId}`);
      const info = await fileInfoRes.json();
      if (info.ok && info.result?.file_path) {
        return info.result.file_path;
      }
      console.log(`resolveFilePath attempt ${attempt + 1}: file not ready yet`);
    } catch (e) {
      console.error(`resolveFilePath attempt ${attempt + 1} error:`, e);
    }
    const delayMs = Math.min(2000 * (attempt + 1), 10000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

async function sendFileChunk(buffer: Buffer, fileName: string, index: number): Promise<TelegramChunk> {
  const formData = new FormData();
  const file = new File([new Uint8Array(buffer)], fileName, { type: "application/octet-stream" });
  formData.append("chat_id", TELEGRAM_CHANNEL_ID);
  formData.append("document", file);

  const res = await fetch(`${API_BASE}/sendDocument`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Telegram upload failed: ${res.statusText}`);
  const data = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description}`);
  }

  const doc = data.result.document || data.result.audio || data.result.video;
  if (!doc?.file_id) {
    throw new Error("Telegram did not return a file id for the uploaded chunk");
  }

  const filePath = await resolveFilePath(doc.file_id);
  if (!filePath) {
    console.warn(`Chunk ${index}: file_path unavailable after retries, storing file_id for download resolution`);
  }

  return {
    index,
    fileId: doc.file_id,
    filePath: filePath || "",
    messageId: data.result.message_id,
    chatId: TELEGRAM_CHANNEL_ID,
    size: doc.file_size || buffer.length,
  };
}

function assertTelegramConfig() {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  if (!TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_CHANNEL_ID is not configured");
  }
}

export async function uploadFileChunked(buffer: Buffer, fileName: string): Promise<UploadResult> {
  assertTelegramConfig();

  const totalChunks = Math.ceil(buffer.length / MAX_CHUNK_SIZE);
  const concurrencyLimit = 3; // Máximo 3 subidas simultáneas para evitar rate limiting
  const chunks: TelegramChunk[] = new Array(totalChunks);

  console.log(`[Upload] Starting parallel upload: ${totalChunks} chunks`);

  // Subir chunks en paralelo con límite de concurrencia
  for (let i = 0; i < totalChunks; i += concurrencyLimit) {
    const batchEnd = Math.min(i + concurrencyLimit, totalChunks);
    const batchPromises = [];

    // Crear batch de promesas
    for (let j = i; j < batchEnd; j++) {
      const start = j * MAX_CHUNK_SIZE;
      const end = Math.min(start + MAX_CHUNK_SIZE, buffer.length);
      const chunkName = `${crypto.randomUUID()}.bin`;
      
      // Agregar reintentos para cada chunk
      batchPromises.push(
        uploadWithRetry(buffer.subarray(start, end), chunkName, j, 3)
      );
    }

    // Esperar a que termine el batch
    const batchResults = await Promise.all(batchPromises);
    
    // Guardar resultados en orden
    for (let j = 0; j < batchResults.length; j++) {
      chunks[i + j] = batchResults[j];
    }

    console.log(`[Upload] Progress: ${batchEnd}/${totalChunks} chunks uploaded`);
  }

  return {
    fileId: chunks[0].fileId,
    filePath: chunks[0].filePath,
    messageId: chunks[0].messageId,
    chatId: chunks[0].chatId,
    chunks,
  };
}

// Función auxiliar con reintentos
async function uploadWithRetry(
  chunkBuffer: Buffer,
  chunkName: string,
  index: number,
  maxRetries: number = 3
): Promise<TelegramChunk> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const chunk = await sendFileChunk(chunkBuffer, chunkName, index);
      return chunk;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Upload] Chunk ${index} attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        // Esperar antes de reintentar (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to upload chunk ${index} after ${maxRetries} attempts`);
}

export async function uploadFile(buffer: Buffer, fileName: string): Promise<UploadResult> {
  assertTelegramConfig();

  if (buffer.length > BOT_API_MAX_BYTES) {
    throw new Error("File exceeds Bot API limit; use GramJS for large files");
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
