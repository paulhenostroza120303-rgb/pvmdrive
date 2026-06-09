/** Corrige nombres UTF-8 mal interpretados como latin1 por multer (ej. MÃ¡rchate → Márchate). */
export function decodeUploadFilename(name: string): string {
  if (!name) return name;

  if (/Ã.|Â.|â€|ï¿½/.test(name)) {
    return Buffer.from(name, "latin1").toString("utf8");
  }

  return name;
}

/** Normaliza para mostrar en UI (archivos ya guardados con mojibake). */
export function displayFilename(name: string): string {
  return decodeUploadFilename(name);
}

export function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
