import { db, auth } from "./firebase-admin";
import { displayFilename } from "./filename";

export type SharePermission = "view" | "edit";
export type ResourceType = "file" | "folder";

const SHARES_COLLECTION = "shares";
const FILES_COLLECTION = "files";
const FOLDERS_COLLECTION = "folders";

export interface ShareRecord {
  id: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  ownerId: string;
  ownerEmail: string;
  sharedWithEmail: string;
  sharedWithUid: string | null;
  permission: SharePermission;
  createdAt: Date;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getFolderDoc(folderId: string) {
  const doc = await db.collection(FOLDERS_COLLECTION).doc(folderId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as { id: string; name: string; parentId: string | null; ownerId: string; trashed: boolean };
}

async function getShareForResource(userId: string, userEmail: string, resourceId: string, resourceType: ResourceType) {
  const email = normalizeEmail(userEmail);

  const [byUid, byEmail] = await Promise.all([
    db.collection(SHARES_COLLECTION)
      .where("resourceId", "==", resourceId)
      .where("resourceType", "==", resourceType)
      .where("sharedWithUid", "==", userId)
      .limit(1)
      .get(),
    db.collection(SHARES_COLLECTION)
      .where("resourceId", "==", resourceId)
      .where("resourceType", "==", resourceType)
      .where("sharedWithEmail", "==", email)
      .limit(1)
      .get(),
  ]);

  const doc = byUid.docs[0] || byEmail.docs[0];
  if (!doc) return null;
  return { id: doc.id, ...doc.data() } as ShareRecord;
}

function permissionAllows(required: SharePermission, granted: SharePermission) {
  if (required === "view") return granted === "view" || granted === "edit";
  return granted === "edit";
}

export async function canEditFolder(userId: string, userEmail: string, folderId: string): Promise<boolean> {
  const folder = await getFolderDoc(folderId);
  if (!folder || folder.trashed) return false;
  if (folder.ownerId === userId) return true;

  const share = await getShareForResource(userId, userEmail, folderId, "folder");
  if (share?.permission === "edit") return true;

  if (folder.parentId) return canEditFolder(userId, userEmail, folder.parentId);
  return false;
}

export async function canAccessFolder(userId: string, userEmail: string, folderId: string | null): Promise<boolean> {
  if (!folderId) return true;

  const folder = await getFolderDoc(folderId);
  if (!folder || folder.trashed) return false;
  if (folder.ownerId === userId) return true;

  const share = await getShareForResource(userId, userEmail, folderId, "folder");
  if (share) return true;

  if (folder.parentId) return canAccessFolder(userId, userEmail, folder.parentId);
  return false;
}

export async function canAccessFile(
  userId: string,
  userEmail: string,
  fileId: string,
  required: SharePermission = "view"
): Promise<boolean> {
  const fileDoc = await db.collection(FILES_COLLECTION).doc(fileId).get();
  if (!fileDoc.exists) return false;
  const file = fileDoc.data()!;
  if (file.trashed) return false;
  if (file.ownerId === userId) return true;

  const share = await getShareForResource(userId, userEmail, fileId, "file");
  if (share && permissionAllows(required, share.permission)) return true;

  if (file.folderId) return canAccessFolder(userId, userEmail, file.folderId);
  return false;
}

export async function isResourceOwner(userId: string, resourceId: string, resourceType: ResourceType) {
  const collection = resourceType === "file" ? FILES_COLLECTION : FOLDERS_COLLECTION;
  const doc = await db.collection(collection).doc(resourceId).get();
  if (!doc.exists) return false;
  return doc.data()?.ownerId === userId;
}

export async function createShare(
  ownerId: string,
  ownerEmail: string,
  resourceId: string,
  resourceType: ResourceType,
  email: string,
  permission: SharePermission
) {
  const sharedWithEmail = normalizeEmail(email);
  if (sharedWithEmail === normalizeEmail(ownerEmail)) {
    throw new Error("No puedes compartir contigo mismo");
  }

  const isOwner = await isResourceOwner(ownerId, resourceId, resourceType);
  if (!isOwner) throw new Error("No tienes permiso para compartir este elemento");

  const collection = resourceType === "file" ? FILES_COLLECTION : FOLDERS_COLLECTION;
  const resourceDoc = await db.collection(collection).doc(resourceId).get();
  if (!resourceDoc.exists) throw new Error("Recurso no encontrado");

  const resourceName = resourceDoc.data()?.name || "Sin nombre";

  let sharedWithUid: string | null = null;
  try {
    const userRecord = await auth.getUserByEmail(sharedWithEmail);
    sharedWithUid = userRecord.uid;
  } catch {
    // El usuario aún no tiene cuenta; queda pendiente por email
  }

  const existing = await db.collection(SHARES_COLLECTION)
    .where("resourceId", "==", resourceId)
    .where("resourceType", "==", resourceType)
    .where("sharedWithEmail", "==", sharedWithEmail)
    .limit(1)
    .get();

  if (!existing.empty) {
    await existing.docs[0].ref.update({ permission, sharedWithUid, updatedAt: new Date() });
    await db.collection(collection).doc(resourceId).update({ shared: true });
    return { id: existing.docs[0].id, updated: true };
  }

  const shareRef = db.collection(SHARES_COLLECTION).doc();
  const shareData = {
    resourceId,
    resourceType,
    resourceName,
    ownerId,
    ownerEmail: normalizeEmail(ownerEmail),
    sharedWithEmail,
    sharedWithUid,
    permission,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await shareRef.set(shareData);
  await db.collection(collection).doc(resourceId).update({ shared: true, updatedAt: new Date() });

  return { id: shareRef.id, ...shareData };
}

export async function listSharesForResource(ownerId: string, resourceId: string, resourceType: ResourceType) {
  const isOwner = await isResourceOwner(ownerId, resourceId, resourceType);
  if (!isOwner) throw new Error("Forbidden");

  const snap = await db.collection(SHARES_COLLECTION)
    .where("resourceId", "==", resourceId)
    .where("resourceType", "==", resourceType)
    .get();

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function revokeShare(ownerId: string, shareId: string) {
  const shareDoc = await db.collection(SHARES_COLLECTION).doc(shareId).get();
  if (!shareDoc.exists) throw new Error("Share not found");
  const share = shareDoc.data()!;
  if (share.ownerId !== ownerId) throw new Error("Forbidden");

  await shareDoc.ref.delete();

  const remaining = await db.collection(SHARES_COLLECTION)
    .where("resourceId", "==", share.resourceId)
    .where("resourceType", "==", share.resourceType)
    .limit(1)
    .get();

  if (remaining.empty) {
    const collection = share.resourceType === "file" ? FILES_COLLECTION : FOLDERS_COLLECTION;
    await db.collection(collection).doc(share.resourceId).update({ shared: false });
  }

  return { success: true };
}

export async function listSharedWithUser(userId: string, userEmail: string) {
  const email = normalizeEmail(userEmail);

  const [byUid, byEmail] = await Promise.all([
    db.collection(SHARES_COLLECTION).where("sharedWithUid", "==", userId).get(),
    db.collection(SHARES_COLLECTION).where("sharedWithEmail", "==", email).get(),
  ]);

  const shareMap = new Map<string, ShareRecord & { id: string }>();
  for (const doc of [...byUid.docs, ...byEmail.docs]) {
    shareMap.set(doc.id, { id: doc.id, ...doc.data() } as ShareRecord & { id: string });
  }

  const files: Record<string, unknown>[] = [];
  const folders: Record<string, unknown>[] = [];

  for (const share of shareMap.values()) {
    const collection = share.resourceType === "file" ? FILES_COLLECTION : FOLDERS_COLLECTION;
    const resourceDoc = await db.collection(collection).doc(share.resourceId).get();
    if (!resourceDoc.exists || resourceDoc.data()?.trashed) continue;

    const data = resourceDoc.data()!;
    const item = {
      id: resourceDoc.id,
      ...data,
      name: displayFilename(String(data.name || "")),
      type: share.resourceType,
      sharePermission: share.permission,
      sharedBy: share.ownerEmail,
    };

    if (share.resourceType === "file") files.push(item);
    else folders.push(item);
  }

  return { files, folders };
}
