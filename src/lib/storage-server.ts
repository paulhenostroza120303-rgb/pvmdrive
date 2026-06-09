import { db } from "./firebase-admin";
import fs from "fs";
import { uploadFile, uploadFileChunked, resolveFilePath, BOT_API_MAX_BYTES } from "./telegram-server";
import { uploadFileClient, downloadFileClient, downloadFileToDisk, hasGramJsConfig } from "./telegram-client";
import { canAccessFolder, getFolderDoc } from "./sharing";
import { displayFilename } from "./filename";
import type { DriveFile } from "../types";

type StorageMethod = "bot" | "gramjs" | "chunked";

const FILES_COLLECTION = "files";
const FOLDERS_COLLECTION = "folders";
const CHUNKS_COLLECTION = "file_chunks";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const UPLOAD_SERVER_URL =
  process.env.UPLOAD_SERVER_URL ||
  process.env.NEXT_PUBLIC_UPLOAD_URL ||
  "https://pvmdrive-production.up.railway.app";

function telegramFileUrl(filePath: string) {
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
}

async function resolveStoredFilePath(storedPath: string | undefined, fileId: string | undefined): Promise<string | null> {
  if (storedPath) return storedPath;
  if (!fileId) return null;
  return resolveFilePath(fileId);
}

interface StoredFile extends DriveFile {
  storageMethod?: StorageMethod;
  telegramFileId: string;
  telegramFilePath: string;
  telegramMessageId: number;
  telegramChatId: string;
}

function bufferToStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

export async function getDownloadUrl(fileId: string) {
  const file = await getFileDoc(fileId);
  if (!file) {
    throw new Error("File not found");
  }
  
  // Ahora todas las descargas pasan por el proxy de Railway para asegurar compatibilidad
  // y soporte para archivos fragmentados o de cuenta personal.
  return `${UPLOAD_SERVER_URL}/download/${fileId}`;
}

export async function buildFileDownloadResponse(fileId: string) {
  const file = await getFileDoc(fileId);
  if (!file) return null;

  const fileName = displayFilename(file.originalName || file.name);
  const mimeType = file.mimeType || "application/octet-stream";

  if (file.storageMethod === "gramjs" || (!file.storageMethod && !file.telegramFilePath && file.telegramMessageId)) {
    // Para archivos GramJS grandes, descargar a disco y hacer streaming desde ahí
    const tempPath = await downloadFileToDisk(file.telegramMessageId, file.telegramChatId, fileName);
    const fileStream = fs.createReadStream(tempPath);
    // Auto-limpiar el archivo temporal cuando termine el stream
    fileStream.on("close", () => {
      try { fs.unlinkSync(tempPath); } catch { /* ignorar */ }
    });
    fileStream.on("error", () => {
      try { fs.unlinkSync(tempPath); } catch { /* ignorar */ }
    });
    // Convertir Node.js Readable a Web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk: string | Buffer) => {
          controller.enqueue(new Uint8Array(chunk as Uint8Array));
        });
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err: Error) => controller.error(err));
      },
    });
    return { stream, mimeType, fileName };
  }

  const chunksSnap = await db.collection(CHUNKS_COLLECTION).where("fileId", "==", fileId).get();

  if (!chunksSnap.empty) {
    const chunks = chunksSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => (a.index as number) - (b.index as number));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const concurrencyLimit = 5; // Descargar 5 chunks simultáneamente
          const chunkBuffers: Buffer[] = new Array(chunks.length);

          // Descargar chunks en paralelo con límite de concurrencia
          for (let i = 0; i < chunks.length; i += concurrencyLimit) {
            const batchEnd = Math.min(i + concurrencyLimit, chunks.length);
            const batchPromises = [];

            // Crear batch de promesas de descarga
            for (let j = i; j < batchEnd; j++) {
              const chunk = chunks[j];
              batchPromises.push(
                downloadChunkWithRetry(chunk, j)
              );
            }

            // Esperar a que termine el batch
            const batchResults = await Promise.all(batchPromises);
            
            // Guardar buffers en orden
            for (let j = 0; j < batchResults.length; j++) {
              chunkBuffers[i + j] = batchResults[j];
            }

            console.log(`[Download] Progress: ${batchEnd}/${chunks.length} chunks downloaded`);
          }

          // Enviar todos los buffers al stream en orden
          for (const buffer of chunkBuffers) {
            controller.enqueue(new Uint8Array(buffer));
          }
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return { stream, mimeType, fileName };
  }

// Función auxiliar para descargar chunk con reintentos
async function downloadChunkWithRetry(chunk: any, index: number, maxRetries: number = 3): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const path = await resolveStoredFilePath(
        (chunk.telegramFilePath || chunk.filePath) as string | undefined,
        (chunk.telegramFileId || chunk.fileId) as string | undefined
      );
      if (!path) throw new Error("Chunk path resolution failed");

      const res = await fetch(telegramFileUrl(path));
      if (!res.ok || !res.body) throw new Error(`Chunk download failed: ${res.statusText}`);

      // Leer todo el chunk
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      return Buffer.concat(chunks.map(c => new Uint8Array(c)));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Download] Chunk ${index} attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`Failed to download chunk ${index} after ${maxRetries} attempts`);
}

  const filePath = await resolveStoredFilePath(file.telegramFilePath, file.telegramFileId);
  if (!filePath) return null;

  const res = await fetch(telegramFileUrl(filePath));
  if (!res.ok || !res.body) return null;

  return { stream: res.body, mimeType, fileName };
}

