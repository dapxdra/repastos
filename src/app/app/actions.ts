"use server";
import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ErrorUsuario, requireUsuario, slugify } from "@/lib/tenant";
import { datos, ejecutar, v, type Resultado } from "@/lib/acciones";
import { PRODUCTOS_BASE } from "@/lib/dominio";
import { MAX_GANADERIAS_PROPIAS } from "@/lib/planes";
import { VERSION_LEGAL } from "@/lib/legal";
import { UNIDADES_AREA } from "@/lib/dominio";

export async function crearOrganizacion(_p: Resultado, fd: FormData) {
  let slug = "";
  const r = await ejecutar(async () => {
    const user = await requireUsuario();
    const d = z
      .object({
        nombre: v.texto(80),
        tipoProduccion: z.enum(["leche", "carne", "doble_proposito"]),
        unidadArea: z.enum(UNIDADES_AREA),
        // Quien crea la ganadería es quien contrata el servicio: debe aceptar los Términos y la Política de Privacidad
        aceptaTerminos: z.literal("on", { error: "Debes aceptar los Términos y la Política de Privacidad." }),
      })
      .parse(datos(fd));

    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.membresias)
      .where(and(eq(schema.membresias.userId, user.id), eq(schema.membresias.rol, "propietario")));
    if (n >= MAX_GANADERIAS_PROPIAS) {
      throw new ErrorUsuario(`Puedes ser propietario de hasta ${MAX_GANADERIAS_PROPIAS} ganaderías. Escríbenos si necesitas más.`);
    }

    slug = `${slugify(d.nombre) || "ganaderia"}-${crypto.randomUUID().slice(0, 6)}`;

    await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(schema.organizaciones)
        .values({
          nombre: d.nombre,
          tipoProduccion: d.tipoProduccion,
          unidadArea: d.unidadArea,
          slug,
          terminosVersion: VERSION_LEGAL,
          terminosAceptadosEn: new Date(),
          terminosAceptadosPor: user.id,
        })
        .returning();
      await tx.insert(schema.membresias).values({ orgId: org.id, userId: user.id, email: user.email, rol: "propietario" });
      // Catálogo inicial: fertilizantes de composición estándar (sin precios ni agroquímicos).
      await tx.insert(schema.productos).values(
        PRODUCTOS_BASE.map((p) => ({
          orgId: org.id,
          nombre: p.nombre,
          tipo: p.tipo,
          unidad: "kg" as const,
          n: p.n?.toString(),
          p: p.p?.toString(),
          k: p.k?.toString(),
          cao: p.cao?.toString(),
          mgo: p.mgo?.toString(),
          s: p.s?.toString(),
          periodoReingresoDias: 0,
        })),
      );
    });
  });
  if (r?.ok) redirect(`/app/${slug}`);
  return r;
}
