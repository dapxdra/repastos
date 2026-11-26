import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ClipboardList, FileBarChart, Repeat2, Sprout } from "lucide-react";
import { db, schema } from "@/db";
import { requireOrg } from "@/lib/tenant";
import { TIPOS_EVENTO, diasEntre, fechaCR, fechaCortaCR, formatColones, formatNum, hoyCR, sumarDias, type TipoEvento } from "@/lib/dominio";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { AccionesReporte } from "@/components/acciones-reporte";

export const metadata = { title: "Reportes" };

const esFecha = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Reportes({ params, searchParams }: PageProps<"/app/[slug]/reportes">) {
  const { slug } = await params;
  const sp = (await searchParams) as { desde?: string; hasta?: string; lote?: string };
  const { org } = await requireOrg(slug);
  const hoy = hoyCR();
  const hasta = esFecha(sp.hasta) && sp.hasta <= hoy ? sp.hasta : hoy;
  const desde = esFecha(sp.desde) && sp.desde <= hasta ? sp.desde : sumarDias(hasta, -29);
  const loteId = sp.lote && /^[0-9a-f-]{36}$/i.test(sp.lote) ? sp.lote : null;

  const [lotes, pastoreos, aplicaciones, labores] = await Promise.all([
    db.select({ id: schema.lotes.id, nombre: schema.lotes.nombre }).from(schema.lotes).where(eq(schema.lotes.orgId, org.id)).orderBy(schema.lotes.nombre),
    db.execute<{
      id: string;
      potrero: string;
      potrero_id: string;
      modulo: string | null;
      lote: string;
      cabezas: number | null;
      entrada: string;
      salida: string | null;
      salida_prev: string | null;
      aforo: string | null;
    }>(sql`
      with h as (
        select x.*, lag(x.fecha_salida) over (partition by x.potrero_id order by x.fecha_entrada) as salida_prev
          from pastoreos x where x.org_id = ${org.id}
      )
      select h.id, p.nombre as potrero, p.id as potrero_id, m.nombre as modulo, l.nombre as lote, h.cabezas,
             (h.fecha_entrada at time zone 'America/Costa_Rica')::date::text as entrada,
             (h.fecha_salida at time zone 'America/Costa_Rica')::date::text as salida,
             (h.salida_prev at time zone 'America/Costa_Rica')::date::text as salida_prev,
             (select a.kg_ms_ha from aforos a where a.potrero_id = h.potrero_id and a.org_id = h.org_id
                 and a.fecha between (h.fecha_entrada at time zone 'America/Costa_Rica')::date - 3 and (h.fecha_entrada at time zone 'America/Costa_Rica')::date
               order by a.fecha desc limit 1) as aforo
        from h
        join potreros p on p.id = h.potrero_id
        join lotes l on l.id = h.lote_id
        left join modulos m on m.id = p.modulo_id
       where (h.fecha_entrada at time zone 'America/Costa_Rica')::date <= ${hasta}::date
         and coalesce((h.fecha_salida at time zone 'America/Costa_Rica')::date, ${hoy}::date) >= ${desde}::date
         ${loteId ? sql`and h.lote_id = ${loteId}` : sql``}
       order by h.fecha_entrada`),
    db
      .select({
        producto: schema.productos.nombre,
        aplicaciones: sql<number>`count(distinct ${schema.aplicaciones.grupoId})::int`,
        potreros: sql<number>`count(*)::int`,
        cantidad: sql<string>`sum(${schema.aplicaciones.cantidadTotal})`,
        unidad: sql<string>`min(${schema.productos.unidad})`,
        costo: sql<string | null>`sum(${schema.aplicaciones.costoTotal})`,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .where(and(eq(schema.aplicaciones.orgId, org.id), gte(schema.aplicaciones.fecha, desde), lte(schema.aplicaciones.fecha, hasta)))
      .groupBy(schema.productos.nombre),
    db
      .select({ tipo: schema.eventos.tipo, n: sql<number>`count(distinct ${schema.eventos.grupoId})::int`, costo: sql<string | null>`sum(${schema.eventos.costo})` })
      .from(schema.eventos)
      .where(and(eq(schema.eventos.orgId, org.id), eq(schema.eventos.hecha, true), gte(schema.eventos.fecha, desde), lte(schema.eventos.fecha, hasta)))
      .groupBy(schema.eventos.tipo),
  ]);

  const filas = pastoreos.rows.map((r) => ({
    ...r,
    dias: diasEntre(r.entrada, r.salida ?? hoy) + 1,
    descanso: r.salida_prev ? diasEntre(r.salida_prev, r.entrada) : null,
  }));
  const porPotrero = [...new Map(filas.map((f) => [f.potrero_id, f.potrero])).entries()].map(([id, nombre]) => {
    const fs = filas.filter((f) => f.potrero_id === id);
    const descansos = fs.map((f) => f.descanso).filter((x): x is number => x != null);
    return { id, nombre, n: fs.length, dias: fs.reduce((s, f) => s + f.dias, 0), descanso: descansos.length ? descansos.reduce((a, b) => a + b, 0) / descansos.length : null };
  });
  const descansos = filas.map((f) => f.descanso).filter((x): x is number => x != null);
  const descansoProm = descansos.length ? descansos.reduce((a, b) => a + b, 0) / descansos.length : null;
  const ocupProm = filas.length ? filas.reduce((s, f) => s + f.dias, 0) / filas.length : null;
  const gastoInsumos = aplicaciones.reduce((s, a) => s + Number(a.costo ?? 0), 0);
  const gastoLabores = labores.reduce((s, l) => s + Number(l.costo ?? 0), 0);
  const loteNombre = loteId ? lotes.find((l) => l.id === loteId)?.nombre : null;

  const resumen = [
    `*Reporte de rotación — ${org.nombre}*`,
    `${fechaCR(desde)} al ${fechaCR(hasta)}${loteNombre ? ` · ${loteNombre}` : ""}`,
    `Pastoreos: ${filas.length} en ${porPotrero.length} potreros`,
    `Descanso promedio: ${formatNum(descansoProm, 0)} días · Ocupación promedio: ${formatNum(ocupProm, 1)} días`,
    aplicaciones.length ? `Insumos: ${formatColones(gastoInsumos)} (${aplicaciones.map((a) => a.producto).join(", ")})` : "",
    labores.length ? `Labores: ${labores.map((l) => `${TIPOS_EVENTO[l.tipo as TipoEvento].label.split(" (")[0]} ×${l.n}`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <PageHeader
        titulo="Reporte de rotación"
        descripcion={`${org.nombre} · ${fechaCR(desde)} al ${fechaCR(hasta)}${loteNombre ? ` · ${loteNombre}` : ""}`}
        acciones={<AccionesReporte resumen={resumen} />}
      />

      <form className="card card-pad mb-4 grid grid-campos items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] print:hidden" method="get">
        <label className="field">
          <span className="label">Desde</span>
          <input className="input" type="date" name="desde" defaultValue={desde} max={hoy} />
        </label>
        <label className="field">
          <span className="label">Hasta</span>
          <input className="input" type="date" name="hasta" defaultValue={hasta} max={hoy} />
        </label>
        <label className="field col-span-full sm:col-span-1">
          <span className="label">Lote</span>
          <select className="input" name="lote" defaultValue={loteId ?? ""}>
            <option value="">Todos</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </label>
        <button type="submit" className="btn col-span-full sm:col-span-1 sm:row-span-2 sm:self-end">Ver reporte</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Pastoreos", formatNum(filas.length, 0)],
          ["Potreros usados", formatNum(porPotrero.length, 0)],
          ["Descanso promedio", descansoProm == null ? "—" : `${formatNum(descansoProm, 0)} días`],
          ["Gasto insumos y labores", formatColones(gastoInsumos + gastoLabores)],
        ].map(([k, v]) => (
          <div key={k} className="card card-pad">
            <p className="text-xs text-muted">{k}</p>
            <p className="num font-display text-xl font-bold">{v}</p>
          </div>
        ))}
      </div>

      <Card titulo="Movimientos" icono={Repeat2}>
        {filas.length === 0 ? (
          <Vacio icono={FileBarChart} titulo="Sin pastoreos en el período" texto="Cambia las fechas o el lote." />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Potrero</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th className="text-right">Días</th>
                <th className="text-right">Descanso previo</th>
                <th className="text-right">Aforo entrada</th>
                <th className="text-right">Cab.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium">{f.lote}</td>
                  <td>{f.potrero}{f.modulo && <span className="block text-xs text-muted">{f.modulo}</span>}</td>
                  <td className="num">{fechaCortaCR(f.entrada)}</td>
                  <td className="num">{f.salida ? fechaCortaCR(f.salida) : "En curso"}</td>
                  <td className="num text-right">{f.dias}</td>
                  <td className="num text-right">{f.descanso == null ? "—" : `${f.descanso} d`}</td>
                  <td className="num text-right">{f.aforo ? formatNum(Number(f.aforo), 0) : "—"}</td>
                  <td className="num text-right">{f.cabezas ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <Card titulo="Por potrero" icono={FileBarChart}>
          {porPotrero.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <Tabla>
              <thead><tr><th>Potrero</th><th className="text-right">Pastoreos</th><th className="text-right">Días ocupado</th><th className="text-right">Descanso prom.</th></tr></thead>
              <tbody>
                {porPotrero.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.nombre}</td>
                    <td className="num text-right">{p.n}</td>
                    <td className="num text-right">{p.dias}</td>
                    <td className="num text-right">{p.descanso == null ? "—" : `${formatNum(p.descanso, 0)} d`}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
        <div className="space-y-4">
          <Card titulo="Insumos aplicados" icono={Sprout}>
            {aplicaciones.length === 0 ? <p className="text-sm text-muted">Sin aplicaciones en el período.</p> : (
              <ul className="space-y-2 text-sm">
                {aplicaciones.map((a) => (
                  <li key={a.producto} className="flex justify-between gap-2">
                    <span><b className="font-medium">{a.producto}</b> <span className="text-muted">· {a.potreros} pot. · {formatNum(Number(a.cantidad), 1)} {a.unidad}</span></span>
                    <span className="num">{formatColones(a.costo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card titulo="Labores" icono={ClipboardList}>
            {labores.length === 0 ? <p className="text-sm text-muted">Sin labores en el período.</p> : (
              <ul className="space-y-2 text-sm">
                {labores.map((l) => (
                  <li key={l.tipo} className="flex justify-between gap-2">
                    <span><b className="font-medium">{TIPOS_EVENTO[l.tipo as TipoEvento].label}</b> <span className="text-muted">× {l.n}</span></span>
                    <span className="num">{formatColones(l.costo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <p className="mt-4 hidden text-xs text-muted print:block">Generado con Repastos el {fechaCR(hoy)}.</p>
    </>
  );
}
