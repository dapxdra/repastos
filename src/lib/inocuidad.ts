import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hoyCR, loteDeOrdeno } from "@/lib/dominio";

/**
 * Retiro de leche / carne por agroquímicos (inocuidad).
 *
 * Un lote queda "expuesto" a una aplicación si estuvo en el potrero dentro de la ventana
 * [fecha de aplicación, fecha + días de retiro). Mientras la ventana no termine:
 *  - lote de ordeño → su leche no debe entregarse;
 *  - cualquier lote → sus animales no deben ir a sacrificio (retiro de carne).
 *
 * Si el lote salió el mismo día de la aplicación se asume que salió antes de aplicar
 * (práctica normal: se fumiga después de pastorear).
 */
export type Restriccion = {
  loteId: string;
  lote: string;
  tipo: "leche" | "carne";
  /** Primer día (YYYY-MM-DD) en que vuelve a ser apto */
  hasta: string;
  producto: string;
  potrero: string;
};

export type RetiroPotrero = { hasta: string; producto: string };

/** Potreros con retiro de leche vigente: los lotes de ordeño no deben entrar antes de `hasta`. */
export async function retirosLechePorPotrero(orgId: string, hoy = hoyCR()): Promise<Map<string, RetiroPotrero>> {
  const { rows } = await db.execute<{ potrero_id: string; hasta: string; producto: string }>(sql`
    select distinct on (a.potrero_id) a.potrero_id::text as potrero_id,
           (a.fecha + pr.retiro_leche_dias)::text as hasta, pr.nombre as producto
      from aplicaciones a
      join productos pr on pr.id = a.producto_id
     where a.org_id = ${orgId} and a.fecha + pr.retiro_leche_dias > ${hoy}::date
     order by a.potrero_id, a.fecha + pr.retiro_leche_dias desc
  `);
  return new Map(rows.map((r) => [r.potrero_id, { hasta: r.hasta, producto: r.producto }]));
}

type Fila = {
  lote_id: string;
  lote: string;
  categoria: string;
  producto: string;
  potrero: string;
  entrada: string;
  salida: string | null;
  fecha: string;
  leche_hasta: string | null;
  carne_hasta: string | null;
};

export async function restriccionesDeLotes(orgId: string, tipoProduccion: string, hoy = hoyCR()): Promise<Restriccion[]> {
  const { rows } = await db.execute<Fila>(sql`
    select l.id::text as lote_id, l.nombre as lote, l.categoria::text as categoria,
           pr.nombre as producto, po.nombre as potrero,
           (pa.fecha_entrada at time zone 'America/Costa_Rica')::date::text as entrada,
           (pa.fecha_salida at time zone 'America/Costa_Rica')::date::text as salida,
           a.fecha::text as fecha,
           (a.fecha + pr.retiro_leche_dias)::text as leche_hasta,
           (a.fecha + pr.retiro_carne_dias)::text as carne_hasta
      from aplicaciones a
      join productos pr on pr.id = a.producto_id
      join potreros po on po.id = a.potrero_id
      join pastoreos pa on pa.potrero_id = a.potrero_id and pa.org_id = a.org_id
      join lotes l on l.id = pa.lote_id
     where a.org_id = ${orgId}
       and (a.fecha + coalesce(pr.retiro_leche_dias, 0) > ${hoy}::date
            or a.fecha + coalesce(pr.retiro_carne_dias, 0) > ${hoy}::date)
       and (pa.fecha_salida is null or pa.fecha_salida >= a.fecha - interval '1 day')
  `);

  const mejor = new Map<string, Restriccion>();
  for (const r of rows) {
    // Sin salida: sigue adentro hoy
    const salida = r.salida ?? hoy;
    const candidatos: ["leche" | "carne", string | null][] = [
      ["leche", loteDeOrdeno(r.categoria, tipoProduccion) ? r.leche_hasta : null],
      ["carne", r.carne_hasta],
    ];
    for (const [tipo, hasta] of candidatos) {
      if (!hasta || hasta <= hoy) continue;
      // Estuvo adentro después de aplicar, o entró antes de que terminara el retiro
      const expuesto = r.entrada < hasta && (salida > r.fecha || r.entrada >= r.fecha);
      if (!expuesto) continue;
      const k = `${r.lote_id}:${tipo}`;
      const previo = mejor.get(k);
      if (!previo || hasta > previo.hasta) {
        mejor.set(k, { loteId: r.lote_id, lote: r.lote, tipo, hasta, producto: r.producto, potrero: r.potrero });
      }
    }
  }
  return [...mejor.values()].sort((a, b) => (a.tipo === b.tipo ? a.hasta.localeCompare(b.hasta) : a.tipo === "leche" ? -1 : 1));
}
