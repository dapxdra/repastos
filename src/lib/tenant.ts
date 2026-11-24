import "server-only";
import { cache } from "react";
import { and, count, eq } from "drizzle-orm";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import type { Rol } from "@/db/schema";
import { hoyCR } from "@/lib/dominio";
import { ESTADOS_SUSCRIPCION, PLANES, estadoEfectivo, limite, puedeEscribir, type Recurso } from "@/lib/planes";

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

/** Formato de los slugs que genera crearOrganizacion; cualquier otra cosa no se consulta. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id recibido como argumento de una acción (el navegador lo puede alterar): debe ser un UUID. */
export function idValido(id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");
  return id;
}

/**
 * Resuelve la organización por slug y exige membresía con al menos `minimo`.
 * Toda acción que modifica datos pide `operador` o más: con la suscripción vencida se rechaza,
 * salvo con `permitirSinSuscripcion` (borrar datos o salir del equipo siempre se permite).
 */
export async function requireOrg(slug: string, minimo: Rol = "lector", { permitirSinSuscripcion = false } = {}) {
  const user = await requireUsuario();
  if (typeof slug !== "string" || !SLUG.test(slug)) notFound();
  const fila = await membresia(slug, user.id);
  if (!fila) notFound();
  if (!puede(fila.rol, minimo)) throw new ErrorUsuario("Tu rol no tiene permiso para esta acción.");
  if (minimo !== "lector" && !permitirSinSuscripcion && !puedeEscribir(fila.org, hoyCR())) {
    const estado = ESTADOS_SUSCRIPCION[estadoEfectivo(fila.org, hoyCR())].toLowerCase();
    throw new ErrorUsuario(`La suscripción de esta ganadería está ${estado}: puedes consultar y exportar tus datos, pero no registrar cambios. El propietario puede renovarla en Ajustes.`);
  }
  return { user, org: fila.org, rol: fila.rol };
}

/**
 * Igual que requireOrg (exige sesión) pero devuelve null si el usuario no pertenece a la ganadería, sin lanzar
 * notFound(). El layout la usa para mostrar «no encontrada» sin renderizar la página: lanzar notFound() dentro
 * del streaming a veces dejaba la pantalla en blanco.
 */
export async function accesoOrg(slug: string) {
  const user = await requireUsuario();
  if (typeof slug !== "string" || !SLUG.test(slug)) return null;
  const fila = await membresia(slug, user.id);
  return fila ? { user, org: fila.org, rol: fila.rol } : null;
}

/** Rechaza la acción si agregar `nuevos` elementos supera el límite del plan. */
export async function verificarLimite(org: { id: string; plan: keyof typeof PLANES }, recurso: Recurso, nuevos = 1) {
  const max = limite(org.plan, recurso);
  if (max == null) return;
  const tabla = { potreros: schema.potreros, fincas: schema.fincas, miembros: schema.membresias }[recurso];
  const [{ n }] = await db.select({ n: count() }).from(tabla).where(eq(tabla.orgId, org.id));
  if (n + nuevos > max) {
    throw new ErrorUsuario(`El plan ${PLANES[org.plan].nombre} permite hasta ${max} ${recurso}. Cambia de plan en Ajustes para agregar más.`);
  }
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
