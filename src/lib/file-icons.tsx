import {
  FileText, Image as ImageIcon, Film, Music, FileArchive, FileCode,
  FileSpreadsheet, Presentation, File as FileIcon, type LucideIcon,
} from "lucide-react";

export type FileKind =
  | "image" | "video" | "audio" | "pdf" | "document"
  | "spreadsheet" | "presentation" | "archive" | "code" | "text" | "other";

interface KindStyle {
  icon: LucideIcon;
  /** Tailwind text color for the icon */
  color: string;
  /** Tailwind background tint for grid cards / avatars */
  bg: string;
  label: string;
}

const KIND_STYLES: Record<FileKind, KindStyle> = {
  image:        { icon: ImageIcon,        color: "text-emerald-500", bg: "bg-emerald-50",  label: "Imagen" },
  video:        { icon: Film,             color: "text-rose-500",    bg: "bg-rose-50",     label: "Video" },
  audio:        { icon: Music,            color: "text-purple-500",  bg: "bg-purple-50",   label: "Audio" },
  pdf:          { icon: FileText,         color: "text-red-500",     bg: "bg-red-50",      label: "PDF" },
  document:     { icon: FileText,         color: "text-blue-600",    bg: "bg-blue-50",     label: "Documento" },
  spreadsheet:  { icon: FileSpreadsheet,  color: "text-green-600",   bg: "bg-green-50",    label: "Hoja de cálculo" },
  presentation: { icon: Presentation,     color: "text-orange-500",  bg: "bg-orange-50",   label: "Presentación" },
  archive:      { icon: FileArchive,      color: "text-amber-500",   bg: "bg-amber-50",    label: "Comprimido" },
  code:         { icon: FileCode,         color: "text-cyan-600",    bg: "bg-cyan-50",     label: "Código" },
  text:         { icon: FileText,         color: "text-slate-500",   bg: "bg-slate-100",   label: "Texto" },
  other:        { icon: FileIcon,         color: "text-slate-400",   bg: "bg-slate-100",   label: "Archivo" },
};

const EXT_KINDS: Record<string, FileKind> = {
  // documents
  doc: "document", docx: "document", odt: "document", rtf: "document", pages: "document",
  // spreadsheets
  xls: "spreadsheet", xlsx: "spreadsheet", ods: "spreadsheet", csv: "spreadsheet", numbers: "spreadsheet",
  // presentations
  ppt: "presentation", pptx: "presentation", odp: "presentation", key: "presentation",
  // archives
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive", bz2: "archive", xz: "archive",
  // code
  js: "code", jsx: "code", ts: "code", tsx: "code", json: "code", html: "code", css: "code", scss: "code",
  py: "code", java: "code", c: "code", cpp: "code", cs: "code", go: "code", rs: "code", php: "code",
  rb: "code", sh: "code", sql: "code", xml: "code", yml: "code", yaml: "code", vue: "code", swift: "code",
  // text
  txt: "text", md: "text", log: "text",
  // pdf
  pdf: "pdf",
};

/** Determine the high-level kind of a file from its MIME type and/or name. */
export function getFileKind(mimeType?: string | null, name?: string | null): FileKind {
  const mime = (mimeType || "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "spreadsheet";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "presentation";
  if (mime.includes("word") || mime.includes("document") || mime === "application/rtf") return "document";
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar") || mime.includes("rar")) return "archive";
  if (mime.startsWith("text/")) return mime.includes("html") || mime.includes("css") ? "code" : "text";

  // fall back to extension
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (ext && EXT_KINDS[ext]) return EXT_KINDS[ext];

  return "other";
}

/** Full style descriptor (icon component + colors + label) for a file. */
export function getFileStyle(mimeType?: string | null, name?: string | null): KindStyle {
  return KIND_STYLES[getFileKind(mimeType, name)];
}

export function isImage(mimeType?: string | null, name?: string | null): boolean {
  return getFileKind(mimeType, name) === "image";
}
