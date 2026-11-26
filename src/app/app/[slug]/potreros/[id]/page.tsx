import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { ArrowLeft, Bug, CalendarClock, Mountain, ClipboardList, FileText, History, Leaf, Pencil, Ruler, Sprout, Upload } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConForraje } from "@/lib/consultas";
import { PRIORIDADES, descansoPorHojas } from "@/lib/forraje";
import { N_ANUAL_MAX, aAnalisis, cice, recomendar, saturacionTolerada } from "@/lib/suelo";
import { NIVELES_PLAGA, PLAGAS, nivelPlaga } from "@/lib/plagas";
import {
  METODOS_AFORO,
  aUnidad,
  detalleEstado,
  diasEntre,
  dosisEnUnidad,
  fechaCortaCR,
  fechaISOEnCR,
  formatArea,
  porUnidadTasa,
  simboloUnidad,
  unidadTasa,
  formatColones,
  formatNum,
  hoyCR,
  sumarDias,
  TIPOS_EVENTO,
  type TipoEvento,
} from "@/lib/dominio";
import { Card, EstadoBadge, ModuloChip, PageHeader, Tabla } from "@/components/ui";
import { ActionForm, Field, Submit } from "@/components/forms";
import { actualizarPotrero, subirArchivo } from "../../actions";

export const metadata = { title: "Potrero" };

