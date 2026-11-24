import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireOrg } from "@/lib/tenant";
import { potrerosConForraje } from "@/lib/consultas";
import { hoyCR } from "@/lib/dominio";
import { demandaDeLote } from "@/lib/plan";
import { PageHeader } from "@/components/ui";
import { Calculadoras } from "./calculadoras";

export const metadata = { title: "Herramientas" };

export default async function Herramientas({ params }: PageProps<"/app/[slug]/herramientas">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  const [{ potreros, climas }, lotes, [urea]] = await Promise.all([
    potrerosConForraje(org.id),
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)),
    db
      .select({ precio: schema.productos.precioUnidad })
      .from(schema.productos)
      .where(and(eq(schema.productos.orgId, org.id), ilike(schema.productos.nombre, "urea%")))
      .limit(1),
  ]);
  const conDato = potreros.filter((p) => p.est.cobertura != null && p.areaUtilHa);
  const areaHa = potreros.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
  const areaDato = conDato.reduce((s, p) => s + p.areaUtilHa!, 0);
  const cobertura = areaDato > 0 ? conDato.reduce((s, p) => s + p.est.cobertura! * p.areaUtilHa!, 0) / areaDato : 0;
  const cabezas = lotes.reduce((s, l) => s + l.cabezas, 0);
  const pasto = lotes.reduce((s, l) => s + demandaDeLote(l).pasto, 0);
  // Pasto más común de la ganadería
  const conteo = new Map<string, number>();
  potreros.forEach((p) => p.tipoPasto && conteo.set(p.tipoPasto, (conteo.get(p.tipoPasto) ?? 0) + 1));
  const pastoComun = [...conteo].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const altitud = [...climas.values()][0]?.altitudMsnm ?? 300;

  return (
    <>
      <PageHeader titulo="Herramientas" descripcion="Calculadoras para decidir en el día a día: etapa de hoja, franjas con cerca eléctrica, respuesta al nitrógeno, banco forrajero y días de pastoreo." />
      <Calculadoras
        defaults={{
          unidad: org.unidadArea,
          hoy: hoyCR(),
          altitud,
          pasto: pastoComun,
          cobertura,
          areaHa: Number(areaHa.toFixed(2)),
          cabezas,
          consumoAnimal: cabezas > 0 ? pasto / cabezas : 0,
          precioUreaSaco: urea?.precio ? Number(urea.precio) * 45 : null,
        }}
      />
    </>
  );
}
