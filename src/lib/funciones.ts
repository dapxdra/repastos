import "server-only";
import { functionBaseUrl } from "@neon/env";
import { auth } from "@/lib/auth/server";

export type ResumenPotreros = {
  generadoEn: string;
  totales: { potreros: number; ocupados: number; enEspera: number; enDescanso: number; listos: number };
  potreros: { id: string; nombre: string; estado: "ocupado" | "en_espera" | "en_descanso" | "listo" }[];
};

/** Llama a la Neon Function `api` con el JWT de Neon Auth del usuario actual. */
export async function obtenerResumen(orgId: string): Promise<ResumenPotreros> {
  // `token` es un endpoint del servidor de Neon Auth (GET /token); el tipo Pick<> del SDK lo deja como unknown.
  const token = auth.token as () => Promise<{ data: { token: string } | null; error: unknown }>;
  const { data, error } = await token();
  if (error || !data?.token) throw new Error("No se pudo obtener el token de sesión");
  const res = await fetch(`${functionBaseUrl("api")}/orgs/${orgId}/resumen`, {
    headers: { Authorization: `Bearer ${data.token}` },
    cache: "no-store",
    // El inicio espera esta respuesta: si la función tarda (arranque en frío), se usan los conteos locales.
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`Function api respondió ${res.status}`);
  return res.json();
}
