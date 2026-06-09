"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { File as FileIcon, Folder as FolderIcon, Download, Loader2, AlertCircle, ChevronRight, Home } from "lucide-react";

interface PublicLinkInfo {
  token: string;
  resourceId: string;
  resourceType: "file" | "folder";
  resourceName: string;
  permission: "view" | "download";
  mimeType?: string;
  size?: number;
}

interface SharedItem {
  id: string;
  name: string;
  type: "file" | "folder";
  size?: number;
  mimeType?: string;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [link, setLink] = useState<PublicLinkInfo | null>(null);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>("");
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchSharedContent();
  }, [token]);

  const fetchSharedContent = async (folderId?: string | null) => {
    setLoading(true);
    try {
      const url = `/api/share-links/public?token=${token}${folderId ? `&folderId=${folderId}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");

      setLink(data.link);

      if (data.link.resourceType === "folder" || folderId) {
        const allItems = [
          ...(data.folders || []).map((f: Record<string, unknown>) => ({ id: f.id as string, name: f.name as string, type: "folder" as const })),
          ...(data.files || []).map((f: Record<string, unknown>) => ({ id: f.id as string, name: f.name as string, type: "file" as const, size: f.size as number, mimeType: f.mimeType as string })),
        ];
        setItems(allItems);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Link no válido o expirado");
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    setCurrentFolderName(folderName);
    if (folderId) {
      setFolderPath((prev) => {
        const existing = prev.findIndex((b) => b.id === folderId);
        if (existing >= 0) return prev.slice(0, existing + 1);
        return [...prev, { id: folderId, name: folderName }];
      });
    } else {
      setFolderPath([{ id: null, name: link?.resourceName || "Carpeta" }]);
    }
    fetchSharedContent(folderId);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  };

  const downloadFile = async (fileId: string, fileName: string) => {
    const uploadUrl = process.env.NEXT_PUBLIC_UPLOAD_URL || "https://pvmdrive-production.up.railway.app";
    setDownloading(fileId);
    try {
      const res = await fetch(`${uploadUrl}/download/${fileId}?public=true`);
      if (!res.ok) throw new Error("Error al descargar");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : fileName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("No se pudo descargar el archivo");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Link no disponible</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!link) return null;

  // Archivo individual
  if (link.resourceType === "file") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl border max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileIcon className="h-8 w-8 text-blue-500" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1 truncate">{link.resourceName}</h1>
          {link.size && <p className="text-sm text-gray-500 mb-4">{formatSize(link.size)}</p>}
          <p className="text-xs text-gray-400 mb-6">Compartido via CloudGram</p>
          {link.permission === "download" || link.permission === "view" ? (
            <button
              onClick={() => downloadFile(link.resourceId, link.resourceName)}
              disabled={downloading === link.resourceId}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {downloading === link.resourceId ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Descargando...</>
              ) : (
                <><Download className="h-4 w-4" /> Descargar</>
              )}
            </button>
          ) : (
            <p className="text-sm text-gray-500">Solo vista previa</p>
          )}
        </div>
      </div>
    );
  }

  // Carpeta compartida
  const displayName = currentFolderName || link.resourceName;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <FolderIcon className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h1>
              <p className="text-xs text-gray-400">Carpeta compartida via CloudGram</p>
            </div>
          </div>
          {folderPath.length > 1 && (
            <div className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
              <button
                onClick={() => navigateToFolder(null, link.resourceName)}
                className="hover:text-blue-600 flex items-center gap-1"
              >
                <Home className="h-3 w-3" />
                {link.resourceName}
              </button>
              {folderPath.slice(1).map((crumb, i) => (
                <span key={crumb.id ?? "root"} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => navigateToFolder(crumb.id, crumb.name)}
                    className="hover:text-blue-600 truncate max-w-[160px]"
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        {items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <FolderIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Carpeta vacía</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      {item.type === "folder" ? (
                        <button
                          onClick={() => navigateToFolder(item.id, item.name)}
                          className="flex items-center gap-3 w-full text-left"
                        >
                          <FolderIcon className="h-5 w-5 text-amber-500 shrink-0" />
                          <span className="font-medium text-gray-900 truncate">{item.name}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-3">
                          <FileIcon className="h-5 w-5 text-blue-500 shrink-0" />
                          <span className="font-medium text-gray-900 truncate">{item.name}</span>
                          {item.size && <span className="text-xs text-gray-400">{formatSize(item.size)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.type === "file" && (
                        <button
                          onClick={() => downloadFile(item.id, item.name)}
                          disabled={downloading === item.id}
                          className="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                          title="Descargar"
                        >
                          {downloading === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                          ) : (
                            <Download className="h-4 w-4 text-gray-500" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
