"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase-client";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import { DriveFile, Folder } from "@/types";
import {
  Loader2, Upload, File as FileIcon, Folder as FolderIcon, Plus,
  Trash2, Edit2, Download, ChevronLeft, MoreVertical, X, Check, AlertCircle
} from "lucide-react";

interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<(DriveFile & { type: 'file' })[]>([]);
  const [folders, setFolders] = useState<(Folder & { type: 'folder' })[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<{ id: string; type: 'file' | 'folder' } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!user) router.push("/login");
    else fetchContents();
  }, [user, currentFolderId]);

  const fetchContents = async () => {
    setLoading(true);
    const token = await user?.getIdToken();
    const res = await fetch(`/api/files?parentId=${currentFolderId || ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setFiles(data.files || []);
    setFolders(data.folders || []);
    setLoading(false);
  };

  const uploadFile = async (file: File, folderId: string | null, token: string) => {
    const uploadId = crypto.randomUUID();
    setUploads(prev => [...prev, {
      id: uploadId,
      name: file.name,
      size: file.size,
      progress: 0,
      status: "uploading"
    }]);
    setShowUploadPanel(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderId", folderId || "");

      const serverRes = await fetch("https://pvmdrive-production.up.railway.app/upload", {
        method: "POST",
        headers: { 
            "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      if (!serverRes.ok) {
        const errorData = await serverRes.json();
        throw new Error(errorData.error || "Error subiendo archivo al servidor");
      }

      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: 100, status: "done" } : u));
      setTimeout(() => setUploads(prev => prev.filter(u => u.id !== uploadId)), 3000);
      fetchContents();
    } catch (err: any) {
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: "error", error: err.message } : u));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const token = await user?.getIdToken();
    if (!token) return;
    for (const file of Array.from(fileList || [])) {
      await uploadFile(file, currentFolderId, token);
    }
    e.target.value = "";
    // fetchContents() is called inside uploadFile
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget === null) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const token = await user?.getIdToken();
    if (!token) return;

    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;
    if (items && items.length > 0) {
      const entries = Array.from(items)
        .map(item => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);
      for (const entry of entries) {
        await processEntry(entry, currentFolderId, token);
      }
    } else if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        await uploadFile(file, currentFolderId, token);
      }
    }
    fetchContents();
  };

  const processEntry = async (entry: FileSystemEntry, parentId: string | null, token: string) => {
    if (entry.name.startsWith('.')) return; // Ignorar archivos y carpetas ocultos

    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      await uploadFile(file, parentId, token);
    } else if (entry.isDirectory) {
      const folderId = await createFolderInDB(entry.name, parentId, token);
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const subEntries = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve);
      });
      for (const sub of subEntries) {
        await processEntry(sub, folderId, token);
      }
    }
  };

  const createFolderInDB = async (name: string, parentId: string | null, token: string) => {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId })
    });
    const data = await res.json();
    return data.id;
  };

  const createFolder = async () => {
    const name = prompt("Nombre de la carpeta:");
    if (!name) return;
    const token = await user?.getIdToken();
    await fetch("/api/folders", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: currentFolderId })
    });
    fetchContents();
  };

  const deleteItem = async (id: string, type: 'file' | 'folder') => {
    if (!confirm(`Borrar ${type === 'file' ? 'archivo' : 'carpeta'}?`)) return;
    const token = await user?.getIdToken();
    await fetch(`/api/items/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type })
    });
    setActiveMenu(null);
    fetchContents();
  };

  const renameItem = async (id: string, type: 'file' | 'folder', currentName: string) => {
    const newName = prompt("Nuevo nombre:", currentName);
    if (!newName) return;
    const token = await user?.getIdToken();
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type })
    });
    setActiveMenu(null);
    fetchContents();
  };

  const downloadFile = (id: string) => {
    window.location.href = `/api/items/${id}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div
      className="flex h-screen bg-white"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className="w-64 border-r p-6">
        <h2 className="text-2xl font-bold text-blue-600 mb-8">CloudGram</h2>
        <button onClick={createFolder} className="flex items-center gap-2 w-full p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          <Plus className="h-5 w-5" /> Nueva Carpeta
        </button>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="flex justify-between items-center px-8 py-4 border-b">
          <div className="flex items-center gap-2">
            {currentFolderId && <button onClick={() => setCurrentFolderId(null)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft className="h-5 w-5" /></button>}
            <h1 className="text-2xl font-semibold">Mi Unidad</h1>
          </div>
          <label className="bg-blue-600 text-white px-5 py-2 rounded-full flex items-center gap-2 hover:bg-blue-700 transition cursor-pointer">
            <Upload className="h-5 w-5" />
            Subir Archivos
            <input type="file" multiple className="hidden" onChange={handleFileSelect} />
          </label>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex justify-center p-20"><Loader2 className="animate-spin h-10 w-10 text-blue-600" /></div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 text-sm">
                    <th className="p-4 font-medium">Nombre</th>
                    <th className="p-4 font-medium">Tamano</th>
                    <th className="p-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => (
                    <tr key={folder.id} className="border-b hover:bg-gray-50 cursor-pointer transition">
                      <td className="p-4 flex items-center gap-3" onClick={() => setCurrentFolderId(folder.id)}>
                        <FolderIcon className="h-5 w-5 text-yellow-500" />
                        <span className="font-medium">{folder.name}</span>
                      </td>
                      <td className="p-4 text-gray-400 text-sm">--</td>
                      <td className="p-4 text-right">
                        <button onClick={(e) => { e.stopPropagation(); setActiveMenu({ id: folder.id, type: 'folder' }); }} className="p-1 hover:bg-gray-200 rounded">
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {files.map((file) => (
                    <tr key={file.id} className="border-b hover:bg-gray-50 transition">
                      <td className="p-4 flex items-center gap-3">
                        <FileIcon className="h-5 w-5 text-blue-500" />
                         <span className="font-medium">{file.name}</span>
                      </td>
                      <td className="p-4 text-gray-500 text-sm">{formatSize(file.size)}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => setActiveMenu({ id: file.id, type: 'file' })} className="p-1 hover:bg-gray-200 rounded">
                          <MoreVertical className="h-4 w-4 text-gray-400" />
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
          <div className="bg-white rounded-2xl p-16 shadow-2xl border-4 border-dashed border-blue-500">
            <Upload className="h-20 w-20 text-blue-500 mx-auto mb-4" />
            <p className="text-2xl font-bold text-gray-800">Suelta archivos o carpetas aqui</p>
            <p className="text-sm text-gray-500 mt-2">Se subiran a la carpeta actual</p>
          </div>
        </div>
      )}

      {showUploadPanel && uploads.length > 0 && (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b">
            <span className="font-semibold text-sm">
              {uploads.filter(u => u.status === "uploading").length > 0
                ? `Subiendo ${uploads.filter(u => u.status === "uploading").length} archivo(s)...`
                : "Subidas completadas"}
            </span>
            <button onClick={() => setShowUploadPanel(false)} className="p-1 hover:bg-gray-200 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {uploads.map(u => (
              <div key={u.id} className="p-3 border-b last:border-b-0">
                <div className="flex items-center gap-2 mb-1">
                  {u.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />}
                  {u.status === "done" && <Check className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  {u.status === "error" && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  <span className="text-sm truncate flex-1">{u.name}</span>
                  <span className="text-xs text-gray-500">{formatSize(u.size)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      u.status === "error" ? "bg-red-500" :
                      u.status === "done" ? "bg-green-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
                {u.error && <p className="text-xs text-red-500 mt-1">{u.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeMenu && (
        <div className="fixed z-50 bg-white shadow-xl border rounded-lg p-1 w-44"
             style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          {activeMenu.type === 'folder' ? (
            <>
              <button onClick={() => { setCurrentFolderId(activeMenu.id); setActiveMenu(null); }} className="flex items-center gap-2 w-full p-2 text-sm hover:bg-gray-100 rounded">
                <FolderIcon className="h-4 w-4" /> Abrir
              </button>
              <button onClick={() => { const f = folders.find(x => x.id === activeMenu.id); if(f) renameItem(activeMenu.id, 'folder', f.name); }} className="flex items-center gap-2 w-full p-2 text-sm hover:bg-gray-100 rounded">
                <Edit2 className="h-4 w-4" /> Renombrar
              </button>
              <hr className="my-1" />
              <button onClick={() => deleteItem(activeMenu.id, 'folder')} className="flex items-center gap-2 w-full p-2 text-sm text-red-500 hover:bg-red-50 rounded">
                <Trash2 className="h-4 w-4" /> Borrar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { downloadFile(activeMenu.id); setActiveMenu(null); }} className="flex items-center gap-2 w-full p-2 text-sm hover:bg-gray-100 rounded">
                <Download className="h-4 w-4" /> Descargar
              </button>
              <button onClick={() => { const f = files.find(x => x.id === activeMenu.id); if(f) renameItem(activeMenu.id, 'file', f.name); }} className="flex items-center gap-2 w-full p-2 text-sm hover:bg-gray-100 rounded">
                <Edit2 className="h-4 w-4" /> Renombrar
              </button>
              <hr className="my-1" />
              <button onClick={() => deleteItem(activeMenu.id, 'file')} className="flex items-center gap-2 w-full p-2 text-sm text-red-500 hover:bg-red-50 rounded">
                <Trash2 className="h-4 w-4" /> Borrar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