export default async function DetallePotrero({ params }: PageProps<"/app/[slug]/potreros/[id]">) {
  const { slug, id } = await params;
  const { org, rol } = await requireOrg(slug);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const u = org.unidadArea;
  const hoy = hoyCR();

  const { potreros: todos } = await potrerosConForraje(org.id);
  const p = todos.find((x) => x.id === id);
  if (!p) notFound();

  const [[extra], pastoreos, aplicaciones, aforos, archivos, modulos, eventos, ultimas] = await Promise.all([
    db.select({ notas: schema.potreros.notas }).from(schema.potreros).where(and(eq(schema.potreros.id, id), eq(schema.potreros.orgId, org.id))),
    db
      .select({ id: schema.pastoreos.id, entrada: schema.pastoreos.fechaEntrada, salida: schema.pastoreos.fechaSalida, cabezas: schema.pastoreos.cabezas, lote: schema.lotes.nombre })
      .from(schema.pastoreos)
      .innerJoin(schema.lotes, eq(schema.lotes.id, schema.pastoreos.loteId))
      .where(and(eq(schema.pastoreos.potreroId, id), eq(schema.pastoreos.orgId, org.id)))
      .orderBy(desc(schema.pastoreos.fechaEntrada))
      .limit(20),
    db
      .select({
        id: schema.aplicaciones.id,
        fecha: schema.aplicaciones.fecha,
        producto: schema.productos.nombre,
        unidad: schema.productos.unidad,
        dosisPorHa: schema.aplicaciones.dosisPorHa,
        cantidad: schema.aplicaciones.cantidadTotal,
        costo: schema.aplicaciones.costoTotal,
        liberacion: schema.aplicaciones.fechaLiberacion,
        reingreso: schema.aplicaciones.reingresoDias,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .where(and(eq(schema.aplicaciones.potreroId, id), eq(schema.aplicaciones.orgId, org.id)))
      .orderBy(desc(schema.aplicaciones.fecha))
      .limit(20),
    db.select().from(schema.aforos).where(and(eq(schema.aforos.potreroId, id), eq(schema.aforos.orgId, org.id))).orderBy(desc(schema.aforos.fecha)).limit(10),
    db.select().from(schema.archivos).where(and(eq(schema.archivos.potreroId, id), eq(schema.archivos.orgId, org.id))).orderBy(desc(schema.archivos.creadoEn)),
    modulosDeOrg(org.id),
    db
      .select()
      .from(schema.eventos)
      .where(and(eq(schema.eventos.potreroId, id), eq(schema.eventos.orgId, org.id)))
      .orderBy(desc(schema.eventos.fecha), desc(schema.eventos.creadoEn))
      .limit(20),
    // Última aplicación por familia de producto (abono / foliar / fumigación)
    db.execute<{ familia: string; fecha: string }>(sql`
      select case when pr.tipo in ('fertilizante', 'organico', 'enmienda') then 'abono'
                  when pr.tipo = 'foliar' then 'foliar' else 'fumigacion' end as familia,
             max(a.fecha)::text as fecha
        from aplicaciones a join productos pr on pr.id = a.producto_id
       where a.potrero_id = ${id} and a.org_id = ${org.id} and pr.tipo <> 'otro'
       group by 1`),
  ]);

  // Nutrientes aplicados en los últimos 365 días (kg/ha) según la composición de etiqueta del catálogo
  const [nutrientes, analisis, monitoreos] = await Promise.all([
    db
      .select({
        dosis: schema.aplicaciones.dosisPorHa,
        n: schema.productos.n,
        p: schema.productos.p,
        k: schema.productos.k,
        cao: schema.productos.cao,
        mgo: schema.productos.mgo,
        s: schema.productos.s,
        fecha: schema.aplicaciones.fecha,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .where(and(eq(schema.aplicaciones.potreroId, id), eq(schema.aplicaciones.orgId, org.id), gte(schema.aplicaciones.fecha, sumarDias(hoy, -365)))),
    // Último análisis de suelo que incluye este potrero
    db
      .select()
      .from(schema.analisisSuelo)
      .where(and(eq(schema.analisisSuelo.orgId, org.id), sql`${id}::uuid = any(${schema.analisisSuelo.potreroIds})`))
      .orderBy(desc(schema.analisisSuelo.fecha))
      .limit(1),
    db
      .select()
      .from(schema.monitoreosPlaga)
      .where(and(eq(schema.monitoreosPlaga.orgId, org.id), eq(schema.monitoreosPlaga.potreroId, id), gte(schema.monitoreosPlaga.fecha, sumarDias(hoy, -60))))
      .orderBy(desc(schema.monitoreosPlaga.fecha)),
  ]);
  const anual = nutrientes.reduce(
    (s, x) => {
      const kg = (pct: string | null) => (Number(pct ?? 0) * Number(x.dosis)) / 100;
      return { n: s.n + kg(x.n), p: s.p + kg(x.p), k: s.k + kg(x.k), cao: s.cao + kg(x.cao), mgo: s.mgo + kg(x.mgo), s: s.s + kg(x.s) };
    },
    { n: 0, p: 0, k: 0, cao: 0, mgo: 0, s: 0 },
  );
  const suelo = analisis[0] ? aAnalisis(analisis[0]) : null;
  const recSuelo = suelo ? recomendar(suelo, saturacionTolerada(p.tipoPasto)) : null;
  // Último conteo de cada plaga en 60 días
  const plagas = monitoreos.filter((m, i, xs) => xs.findIndex((x) => x.plaga === m.plaga) === i);
  const porU = (v: number) => porUnidadTasa(v, u);
  const ut = unidadTasa(u);
  const esAdmin = puede(rol, "administrador");
  const noPastoreable = (p.areaHa ?? 0) - (p.areaUtilHa ?? 0);
  const areaTexto =
    noPastoreable > 0.005
      ? `${formatArea(p.areaUtilHa, u)} aprovechables de ${formatArea(p.areaHa, u)}`
      : formatArea(p.areaHa, u);

  return (
    <>
      <Link href={`/app/${slug}/potreros`} className="btn-ghost -ml-3 mb-2"><ArrowLeft className="size-4" aria-hidden />Potreros</Link>
      <PageHeader titulo={p.nombre} descripcion={`${p.fincaNombre} · ${p.tipoPasto ?? "Pasto sin definir"} · ${areaTexto}`} acciones={<>{modulos.length > 0 && <ModuloChip modulo={p.modulo} />}<EstadoBadge estado={p.estado} /></>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Situación", detalleEstado(p)],
          ["Último aforo", p.ultimoAforo ? `${formatNum(p.ultimoAforo.kgMsHa, 0)} kg MS/ha · ${fechaCortaCR(p.ultimoAforo.fecha)}` : "Sin aforos"],
          [
            `N-P₂O₅-K₂O aplicado, 12 meses (kg/${ut})`,
            `${formatNum(porU(anual.n), 0)} - ${formatNum(porU(anual.p), 0)} - ${formatNum(porU(anual.k), 0)}${anual.cao + anual.mgo + anual.s > 0 ? ` · CaO ${formatNum(porU(anual.cao), 0)} · MgO ${formatNum(porU(anual.mgo), 0)} · S ${formatNum(porU(anual.s), 0)}` : ""}${anual.n > N_ANUAL_MAX ? ` ⚠ más de ${N_ANUAL_MAX} kg N/ha: riesgo de pérdidas por lavado` : ""}`,
          ],
          ["Objetivos", `${p.diasDescansoObjetivo} d descanso · ${p.diasOcupacionObjetivo} d ocupación`],
        ].map(([k, v]) => (
          <div key={k} className="card card-pad">
            <p className="text-xs text-muted">{k}</p>
            <p className="num mt-0.5 text-sm font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card titulo="Forraje" icono={Leaf} acciones={<span className="chip bg-surface-2 text-foreground"><span className="size-2 rounded-full" style={{ background: PRIORIDADES[p.prioridad].color }} aria-hidden />{PRIORIDADES[p.prioridad].label}</span>}>
          {p.est.cobertura == null ? (
            <p className="text-sm text-muted">Sin datos. Registra un aforo o un pastoreo con salida para estimar la cobertura.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted">Cobertura {p.est.fuente === "aforo" ? "(aforo)" : "estimada"}</dt><dd className="num font-display text-xl font-bold">{formatNum(p.est.cobertura, 0)}<span className="text-xs font-normal text-muted"> kg MS/ha</span></dd></div>
                <div><dt className="text-xs text-muted">Crecimiento</dt><dd className="num font-display text-xl font-bold">{formatNum(p.est.tasa, 0)}<span className="text-xs font-normal text-muted"> kg/ha/día</span></dd></div>
                <div><dt className="text-xs text-muted">Hojas por rebrote</dt><dd className="num font-display text-xl font-bold">{p.est.hojas == null ? "—" : formatNum(p.est.hojas, 1)}<span className="text-xs font-normal text-muted"> de {p.est.parametros.hojasObjetivo}</span></dd></div>
                <div><dt className="text-xs text-muted">En 7 días</dt><dd className="num font-semibold">{formatNum(p.est.en7, 0)} kg MS/ha</dd></div>
                <div><dt className="text-xs text-muted">En 14 días</dt><dd className="num font-semibold">{formatNum(p.est.en14, 0)} kg MS/ha</dd></div>
                <div><dt className="text-xs text-muted">Sobre el residuo</dt><dd className="num font-semibold">{formatNum(p.est.disponible, 0)} kg MS/ha</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                {p.est.parametros.label}: entrar con {p.est.parametros.alturaEntrada} cm (~{formatNum(p.est.parametros.entrada, 0)} kg MS/ha) y sacar con {p.est.parametros.alturaSalida} cm (~{formatNum(p.est.parametros.residuo, 0)} kg MS/ha).
                {" "}A esta altitud llega a {p.est.parametros.hojasObjetivo} hojas en ~{descansoPorHojas(p.est.parametros, p.est.contexto.altitudMsnm)} días
                {p.diasDescansoObjetivo !== descansoPorHojas(p.est.parametros, p.est.contexto.altitudMsnm) && ` (objetivo actual: ${p.diasDescansoObjetivo} d)`}.
                {p.est.calibracion !== 1 && ` Calibrado con tus aforos (×${formatNum(p.est.calibracion, 2)}).`}
              </p>
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold text-muted">Qué limita el crecimiento hoy (100 % = sin limitación)</p>
                <ul className="grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ["Agua", p.est.factores.agua, p.est.factores.agua < 0.6 ? "Suelo seco: riego o bajar la carga" : "Suelo con humedad"],
                      ["Nitrógeno", p.est.factores.nitrogeno, p.est.factores.nitrogeno < 0.8 ? "Poco N reciente: conviene abonar" : "N disponible"],
                      ["Temperatura", p.est.factores.temperatura, `${formatNum(p.est.contexto.altitudMsnm, 0)} msnm${p.altitudMsnm != null ? " (del potrero)" : " (de la finca)"}`],
                    ] as const
                  ).map(([n, f, d]) => (
                    <li key={n} className="rounded-lg bg-surface-2 p-2">
                      <span className="flex justify-between font-semibold">
                        {n}
                        <span className={`num ${f < 0.6 ? "text-danger" : f < 0.8 ? "text-warning" : "text-primary"}`}>{formatNum(f * 100, 0)} %</span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                        <span className={`block h-full ${f < 0.6 ? "bg-danger" : f < 0.8 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.round(f * 100)}%` }} />
                      </span>
                      <span className="mt-1 block text-muted">{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </Card>
        <Card titulo="Suelo y plagas" icono={Mountain} acciones={<Link href={`/app/${slug}/suelos`} className="btn-ghost">Suelos</Link>}>
          {suelo && recSuelo ? (
            <div className="text-sm">
              <p className="text-xs text-muted">Análisis «{analisis[0].nombre}» del {fechaCortaCR(analisis[0].fecha)}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                <div><dt className="text-xs text-muted">pH</dt><dd className={`num font-semibold ${suelo.ph != null && suelo.ph < 5.5 ? "text-warning" : ""}`}>{formatNum(suelo.ph, 1)}</dd></div>
                <div><dt className="text-xs text-muted">Sat. acidez</dt><dd className={`num font-semibold ${recSuelo.ras != null && recSuelo.ras > recSuelo.rasObjetivo ? "text-danger" : ""}`}>{recSuelo.ras == null ? "—" : `${formatNum(recSuelo.ras, 0)} %`}<span className="text-xs font-normal text-muted"> (tolera {recSuelo.rasObjetivo} %)</span></dd></div>
                <div><dt className="text-xs text-muted">CICE</dt><dd className="num font-semibold">{formatNum(cice(suelo), 1)}</dd></div>
              </dl>
              <p className={`mt-2 font-semibold ${recSuelo.caco3Tha > 0 ? "text-warning" : "text-primary"}`}>
                {recSuelo.caco3Tha > 0 ? `Encalar: ${formatNum(recSuelo.caco3Tha, 1)} t/ha de CaCO₃ equivalente${recSuelo.dolomita ? " (dolomita)" : ""}` : "La acidez no limita a este pasto"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Sin análisis de suelo para este potrero.</p>
          )}
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted"><Bug className="size-3.5" aria-hidden />Plagas, últimos 60 días</p>
            {plagas.length === 0 ? (
              <p className="text-sm text-muted">Sin monitoreos.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {plagas.map((m) => {
                  const nv = nivelPlaga(m.plaga, Number(m.conteo));
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>{PLAGAS[m.plaga].label} <span className="num text-xs text-muted">· {formatNum(Number(m.conteo), 1)} · {fechaCortaCR(m.fecha)}</span></span>
                      {nv && <span className={`chip ${NIVELES_PLAGA[nv].clase}`}>{NIVELES_PLAGA[nv].label}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
        <Card titulo="Días desde" icono={CalendarClock}>
          {(() => {
            const desde = (f: string | null | undefined) => (f ? diasEntre(f, hoy) : null);
            const fam = new Map(ultimas.rows.map((r) => [r.familia, r.fecha]));
            const ultimoEvento = (t: TipoEvento) => eventos.find((e) => e.tipo === t && e.hecha)?.fecha ?? null;
            const items: [string, string | null][] = [
              ["Pastoreo", p.estado === "ocupado" ? hoy : p.ultimaSalidaFecha],
              ["Abono", fam.get("abono") ?? null],
              ["Foliar", fam.get("foliar") ?? null],
              ["Fumigación", fam.get("fumigacion") ?? null],
              ["Chapia", ultimoEvento("chapia")],
              ["Cosecha", ultimoEvento("cosecha")],
              ["Siembra", ultimoEvento("siembra")],
              ["Aforo", p.ultimoAforo?.fecha ?? null],
            ];
            return (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {items.map(([k, f]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="num font-semibold">{f == null ? "—" : k === "Pastoreo" && p.estado === "ocupado" ? "Ocupado" : `${desde(f)} d`}</dd>
                  </div>
                ))}
              </dl>
            );
          })()}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Labores" icono={ClipboardList} acciones={<Link href={`/app/${slug}/labores`} className="btn-ghost">Registrar</Link>}>
          {eventos.length === 0 ? (
            <p className="text-sm text-muted">Sin labores registradas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {eventos.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    <b className="font-medium">{e.titulo ?? TIPOS_EVENTO[e.tipo].label}</b>
                    {!e.hecha && <span className="chip ml-1 bg-accent-soft text-accent">Pendiente</span>}
                    {e.notas && <span className="block truncate text-xs text-muted">{e.notas}</span>}
                  </span>
                  <span className="num shrink-0 text-muted">{fechaCortaCR(e.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card titulo="Pastoreos" icono={History}>
          {pastoreos.length === 0 ? <p className="text-sm text-muted">Sin pastoreos.</p> : (
            <Tabla>
              <thead><tr><th>Lote</th><th>Entrada</th><th>Salida</th><th className="text-right">Días</th></tr></thead>
              <tbody>
                {pastoreos.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium">{x.lote} <span className="text-xs text-muted">({x.cabezas ?? "?"} cab.)</span></td>
                    <td className="num">{fechaCortaCR(x.entrada)}</td>
                    <td className="num">{x.salida ? fechaCortaCR(x.salida) : <span className="text-sky">En curso</span>}</td>
                    <td className="num text-right">{diasEntre(fechaISOEnCR(x.entrada), x.salida ? fechaISOEnCR(x.salida) : hoy) + 1}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>

        <Card titulo="Aplicaciones" icono={Sprout}>
          {aplicaciones.length === 0 ? <p className="text-sm text-muted">Sin aplicaciones.</p> : (
            <Tabla>
              <thead><tr><th>Fecha</th><th>Producto</th><th className="text-right">Dosis/{ut}</th><th className="text-right">Costo</th><th>Espera</th></tr></thead>
              <tbody>
                {aplicaciones.map((a) => (
                  <tr key={a.id}>
                    <td className="num">{fechaCortaCR(a.fecha)}</td>
                    <td className="font-medium">{a.producto}</td>
                    <td className="num text-right">{formatNum(dosisEnUnidad(Number(a.dosisPorHa), u), 1)} {a.unidad}</td>
                    <td className="num text-right">{formatColones(a.costo)}</td>
                    <td className="num">{a.reingreso === 0 ? "—" : a.liberacion > hoy ? <span className="font-semibold text-warning">{fechaCortaCR(a.liberacion)}</span> : <span className="text-primary">cumplida</span>}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>

        <Card titulo="Aforos" icono={Ruler}>
          {aforos.length === 0 ? <p className="text-sm text-muted">Sin aforos. <Link className="text-primary underline" href={`/app/${slug}/campo`}>Registrar</Link></p> : (
            <ul className="space-y-2 text-sm">
              {aforos.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{fechaCortaCR(a.fecha)} · <span className="text-muted">{METODOS_AFORO[a.metodo]}</span></span>
                  <b className="num">{formatNum(Number(a.kgMsHa), 0)} kg MS/ha{a.hojas ? ` · ${formatNum(Number(a.hojas), 1)} hojas` : ""}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Fotos y documentos" icono={FileText}>
          <ul className="mb-3 divide-y divide-border text-sm">
            {archivos.length === 0 && <li className="text-muted">Sin archivos.</li>}
            {archivos.map((a) => (
              <li key={a.id} className="flex justify-between py-2">
                <a className="font-medium hover:text-primary" href={`/api/orgs/${slug}/archivos/${a.id}`} target="_blank" rel="noopener">{a.nombre}</a>
                <span className="num text-xs text-muted">{Math.ceil(a.tamano / 1024)} KB</span>
              </li>
            ))}
          </ul>
          {puede(rol, "operador") && (
            <ActionForm action={subirArchivo.bind(null, slug)} className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
              <input type="hidden" name="potreroId" value={p.id} />
              <Field label="Archivo (máx. 10 MB)" name="archivo" className="flex-1">
                <input className="input py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" type="file" accept="image/*,application/pdf,.kml,.kmz,.txt,.csv" />
              </Field>
              <Submit className="btn"><Upload className="size-4" aria-hidden />Subir</Submit>
            </ActionForm>
          )}
        </Card>

        {esAdmin && (
          <Card titulo="Editar potrero" icono={Pencil} className="lg:col-span-2">
            <ActionForm action={actualizarPotrero.bind(null, slug, p.id)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" version={JSON.stringify([p.nombre, p.moduloId, p.tipoPasto, p.areaHa, p.descuentoHa, p.diasDescansoObjetivo, p.diasOcupacionObjetivo, extra?.notas, p.altitudMsnm])}>
              <Field label="Nombre" name="nombre" required><input className="input" defaultValue={p.nombre} /></Field>
              <Field label="Tipo de pasto" name="tipoPasto">
                <input className="input" list="pastos-cr" defaultValue={p.tipoPasto ?? ""} />
              </Field>
              <Field label="Altitud (msnm)" name="altitud" hint="Vacío = la de la finca. Útil en fincas de ladera">
                <input className="input" type="number" inputMode="numeric" min={0} max={4000} step={1} defaultValue={p.altitudMsnm ?? ""} placeholder={String(p.est.contexto.altitudMsnm)} />
              </Field>
              {modulos.length > 0 ? (
                <Field label="Módulo" name="moduloId">
                  <select className="input" defaultValue={p.moduloId ?? ""}>
                    <option value="">Sin módulo</option>
                    {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </Field>
              ) : (
                <input type="hidden" name="moduloId" value="" />
              )}
              <Field label={`Área (${simboloUnidad(u)})`} name="area" hint={p.tieneGeometria ? "Calculada del mapa" : undefined}>
                <input className="input" type="number" step="any" min={0} disabled={p.tieneGeometria} defaultValue={p.areaHa != null ? Number(aUnidad(p.areaHa, u).toFixed(u === "m2" ? 0 : 3)) : ""} />
              </Field>
              <Field
                label={`Descuento no pastoreable (${simboloUnidad(u)})`}
                name="descuento"
                hint={
                  p.areaExcluidaHa > 0.005
                    ? `Árboles, charral o pendientes sin mapear. Ya se descuentan ${formatArea(p.areaExcluidaHa, u)} de áreas marcadas en el mapa.`
                    : "Árboles, charral o pendientes que no marcaste en el mapa"
                }
              >
                <input className="input" type="number" inputMode="decimal" step="any" min={0} defaultValue={p.descuentoHa > 0 ? Number(aUnidad(p.descuentoHa, u).toFixed(u === "m2" ? 0 : 3)) : ""} placeholder="0" />
              </Field>
              <Field label="Días de descanso" name="diasDescanso"><input className="input" type="number" min={1} defaultValue={p.diasDescansoObjetivo} /></Field>
              <Field label="Días de ocupación" name="diasOcupacion"><input className="input" type="number" min={1} defaultValue={p.diasOcupacionObjetivo} /></Field>
              <Field label="Notas" name="notas" className="sm:col-span-2 lg:col-span-3"><textarea className="input" rows={2} defaultValue={extra?.notas ?? ""} /></Field>
              <div className="sm:col-span-2 lg:col-span-3"><Submit>Guardar cambios</Submit></div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
