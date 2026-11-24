import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Neon Object Storage (S3-compatible). Credenciales/endpoint/región vienen de AWS_* en el entorno.
export const BUCKET = "assets";

const s3 = new S3Client({ forcePathStyle: true });

export async function subirObjeto(key: string, body: Uint8Array, contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

/**
 * Tipos que se pueden abrir en el navegador sin riesgo (sin scripts).
 * SVG y HTML quedan fuera a propósito: pueden ejecutar JavaScript.
 */
const TIPOS_INLINE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"]);

/** Firmas (primeros bytes) de los tipos que se abren en el navegador. */
const FIRMAS: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => String.fromCharCode(...b.slice(0, 4)) === "GIF8",
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "application/pdf": (b) => String.fromCharCode(...b.slice(0, 5)) === "%PDF-",
  // Texto: sin bytes nulos en el primer bloque
  "text/plain": (b) => !b.slice(0, 8192).includes(0),
};

/**
 * Tipo con el que se guarda un archivo subido. Solo se conserva el tipo declarado por el navegador si es uno
 * de los que se abren en línea y el contenido coincide con su firma; si no, queda como descarga genérica.
 * Así un HTML/SVG renombrado a .png nunca se sirve como imagen ni como página.
 */
export function tipoContenidoSeguro(declarado: string, bytes: Uint8Array) {
  const t = declarado.split(";")[0].trim().toLowerCase();
  if (TIPOS_INLINE.has(t) && FIRMAS[t]?.(bytes)) return t;
  // Formatos de mapas y oficina: se descargan, pero se conserva un tipo descriptivo conocido
  return TIPOS_DESCARGA.has(t) ? t : "application/octet-stream";
}

const TIPOS_DESCARGA = new Set([
  "application/zip",
  "application/vnd.google-earth.kml+xml",
  "application/vnd.google-earth.kmz",
  "application/geo+json",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/msword",
]);

export async function urlFirmada(key: string, nombre: string, contentType: string, expiresIn = 600) {
  // El tipo lo declaró el navegador al subir: no se confía en él. Lo que no esté en la lista se descarga.
  const inline = TIPOS_INLINE.has(contentType.split(";")[0].trim().toLowerCase());
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentType: inline ? contentType : "application/octet-stream",
      ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    }),
    { expiresIn },
  );
}

export async function borrarObjeto(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
