import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import turfArea from "@turf/area";
import intersect from "@turf/intersect";
import union from "@turf/union";
import { feature, featureCollection } from "@turf/helpers";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { db, schema } from "@/db";

type Pol = { type: "Polygon"; coordinates: number[][][] };
type Ejecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const caja = (g: Pol) => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of g.coordinates[0]) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1] as const;
};
const tocan = (a: readonly number[], b: readonly number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/**
 * Hectáreas del potrero cubiertas por zonas no pastoreables. Las zonas se unen antes de intersecar
 * para no descontar dos veces un traslape (p. ej. un camino que cruza un bosque).
 */
export function haExcluidas(potrero: Pol, zonas: Pol[]): number {
  const bp = caja(potrero);
  const cand = zonas.filter((z) => tocan(bp, caja(z)));
  if (!cand.length) return 0;
  const p = feature(potrero as Polygon);
  try {
    const u: Feature<Polygon | MultiPolygon> | null =
      cand.length === 1 ? feature(cand[0] as Polygon) : union(featureCollection(cand.map((z) => feature(z as Polygon))));
    if (!u) return 0;
    const i = intersect(featureCollection([p, u]));
    return i ? Math.min(turfArea(i), turfArea(p)) / 10_000 : 0;
  } catch {
    // Geometría inválida (auto-intersección): suma zona por zona como aproximación
    let m2 = 0;
    for (const z of cand) {
      try {
        const i = intersect(featureCollection([p, feature(z as Polygon)]));
        if (i) m2 += turfArea(i);
      } catch {
        /* se ignora la zona inválida */
      }
    }
    return Math.min(m2, turfArea(p)) / 10_000;
  }
}

/** Recalcula el área excluida de todos los potreros dibujados de las fincas indicadas. */
export async function recalcularExcluidas(ex: Ejecutor, orgId: string, fincaIds: string[]) {
  const fincas = [...new Set(fincaIds)];
  if (!fincas.length) return;
  const [potreros, zonas] = await Promise.all([
    ex
      .select({ id: schema.potreros.id, fincaId: schema.potreros.fincaId, geometria: schema.potreros.geometria, actual: schema.potreros.areaExcluidaHa })
      .from(schema.potreros)
      .where(and(eq(schema.potreros.orgId, orgId), inArray(schema.potreros.fincaId, fincas), isNotNull(schema.potreros.geometria))),
    ex
      .select({ fincaId: schema.zonas.fincaId, geometria: schema.zonas.geometria })
      .from(schema.zonas)
      .where(and(eq(schema.zonas.orgId, orgId), inArray(schema.zonas.fincaId, fincas))),
  ]);
  const cambios = potreros
    .map((p) => ({
      id: p.id,
      ha: haExcluidas(
        p.geometria!,
        zonas.filter((z) => z.fincaId === p.fincaId).map((z) => z.geometria),
      ),
      actual: Number(p.actual),
    }))
    .filter((c) => Math.abs(c.ha - c.actual) > 1e-6);
  if (!cambios.length) return;
  await ex.execute(sql`
    update potreros p set area_excluida_ha = v.ha::numeric
      from (values ${sql.join(cambios.map((c) => sql`(${c.id}::uuid, ${c.ha.toFixed(6)})`), sql`, `)}) as v(id, ha)
     where p.id = v.id and p.org_id = ${orgId}`);
}
