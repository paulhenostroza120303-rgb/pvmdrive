import { db } from "./firebase-admin";
import { uploadFile, resolveFilePath } from "./telegram-server";
import type { DriveFile } from "../types";

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
  telegramFileId: string;
  telegramFilePath: string;
  telegramMessageId: number;
  telegramChatId: string;
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

  const fileName = file.originalName || file.name;
  const mimeType = file.mimeType || "application/octet-stream";

  const chunksSnap = await db.collection(CHUNKS_COLLECTION).where("fileId", "==", fileId).get();

  if (!chunksSnap.empty) {
    const chunks = chunksSnap.docs
      .map((doc) => doc.data())
      .sort((a, b) => (a.index as number) - (b.index as number));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (const chunk of chunks) {
            const path = await resolveStoredFilePath(
              (chunk.telegramFilePath || chunk.filePath) as string | undefined,
              (chunk.telegramFileId || chunk.fileId) as string | undefined
            );
            if (!path) throw new Error("Chunk path resolution failed");
            const res = await fetch(telegramFileUrl(path));
            if (!res.ok || !res.body) throw new Error("Chunk download failed");
            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return { stream, mimeType, fileName };
  }

  const filePath = await resolveStoredFilePath(file.telegramFilePath, file.telegramFileId);
  if (!filePath) return null;

  const res = await fetch(telegramFileUrl(filePath));
  if (!res.ok || !res.body) return null;

  return { stream: res.body, mimeType, fileName };
}

export async function uploadUserFile(userId: string, fileBuffer: Buffer, fileName: string, mimeType: string, folderId?: string) {
  const result = await uploadFile(fileBuffer, fileName);
  const fileId = crypto.randomUUID();
  const now = new Date();

  const fileData = {
    userId,
    name: fileName,
    originalName: fileName,
    mimeType,
    size: fileBuffer.length,
    folderId: folderId || null,
    telegramFileId: result.fileId,
    telegramFilePath: result.filePath,
    telegramMessageId: result.messageId,
    telegramChatId: result.chatId,
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

  if (result.chunks?.length) {
    const batch = db.batch();
    for (const chunk of result.chunks) {
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

export async function listFolderContents(userId: string, parentId?: string | null) {
  // Traer archivos
  let filesQuery: FirebaseFirestore.Query = db.collection(FILES_COLLECTION)
    .where("ownerId", "==", userId)
    .where("trashed", "==", false);

  if (parentId) filesQuery = filesQuery.where("folderId", "==", parentId);
  else filesQuery = filesQuery.where("folderId", "==", null);

  // Traer carpetas
  let foldersQuery: FirebaseFirestore.Query = db.collection(FOLDERS_COLLECTION)
    .where("ownerId", "==", userId)
    .where("trashed", "==", false);

  if (parentId) foldersQuery = foldersQuery.where("parentId", "==", parentId);
  else foldersQuery = foldersQuery.where("parentId", "==", null);

  const [filesSnap, foldersSnap] = await Promise.all([filesQuery.get(), foldersQuery.get()]);
  
  const files = filesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), type: "file" }));
  const folders = foldersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), type: "folder" }));
  
  return { files, folders };
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

export async function renameItem(id: string, type: 'file' | 'folder', newName: string) {
  const collection = type === 'file' ? FILES_COLLECTION : FOLDERS_COLLECTION;
  await db.collection(collection).doc(id).update({ name: newName, updatedAt: new Date() });
}
