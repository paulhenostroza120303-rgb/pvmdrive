export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  storageUsed: number;
  storageLimit: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriveFile {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  ownerId: string;
  starred: boolean;
  trashed: boolean;
  shared: boolean;
  shareToken: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  path: string;
  color: string | null;
  icon: string | null;
  starred: boolean;
  trashed: boolean;
  shared: boolean;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareLink {
  id: string;
  fileId: string | null;
  folderId: string | null;
  ownerId: string;
  token: string;
  permission: "view" | "download" | "edit";
  expiresAt: Date | null;
  maxDownloads: number | null;
  downloadCount: number;
  password: string | null;
  createdAt: Date;
}

export interface Activity {
  id: string;
  userId: string;
  action: FileAction;
  targetType: "file" | "folder";
  targetId: string;
  targetName: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: "share" | "comment" | "upload" | "download" | "delete" | "rename" | "move";
  title: string;
  message: string;
  read: boolean;
  data: Record<string, unknown>;
  createdAt: Date;
}

export type ViewMode = "grid" | "list";

export type SortOption = "name" | "size" | "createdAt" | "updatedAt" | "type";

export type FileAction = "upload" | "download" | "delete" | "rename" | "move" | "copy" | "share" | "star" | "restore" | "trash";

export interface FileUploadProgress {
  file: DriveFile | File;
  progress: number;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface SearchFilters {
  query?: string;
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minSize?: number;
  maxSize?: number;
  trashed?: boolean;
  starred?: boolean;
  shared?: boolean;
}
