"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUsuario, slugify } from "@/lib/tenant";
import { datos, ejecutar, v, type Resultado } from "@/lib/acciones";
import { PRODUCTOS_BASE } from "@/lib/dominio";

export async function crearOrganizacion(_p: Resultado, fd: FormData) {
  let slug = "";
  const r = await ejecutar(async () => {
    const user = await requireUsuario();
    const d = z
      .object({
        nombre: v.texto(80),
        tipoProduccion: z.enum(["leche", "carne", "doble_proposito"]),
        unidadArea: z.enum(["ha", "mz"]),
      })
      .parse(datos(fd));
    slug = `${slugify(d.nombre) || "ganaderia"}-${crypto.randomUUID().slice(0, 6)}`;

    await db.transaction(async (tx) => {
      const [org] = await tx.insert(schema.organizaciones).values({ ...d, slug }).returning();
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
