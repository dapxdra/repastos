import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import { urlFirmada } from "@/lib/storage";

// Descarga: valida sesión + membresía y redirige a una URL firmada de corta duración.
export async function GET(_req: Request, ctx: RouteContext<"/api/orgs/[slug]/archivos/[id]">) {
  const { slug, id } = await ctx.params;
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });

  const [fila] = await db
    .select({ key: schema.archivos.key, nombre: schema.archivos.nombre, contentType: schema.archivos.contentType })
    .from(schema.archivos)
    .innerJoin(schema.organizaciones, eq(schema.organizaciones.id, schema.archivos.orgId))
    .innerJoin(
      schema.membresias,
      and(eq(schema.membresias.orgId, schema.organizaciones.id), eq(schema.membresias.userId, session.user.id)),
    )
    .where(and(eq(schema.organizaciones.slug, slug), eq(schema.archivos.id, id)))
    .limit(1);
  if (!fila) return Response.json({ error: "Not found" }, { status: 404 });

  // La URL firmada no debe quedar en cachés intermedias ni en el Referer de otros sitios
  return new Response(null, {
    status: 302,
    headers: {
      Location: await urlFirmada(fila.key, fila.nombre, fila.contentType),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
