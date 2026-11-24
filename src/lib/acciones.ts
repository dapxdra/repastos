import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ErrorUsuario } from "@/lib/tenant";

export type Resultado =
  | { ok: true; mensaje?: string; n: number }
  | { ok: false; error: string; campos?: Record<string, string>; n: number }
  | null;

/** Ejecuta una acción de servidor y convierte errores en un resultado mostrable en el formulario. */
export async function ejecutar(fn: () => Promise<string | void>): Promise<Resultado> {
  const n = Date.now();
  try {
    const mensaje = await fn();
    return { ok: true, mensaje: mensaje ?? "Guardado", n };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof z.ZodError) {
      const campos: Record<string, string> = {};
      for (const issue of e.issues) {
        const k = String(issue.path[0] ?? "");
        if (k && !campos[k]) campos[k] = issue.message;
      }
      const error = e.issues.length === 1 ? e.issues[0].message : "Revisa los campos marcados.";
      return { ok: false, error, campos, n };
    }
    if (e instanceof ErrorUsuario) return { ok: false, error: e.message, n };
    console.error(e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo.", n };
  }
}

/** Lee un FormData como objeto plano (los campos repetidos se vuelven arreglos). */
export function datos(formData: FormData) {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

/** JSON enviado como texto por el navegador: tamaño acotado y error mostrable si no es válido. */
export function jsonSeguro(texto: unknown, max = 8_000_000): unknown {
  if (typeof texto !== "string" || texto.length > max) throw new ErrorUsuario("Datos inválidos o demasiado grandes.");
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorUsuario("Datos inválidos.");
  }
}

// Validadores reutilizables con mensajes en español.
// Todo número tiene un máximo: un valor absurdo desbordaría la columna numeric y fallaría en la base de datos.
const vacio = (v: unknown) => v === "" || v == null;
const MAX_NUM = 1e9;
const fmt = (n: number) => n.toLocaleString("es-CR");
export const v = {
  /** Texto obligatorio; se quitan caracteres de control (salvo saltos de línea y tabulador). */
  texto: (max = 120) =>
    z.string({ error: "Requerido" }).trim().min(1, "Requerido").max(max, `Máximo ${max} caracteres`).transform(sinControl),
  opcional: (max = 300) =>
    z.preprocess((x) => (vacio(x) ? undefined : x), z.string().trim().max(max, `Máximo ${max} caracteres`).transform(sinControl).optional()),
  num: (min = 0, max = MAX_NUM) =>
    z.coerce.number({ error: "Número inválido" }).min(min, `Debe ser ≥ ${fmt(min)}`).max(max, `Máximo ${fmt(max)}`),
  numPos: (max = MAX_NUM) => z.coerce.number({ error: "Número inválido" }).positive("Debe ser mayor que 0").max(max, `Máximo ${fmt(max)}`),
  numOpc: (max = MAX_NUM) =>
    z.preprocess(
      (x) => (vacio(x) ? undefined : x),
      z.coerce.number({ error: "Número inválido" }).nonnegative("No puede ser negativo").max(max, `Máximo ${fmt(max)}`).optional(),
    ),
  entero: (min = 0, max = 100000) =>
    z.coerce.number({ error: "Número inválido" }).int("Debe ser entero").min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`),
  enteroOpc: (min = 0, max = 100000) =>
    z.preprocess((x) => (vacio(x) ? undefined : x), z.coerce.number().int("Debe ser entero").min(min).max(max).optional()),
  id: () => z.uuid({ error: "Selecciona una opción" }),
  /** Fecha AAAA-MM-DD dentro de un rango razonable (evita años 0001 o 9999). */
  fecha: () =>
    z.iso
      .date({ error: "Fecha inválida" })
      .refine((f) => f >= "1990-01-01" && f <= "2100-12-31", "Fecha fuera de rango"),
};

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function sinControl(s: string) {
  return s.replace(CONTROL, "");
}
