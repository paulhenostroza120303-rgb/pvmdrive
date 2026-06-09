"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { DriveFile, Folder, BreadcrumbItem } from "@/types";
import { displayFilename } from "@/lib/filename";
import {
  Loader2, Upload, File as FileIcon, Folder as FolderIcon, Plus,
  Trash2, Edit2, Download, ChevronRight, MoreVertical, X, Check, AlertCircle,
  HardDrive, Users, Share2, Home
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

type ViewMode = "drive" | "shared";

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
  const [activeMenu, setActiveMenu] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [shareModal, setShareModal] = useState<{ id: string; type: "file" | "folder"; name: string } | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePermission, setSharePermission] = useState<"view" | "edit">("view");
  const [existingShares, setExistingShares] = useState<ShareEntry[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    if (!user) router.push("/login");
    else fetchContents();
  }, [user, currentFolderId, viewMode]);

  const getToken = async () => {
    const token = await user?.getIdToken();
    if (!token) throw new Error("No autenticado");
    return token;
  };

  const fetchContents = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const sharedRoot = viewMode === "shared" && !currentFolderId;
      const url = sharedRoot
        ? `/api/files?shared=true`
        : `/api/files?parentId=${currentFolderId || ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error cargando archivos");
      setFiles(data.files || []);
      setFolders(data.folders || []);
      setIsSharedView(Boolean(data.isSharedView || sharedRoot));
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
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

  const switchView = (mode: ViewMode) => {
    setViewMode(mode);
    setCurrentFolderId(null);
    setBreadcrumbs([{ id: null, name: mode === "shared" ? "Compartido conmigo" : "Mi unidad" }]);
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

  const processEntry = async (entry: FileSystemEntry, parentId: string | null, token: string) => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      await uploadFile(file, parentId, token);
    } else if (entry.isDirectory) {
      const folderId = await createFolderInDB(entry.name, parentId, token);
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const subEntries = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve));
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

  const createFolder = async () => {
    const name = prompt("Nombre de la carpeta:");
    if (!name || isSharedView) return;
    const token = await getToken();
    await fetch("/api/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: currentFolderId }),
    });
    fetchContents();
  };

  const deleteItem = async (id: string, type: "file" | "folder") => {
    if (!confirm(`¿Borrar ${type === "file" ? "archivo" : "carpeta"}?`)) return;
    const token = await getToken();
    await fetch(`/api/items/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    setActiveMenu(null);
    fetchContents();
  };

  const renameItem = async (id: string, type: "file" | "folder", currentName: string) => {
    const newName = prompt("Nuevo nombre:", currentName);
    if (!newName) return;
    const token = await getToken();
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type }),
    });
    setActiveMenu(null);
    fetchContents();
  };

  const downloadFile = async (id: string, fallbackName: string) => {
    const token = await getToken();
    const res = await fetch(`/api/items/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert("No se pudo descargar el archivo"); return; }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openShareModal = async (id: string, type: "file" | "folder", name: string) => {
    setShareModal({ id, type, name });
    setShareEmail("");
    setSharePermission("view");
    setShareError("");
    setShareLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/shares?resourceId=${id}&resourceType=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setExistingShares(data.shares || []);
    } catch {
      setExistingShares([]);
    } finally {
      setShareLoading(false);
    }
    setActiveMenu(null);
  };

  const submitShare = async () => {
    if (!shareModal || !shareEmail.trim()) return;
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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getSharePermission = (id: string, type: "file" | "folder") => {
    const list = type === "file" ? files : folders;
    return list.find((item) => item.id === id)?.sharePermission;
  };

  return (
    <div className="flex h-screen bg-gray-50" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-blue-600">CloudGram</h2>
          <p className="text-xs text-gray-500 mt-1 truncate">{user?.email}</p>
        </div>
        <nav className="p-3 flex-1 space-y-1">
          <button
            onClick={() => switchView("drive")}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition ${viewMode === "drive" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <HardDrive className="h-4 w-4" /> Mi unidad
          </button>
          <button
            onClick={() => switchView("shared")}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition ${viewMode === "shared" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Users className="h-4 w-4" /> Compartido conmigo
          </button>
        </nav>
        {viewMode === "drive" && !isSharedView && (
          <div className="p-4 border-t">
            <button onClick={createFolder} className="flex items-center gap-2 w-full p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
              <Plus className="h-4 w-4" /> Nueva carpeta
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
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
            {viewMode === "drive" && !isSharedView && (
              <label className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition cursor-pointer text-sm font-medium shrink-0">
                <Upload className="h-4 w-4" /> Subir archivos
                <input type="file" multiple className="hidden" onChange={handleFileSelect} />
              </label>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center p-20"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>
          ) : files.length === 0 && folders.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <FolderIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Esta carpeta está vacía</p>
              <p className="text-sm mt-1">{viewMode === "shared" ? "Nadie ha compartido archivos contigo aún" : "Sube archivos o crea una carpeta"}</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium hidden sm:table-cell">Tamaño</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Compartido por</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => (
                    <tr key={folder.id} className="border-b hover:bg-gray-50 transition group">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigateToFolder(folder.id, displayFilename(folder.name))}
                          className="flex items-center gap-3 w-full text-left"
                        >
                          <FolderIcon className="h-5 w-5 text-amber-500 shrink-0" />
                          <span className="font-medium text-gray-900 truncate">{displayFilename(folder.name)}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm hidden sm:table-cell">—</td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden md:table-cell">{folder.sharedBy || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setActiveMenu({ id: folder.id, type: "folder", name: folder.name })} className="p-1.5 hover:bg-gray-200 rounded-lg opacity-0 group-hover:opacity-100 transition">
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.map((file) => (
                    <tr key={file.id} className="border-b hover:bg-gray-50 transition group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FileIcon className="h-5 w-5 text-blue-500 shrink-0" />
                          <span className="font-medium text-gray-900 truncate">{displayFilename(file.name)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden sm:table-cell">{formatSize(file.size)}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden md:table-cell">{file.sharedBy || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setActiveMenu({ id: file.id, type: "file", name: file.name })} className="p-1.5 hover:bg-gray-200 rounded-lg opacity-0 group-hover:opacity-100 transition">
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
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

      {activeMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
          <div className="fixed z-50 bg-white shadow-2xl border rounded-xl p-1.5 w-48" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
            {activeMenu.type === "folder" ? (
              <>
                <button onClick={() => { navigateToFolder(activeMenu.id, activeMenu.name); setActiveMenu(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                  <FolderIcon className="h-4 w-4" /> Abrir
                </button>
                {(!isSharedView || getSharePermission(activeMenu.id, "folder") === "edit") && (
                  <>
                    {!isSharedView && (
                      <button onClick={() => openShareModal(activeMenu.id, "folder", activeMenu.name)} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                        <Share2 className="h-4 w-4" /> Compartir
                      </button>
                    )}
                    <button onClick={() => renameItem(activeMenu.id, "folder", activeMenu.name)} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                      <Edit2 className="h-4 w-4" /> Renombrar
                    </button>
                    <hr className="my-1" />
                    <button onClick={() => deleteItem(activeMenu.id, "folder")} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="h-4 w-4" /> Borrar
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button onClick={() => { downloadFile(activeMenu.id, activeMenu.name); setActiveMenu(null); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                  <Download className="h-4 w-4" /> Descargar
                </button>
                {(!isSharedView || getSharePermission(activeMenu.id, "file") === "edit") && (
                  <>
                    {!isSharedView && (
                      <button onClick={() => openShareModal(activeMenu.id, "file", activeMenu.name)} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                        <Share2 className="h-4 w-4" /> Compartir
                      </button>
                    )}
                    <button onClick={() => renameItem(activeMenu.id, "file", activeMenu.name)} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 rounded-lg">
                      <Edit2 className="h-4 w-4" /> Renombrar
                    </button>
                    <hr className="my-1" />
                    <button onClick={() => deleteItem(activeMenu.id, "file")} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="h-4 w-4" /> Borrar
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {shareModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setShareModal(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Compartir</h3>
              <button onClick={() => setShareModal(null)} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4 truncate">
              <Share2 className="h-4 w-4 inline mr-1" />
              {displayFilename(shareModal.name)}
            </p>
            <div className="space-y-3">
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
            <p className="text-xs text-gray-400 mt-4">La persona debe tener cuenta en CloudGram con ese correo.</p>
          </div>
        </>
      )}
    </div>
  );
}
