import { db } from "./firebase-admin";
import { uploadFileClient, deleteMessageClient } from "./telegram-client";
import type { DriveFile } from "../types";

const FILES_COLLECTION = "files";
const FOLDERS_COLLECTION = "folders";
const CHUNKS_COLLECTION = "file_chunks";

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
  
  // Si tenemos filePath, usamos la URL directa de descarga, sin pasar por getFile
  if (file.telegramFilePath) {
    return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.telegramFilePath}`;
  }
  
  // Fallback para archivos pequeños
  return getFileUrl(file.telegramFileId);
}

export async function uploadUserFile(userId: string, fileBuffer: Buffer, fileName: string, mimeType: string, folderId?: string) {
  const result = await uploadFileClient(fileBuffer, fileName);
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
