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

// Validadores reutilizables con mensajes en español
const vacio = (v: unknown) => v === "" || v == null;
export const v = {
  texto: (max = 120) => z.string({ error: "Requerido" }).trim().min(1, "Requerido").max(max, `Máximo ${max} caracteres`),
  opcional: (max = 300) => z.preprocess((x) => (vacio(x) ? undefined : x), z.string().trim().max(max).optional()),
  num: (min = 0) =>
    z.coerce.number({ error: "Número inválido" }).refine((n) => n >= min, `Debe ser ≥ ${min}`),
  numPos: () => z.coerce.number({ error: "Número inválido" }).positive("Debe ser mayor que 0"),
  numOpc: () =>
    z.preprocess((x) => (vacio(x) ? undefined : x), z.coerce.number({ error: "Número inválido" }).nonnegative("No puede ser negativo").optional()),
  entero: (min = 0, max = 100000) =>
    z.coerce.number({ error: "Número inválido" }).int("Debe ser entero").min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`),
  enteroOpc: (min = 0, max = 100000) =>
    z.preprocess((x) => (vacio(x) ? undefined : x), z.coerce.number().int("Debe ser entero").min(min).max(max).optional()),
  id: () => z.uuid({ error: "Selecciona una opción" }),
  fecha: () => z.iso.date({ error: "Fecha inválida" }),
};
