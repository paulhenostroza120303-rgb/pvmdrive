"use client";

import { useEffect, useRef, useState } from "react";
import { getFileStyle, isImage } from "@/lib/file-icons";

// Caché de miniaturas a nivel de módulo: reutiliza los object URLs entre
// re-renders y al alternar vista lista/cuadrícula (evita re-descargas).
const thumbCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

// Solo generamos miniatura automática para imágenes por debajo de este tamaño.
const MAX_THUMB_BYTES = 6 * 1024 * 1024; // 6 MB

async function loadThumb(fileId: string, getToken: () => Promise<string>): Promise<string | null> {
  if (thumbCache.has(fileId)) return thumbCache.get(fileId)!;
  if (inFlight.has(fileId)) return inFlight.get(fileId)!;

  const promise = (async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/files/${fileId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      thumbCache.set(fileId, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(fileId);
    }
  })();

  inFlight.set(fileId, promise);
  return promise;
}

interface FileThumbnailProps {
  fileId: string;
  name: string;
  mimeType?: string | null;
  size?: number;
  getToken: () => Promise<string>;
  /** Tamaño del ícono de respaldo, ej. "h-6 w-6" (lista) o "h-12 w-12" (cuadrícula) */
  iconClassName?: string;
  /** Clases extra para el contenedor */
  className?: string;
  /** object-fit de la imagen */
  fit?: "cover" | "contain";
}

/**
 * Muestra una miniatura para imágenes (cargada de forma diferida vía el proxy
 * autenticado) con respaldo a un ícono de color según el tipo de archivo.
 */
export function FileThumbnail({
  fileId, name, mimeType, size, getToken,
  iconClassName = "h-6 w-6", className = "", fit = "cover",
}: FileThumbnailProps) {
  const style = getFileStyle(mimeType, name);
  const Icon = style.icon;
  const eligible = isImage(mimeType, name) && (size === undefined || size <= MAX_THUMB_BYTES);

  const [url, setUrl] = useState<string | null>(() => thumbCache.get(fileId) ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!eligible || url || failed) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        setLoading(true);
        loadThumb(fileId, getToken)
          .then((u) => { if (u) setUrl(u); else setFailed(true); })
          .finally(() => setLoading(false));
      }
    }, { rootMargin: "200px" });

    observer.observe(el);
    return () => observer.disconnect();
  }, [eligible, url, failed, fileId, getToken]);

  return (
    <div
      ref={ref}
      className={`relative flex items-center justify-center overflow-hidden ${!url ? style.bg : "bg-slate-100"} ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          loading="lazy"
          className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      ) : loading ? (
        <div className="thumb-skeleton absolute inset-0" />
      ) : (
        <Icon className={`${iconClassName} ${style.color}`} strokeWidth={1.5} />
      )}
    </div>
  );
}
