import { and, eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth/server";
import { db, schema } from "@/db";
import { puede } from "@/lib/tenant";
import { hoyCR } from "@/lib/dominio";

/**
 * Exporta todos los datos de la ganadería en JSON (derecho de acceso y portabilidad, Ley 8968).
 * Solo propietario o administrador. Funciona aunque la suscripción esté vencida.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/orgs/[slug]/exportar">) {
  const { slug } = await ctx.params;
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return Response.json({ error: "Not found" }, { status: 404 });

  const [fila] = await db
    .select({ org: schema.organizaciones, rol: schema.membresias.rol })
    .from(schema.organizaciones)
    .innerJoin(schema.membresias, eq(schema.membresias.orgId, schema.organizaciones.id))
    .where(and(eq(schema.organizaciones.slug, slug), eq(schema.membresias.userId, session.user.id)))
    .limit(1);
  if (!fila) return Response.json({ error: "Not found" }, { status: 404 });
  if (!puede(fila.rol, "administrador")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const orgId = fila.org.id;
  const de = (t: PgTable & { orgId: AnyPgColumn }) => db.select().from(t as PgTable).where(eq(t.orgId, orgId));

  const [fincas, modulos, potreros, zonas, lotes, pastoreos, aforos, lluvias, productos, aplicaciones, eventos, plan, archivos, suelos, plagas, leche, pesajes, equipo] =
    await Promise.all([
      de(schema.fincas),
      de(schema.modulos),
      de(schema.potreros),
      de(schema.zonas),
      de(schema.lotes),
      de(schema.pastoreos),
      de(schema.aforos),
      de(schema.lluvias),
      de(schema.productos),
      de(schema.aplicaciones),
      de(schema.eventos),
      de(schema.planPastoreo),
      // Archivos: solo la ficha; cada archivo se descarga desde la aplicación
      db
        .select({ id: schema.archivos.id, nombre: schema.archivos.nombre, contentType: schema.archivos.contentType, tamano: schema.archivos.tamano, potreroId: schema.archivos.potreroId, creadoEn: schema.archivos.creadoEn })
        .from(schema.archivos)
        .where(eq(schema.archivos.orgId, orgId)),
      de(schema.analisisSuelo),
      de(schema.monitoreosPlaga),
      de(schema.produccionLeche),
      de(schema.pesajes),
      db
        .select({ email: schema.membresias.email, rol: schema.membresias.rol, desde: schema.membresias.creadoEn })
        .from(schema.membresias)
        .where(eq(schema.membresias.orgId, orgId)),
    ]);

  const { id, nombre, tipoProduccion, unidadArea, plan: planSuscripcion, estadoSuscripcion, creadoEn } = fila.org;
  const cuerpo = JSON.stringify(
    {
      exportadoEn: new Date().toISOString(),
      formato: "repastos-export/1",
      notas: "Áreas en hectáreas; geometrías en GeoJSON (WGS84).",
      ganaderia: { id, nombre, tipoProduccion, unidadArea, plan: planSuscripcion, estadoSuscripcion, creadoEn },
      equipo,
      fincas,
      modulos,
      potreros,
      zonas,
      lotes,
      pastoreos,
      aforos,
      lluvias,
      productos,
      aplicaciones,
      eventos,
      planPastoreo: plan,
      analisisSuelo: suelos,
      monitoreosPlaga: plagas,
      produccionLeche: leche,
      pesajes,
      archivos,
    },
    null,
    2,
  );

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="repastos-${slug}-${hoyCR()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