export async function uploadUserFile(userId: string, fileBuffer: Buffer, fileName: string, mimeType: string, folderId?: string) {
  const fileId = crypto.randomUUID();
  const now = new Date();

  let storageMethod: StorageMethod;
  let telegramFileId = "";
  let telegramFilePath = "";
  let telegramMessageId = 0;
  let telegramChatId = "";
  let chunks: Awaited<ReturnType<typeof uploadFileChunked>>["chunks"] = null;

  if (fileBuffer.length <= BOT_API_MAX_BYTES) {
    const result = await uploadFile(fileBuffer, fileName);
    storageMethod = "bot";
    telegramFileId = result.fileId;
    telegramFilePath = result.filePath;
    telegramMessageId = result.messageId;
    telegramChatId = result.chatId;
  } else if (hasGramJsConfig()) {
    const result = await uploadFileClient(fileBuffer, fileName);
    storageMethod = "gramjs";
    telegramMessageId = result.messageId;
    telegramChatId = result.chatId;
  } else {
    const result = await uploadFileChunked(fileBuffer, fileName);
    storageMethod = "chunked";
    telegramFileId = result.fileId;
    telegramFilePath = result.filePath;
    telegramMessageId = result.messageId;
    telegramChatId = result.chatId;
    chunks = result.chunks;
  }

  const fileData = {
    userId,
    name: fileName,
    originalName: fileName,
    mimeType,
    size: fileBuffer.length,
    folderId: folderId || null,
    storageMethod,
    telegramFileId,
    telegramFilePath,
    telegramMessageId,
    telegramChatId,
    starred: false,
    trashed: false,
    shared: false,
    shareToken: null,
    thumbnailUrl: null,
    tags: [],
    metadata: {},
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  await db.collection(FILES_COLLECTION).doc(fileId).set(fileData);

  if (chunks?.length) {
    const batch = db.batch();
    for (const chunk of chunks) {
      const chunkRef = db.collection(CHUNKS_COLLECTION).doc();
      batch.set(chunkRef, {
        fileId,
        index: chunk.index,
        telegramFileId: chunk.fileId,
        telegramFilePath: chunk.filePath,
        telegramMessageId: chunk.messageId,
        telegramChatId: chunk.chatId,
        size: chunk.size,
      });
    }
    await batch.commit();
  }

  return { id: fileId, ...fileData };
}

export async function listFolderContents(userId: string, userEmail: string, parentId?: string | null) {
  if (parentId) {
    const hasAccess = await canAccessFolder(userId, userEmail, parentId);
    if (!hasAccess) throw new Error("Forbidden");
  }

  const folder = parentId ? await getFolderDoc(parentId) : null;
  const isOwner = !parentId || folder?.ownerId === userId;

  let filesQuery: FirebaseFirestore.Query = db.collection(FILES_COLLECTION).where("trashed", "==", false);
  let foldersQuery: FirebaseFirestore.Query = db.collection(FOLDERS_COLLECTION).where("trashed", "==", false);

  if (parentId) {
    filesQuery = filesQuery.where("folderId", "==", parentId);
    foldersQuery = foldersQuery.where("parentId", "==", parentId);
    if (isOwner) {
      filesQuery = filesQuery.where("ownerId", "==", userId);
      foldersQuery = foldersQuery.where("ownerId", "==", userId);
    }
  } else {
    filesQuery = filesQuery.where("ownerId", "==", userId).where("folderId", "==", null);
    foldersQuery = foldersQuery.where("ownerId", "==", userId).where("parentId", "==", null);
  }

  const [filesSnap, foldersSnap] = await Promise.all([filesQuery.get(), foldersQuery.get()]);

  const mapName = (data: Record<string, unknown>) => ({
    ...data,
    name: displayFilename(String(data.name || "")),
    originalName: data.originalName ? displayFilename(String(data.originalName)) : undefined,
  });

  const files = filesSnap.docs.map((doc) => ({ id: doc.id, ...mapName(doc.data()), type: "file" }));
  const folders = foldersSnap.docs.map((doc) => ({ id: doc.id, ...mapName(doc.data()), type: "folder" }));

  return { files, folders, isSharedView: Boolean(parentId && !isOwner) };
}

export async function getFileDoc(fileId: string) {
  const doc = await db.collection(FILES_COLLECTION).doc(fileId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as StoredFile;
}

export async function softDeleteItem(id: string, type: 'file' | 'folder') {
  if (type === 'folder') {
    // 1. Buscar y borrar recursivamente todo el contenido de la carpeta
    const children = await db.collection("files")
      .where("folderId", "==", id)
      .get();
    
    const childrenFolders = await db.collection("folders")
      .where("parentId", "==", id)
      .get();

    // Borrar archivos hijos
    const filePromises = children.docs.map(doc => 
      db.collection("files").doc(doc.id).update({ trashed: true, deletedAt: new Date() })
    );

    // Borrar carpetas hijas recursivamente
    const folderPromises = childrenFolders.docs.map(doc => 
      softDeleteItem(doc.id, 'folder')
    );

    await Promise.all([...filePromises, ...folderPromises]);
  }

  // Finalmente, borrar el item actual
  const collection = type === 'file' ? FILES_COLLECTION : FOLDERS_COLLECTION;
  await db.collection(collection).doc(id).update({ trashed: true, deletedAt: new Date() });
}

export async function renameItem(id: string, type: "file" | "folder", newName: string) {
  const collection = type === "file" ? FILES_COLLECTION : FOLDERS_COLLECTION;
  const update: Record<string, unknown> = { name: newName, updatedAt: new Date() };
  if (type === "file") update.originalName = newName;
  await db.collection(collection).doc(id).update(update);
}
