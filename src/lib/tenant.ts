import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import type { Rol } from "@/db/schema";

const NIVEL: Record<Rol, number> = { lector: 0, operador: 1, administrador: 2, propietario: 3 };

export function puede(rol: Rol, minimo: Rol) {
  return NIVEL[rol] >= NIVEL[minimo];
}

/** Error con mensaje apto para mostrar al usuario. */
export class ErrorUsuario extends Error {}

export const getUsuario = cache(async () => {
  const { data: session } = await auth.getSession();
  return session?.user ?? null;
});

export async function requireUsuario() {
  const user = await getUsuario();
  if (!user) redirect("/auth/sign-in");
  return user;
}

const membresia = cache(async (slug: string, userId: string) => {
  const [fila] = await db
    .select({ org: schema.organizaciones, rol: schema.membresias.rol })
    .from(schema.organizaciones)
    .innerJoin(schema.membresias, eq(schema.membresias.orgId, schema.organizaciones.id))
    .where(and(eq(schema.organizaciones.slug, slug), eq(schema.membresias.userId, userId)))
    .limit(1);
  return fila ?? null;
});

/** Resuelve la organización por slug y exige membresía con al menos `minimo`. */
export async function requireOrg(slug: string, minimo: Rol = "lector") {
  const user = await requireUsuario();
  const fila = await membresia(slug, user.id);
  if (!fila) notFound();
  if (!puede(fila.rol, minimo)) throw new ErrorUsuario("Tu rol no tiene permiso para esta acción.");
  return { user, org: fila.org, rol: fila.rol };
}

export function slugify(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
