import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Beef, Coins, Info, Leaf, Milk, Plus, Scale, Sprout, Trash2, TrendingUp } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { potrerosConEstado } from "@/lib/consultas";
import { demandaDeLote } from "@/lib/plan";
import { porUnidadTasa, unidadTasa, diasEntre, fechaCortaCR, formatColones, formatNum, hoyCR, sumarDias } from "@/lib/dominio";
import { UMBRAL_BAJO_RENDIMIENTO, gananciasDePeso, mediana, resumenLeche } from "@/lib/indicadores";
import { Card, PageHeader, Stat, Tabla, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { eliminarLeche, eliminarPesaje, registrarLeche, registrarPesaje } from "../actions";

export const metadata = { title: "Producción" };

export default async function Produccion({ params }: PageProps<"/app/[slug]/produccion">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const esAdmin = puede(rol, "administrador");
  const u = org.unidadArea;
  const hoy = hoyCR();
  const hace365 = sumarDias(hoy, -365);
  const leche = org.tipoProduccion !== "carne";

  const [potreros, lotes, pastoreos, primerPastoreo, registrosLeche, pesajes] = await Promise.all([
    potrerosConEstado(org.id),
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)).orderBy(schema.lotes.nombre),
    // Días de cada pastoreo dentro de los últimos 365 días (los abiertos cuentan hasta hoy)
    db.execute<{ potrero_id: string; lote_id: string; cabezas: number | null; dias: string }>(sql`
      select potrero_id, lote_id, cabezas,
             extract(epoch from (least(coalesce(fecha_salida, now()), now()) - greatest(fecha_entrada, now() - interval '365 days'))) / 86400 as dias
        from pastoreos
       where org_id = ${org.id} and coalesce(fecha_salida, now()) > now() - interval '365 days'`),
    db.execute<{ fecha: string | null }>(sql`select min((fecha_entrada at time zone 'America/Costa_Rica')::date)::text as fecha from pastoreos where org_id = ${org.id}`),
    db
      .select({
        id: schema.produccionLeche.id,
        desde: schema.produccionLeche.desde,
        hasta: schema.produccionLeche.hasta,
        litros: schema.produccionLeche.litros,
        vacas: schema.produccionLeche.vacas,
        precio: schema.produccionLeche.precioLitro,
        lote: schema.lotes.nombre,
      })
      .from(schema.produccionLeche)
      .leftJoin(schema.lotes, eq(schema.lotes.id, schema.produccionLeche.loteId))
      .where(and(eq(schema.produccionLeche.orgId, org.id), gte(schema.produccionLeche.hasta, hace365)))
      .orderBy(desc(schema.produccionLeche.hasta)),
    db
      .select({ id: schema.pesajes.id, loteId: schema.pesajes.loteId, fecha: schema.pesajes.fecha, cabezas: schema.pesajes.cabezas, peso: schema.pesajes.pesoPromedioKg })
      .from(schema.pesajes)
      .where(and(eq(schema.pesajes.orgId, org.id), gte(schema.pesajes.fecha, sumarDias(hoy, -540))))
      .orderBy(desc(schema.pesajes.fecha)),
  ]);

  // Ventana de análisis: 365 días, o desde el primer pastoreo si la finca empezó a registrar hace menos
  const inicio = primerPastoreo.rows[0]?.fecha && primerPastoreo.rows[0].fecha > hace365 ? primerPastoreo.rows[0].fecha : hace365;
  const diasVentana = Math.max(1, diasEntre(inicio, hoy));
  const anualizar = 365 / diasVentana;

  const costos = await db.execute<{ insumos: string; labores: string }>(sql`
      select (select coalesce(sum(costo_total), 0) from aplicaciones where org_id = ${org.id} and fecha >= ${inicio}::date) as insumos,
             (select coalesce(sum(costo), 0) from eventos where org_id = ${org.id} and hecha and fecha >= ${inicio}::date) as labores`);
  const costoInsumos = Number(costos.rows[0].insumos);
  const costoLabores = Number(costos.rows[0].labores);
  const costoTotal = costoInsumos + costoLabores;

  // Pasto cosechado: lo que comió cada lote (demanda de pasto × días) en cada potrero
  const loteDe = new Map(lotes.map((l) => [l.id, l]));
  const cosechaKg = new Map<string, number>();
  for (const r of pastoreos.rows) {
    const l = loteDe.get(r.lote_id);
    const dias = Number(r.dias);
    if (!l || !(dias > 0)) continue;
    const kg = demandaDeLote({ ...l, cabezas: r.cabezas ?? l.cabezas }).pasto * dias;
    cosechaKg.set(r.potrero_id, (cosechaKg.get(r.potrero_id) ?? 0) + kg);
  }
  const filas = potreros
    .filter((p) => p.areaUtilHa && p.areaUtilHa > 0)
    .map((p) => {
      const kg = cosechaKg.get(p.id) ?? 0;
      return { p, kg, tHaAno: (kg * anualizar) / p.areaUtilHa! / 1000 };
    })
    .sort((a, b) => b.tHaAno - a.tHaAno);
  const med = mediana(filas.filter((f) => f.kg > 0).map((f) => f.tHaAno));
  const areaHa = potreros.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
  const kgTotal = [...cosechaKg.values()].reduce((s, x) => s + x, 0);
  const tHaAnoFinca = areaHa > 0 ? (kgTotal * anualizar) / areaHa / 1000 : null;
  const costoKgMs = kgTotal > 0 ? costoTotal / kgTotal : null;

  // Leche
  const rl = resumenLeche(registrosLeche.map((r) => ({ desde: r.desde, hasta: r.hasta, litros: Number(r.litros), vacas: r.vacas })));
  const litrosAno = rl.litrosDia != null ? rl.litrosDia * 365 : null;
  const conPrecio = registrosLeche.filter((r) => r.precio);
  const precioProm = conPrecio.length ? conPrecio.reduce((s, r) => s + Number(r.litros) * Number(r.precio), 0) / conPrecio.reduce((s, r) => s + Number(r.litros), 0) : null;
  const costoPorLitro = rl.litrosDia ? costoTotal / diasVentana / rl.litrosDia : null;

  // Carne: ganancia de peso por lote
  const porLote = lotes
    .map((l) => {
      const ps = pesajes.filter((x) => x.loteId === l.id).map((x) => ({ fecha: x.fecha, cabezas: x.cabezas, peso: Number(x.peso) }));
      const tramos = gananciasDePeso(ps);
      return { l, ultimo: ps[0] ?? null, tramo: tramos.at(-1) ?? null, kgAno: tramos.filter((t) => t.hasta >= hace365).reduce((s, t) => s + t.kgGanados, 0) };
    })
    .filter((x) => x.ultimo);
  const kgCarneAno = porLote.reduce((s, x) => s + x.kgAno, 0);

  const enU = (porHa: number) => porUnidadTasa(porHa, u);
  const ut = unidadTasa(u);

  return (
    <>
      <PageHeader titulo="Producción" descripcion="Leche, pesajes y lo que rinde cada potrero: pasto cosechado, litros por hectárea y costo del pasto." />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <Stat icono={Leaf} etiqueta={`Pasto cosechado (t MS/${ut}/año)`} valor={formatNum(tHaAnoFinca == null ? null : enU(tHaAnoFinca), 1)} detalle={`Estimado del consumo de los lotes · ${formatNum(kgTotal / 1000, 0)} t MS en ${diasVentana} d`} />
        <Stat icono={Coins} tono="accent" etiqueta="Costo del pasto (₡/kg MS)" valor={costoKgMs == null ? "—" : formatColones(costoKgMs)} detalle={`Insumos ${formatColones(costoInsumos)} · labores ${formatColones(costoLabores)}`} />
        {leche ? (
          <>
            <Stat icono={Milk} tono="sky" etiqueta={`Leche (L/${ut}/año)`} valor={formatNum(litrosAno != null && areaHa > 0 ? enU(litrosAno / areaHa) : null, 0)} detalle={rl.litrosDia ? `${formatNum(rl.litrosDia, 0)} L/día${rl.litrosVacaDia ? ` · ${formatNum(rl.litrosVacaDia, 1)} L/vaca/día` : ""}` : "Registra la leche entregada"} />
            <Stat icono={TrendingUp} tono="warning" etiqueta="Costo del pasto por litro" valor={costoPorLitro == null ? "—" : formatColones(costoPorLitro)} detalle={precioProm ? `${formatNum((costoPorLitro ?? 0) / precioProm * 100, 0)} % del precio (${formatColones(precioProm)}/L)` : "Anota el precio por litro para compararlo"} />
          </>
        ) : (
          <>
            <Stat icono={Scale} tono="sky" etiqueta={`Carne producida (kg/${ut}/año)`} valor={formatNum(areaHa > 0 && kgCarneAno > 0 ? enU(kgCarneAno / areaHa) : null, 0)} detalle={`${formatNum(kgCarneAno, 0)} kg ganados en 12 meses`} />
            <Stat icono={TrendingUp} tono="warning" etiqueta="Costo del pasto por kg ganado" valor={kgCarneAno > 0 ? formatColones((costoTotal / diasVentana) * 365 / kgCarneAno) : "—"} detalle="Insumos y labores ÷ kg de peso ganado" />
          </>
        )}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        El pasto cosechado se estima con la demanda de cada lote (peso, consumo y suplemento actuales) por los días que estuvo en cada potrero. Anualizado {diasVentana < 365 ? `desde el ${fechaCortaCR(inicio)}` : "a 12 meses"}.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card titulo="Rendimiento por potrero" icono={Sprout}>
            {filas.every((f) => f.kg === 0) ? (
              <Vacio icono={Sprout} titulo="Sin pastoreos" texto="Los rendimientos aparecen cuando hay movimientos de lotes registrados." />
            ) : (
              <>
                <Tabla>
                  <thead>
                    <tr><th>Potrero</th><th className="text-right">t MS/{ut}/año</th><th className="text-right">vs. mediana</th><th>Diagnóstico</th></tr>
                  </thead>
                  <tbody>
                    {filas.map(({ p, kg, tHaAno }) => {
                      const rel = med ? tHaAno / med : null;
                      const bajo = rel != null && kg > 0 && rel < UMBRAL_BAJO_RENDIMIENTO;
                      return (
                        <tr key={p.id} className={bajo ? "bg-warning-soft/40" : ""}>
                          <td><Link href={`/app/${slug}/potreros/${p.id}`} className="font-medium hover:text-primary">{p.nombre}</Link><span className="block text-xs text-muted">{p.tipoPasto ?? "Pasto sin definir"}</span></td>
                          <td className="num text-right font-semibold">{kg > 0 ? formatNum(enU(tHaAno), 1) : "—"}</td>
                          <td className="num text-right">{rel != null && kg > 0 ? `${formatNum(rel * 100, 0)} %` : "—"}</td>
                          <td className="text-xs">
                            {kg === 0 ? <span className="text-muted">Sin pastoreos en el período</span> : bajo ? <span className="font-semibold text-warning">Rinde poco: revisar suelo, plagas y especie; candidato a renovar</span> : <span className="text-muted">En el rango de la finca</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
                <p className="mt-2 text-xs text-muted">Un pastizal tropical bien manejado y abonado cosecha del orden de 15–25 t MS/ha/año; uno degradado, menos de 8.</p>
              </>
            )}
          </Card>

          {leche && (
            <Card titulo="Leche registrada" icono={Milk}>
              {registrosLeche.length === 0 ? (
                <p className="text-sm text-muted">Sin registros. Anota la entrega quincenal a la cooperativa o el total diario.</p>
              ) : (
                <Tabla>
                  <thead><tr><th>Período</th><th>Lote</th><th className="text-right">Litros</th><th className="text-right">L/vaca/día</th><th className="text-right">₡/L</th>{esAdmin && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
                  <tbody>
                    {registrosLeche.map((r) => {
                      const dias = diasEntre(r.desde, r.hasta) + 1;
                      return (
                        <tr key={r.id}>
                          <td className="num whitespace-nowrap">{r.desde === r.hasta ? fechaCortaCR(r.desde) : `${fechaCortaCR(r.desde)} – ${fechaCortaCR(r.hasta)}`}</td>
                          <td>{r.lote ?? <span className="text-muted">Toda la ganadería</span>}</td>
                          <td className="num text-right font-semibold">{formatNum(Number(r.litros), 0)}</td>
                          <td className="num text-right">{r.vacas ? formatNum(Number(r.litros) / r.vacas / dias, 1) : "—"}</td>
                          <td className="num text-right">{r.precio ? formatColones(r.precio) : "—"}</td>
                          {esAdmin && (
                            <td>
                              <BotonAccion action={eliminarLeche.bind(null, slug, r.id)} className="btn-ghost min-h-9 px-2" confirmar="¿Eliminar este registro de leche?">
                                <Trash2 className="size-4" aria-hidden /><span className="sr-only">Eliminar</span>
                              </BotonAccion>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </Tabla>
              )}
            </Card>
          )}

          <Card titulo="Ganancia de peso por lote" icono={Beef}>
            {porLote.length === 0 ? (
              <p className="text-sm text-muted">Sin pesajes. Pesar cada 30–60 días muestra si el pasto alcanza.</p>
            ) : (
              <Tabla>
                <thead><tr><th>Lote</th><th>Último pesaje</th><th className="text-right">Peso prom.</th><th className="text-right">Ganancia</th>{esAdmin && <th><span className="sr-only">Acciones</span></th>}</tr></thead>
                <tbody>
                  {porLote.map(({ l, ultimo, tramo }) => (
                    <tr key={l.id}>
                      <td className="font-medium">{l.nombre}</td>
                      <td className="num">{fechaCortaCR(ultimo!.fecha)} · {ultimo!.cabezas} cab.</td>
                      <td className="num text-right">{formatNum(ultimo!.peso, 0)} kg</td>
                      <td className={`num text-right font-semibold ${tramo && tramo.gdp < 0.3 ? "text-warning" : ""}`}>
                        {tramo ? `${formatNum(tramo.gdp * 1000, 0)} g/día` : "—"}
                        {tramo && <span className="block text-xs font-normal text-muted">en {tramo.dias} d</span>}
                      </td>
                      {esAdmin && (
                        <td>
                          <BotonAccion action={eliminarPesaje.bind(null, slug, pesajes.find((x) => x.loteId === l.id)!.id)} className="btn-ghost min-h-9 px-2" confirmar="¿Eliminar el último pesaje de este lote?">
                            <Trash2 className="size-4" aria-hidden /><span className="sr-only">Eliminar último pesaje</span>
                          </BotonAccion>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {esOperador && leche && (
            <Card titulo="Registrar leche" icono={Plus}>
              <ActionForm action={registrarLeche.bind(null, slug)} className="space-y-3">
                <Field label="Lote" name="loteId">
                  <select className="input" defaultValue="">
                    <option value="">Toda la ganadería</option>
                    {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Desde" name="desde" required><input className="input" type="date" max={hoy} defaultValue={sumarDias(hoy, -14)} /></Field>
                  <Field label="Hasta" name="hasta" required><input className="input" type="date" max={hoy} defaultValue={hoy} /></Field>
                  <Field label="Litros" name="litros" required><input className="input" type="number" inputMode="decimal" step="any" min={0} /></Field>
                  <Field label="Vacas en ordeño" name="vacas"><input className="input" type="number" inputMode="numeric" min={1} /></Field>
                  <Field label="Precio por litro (₡)" name="precio" className="col-span-2" hint="De la liquidación de la cooperativa (opcional)">
                    <input className="input" type="number" inputMode="decimal" step="any" min={0} />
                  </Field>
                </div>
                <Submit className="btn w-full">Guardar leche</Submit>
              </ActionForm>
            </Card>
          )}

          {esOperador && lotes.length > 0 && (
            <Card titulo="Registrar pesaje" icono={Scale}>
              <ActionForm action={registrarPesaje.bind(null, slug)} className="space-y-3">
                <Field label="Lote" name="loteId">
                  <select className="input">{lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.cabezas} cab.)</option>)}</select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha" name="fecha"><input className="input" type="date" max={hoy} defaultValue={hoy} /></Field>
                  <Field label="Animales pesados" name="cabezas" required><input className="input" type="number" inputMode="numeric" min={1} /></Field>
                  <Field label="Peso promedio (kg)" name="peso" required className="col-span-2" hint="Actualiza el peso del lote para calcular su consumo">
                    <input className="input" type="number" inputMode="decimal" step="any" min={0} />
                  </Field>
                </div>
                <Submit className="btn w-full">Guardar pesaje</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
