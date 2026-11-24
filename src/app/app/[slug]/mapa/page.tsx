import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConForraje, zonasDeOrg } from "@/lib/consultas";
import { detalleEstado } from "@/lib/dominio";
import { MapaPotreros } from "@/components/mapa-potreros";
import { PageHeader } from "@/components/ui";
import { actualizarZona, crearPotrero, crearZona, eliminarZona, guardarGeometria, guardarGeometriaZona, importarPotreros } from "../actions";

export const metadata = { title: "Mapa" };

export default async function Mapa({ params, searchParams }: PageProps<"/app/[slug]/mapa">) {
  const { slug } = await params;
  const { color } = (await searchParams) as { color?: string };
  const { org, rol } = await requireOrg(slug);
  const [potreros, modulos, fincas, zonas] = await Promise.all([
    potrerosConForraje(org.id, { geometria: true }).then((r) => r.potreros),
    modulosDeOrg(org.id),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)).orderBy(schema.fincas.nombre),
    zonasDeOrg(org.id),
  ]);
  const nombreFinca = new Map(fincas.map((f) => [f.id, f.nombre]));

  return (
    <>
      <PageHeader titulo="Mapa de potreros" descripcion="Vista satelital coloreada por estado. Dibuja los límites o importa el mapa de tu finca (KML, KMZ, Shapefile, GeoJSON o GPX). Marca bosque, caminos y quebradas para descontarlos del área de pastoreo." />
      <MapaPotreros
        slug={slug}
        colorInicial={color === "prioridad" || color === "modulo" ? color : "estado"}
        unidad={org.unidadArea}
        fincas={fincas}
        modulos={modulos.map((m) => ({ id: m.id, nombre: m.nombre, color: m.color }))}
        editable={puede(rol, "administrador")}
        crearPotrero={crearPotrero.bind(null, slug)}
        guardarGeometria={guardarGeometria.bind(null, slug)}
        importarPotreros={importarPotreros.bind(null, slug)}
        crearZona={crearZona.bind(null, slug)}
        actualizarZona={actualizarZona.bind(null, slug)}
        guardarGeometriaZona={guardarGeometriaZona.bind(null, slug)}
        eliminarZona={eliminarZona.bind(null, slug)}
        zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre, tipo: z.tipo, areaHa: z.areaHa, geometria: z.geometria, anchoM: z.anchoM, largoM: z.largoM, fincaNombre: nombreFinca.get(z.fincaId) ?? "" }))}
        potreros={potreros.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          fincaNombre: p.fincaNombre,
          estado: p.estado,
          areaHa: p.areaHa,
          areaUtilHa: p.areaUtilHa,
          tipoPasto: p.tipoPasto,
          geometria: p.geometria,
          detalle: detalleEstado(p),
          modulo: p.modulo,
          prioridad: p.prioridad,
          cobertura: p.est.cobertura,
        }))}
      />
    </>
  );
}
