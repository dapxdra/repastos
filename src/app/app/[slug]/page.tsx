import Link from "next/link";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudRain,
  Clock,
  Gauge,
  Hourglass,
  Layers3,
  Leaf,
  Lightbulb,
  Map as MapIcon,
  Sprout,
  Repeat2,
} from "lucide-react";
import { db, schema } from "@/db";
import { requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConForraje } from "@/lib/consultas";
import { obtenerResumen } from "@/lib/funciones";
import { restriccionesDeLotes } from "@/lib/inocuidad";
import { PLAGAS, nivelPlaga } from "@/lib/plagas";
import { APROVECHAMIENTO } from "@/lib/forraje";
import { demandaDeLote } from "@/lib/plan";
import {
  aUnidad,
  descansoQuePermite,
  detalleEstado,
  fechaCortaCR,
  formatArea,
  unidadTasa,
  formatColones,
  formatNum,
  plural,
  hoyCR,
  sugerirSiguiente,
  sumarDias,
  unidadesAnimales,
  type CategoriaLote,
} from "@/lib/dominio";
import { Card, EstadoBadge, ModuloChip, PageHeader, Stat, Vacio } from "@/components/ui";

export const metadata = { title: "Inicio" };

export default async function Inicio({ params }: PageProps<"/app/[slug]">) {
  const { slug } = await params;
  const { org } = await requireOrg(slug);
  const u = org.unidadArea;
  const hoy = hoyCR();
  const hace30 = sumarDias(hoy, -30);

  const [potreros, lotes, lluvia30, gasto30, recientes, resumen, modulos, retiros, plagas] = await Promise.all([
    potrerosConForraje(org.id).then((r) => r.potreros),
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)),
    db
      .select({ mm: sql<string>`coalesce(sum(${schema.lluvias.mm}), 0)` })
      .from(schema.lluvias)
      .where(and(eq(schema.lluvias.orgId, org.id), gte(schema.lluvias.fecha, hace30))),
    db
      .select({ total: sql<string>`coalesce(sum(${schema.aplicaciones.costoTotal}), 0)` })
      .from(schema.aplicaciones)
      .where(and(eq(schema.aplicaciones.orgId, org.id), gte(schema.aplicaciones.fecha, hace30))),
    db
      .select({
        grupoId: schema.aplicaciones.grupoId,
        fecha: schema.aplicaciones.fecha,
        producto: schema.productos.nombre,
        potreros: sql<number>`count(*)::int`,
        liberacion: sql<string>`max(${schema.aplicaciones.fechaLiberacion})::text`,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .where(eq(schema.aplicaciones.orgId, org.id))
      .groupBy(schema.aplicaciones.grupoId, schema.aplicaciones.fecha, schema.productos.nombre)
      .orderBy(desc(schema.aplicaciones.fecha))
      .limit(5),
    // Neon Function `api`: conteos calculados junto a los datos con el JWT del usuario
    obtenerResumen(org.id).catch(() => null),
    modulosDeOrg(org.id),
    restriccionesDeLotes(org.id, org.tipoProduccion, hoy),
    db
      .select({ id: schema.monitoreosPlaga.id, plaga: schema.monitoreosPlaga.plaga, conteo: schema.monitoreosPlaga.conteo, potreroId: schema.monitoreosPlaga.potreroId, potrero: schema.potreros.nombre, fecha: schema.monitoreosPlaga.fecha })
      .from(schema.monitoreosPlaga)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.monitoreosPlaga.potreroId))
      .where(and(eq(schema.monitoreosPlaga.orgId, org.id), gte(schema.monitoreosPlaga.fecha, sumarDias(hoy, -14))))
      .orderBy(desc(schema.monitoreosPlaga.fecha), desc(schema.monitoreosPlaga.creadoEn)),
  ]);

  if (potreros.length === 0) {
    return (
      <>
        <PageHeader titulo="Bienvenido a Repastos" descripcion="Configura tu ganadería en tres pasos." />
        <Card>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              { n: 1, t: "Crea una finca", d: "Con su provincia y cantón.", href: "ajustes", icon: Gauge },
              { n: 2, t: "Dibuja tus potreros", d: "Sobre el mapa satelital o importa tu KML, KMZ o Shapefile; el área se calcula sola.", href: "mapa", icon: MapIcon },
              { n: 3, t: "Registra tus lotes", d: "Y empieza a mover el ganado.", href: "rotacion", icon: Repeat2 },
            ].map((p) => (
              <li key={p.n}>
                <Link href={`/app/${slug}/${p.href}`} className="flex h-full flex-col rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-primary-soft/40">
                  <span className="mb-2 grid size-8 place-items-center rounded-full bg-primary font-display text-sm font-bold text-on-primary">{p.n}</span>
                  <span className="font-semibold">{p.t}</span>
                  <span className="mt-1 text-sm text-muted">{p.d}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </>
    );
  }

  const cuenta = (e: string) => potreros.filter((p) => p.estado === e).length;
  // La carga se calcula sobre el área que sí se pastorea (sin bosque, caminos ni instalaciones)
  const areaTotal = potreros.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
  const uaDe = (l: (typeof lotes)[number]) =>
    unidadesAnimales(l.cabezas, l.pesoPromedioKg ? Number(l.pesoPromedioKg) : null, l.categoria as CategoriaLote);
  const uaTotal = lotes.reduce((s, l) => s + uaDe(l), 0);
  const ubicacion = new Map(potreros.filter((p) => p.loteActual).map((p) => [p.loteActual!.id, p]));

  // Resumen por módulo: potreros, estados, hatos asignados, carga y descanso que permite la rotación
  const resumenModulos = modulos.map((m) => {
    const ps = potreros.filter((p) => p.moduloId === m.id);
    const hatos = lotes.filter((l) => l.moduloId === m.id);
    const area = ps.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
    const ua = hatos.reduce((s, l) => s + uaDe(l), 0);
    const ocup = ps.length ? Math.round(ps.reduce((s, p) => s + p.diasOcupacionObjetivo, 0) / ps.length) : 0;
    const desc = ps.length ? Math.round(ps.reduce((s, p) => s + p.diasDescansoObjetivo, 0) / ps.length) : 0;
    return {
      m,
      n: ps.length,
      listos: ps.filter((p) => p.estado === "listo").length,
      espera: ps.filter((p) => p.estado === "en_espera").length,
      hatos,
      area,
      carga: area > 0 && ua > 0 ? ua / aUnidad(area, unidadTasa(u)) : null,
      permite: descansoQuePermite(ps.length, ocup),
      desc,
    };
  }).filter((r) => r.n > 0 || r.hatos.length > 0);
  const carga = areaTotal > 0 ? uaTotal / aUnidad(areaTotal, unidadTasa(u)) : null;

  const alertas = [
    ...retiros.map((r) => ({
      tono: r.tipo === "leche" ? ("danger" as const) : ("warning" as const),
      texto:
        r.tipo === "leche"
          ? `Leche de ${r.lote} no apta: no entregar hasta el ${fechaCortaCR(r.hasta)} (${r.producto} en ${r.potrero}).`
          : `${r.lote}: no enviar a sacrificio antes del ${fechaCortaCR(r.hasta)} (retiro de carne de ${r.producto} en ${r.potrero}).`,
      href: `rotacion`,
    })),
    // Plagas sobre el umbral de acción (último conteo de cada plaga y potrero, 14 días)
    ...plagas
      .filter((m, i, xs) => xs.findIndex((x) => x.potreroId === m.potreroId && x.plaga === m.plaga) === i)
      .filter((m) => nivelPlaga(m.plaga, Number(m.conteo)) === "accion")
      .map((m) => ({ tono: "danger" as const, texto: `${PLAGAS[m.plaga].label} en ${m.potrero}: ${formatNum(Number(m.conteo), 0)} ${PLAGAS[m.plaga].unidad}, sobre el umbral de acción.`, href: "plagas" })),
    ...potreros
      .filter((p) => p.sobreocupado)
      .map((p) => ({ tono: "warning" as const, texto: `${p.loteActual?.nombre} lleva ${(p.diasOcupacion ?? 0) + 1} días en ${p.nombre} (objetivo ${p.diasOcupacionObjetivo}).`, href: `rotacion` })),
    ...potreros
      .filter((p) => p.aplicacionConGanado)
      .map((p) => ({ tono: "danger" as const, texto: `${p.nombre} tiene ganado dentro de la carencia de ${p.productoEspera}. Saca el lote.`, href: `potreros/${p.id}` })),
  ];
  const proximas = potreros
    .filter((p) => p.estado === "en_espera" && (p.diasParaLiberar ?? 99) <= 7)
    .sort((a, b) => (a.diasParaLiberar ?? 0) - (b.diasParaLiberar ?? 0));
  // Sugerencia por hato (dentro de su módulo); sin hatos, los potreros listos con más forraje / descanso
  const sugeridos = lotes.length
    ? lotes.map((l) => ({ id: l.id, lote: l.nombre, p: sugerirSiguiente(potreros, l.moduloId, ubicacion.get(l.id)?.id) }))
    : potreros
        .filter((p) => p.estado === "listo")
        .sort((a, b) => b.puntaje - a.puntaje || (b.diasDescanso ?? 999) - (a.diasDescanso ?? 999))
        .slice(0, 4)
        .map((p) => ({ id: p.id, lote: null as string | null, p }));

  return (
    <>
      <PageHeader
        titulo="Inicio"
        descripcion={`${plural(potreros.length, "potrero")} · ${formatArea(areaTotal, u, 1)} pastoreables · ${plural(lotes.reduce((s, l) => s + l.cabezas, 0), "cabeza")}`}
        acciones={
          <>
            <Link href={`/app/${slug}/rotacion`} className="btn-secondary"><Repeat2 className="size-4" aria-hidden />Mover lote</Link>
            <Link href={`/app/${slug}/aplicaciones`} className="btn"><Sprout className="size-4" aria-hidden />Registrar aplicación</Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
        <Stat icono={CheckCircle2} etiqueta="Listos para pastoreo" valor={resumen?.totales.listos ?? cuenta("listo")} detalle={`${cuenta("en_descanso")} en descanso · ${plural(cuenta("ocupado"), "ocupado")}`} />
        <Stat icono={Hourglass} tono="warning" etiqueta="En espera por aplicación" valor={resumen?.totales.enEspera ?? cuenta("en_espera")} detalle={proximas.length ? `${proximas.length} se liberan esta semana` : "Sin liberaciones próximas"} />
        <Stat icono={Gauge} tono="sky" etiqueta={`Carga animal (UA/${unidadTasa(u)})`} valor={formatNum(carga, 2)} detalle={`${formatNum(uaTotal, 1)} UA en ${formatArea(areaTotal, u, 1)} pastoreables`} />
        <Stat icono={CloudRain} tono="accent" etiqueta="Lluvia, últimos 30 días" valor={`${formatNum(Number(lluvia30[0].mm), 0)} mm`} detalle={`Insumos aplicados: ${formatColones(gasto30[0].total)}`} />
      </div>

      {alertas.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Alertas">
          {alertas.map((a, i) => (
            <li key={i}>
              <Link
                href={`/app/${slug}/${a.href}`}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${a.tono === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}
              >
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{a.texto}</span>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(() => {
        const conDato = potreros.filter((p) => p.est.cobertura != null && p.areaUtilHa);
        if (!conDato.length) return null;
        const area = conDato.reduce((s, p) => s + p.areaUtilHa!, 0);
        const cobertura = conDato.reduce((s, p) => s + p.est.cobertura! * p.areaUtilHa!, 0) / area;
        const tasa = conDato.reduce((s, p) => s + p.est.tasa * p.areaUtilHa!, 0) / area;
        const demanda = lotes.reduce((s, l) => s + demandaDeLote(l).pasto, 0);
        const stock = conDato.reduce((s, p) => s + (p.est.disponible ?? 0) * APROVECHAMIENTO * p.areaUtilHa!, 0);
        const ya = potreros.filter((p) => p.prioridad === "pastorear").length;
        const pasados = potreros.filter((p) => p.prioridad === "pasado").length;
        return (
          <Link href={`/app/${slug}/forraje`} className="card card-pad mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 transition-colors hover:border-primary" data-testid="forraje">
            <span className="flex items-center gap-2 font-display font-bold"><Leaf className="size-5 text-primary" aria-hidden />Forraje hoy</span>
            <span className="text-sm"><b className="num text-lg">{formatNum(cobertura, 0)}</b> <span className="text-muted">kg MS/ha promedio</span></span>
            <span className="text-sm"><b className="num text-lg">{formatNum(tasa, 0)}</b> <span className="text-muted">kg/ha/día de crecimiento</span></span>
            {demanda > 0 && <span className="text-sm"><b className="num text-lg">{formatNum(stock / demanda, 0)}</b> <span className="text-muted">días de pasto en pie</span></span>}
            <span className="text-sm"><b className="num text-lg">{ya}</b> <span className="text-muted">para pastorear ya</span>{pasados > 0 && <> · <b className="num text-warning">{pasados}</b> <span className="text-muted">pasándose</span></>}</span>
            <ArrowRight className="ml-auto size-4 text-muted" aria-hidden />
          </Link>
        );
      })()}

      {resumenModulos.length > 0 && (
        <Card titulo="Módulos por hato" icono={Layers3} className="mt-6" acciones={<Link href={`/app/${slug}/potreros`} className="btn-ghost">Gestionar <ArrowRight className="size-4" aria-hidden /></Link>}>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="modulos">
            {resumenModulos.map((r) => (
              <li key={r.m.id} className="rounded-xl border border-border p-3" style={{ borderLeft: `4px solid ${r.m.color}` }}>
                <div className="flex items-center justify-between gap-2">
                  <ModuloChip modulo={r.m} />
                  <span className="num text-xs text-muted">{plural(r.n, "potrero")} · {formatArea(r.area, u, 1)}</span>
                </div>
                <p className="mt-2 text-sm">
                  <b className="num">{r.listos}</b> listos
                  {r.espera > 0 && <> · <b className="num text-warning">{r.espera}</b> en espera</>}
                  {r.carga != null && <> · <b className="num">{formatNum(r.carga, 2)}</b> UA/{unidadTasa(u)}</>}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {r.hatos.length ? r.hatos.map((h) => `${h.nombre} (${h.cabezas} cab.)`).join(", ") : "Sin hato asignado"}
                </p>
                {r.n > 1 && (
                  <p className={`mt-1 text-xs ${r.permite < r.desc ? "font-semibold text-warning" : "text-muted"}`}>
                    {r.permite < r.desc
                      ? `Faltan potreros: la rotación da ${r.permite} d de descanso y el objetivo es ${r.desc} d`
                      : `La rotación da ${r.permite} d de descanso (objetivo ${r.desc} d)`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card titulo="Estado de potreros" icono={MapIcon} className="lg:col-span-2" acciones={<Link href={`/app/${slug}/mapa`} className="btn-ghost">Ver mapa <ArrowRight className="size-4" aria-hidden /></Link>}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {potreros.map((p) => (
              <li key={p.id}>
                <Link href={`/app/${slug}/potreros/${p.id}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-3 py-2 transition-colors hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted">{detalleEstado(p)}</span>
                  </span>
                  <EstadoBadge estado={p.estado} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card titulo="Siguiente pastoreo sugerido" icono={Lightbulb}>
            {sugeridos.length === 0 ? (
              <p className="text-sm text-muted">Ningún potrero ha completado su descanso todavía.</p>
            ) : (
              <ol className="space-y-2" data-testid="sugeridos">
                {sugeridos.map(({ id, lote, p }, i) => (
                  <li key={id} className="flex items-center gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-strong">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {lote && <span className="text-muted">{lote} → </span>}
                      <span className="font-medium">{p ? p.nombre : "sin potrero disponible"}</span>
                    </span>
                    {p && (
                      <span className="num shrink-0 text-xs text-muted">
                        {p.estado === "en_descanso"
                          ? `${p.diasDescanso}/${p.diasDescansoObjetivo} d`
                          : p.est.cobertura != null
                            ? `~${formatNum(p.est.cobertura, 0)} kg MS/ha`
                            : p.diasDescanso != null
                              ? `${p.diasDescanso} d descanso`
                              : "nuevo"}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card titulo="Próximas liberaciones" icono={Clock}>
            {proximas.length === 0 ? (
              <p className="text-sm text-muted">No hay potreros que se liberen en los próximos 7 días.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {proximas.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="font-medium">{p.nombre}</span>
                    <span className="num text-muted">{fechaCortaCR(p.liberacion!)} · {p.diasParaLiberar} d</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Últimas aplicaciones" icono={Sprout}>
            {recientes.length === 0 ? (
              <Vacio icono={Sprout} titulo="Sin aplicaciones" texto="Registra abonos, foliares o herbicidas." />
            ) : (
              <ul className="space-y-2 text-sm">
                {recientes.map((a) => (
                  <li key={a.grupoId} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate"><b className="font-medium">{a.producto}</b> · {a.potreros} pot.</span>
                    <span className="num shrink-0 text-muted">{fechaCortaCR(a.fecha)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
