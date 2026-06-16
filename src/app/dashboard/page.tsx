"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { DriveFile, Folder, BreadcrumbItem, ViewMode } from "@/types";
import { displayFilename } from "@/lib/filename";
import { getFileStyle } from "@/lib/file-icons";
import { FileThumbnail } from "@/components/drive/file-thumbnail";
import { ConfirmDialog, PromptDialog } from "@/components/ui/dialogs";
import {
  Loader2, Upload, File as FileIcon, Folder as FolderIcon, Plus,
  Trash2, Edit2, Download, ChevronRight, MoreVertical, X, Check, AlertCircle,
  HardDrive, Users, Share2, Home, Menu, Star, Copy, Scissors, ClipboardPaste,
  Move, Info, FolderInput, StarOff, Link, CopyCheck,
  FolderOpen, Clock, UploadCloud, FolderUp,
  LayoutGrid, List as ListIcon
} from "lucide-react";

interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface ShareEntry {
  id: string;
  sharedWithEmail: string;
  permission: string;
}

interface ClipboardItem {
  id: string;
  type: "file" | "folder";
  name: string;
  action: "copy" | "cut";
  sourceFolderId: string | null;
}

interface DownloadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "downloading" | "done" | "error";
  error?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [files, setFiles] = useState<(DriveFile & { type: "file"; sharedBy?: string; sharePermission?: string })[]>([]);
  const [folders, setFolders] = useState<(Folder & { type: "folder"; sharedBy?: string; sharePermission?: string })[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Mi unidad" }]);
  const [viewMode, setViewMode] = useState<ViewMode>("drive");
  const [isSharedView, setIsSharedView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<{ id: string; type: "file" | "folder"; name: string; x: number; y: number } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shareModal, setShareModal] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("view");
  const [existingShares, setExistingShares] = useState<ShareEntry[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [publicLink, setPublicLink] = useState<{ token: string; permission: string } | null>(null);
  const [publicLinkLoading, setPublicLinkLoading] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [infoModal, setInfoModal] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);
  const [infoData, setInfoData] = useState<Record<string, unknown> | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [listView, setListView] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ id: string; name: string; mimeType: string; url: string } | null>(null);
  const [trashView, setTrashView] = useState(false);
  const [trashItems, setTrashItems] = useState<Array<{ id: string; type: "file" | "folder"; name: string; size?: number; deletedAt?: any }>>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [storage, setStorage] = useState<{ used: number; limit: number } | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; danger?: boolean; confirmText?: string; onConfirm: () => void } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) router.push("/login");
    else fetchContents();
  }, [user, currentFolderId, viewMode, trashView]);

  // Cargar uso de almacenamiento al iniciar y tras subir/borrar
  const fetchStorage = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/storage", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setStorage(await res.json());
    } catch { /* ignorar */ }
  }, [user]);

  useEffect(() => { fetchStorage(); }, [fetchStorage]);

  // Reordenar cuando cambien los criterios de ordenamiento
  useEffect(() => {
    if (files.length > 0 || folders.length > 0) {
      // Forzar re-render con los nuevos criterios
      fetchContents();
    }
  }, [sortBy, sortDirection]);

  // Cerrar menú al presionar Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveMenu(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const getToken = async () => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("No autenticado");
    return token;
  };

  // Función para ordenar archivos y carpetas
  const sortItems = (items: any[]): any[] => {
    return [...items].sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      } else if (sortBy === "size") {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        comparison = sizeA - sizeB;
      } else if (sortBy === "date") {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        comparison = dateA - dateB;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
  };

  // Función de búsqueda local
  const filterBySearch = (items: any[]): any[] => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(query)
    );
  };

  const fetchContents = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      
      // Si estamos en vista de papelera
      if (trashView) {
        await fetchTrash(token);
        return;
      }
      
      const atRoot = !currentFolderId;
      let url: string;
      if (viewMode === "shared" && atRoot) url = `/api/files?shared=true`;
      else if (viewMode === "starred" && atRoot) url = `/api/files?starred=true`;
      else if (viewMode === "recent" && atRoot) url = `/api/files?recent=true`;
      else url = `/api/files?parentId=${currentFolderId || ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error cargando archivos");
      
      // Aplicar ordenamiento y búsqueda
      const sortedFiles = sortItems(data.files || []);
      const sortedFolders = sortItems(data.folders || []);
      
      const filteredFiles = filterBySearch(sortedFiles);
      const filteredFolders = filterBySearch(sortedFolders);
      
      setFiles(filteredFiles);
      setFolders(filteredFolders);
      setIsSharedView(Boolean(data.isSharedView || (viewMode === "shared" && atRoot)));
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar papelera
  const fetchTrash = async (token: string) => {
    setTrashLoading(true);
    try {
      const res = await fetch('/api/trash', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error cargando papelera");
      setTrashItems(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTrashLoading(false);
    }
  };

  const navigateToFolder = (folderId: string | null, folderName: string, resetTrail = false) => {
    setCurrentFolderId(folderId);
    if (resetTrail) {
      setBreadcrumbs([{ id: null, name: viewMode === "shared" ? "Compartido conmigo" : "Mi unidad" }]);
    }
    if (folderId) {
      setBreadcrumbs((prev) => {
        const existing = prev.findIndex((b) => b.id === folderId);
        if (existing >= 0) return prev.slice(0, existing + 1);
        return [...prev, { id: folderId, name: folderName }];
      });
    }
  };

  const viewLabel = (mode: ViewMode) =>
    mode === "shared" ? "Compartido conmigo"
    : mode === "starred" ? "Destacados"
    : mode === "recent" ? "Recientes"
    : "Mi unidad";

  const switchView = (mode: ViewMode) => {
    setTrashView(false);
    setViewMode(mode);
    setCurrentFolderId(null);
    setSidebarOpen(false);
    setBreadcrumbs([{ id: null, name: viewLabel(mode) }]);
  };

  const openTrash = () => {
    setTrashView(true);
    setCurrentFolderId(null);
    setSidebarOpen(false);
  };

  const uploadFile = async (file: File, folderId: string | null, token: string) => {
    const uploadId = crypto.randomUUID();
    setUploads((prev) => [...prev, {
      id: uploadId, name: file.name, size: file.size, progress: 0, status: "uploading",
    }]);
    setShowUploadPanel(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", file.name);
      formData.append("folderId", folderId || "");

      const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "https://pvmdrive-production.up.railway.app";
      const serverRes = await fetch(`${uploadUrl}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!serverRes.ok) {
        const errorData = await serverRes.json();
        throw new Error(errorData.error || "Error subiendo archivo");
      }

      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, progress: 100, status: "done" } : u));
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 3000);
      fetchContents();
      fetchStorage();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      setUploads((prev) => prev.map((u) => u.id === uploadId ? { ...u, status: "error", error: message } : u));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length || isSharedView) return;
    const token = await getToken();
    for (const file of Array.from(fileList)) {
      await uploadFile(file, currentFolderId, token);
    }
    e.target.value = "";
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList?.length || isSharedView) return;
    const token = await getToken();
    // Reconstruir el árbol de carpetas a partir de webkitRelativePath
    const folderCache = new Map<string, string | null>();
    folderCache.set("", currentFolderId);
    for (const file of Array.from(fileList)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = rel.split("/");
      const dirs = parts.slice(0, -1);
      let parentId = currentFolderId;
      let accum = "";
      for (const dir of dirs) {
        accum = accum ? `${accum}/${dir}` : dir;
        if (folderCache.has(accum)) { parentId = folderCache.get(accum)!; continue; }
        const newId = await createFolderInDB(dir, parentId, token);
        folderCache.set(accum, newId);
        parentId = newId;
      }
      await uploadFile(file, parentId, token);
    }
    e.target.value = "";
    fetchContents();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isSharedView) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.relatedTarget === null) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isSharedView) return;
    const token = await getToken();
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;
    if (items?.length) {
      const entries = Array.from(items).map((i) => i.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[];
      for (const entry of entries) await processEntry(entry, currentFolderId, token);
    } else if (files?.length) {
      for (const file of Array.from(files)) await uploadFile(file, currentFolderId, token);
    }
    fetchContents();
  };

  const readAllEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      const allEntries: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        }, reject);
      };
      readBatch();
    });
  };

  const processEntry = async (entry: FileSystemEntry, parentId: string | null, token: string) => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      await uploadFile(file, parentId, token);
    } else if (entry.isDirectory) {
      const folderId = await createFolderInDB(entry.name, parentId, token);
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const subEntries = await readAllEntries(reader);
      for (const sub of subEntries) await processEntry(sub, folderId, token);
    }
  };

  const createFolderInDB = async (name: string, parentId: string | null, token: string) => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    });
    const data = await res.json();
    return data.id;
  };

  const doCreateFolder = async (name: string) => {
    if (!name.trim() || isSharedView) return;
    const token = await getToken();
    await fetch("/api/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parentId: currentFolderId }),
    });
    setNewFolderOpen(false);
    fetchContents();
  };

  const deleteItem = (id: string, type: "file" | "folder", name?: string) => {
    setActiveMenu(null);
    setConfirmState({
      title: `¿Mover a la papelera?`,
      message: `"${displayFilename(name || "")}" se moverá a la papelera. Podrás restaurarlo más tarde.`,
      danger: true,
      confirmText: "Mover a papelera",
      onConfirm: async () => {
        const token = await getToken();
        await fetch(`/api/items/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        fetchContents();
        fetchStorage();
      },
    });
  };

  // Restaurar desde papelera
  const restoreItem = async (id: string, type: "file" | "folder") => {
    const token = await getToken();
    try {
      await fetch(`/api/trash/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchContents(); // Recargar papelera
    } catch (err) {
      console.error(err);
    }
  };

  // Eliminar permanentemente
  const permanentDelete = (id: string, type: "file" | "folder", name?: string) => {
    setConfirmState({
      title: "¿Eliminar permanentemente?",
      message: `"${displayFilename(name || "")}" se eliminará para siempre. Esta acción no se puede deshacer.`,
      danger: true,
      confirmText: "Eliminar para siempre",
      onConfirm: async () => {
        const token = await getToken();
        try {
          await fetch(`/api/trash/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchContents();
          fetchStorage();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  // Vaciar papelera completa
  const emptyTrash = () => {
    setConfirmState({
      title: "¿Vaciar la papelera?",
      message: "Todos los elementos se eliminarán permanentemente. Esta acción no se puede deshacer.",
      danger: true,
      confirmText: "Vaciar papelera",
      onConfirm: async () => {
        const token = await getToken();
        try {
          await fetch('/api/trash', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          fetchContents();
          fetchStorage();
        } catch (err) {
          console.error(err);
        }
      },
    });
  };

  const renameItem = (id: string, type: "file" | "folder", currentName: string) => {
    setActiveMenu(null);
    setRenameTarget({ id, type, name: displayFilename(currentName) });
  };

  const doRename = async (newName: string) => {
    if (!renameTarget || !newName.trim()) return;
    const token = await getToken();
    await fetch(`/api/items/${renameTarget.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: renameTarget.type }),
    });
    setRenameTarget(null);
    fetchContents();
  };

  const toggleStar = async (id: string, type: "file" | "folder", currentStarred: boolean) => {
    const token = await getToken();
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !currentStarred, type }),
    });
    setActiveMenu(null);
    fetchContents();
  };

  const moveItem = async (id: string, type: "file" | "folder", targetFolderId: string | null) => {
    const token = await getToken();
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: targetFolderId, type }),
    });
    setActiveMenu(null);
    fetchContents();
  };

  const copyItem = (id: string, type: "file" | "folder", name: string) => {
    setClipboard({ id, type, name, action: "copy", sourceFolderId: currentFolderId });
    setActiveMenu(null);
  };

  const cutItem = (id: string, type: "file" | "folder", name: string) => {
    setClipboard({ id, type, name, action: "cut", sourceFolderId: currentFolderId });
    setActiveMenu(null);
  };

  const pasteItem = async () => {
    if (!clipboard) return;
    const token = await getToken();
    if (clipboard.action === "cut") {
      // Mover: cambiar folderId/parentId
      await fetch(`/api/items/${clipboard.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: currentFolderId, type: clipboard.type }),
      });
      setClipboard(null);
    } else {
      // Copiar: para archivos, necesitamos re-descargar y re-subir
      // Para carpetas, crear nueva carpeta con mismo nombre
      if (clipboard.type === "folder") {
        await fetch("/api/folders", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${clipboard.name} (copia)`, parentId: currentFolderId }),
        });
      } else {
        // Descargar y re-subir el archivo
        try {
          const downloadRes = await fetch(`/api/items/${clipboard.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (downloadRes.ok) {
            const blob = await downloadRes.blob();
            const formData = new FormData();
            const copyName = clipboard.name.replace(/(\.[^.]+)$/, " (copia)$1");
            formData.append("file", blob, copyName);
            formData.append("fileName", copyName);
            formData.append("folderId", currentFolderId || "");
            const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "https://pvmdrive-production.up.railway.app";
            await fetch(`${uploadUrl}/upload`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
          }
        } catch (err) {
          console.error("Error al copiar archivo:", err);
        }
      }
    }
    fetchContents();
  };

  // Preview de archivos
  const previewFile = async (id: string, name: string, mimeType: string) => {
    try {
      const token = await getToken();
      
      // Usar la API de Next.js como proxy para evitar problemas de CORS
      const res = await fetch(`/api/files/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        console.error('Error al cargar preview:', res.status, res.statusText);
        alert('Error al cargar vista previa');
        return;
      }
      
      // Crear blob URL para preview
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewModal({ id, name, mimeType, url });
    } catch (error) {
      console.error('Error en previewFile:', error);
      alert('Error al cargar la vista previa. Intente descargar el archivo.');
    }
  };

  // Cerrar preview y liberar memoria
  const closePreview = () => {
    if (previewModal?.url) {
      URL.revokeObjectURL(previewModal.url);
    }
    setPreviewModal(null);
  };

  const downloadFile = async (id: string, fallbackName: string, fileSize?: number) => {
    const token = await getToken();
    const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "https://pvmdrive-production.up.railway.app";
    const downloadId = crypto.randomUUID();

    // Agregar al panel de descargas
    setDownloads((prev) => [...prev, {
      id: downloadId, name: fallbackName, size: fileSize || 0, progress: 0, status: "downloading",
    }]);
    setShowDownloadPanel(true);

    try {
      const res = await fetch(`${uploadUrl}/download/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, status: "error", error: "Error del servidor" } : d));
        return;
      }

      const contentLength = Number(res.headers.get("Content-Length")) || fileSize || 0;
      const disposition = res.headers.get("Content-Disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : fallbackName;

      if (!res.body) {
        // Sin stream, descargar como blob directamente
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress: 100, status: "done" } : d));
        setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== downloadId)), 3000);
        return;
      }

      // Leer el stream con progreso
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        const progress = contentLength > 0 ? Math.round((receivedLength / contentLength) * 100) : 0;
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress, size: contentLength || receivedLength } : d));
      }

      // Crear blob y descargar
      const blob = new Blob(chunks.map(c => new Uint8Array(c)));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress: 100, status: "done" } : d));
      setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== downloadId)), 3000);
    } catch {
      setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, status: "error", error: "Error de conexión" } : d));
    }
  };

  const downloadFolderAsZip = async (folderId: string, folderName: string) => {
    const token = await getToken();
    const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "https://pvmdrive-production.up.railway.app";
    const downloadId = crypto.randomUUID();

    // Agregar al panel de descargas
    setDownloads((prev) => [...prev, {
      id: downloadId, name: `${folderName}.zip`, size: 0, progress: 0, status: "downloading",
    }]);
    setShowDownloadPanel(true);

    try {
      const res = await fetch(`${uploadUrl}/download-folder/${folderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, status: "error", error: "Error al crear ZIP" } : d));
        return;
      }

      // Descargar el ZIP como blob
      const contentLength = Number(res.headers.get("Content-Length")) || 0;
      
      if (!res.body) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${folderName}.zip`; a.click();
        URL.revokeObjectURL(url);
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress: 100, status: "done" } : d));
        setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== downloadId)), 3000);
        return;
      }

      // Leer el stream con progreso
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        const progress = contentLength > 0 ? Math.round((receivedLength / contentLength) * 100) : 0;
        setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress, size: receivedLength } : d));
      }

      // Crear blob y descargar
      const blob = new Blob(chunks.map(c => new Uint8Array(c)));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, progress: 100, status: "done" } : d));
      setTimeout(() => setDownloads((prev) => prev.filter((d) => d.id !== downloadId)), 3000);
    } catch {
      setDownloads((prev) => prev.map((d) => d.id === downloadId ? { ...d, status: "error", error: "Error de conexión" } : d));
    }
  };

  const openShareModal = async (id: string, type: "file" | "folder", name: string) => {
    setShareModal({ id, type, name });
    setShareEmail("");
    setSharePermission("view");
    setShareError("");
    setPublicLink(null);
    setPublicLinkCopied(false);
    setShareLoading(true);
    try {
      const token = await getToken();
      const [sharesRes, linkRes] = await Promise.all([
        fetch(`/api/shares?resourceId=${id}&resourceType=${type}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/share-links?resourceId=${id}&resourceType=${type}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const sharesData = await sharesRes.json();
      setExistingShares(sharesData.shares || []);
      const linkData = await linkRes.json();
      if (linkData.link) {
        setPublicLink({ token: linkData.link.token, permission: linkData.link.permission });
      }
    } catch {
      setExistingShares([]);
    } finally {
      setShareLoading(false);
    }
    setActiveMenu(null);
  };

  const submitShare = async () => {
    if (!shareModal || !shareEmail.trim()) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      setShareError("Correo electrónico inválido");
      return;
    }
    setShareLoading(true);
    setShareError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: shareModal.id,
          resourceType: shareModal.type,
          email: shareEmail.trim(),
          permission: sharePermission,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al compartir");
      setShareEmail("");
      const listRes = await fetch(`/api/shares?resourceId=${shareModal.id}&resourceType=${shareModal.type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      setExistingShares(listData.shares || []);
    } catch (err: unknown) {
      setShareError(err instanceof Error ? err.message : "Error al compartir");
    } finally {
      setShareLoading(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    const token = await getToken();
    await fetch(`/api/shares/${shareId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (shareModal) openShareModal(shareModal.id, shareModal.type, shareModal.name);
  };

  const togglePublicLink = async () => {
    if (!shareModal) return;
    setPublicLinkLoading(true);
    try {
      const token = await getToken();
      if (publicLink) {
        // Desactivar link
        await fetch("/api/share-links", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId: shareModal.id, resourceType: shareModal.type }),
        });
        setPublicLink(null);
      } else {
        // Crear link
        const res = await fetch("/api/share-links", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId: shareModal.id, resourceType: shareModal.type, permission: "download" }),
        });
        const data = await res.json();
        if (data.link) {
          setPublicLink({ token: data.link.token, permission: data.link.permission });
        }
      }
    } catch {
      // ignorar error
    } finally {
      setPublicLinkLoading(false);
    }
  };

  const copyPublicLink = () => {
    if (!publicLink) return;
    const url = `${window.location.origin}/share/${publicLink.token}`;
    navigator.clipboard.writeText(url);
    setPublicLinkCopied(true);
    setTimeout(() => setPublicLinkCopied(false), 2000);
  };

  const openInfoModal = async (id: string, type: "file" | "folder", name: string) => {
    setInfoModal({ id, type, name });
    setActiveMenu(null);
    try {
      const token = await getToken();
      const list = type === "file" ? files : folders;
      const item = list.find((i) => i.id === id);
      if (item) setInfoData(item as unknown as Record<string, unknown>);
    } catch {
      setInfoData(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  };

  const formatDate = (d: Date | unknown) => {
    if (!d) return "—";
    try {
      const date = d instanceof Date ? d : new Date(d as string | number);
      return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const getSharePermission = (id: string, type: "file" | "folder") => {
    const list = type === "file" ? files : folders;
    return list.find((item) => item.id === id)?.sharePermission;
  };

  const getItemStarred = (id: string, type: "file" | "folder") => {
    const list = type === "file" ? files : folders;
    return list.find((item) => item.id === id)?.starred || false;
  };

  // Calcular posición del menú para que no salga de pantalla
  const getMenuPosition = useCallback((x: number, y: number) => {
    const menuWidth = 200;
    const menuHeight = 400;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: x + menuWidth > vw ? Math.max(8, x - menuWidth) : x,
      y: y + menuHeight > vh ? Math.max(8, y - menuHeight) : y,
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent, id: string, type: "file" | "folder", name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenu({ id, type, name, x: e.clientX, y: e.clientY });
  };

  // Menú contextual completo
  const ContextMenu = ({ menu }: { menu: { id: string; type: "file" | "folder"; name: string; x: number; y: number } }) => {
    const pos = getMenuPosition(menu.x, menu.y);
    const isStarred = getItemStarred(menu.id, menu.type);
    const canEdit = !isSharedView || getSharePermission(menu.id, menu.type) === "edit";
    const isOwner = !isSharedView;

    return (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} onContextMenu={(e) => { e.preventDefault(); setActiveMenu(null); }} />
        <div ref={menuRef} className="fixed z-50 bg-white shadow-2xl border rounded-xl p-1.5 w-52 max-w-[calc(100vw-1rem)]" style={{ top: pos.y, left: pos.x }}>
          {/* Abrir / Descargar */}
          {menu.type === "folder" ? (
            <>
              <button onClick={() => { navigateToFolder(menu.id, menu.name); setActiveMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                <FolderIcon className="h-4 w-4 text-amber-500" /> Abrir carpeta
              </button>
              <button onClick={() => { downloadFolderAsZip(menu.id, menu.name); setActiveMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                <Download className="h-4 w-4 text-blue-500" /> Descargar como ZIP
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { const f = files.find(f => f.id === menu.id); previewFile(menu.id, menu.name, f?.mimeType || 'application/octet-stream'); setActiveMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Vista previa
              </button>
              <button onClick={() => { const f = files.find(f => f.id === menu.id); downloadFile(menu.id, menu.name, f?.size); setActiveMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                <Download className="h-4 w-4 text-blue-500" /> Descargar
              </button>
            </>
          )}

          <hr className="my-1" />

          {/* Favorito */}
          {isOwner && (
            <button onClick={() => toggleStar(menu.id, menu.type, isStarred)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              {isStarred ? <StarOff className="h-4 w-4 text-amber-500" /> : <Star className="h-4 w-4 text-amber-500" />}
              {isStarred ? "Quitar favorito" : "Agregar a favoritos"}
            </button>
          )}

          {/* Compartir */}
          {isOwner && (
            <button onClick={() => openShareModal(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              <Share2 className="h-4 w-4 text-green-500" /> Compartir
            </button>
          )}

          <hr className="my-1" />

          {/* Renombrar */}
          {canEdit && (
            <button onClick={() => renameItem(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              <Edit2 className="h-4 w-4 text-gray-500" /> Renombrar
            </button>
          )}

          {/* Copiar */}
          {canEdit && (
            <button onClick={() => copyItem(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              <Copy className="h-4 w-4 text-gray-500" /> Copiar
            </button>
          )}

          {/* Cortar */}
          {canEdit && (
            <button onClick={() => cutItem(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              <Scissors className="h-4 w-4 text-gray-500" /> Cortar
            </button>
          )}

          {/* Mover a... */}
          {canEdit && isOwner && (
            <button onClick={() => { moveItem(menu.id, menu.type, null); setActiveMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
              <Move className="h-4 w-4 text-gray-500" /> Mover a raíz
            </button>
          )}

          <hr className="my-1" />

          {/* Info */}
          <button onClick={() => openInfoModal(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
            <Info className="h-4 w-4 text-gray-400" /> Información
          </button>

          {/* Borrar */}
          {canEdit && (
            <>
              <hr className="my-1" />
              <button onClick={() => deleteItem(menu.id, menu.type, menu.name)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 className="h-4 w-4" /> Mover a papelera
              </button>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Marca */}
        <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
            <HardDrive className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 leading-tight">PVM Drive</h2>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>

        {/* Botón Nuevo */}
        <div className="px-4 pb-2 relative">
          <button
            onClick={() => setNewMenuOpen((v) => !v)}
            className="flex items-center gap-3 pl-4 pr-5 py-3 rounded-2xl bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-md hover:bg-slate-50 transition text-sm font-medium text-slate-700"
          >
            <Plus className="h-5 w-5 text-blue-600" /> Nuevo
          </button>
          {newMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNewMenuOpen(false)} />
              <div className="absolute left-4 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-56 animate-pop-in">
                <button
                  onClick={() => { setNewMenuOpen(false); setNewFolderOpen(true); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-100 text-slate-700"
                >
                  <FolderIcon className="h-4 w-4 text-amber-500" /> Nueva carpeta
                </button>
                <hr className="my-1 border-slate-100" />
                <button
                  onClick={() => { setNewMenuOpen(false); fileInputRef.current?.click(); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-100 text-slate-700"
                >
                  <UploadCloud className="h-4 w-4 text-blue-500" /> Subir archivos
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); folderInputRef.current?.click(); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-slate-100 text-slate-700"
                >
                  <FolderUp className="h-4 w-4 text-blue-500" /> Subir carpeta
                </button>
              </div>
            </>
          )}
        </div>

        {/* Navegación */}
        <nav className="px-3 flex-1 space-y-0.5 mt-1 overflow-y-auto">
          {([
            { mode: "drive" as const, icon: HardDrive, label: "Mi unidad" },
            { mode: "starred" as const, icon: Star, label: "Destacados" },
            { mode: "recent" as const, icon: Clock, label: "Recientes" },
            { mode: "shared" as const, icon: Users, label: "Compartido conmigo" },
          ]).map(({ mode, icon: Icon, label }) => {
            const active = !trashView && viewMode === mode;
            return (
              <button
                key={mode}
                onClick={() => switchView(mode)}
                className={`flex items-center gap-3 w-full pl-4 pr-3 py-2.5 rounded-full text-sm font-medium transition ${active ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icon className={`h-[18px] w-[18px] ${active ? "text-blue-700" : "text-slate-500"}`} /> {label}
              </button>
            );
          })}
          <button
            onClick={openTrash}
            className={`flex items-center gap-3 w-full pl-4 pr-3 py-2.5 rounded-full text-sm font-medium transition ${trashView ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Trash2 className={`h-[18px] w-[18px] ${trashView ? "text-blue-700" : "text-slate-500"}`} /> Papelera
          </button>
        </nav>

        {/* Barra de almacenamiento */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
            <HardDrive className="h-4 w-4" /> Almacenamiento
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                storage && storage.used / storage.limit > 0.9 ? "bg-red-500" : "bg-blue-600"
              }`}
              style={{ width: `${storage ? Math.min(100, (storage.used / storage.limit) * 100) : 0}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {storage ? `${formatSize(storage.used)} de ${formatSize(storage.limit)}` : "Calculando…"}
          </p>
        </div>

        {/* Inputs ocultos para subir */}
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          onChange={handleFolderSelect}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm text-gray-500 mb-1 flex-wrap">
                  {breadcrumbs.map((crumb, i) => (
                    <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3" />}
                      <button
                        onClick={() => {
                          setCurrentFolderId(crumb.id);
                          setBreadcrumbs((prev) => prev.slice(0, i + 1));
                        }}
                        className={`hover:text-blue-600 truncate max-w-[160px] ${i === breadcrumbs.length - 1 ? "text-gray-900 font-medium" : ""}`}
                      >
                        {i === 0 ? <span className="flex items-center gap-1"><Home className="h-3 w-3" />{crumb.name}</span> : crumb.name}
                      </button>
                    </span>
                  ))}
                </div>
                <h1 className="text-xl font-semibold text-gray-900 truncate">
                  {breadcrumbs[breadcrumbs.length - 1]?.name || "Mi unidad"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Barra de búsqueda */}
              {!trashView && (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar archivos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border rounded-lg text-sm w-48 sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-2 p-0.5 hover:bg-gray-200 rounded"
                    >
                      <X className="h-3 w-3 text-gray-400" />
                    </button>
                  )}
                </div>
              )}
              
              {/* Toggle vista cuadrícula/lista */}
              {!trashView && (
                <div className="flex items-center bg-slate-100 rounded-full p-0.5">
                  <button
                    onClick={() => setListView(false)}
                    className={`p-1.5 rounded-full transition ${!listView ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    title="Vista de cuadrícula"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setListView(true)}
                    className={`p-1.5 rounded-full transition ${listView ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                    title="Vista de lista"
                  >
                    <ListIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
              
              {/* Control de ordenamiento */}
              <div className="relative group">
                <button className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-200 transition text-sm font-medium">
                  <span className="hidden sm:inline">Ordenar por</span>
                  {sortBy === "name" ? "Nombre" : sortBy === "size" ? "Tamaño" : "Fecha"}
                  {sortDirection === "asc" ? " ↑" : " ↓"}
                </button>
                <div className="absolute right-0 top-full mt-2 bg-white border rounded-lg shadow-lg p-1 min-w-[180px] hidden group-hover:block z-10">
                  <button
                    onClick={() => { setSortBy("name"); setSortDirection(sortBy === "name" && sortDirection === "asc" ? "desc" : "asc"); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 flex items-center justify-between ${sortBy === "name" ? "bg-blue-50 text-blue-700" : ""}`}
                  >
                    <span>Nombre</span>
                    {sortBy === "name" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}
                  </button>
                  <button
                    onClick={() => { setSortBy("size"); setSortDirection(sortBy === "size" && sortDirection === "asc" ? "desc" : "asc"); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 flex items-center justify-between ${sortBy === "size" ? "bg-blue-50 text-blue-700" : ""}`}
                  >
                    <span>Tamaño</span>
                    {sortBy === "size" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}
                  </button>
                  <button
                    onClick={() => { setSortBy("date"); setSortDirection(sortBy === "date" && sortDirection === "asc" ? "desc" : "asc"); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 flex items-center justify-between ${sortBy === "date" ? "bg-blue-50 text-blue-700" : ""}`}
                  >
                    <span>Fecha</span>
                    {sortBy === "date" && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </div>
              </div>
              
              {/* Botón Pegar */}
              {clipboard && !isSharedView && (
                <button
                  onClick={pasteItem}
                  className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-200 transition text-sm font-medium"
                  title={`Pegar: ${clipboard.name} (${clipboard.action === "cut" ? "Cortar" : "Copiar"})`}
                >
                  <ClipboardPaste className="h-4 w-4" /> <span className="hidden sm:inline">Pegar</span>
                  <button onClick={(e) => { e.stopPropagation(); setClipboard(null); }} className="ml-1 hover:text-orange-900">
                    <X className="h-3 w-3" />
                  </button>
                </button>
              )}
              {viewMode === "drive" && !isSharedView && (
                <label className="bg-blue-600 text-white px-3 py-2 sm:px-4 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition cursor-pointer text-sm font-medium">
                  <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Subir archivos</span>
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                </label>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6"
          onContextMenu={(e) => {
            e.preventDefault();
          }}
        >
          {/* Vista de Papelera */}
          {trashView ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Papelera</h2>
                {trashItems.length > 0 && (
                  <button
                    onClick={emptyTrash}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium"
                  >
                    Vaciar papelera
                  </button>
                )}
              </div>
              
              {trashLoading ? (
                <div className="flex justify-center p-20"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>
              ) : trashItems.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <Trash2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">La papelera está vacía</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 font-medium">Nombre</th>
                        <th className="px-4 py-3 font-medium hidden sm:table-cell">Tamaño</th>
                        <th className="px-4 py-3 font-medium hidden md:table-cell">Eliminado</th>
                        <th className="px-4 py-3 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashItems.map((item) => (
                        <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.type === "folder" ? (
                                <FolderIcon className="h-5 w-5 text-amber-500" />
                              ) : (
                                <FileIcon className="h-5 w-5 text-blue-500" />
                              )}
                              <span className="font-medium text-gray-900 truncate">{item.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-sm hidden sm:table-cell">
                            {item.size ? formatSize(item.size) : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm hidden md:table-cell">
                            {item.deletedAt ? new Date(item.deletedAt.toDate()).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => restoreItem(item.id, item.type)}
                                className="text-blue-600 hover:bg-blue-50 px-2 py-1 rounded text-sm font-medium"
                              >
                                Restaurar
                              </button>
                              <button
                                onClick={() => permanentDelete(item.id, item.type)}
                                className="text-red-600 hover:bg-red-50 px-2 py-1 rounded text-sm font-medium"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex justify-center p-20"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>
          ) : files.length === 0 && folders.length === 0 ? (
            <div className="text-center py-24 text-slate-400">
              {viewMode === "starred" ? <Star className="h-14 w-14 mx-auto mb-3 text-slate-200" />
                : viewMode === "recent" ? <Clock className="h-14 w-14 mx-auto mb-3 text-slate-200" />
                : viewMode === "shared" ? <Users className="h-14 w-14 mx-auto mb-3 text-slate-200" />
                : <FolderOpen className="h-14 w-14 mx-auto mb-3 text-slate-200" />}
              <p className="font-medium text-slate-500">
                {viewMode === "starred" ? "No tienes elementos destacados"
                  : viewMode === "recent" ? "No hay archivos recientes"
                  : viewMode === "shared" ? "Nada compartido contigo aún"
                  : "Esta carpeta está vacía"}
              </p>
              <p className="text-sm mt-1">
                {viewMode === "starred" ? "Marca archivos con ⭐ para verlos aquí"
                  : viewMode === "shared" ? "Cuando alguien comparta algo aparecerá aquí"
                  : viewMode === "recent" ? "Sube archivos para verlos aquí"
                  : "Arrastra archivos o usa el botón Nuevo"}
              </p>
            </div>
          ) : listView ? (
            /* ===================== VISTA DE LISTA ===================== */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Tamaño</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Compartido por</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => (
                    <tr
                      key={folder.id}
                      className={`border-b border-slate-50 hover:bg-blue-50/40 transition group cursor-pointer ${clipboard?.id === folder.id && clipboard.action === "cut" ? "opacity-50" : ""}`}
                      onContextMenu={(e) => handleContextMenu(e, folder.id, "folder", folder.name)}
                      onClick={() => navigateToFolder(folder.id, displayFilename(folder.name))}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                            <FolderIcon className="h-5 w-5 text-amber-500" />
                          </div>
                          <span className="font-medium text-slate-700 truncate">{displayFilename(folder.name)}</span>
                          {folder.starred && <Star className="h-3.5 w-3.5 text-amber-400 shrink-0 fill-amber-400" />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-sm hidden sm:table-cell">—</td>
                      <td className="px-4 py-2.5 text-slate-500 text-sm hidden md:table-cell">{folder.sharedBy || "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setActiveMenu({ id: folder.id, type: "folder", name: folder.name, x: e.clientX, y: e.clientY }); }} className="p-1.5 hover:bg-slate-200 rounded-full opacity-0 group-hover:opacity-100 transition">
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.map((file) => {
                    const style = getFileStyle(file.mimeType, file.name);
                    return (
                      <tr
                        key={file.id}
                        className={`border-b border-slate-50 hover:bg-blue-50/40 transition group cursor-pointer ${clipboard?.id === file.id && clipboard.action === "cut" ? "opacity-50" : ""}`}
                        onContextMenu={(e) => handleContextMenu(e, file.id, "file", file.name)}
                        onClick={() => previewFile(file.id, file.name, file.mimeType || "application/octet-stream")}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <FileThumbnail
                              fileId={file.id} name={file.name} mimeType={file.mimeType} size={file.size}
                              getToken={getToken} iconClassName="h-5 w-5"
                              className="h-9 w-9 rounded-lg shrink-0"
                            />
                            <span className="font-medium text-slate-700 truncate">{displayFilename(file.name)}</span>
                            {file.starred && <Star className="h-3.5 w-3.5 text-amber-400 shrink-0 fill-amber-400" />}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-sm hidden sm:table-cell">{formatSize(file.size)}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-sm hidden md:table-cell">{file.sharedBy || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={(e) => { e.stopPropagation(); setActiveMenu({ id: file.id, type: "file", name: file.name, x: e.clientX, y: e.clientY }); }} className="p-1.5 hover:bg-slate-200 rounded-full opacity-0 group-hover:opacity-100 transition">
                            <MoreVertical className="h-4 w-4 text-slate-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ===================== VISTA DE CUADRÍCULA ===================== */
            <div className="space-y-6">
              {folders.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-slate-600 mb-3">Carpetas</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {folders.map((folder) => (
                      <div
                        key={folder.id}
                        onClick={() => navigateToFolder(folder.id, displayFilename(folder.name))}
                        onContextMenu={(e) => handleContextMenu(e, folder.id, "folder", folder.name)}
                        className={`group relative flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3.5 py-3 cursor-pointer hover:shadow-md hover:border-slate-300 transition ${clipboard?.id === folder.id && clipboard.action === "cut" ? "opacity-50" : ""}`}
                      >
                        <FolderIcon className="h-6 w-6 text-amber-500 shrink-0" />
                        <span className="text-sm font-medium text-slate-700 truncate flex-1">{displayFilename(folder.name)}</span>
                        {folder.starred && <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveMenu({ id: folder.id, type: "folder", name: folder.name, x: e.clientX, y: e.clientY }); }}
                          className="p-1 hover:bg-slate-100 rounded-full opacity-0 group-hover:opacity-100 transition shrink-0"
                        >
                          <MoreVertical className="h-4 w-4 text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {files.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-slate-600 mb-3">Archivos</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {files.map((file) => {
                      const style = getFileStyle(file.mimeType, file.name);
                      const TypeIcon = style.icon;
                      return (
                        <div
                          key={file.id}
                          onClick={() => previewFile(file.id, file.name, file.mimeType || "application/octet-stream")}
                          onContextMenu={(e) => handleContextMenu(e, file.id, "file", file.name)}
                          className={`group relative bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:border-slate-300 transition ${clipboard?.id === file.id && clipboard.action === "cut" ? "opacity-50" : ""}`}
                        >
                          {file.starred && (
                            <div className="absolute top-2 left-2 z-10 h-6 w-6 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm">
                              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                            </div>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveMenu({ id: file.id, type: "file", name: file.name, x: e.clientX, y: e.clientY }); }}
                            className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition"
                          >
                            <MoreVertical className="h-4 w-4 text-slate-600" />
                          </button>
                          <FileThumbnail
                            fileId={file.id} name={file.name} mimeType={file.mimeType} size={file.size}
                            getToken={getToken} iconClassName="h-12 w-12"
                            className="aspect-[4/3] w-full"
                          />
                          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100">
                            <TypeIcon className={`h-4 w-4 shrink-0 ${style.color}`} />
                            <span className="text-sm font-medium text-slate-700 truncate flex-1">{displayFilename(file.name)}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{formatSize(file.size)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {isDragging && (
        <div className="fixed inset-0 z-40 bg-blue-600/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl p-12 shadow-2xl border-4 border-dashed border-blue-500 text-center">
            <Upload className="h-16 w-16 text-blue-500 mx-auto mb-3" />
            <p className="text-xl font-bold text-gray-800">Suelta archivos aquí</p>
          </div>
        </div>
      )}

      {showUploadPanel && uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 sm:w-80 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b">
            <span className="font-semibold text-sm">
              {uploads.some((u) => u.status === "uploading") ? "Subiendo..." : "Completado"}
            </span>
            <button onClick={() => setShowUploadPanel(false)} className="p-1 hover:bg-gray-200 rounded"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {uploads.map((u) => (
              <div key={u.id} className="p-3 border-b last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  {u.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {u.status === "done" && <Check className="h-4 w-4 text-green-500" />}
                  {u.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                  <span className="text-sm truncate flex-1">{u.name}</span>
                  <span className="text-xs text-gray-400">{formatSize(u.size)}</span>
                </div>
                {u.error && <p className="text-xs text-red-500">{u.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {showDownloadPanel && downloads.length > 0 && (
        <div className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 sm:w-80 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b">
            <span className="font-semibold text-sm">
              {downloads.some((d) => d.status === "downloading") ? "Descargando..." : "Completado"}
            </span>
            <button onClick={() => setShowDownloadPanel(false)} className="p-1 hover:bg-gray-200 rounded"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {downloads.map((d) => (
              <div key={d.id} className="p-3 border-b last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  {d.status === "downloading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {d.status === "done" && <Check className="h-4 w-4 text-green-500" />}
                  {d.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                  <span className="text-sm truncate flex-1">{d.name}</span>
                  <span className="text-xs text-gray-400">{formatSize(d.size)}</span>
                </div>
                {d.status === "downloading" && d.progress > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${d.progress}%` }} />
                  </div>
                )}
                {d.status === "downloading" && d.progress > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{d.progress}%</p>
                )}
                {d.error && <p className="text-xs text-red-500">{d.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMenu && <ContextMenu menu={activeMenu} />}

      {shareModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShareModal(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Compartir</h3>
              <button onClick={() => setShareModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4 truncate">
              <Share2 className="h-4 w-4 inline mr-1" />
              {displayFilename(shareModal.name)}
            </p>

            {/* Link público */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Link público</span>
                </div>
                <button
                  onClick={togglePublicLink}
                  disabled={publicLinkLoading}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${publicLink ? 'bg-blue-600' : 'bg-gray-300'} disabled:opacity-50`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${publicLink ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {publicLink && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${publicLink.token}`}
                    className="flex-1 bg-white border rounded-lg px-3 py-1.5 text-xs text-gray-600 truncate"
                  />
                  <button
                    onClick={copyPublicLink}
                    className="p-1.5 hover:bg-gray-200 rounded-lg transition shrink-0"
                    title="Copiar link"
                  >
                    {publicLinkCopied ? <CopyCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-gray-500" />}
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">Cualquiera con el link puede ver y descargar</p>
            </div>

            {/* Compartir por email */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase">Compartir con personas</p>
              <input
                type="email"
                placeholder="correo@ejemplo.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={sharePermission}
                onChange={(e) => setSharePermission(e.target.value as "view" | "edit")}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="view">Puede ver y descargar</option>
                <option value="edit">Puede editar y borrar</option>
              </select>
              {shareError && <p className="text-sm text-red-500">{shareError}</p>}
              <button
                onClick={submitShare}
                disabled={shareLoading || !shareEmail.trim()}
                className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {shareLoading ? "Guardando..." : "Dar acceso"}
              </button>
            </div>
            {existingShares.length > 0 && (
              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Personas con acceso</p>
                <ul className="space-y-2">
                  {existingShares.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.sharedWithEmail}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{s.permission === "edit" ? "Editor" : "Lector"}</span>
                        <button onClick={() => revokeShare(s.id)} className="text-red-500 hover:text-red-700 text-xs">Quitar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4">La persona debe tener cuenta en PVM Drive con ese correo.</p>
          </div>
        </>
      )}

      {/* Modal de Información */}
      {infoModal && infoData && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => { setInfoModal(null); setInfoData(null); }} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Información</h3>
              <button onClick={() => { setInfoModal(null); setInfoData(null); }} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              {infoModal.type === "folder" ? (
                <FolderIcon className="h-10 w-10 text-amber-500" />
              ) : (
                <FileIcon className="h-10 w-10 text-blue-500" />
              )}
              <p className="font-medium text-gray-900 truncate">{displayFilename(infoModal.name)}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Tipo</span>
                <span className="text-gray-900">{infoModal.type === "folder" ? "Carpeta" : (infoData.mimeType as string || "Archivo")}</span>
              </div>
              {infoModal.type === "file" && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tamaño</span>
                  <span className="text-gray-900">{formatSize(infoData.size as number)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Favorito</span>
                <span className="text-gray-900">{infoData.starred ? "Sí" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Compartido</span>
                <span className="text-gray-900">{infoData.shared ? "Sí" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Creado</span>
                <span className="text-gray-900">{formatDate(infoData.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Modificado</span>
                <span className="text-gray-900">{formatDate(infoData.updatedAt)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Preview */}
      {previewModal && (
        <>
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={closePreview} />
          <div className="fixed inset-4 sm:inset-8 bg-white rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
            {/* Header del modal */}
            <div className="bg-gray-50 px-4 sm:px-6 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 truncate flex-1">{previewModal.name}</h3>
              <button onClick={closePreview} className="ml-4 p-1.5 hover:bg-gray-200 rounded-lg transition">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            {/* Contenido del preview */}
            <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-4">
              {previewModal.mimeType.startsWith('image/') ? (
                <img src={previewModal.url} alt={previewModal.name} className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
              ) : previewModal.mimeType.startsWith('video/') ? (
                <video src={previewModal.url} controls className="max-w-full max-h-full rounded-lg shadow-lg" />
              ) : previewModal.mimeType === 'application/pdf' ? (
                <iframe src={previewModal.url} className="w-full h-full border-0 rounded-lg" />
              ) : (
                <div className="text-center text-gray-500">
                  <FileIcon className="h-24 w-24 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Vista previa no disponible</p>
                  <p className="text-sm mt-1">{previewModal.mimeType}</p>
                  <button
                    onClick={() => downloadFile(previewModal.id, previewModal.name)}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    Descargar archivo
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Diálogo: nueva carpeta */}
      <PromptDialog
        open={newFolderOpen}
        title="Nueva carpeta"
        label="Nombre de la carpeta"
        placeholder="Carpeta sin título"
        defaultValue="Carpeta sin título"
        confirmText="Crear"
        onConfirm={doCreateFolder}
        onCancel={() => setNewFolderOpen(false)}
      />

      {/* Diálogo: renombrar */}
      <PromptDialog
        open={!!renameTarget}
        title="Cambiar nombre"
        label="Nuevo nombre"
        defaultValue={renameTarget?.name || ""}
        confirmText="Guardar"
        onConfirm={doRename}
        onCancel={() => setRenameTarget(null)}
      />

      {/* Diálogo: confirmaciones */}
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title || ""}
        message={confirmState?.message}
        danger={confirmState?.danger}
        confirmText={confirmState?.confirmText}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
