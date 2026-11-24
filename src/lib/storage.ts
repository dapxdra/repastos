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

export async function urlFirmada(key: string, nombre: string, contentType: string, expiresIn = 600) {
  // El tipo lo declaró el navegador al subir: no se confía en él. Lo que no esté en la lista se descarga.
  const inline = TIPOS_INLINE.has(contentType.split(";")[0].trim().toLowerCase());
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentType: inline ? contentType : "application/octet-stream",
      ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(nombre)}"`,
    }),
    { expiresIn },
  );
}

export async function borrarObjeto(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
