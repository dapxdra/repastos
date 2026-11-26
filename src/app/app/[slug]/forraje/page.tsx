import Link from "next/link";
import { eq } from "drizzle-orm";
import { BarChart3, CloudSun, Gauge, Leaf, Scale, Sprout, TrendingUp } from "lucide-react";
import { db, schema } from "@/db";
import { requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConForraje } from "@/lib/consultas";
import { formatArea, fechaCortaCR, formatNum, plural, porUnidadTasa, unidadTasa } from "@/lib/dominio";
import { APROVECHAMIENTO, PRIORIDADES, REGIMENES_LLUVIA, temperaturaPorAltitud } from "@/lib/forraje";
import { demandaDeLote } from "@/lib/plan";
import { Card, ModuloChip, PageHeader, Stat, Tabla, Vacio } from "@/components/ui";
import { CunaForrajera } from "@/components/cuna-forrajera";

export const metadata = { title: "Forraje" };

const FUENTE = { aforo: "Aforo", modelo: "Estimado", sin_datos: "—" } as const;

export default async function Forraje({ params, searchParams }: PageProps<"/app/[slug]/forraje">) {
  const { slug } = await params;
  const { modulo: moduloSel } = (await searchParams) as { modulo?: string };
  const { org } = await requireOrg(slug);
  const u = org.unidadArea;
  const [{ potreros: todos, climas }, modulos, lotes, fincas] = await Promise.all([
    potrerosConForraje(org.id),
    modulosDeOrg(org.id),
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)),
  ]);

  if (todos.length === 0) {
    return (
      <>
        <PageHeader titulo="Forraje" />
        <Vacio icono={Leaf} titulo="Sin potreros" texto="Crea o importa tus potreros en el mapa para ver la cuña forrajera." />
      </>
    );
  }

  const potreros = moduloSel ? todos.filter((p) => p.moduloId === moduloSel) : todos;
  const lotesSel = moduloSel ? lotes.filter((l) => l.moduloId === moduloSel) : lotes;
  const conDato = potreros.filter((p) => p.est.cobertura != null);
  const area = conDato.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
  const pond = (f: (p: (typeof conDato)[number]) => number) => (area > 0 ? conDato.reduce((s, p) => s + f(p) * (p.areaUtilHa ?? 0), 0) / area : null);
  const coberturaProm = pond((p) => p.est.cobertura!);
  const tasaProm = pond((p) => p.est.tasa);
  const entradaProm = pond((p) => p.est.parametros.entrada) ?? 2800;
  const residuoProm = pond((p) => p.est.parametros.residuo) ?? 1500;

  // Demanda de pasto de los lotes (kg MS/día) contra el crecimiento del área
  const demanda = lotesSel.reduce((s, l) => s + demandaDeLote(l).pasto, 0);
  const suplemento = lotesSel.reduce((s, l) => s + demandaDeLote(l).suplemento, 0);
  const crecimiento = (tasaProm ?? 0) * area;
  const forrajeCosechable = conDato.reduce((s, p) => s + (p.est.disponible ?? 0) * APROVECHAMIENTO * (p.areaUtilHa ?? 0), 0);
  const diasForraje = demanda > 0 ? forrajeCosechable / demanda : null;

  // Cuña: de mayor a menor cobertura; objetivo lineal de la entrada al residuo
  const ordenados = [...conDato].sort((a, b) => b.est.cobertura! - a.est.cobertura!);
  const barras = ordenados.map((p, i) => ({
    id: p.id,
    nombre: p.nombre,
    cobertura: p.est.cobertura!,
    objetivo: entradaProm - ((entradaProm - residuoProm) * i) / Math.max(1, ordenados.length - 1),
    estimada: p.est.fuente !== "aforo",
    prioridad: p.prioridad,
  }));
  const balanceCuna = barras.reduce((s, b, i) => s + (b.cobertura - b.objetivo) * (ordenados[i].areaUtilHa ?? 0), 0);

  const porPrioridad = (Object.keys(PRIORIDADES) as (keyof typeof PRIORIDADES)[]).map((k) => ({ k, n: potreros.filter((p) => p.prioridad === k).length })).filter((x) => x.n);
  const kgU = (kgHa: number) => porUnidadTasa(kgHa, u);
  const ut = unidadTasa(u);
  const conCalibracion = potreros.filter((p) => p.est.calibracion !== 1).length;

  return (
    <>
      <PageHeader
        titulo="Forraje"
        descripcion="Cobertura estimada de cada potrero con tus aforos, pastoreos, lluvia y la altitud de la finca. Se recalcula sola cada día, aunque esté nublado."
        acciones={<Link href={`/app/${slug}/campo`} className="btn"><Sprout className="size-4" aria-hidden />Registrar aforo</Link>}
      />

      {modulos.length > 0 && (
        <nav aria-label="Filtrar por módulo" className="mb-4 flex flex-wrap gap-2">
          <Link href={`/app/${slug}/forraje`} className={`chip min-h-9 px-3 ${!moduloSel ? "bg-primary text-on-primary" : "bg-surface-2 text-muted"}`} aria-current={!moduloSel ? "page" : undefined}>Toda la ganadería</Link>
          {modulos.map((m) => (
            <Link key={m.id} href={`/app/${slug}/forraje?modulo=${m.id}`} aria-current={moduloSel === m.id ? "page" : undefined} className={`rounded-full ${moduloSel === m.id ? "ring-2 ring-foreground" : ""}`}>
              <ModuloChip modulo={m} className="min-h-9 px-3" />
            </Link>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <Stat icono={Gauge} etiqueta={`Cobertura promedio (kg MS/${ut})`} valor={formatNum(coberturaProm == null ? null : kgU(coberturaProm), 0)} detalle={`${plural(conDato.length, "potrero")} con dato de ${potreros.length}`} />
        <Stat icono={TrendingUp} tono="accent" etiqueta={`Crecimiento (kg MS/${ut}/día)`} valor={formatNum(tasaProm == null ? null : kgU(tasaProm), 0)} detalle={`${formatNum(crecimiento / 1000, 1)} t MS/día en ${formatArea(area, u, 1)}`} />
        <Stat
          icono={Scale}
          tono={demanda > crecimiento ? "warning" : "primary"}
          etiqueta="Demanda de pasto"
          valor={`${formatNum(demanda / 1000, 1)} t/día`}
          detalle={demanda === 0 ? "Registra lotes en Rotación" : demanda > crecimiento ? `Come más de lo que crece: la cobertura bajará${suplemento ? ` · suplemento ${formatNum(suplemento / 1000, 1)} t MS/día` : ""}` : `Crece más de lo que se come${suplemento ? ` · suplemento ${formatNum(suplemento / 1000, 1)} t MS/día` : ""}`}
        />
        <Stat icono={Leaf} tono="sky" etiqueta="Días de forraje en pie" valor={formatNum(diasForraje, 0)} detalle={`${formatNum(forrajeCosechable / 1000, 1)} t MS cosechables sobre el residuo`} />
      </div>

      <Card
        titulo="Cuña forrajera"
        icono={BarChart3}
        className="mt-4"
        acciones={
          barras.length > 1 && (
            <span className={`chip ${balanceCuna >= 0 ? "bg-primary-soft text-primary-strong" : "bg-warning-soft text-warning"}`}>
              {balanceCuna >= 0 ? "Excedente" : "Faltante"} de {formatNum(Math.abs(balanceCuna) / 1000, 1)} t MS
            </span>
          )
        }
      >
        {barras.length === 0 ? (
          <Vacio icono={BarChart3} titulo="Sin datos de cobertura" texto="Registra un aforo o un pastoreo (con fecha de salida) y la cuña se arma sola." />
        ) : (
          <>
            <CunaForrajera barras={barras} slug={slug} entrada={entradaProm} residuo={residuoProm} unidad={u} />
            <p className="mt-3 text-sm text-muted">
              {balanceCuna >= 0
                ? "Hay más pasto del que pide la rotación: alarga el descanso de los potreros de abajo o corta los pasados para ensilaje o pacas."
                : "La cuña está bajo el objetivo: acorta la rotación con suplemento (ensilaje, pacas, concentrado), abona con nitrógeno o baja la carga."}
            </p>
          </>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card titulo="Potreros por cobertura" icono={Leaf}>
          <Tabla>
            <thead>
              <tr>
                <th>Potrero</th>
                <th className="text-right">kg MS/{ut}</th>
                <th className="text-right">Crec./día</th>
                <th className="text-right">Hojas</th>
                <th className="text-right">En 7 d</th>
                <th>Prioridad</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {[...potreros].sort((a, b) => b.puntaje - a.puntaje).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/app/${slug}/potreros/${p.id}`} className="font-medium hover:text-primary">{p.nombre}</Link>
                    <span className="block text-xs text-muted">{p.est.parametros.label}</span>
                  </td>
                  <td className="num text-right font-semibold">{formatNum(p.est.cobertura == null ? null : kgU(p.est.cobertura), 0)}</td>
                  <td className="num text-right">{formatNum(kgU(p.est.tasa), 0)}</td>
                  <td className="num text-right">{p.est.hojas == null ? "—" : `${formatNum(p.est.hojas, 1)}/${p.est.parametros.hojasObjetivo}`}</td>
                  <td className="num text-right text-muted">{formatNum(p.est.en7 == null ? null : kgU(p.est.en7), 0)}</td>
                  <td>
                    <span className="chip bg-surface-2 text-foreground">
                      <span className="size-2 rounded-full" style={{ background: PRIORIDADES[p.prioridad].color }} aria-hidden />
                      {PRIORIDADES[p.prioridad].label}
                    </span>
                  </td>
                  <td className="text-xs text-muted">
                    {FUENTE[p.est.fuente]}
                    {p.est.fuente === "modelo" && p.est.diasDesdeDato != null && ` · ${p.est.diasDesdeDato} d`}
                    {p.ultimoAforo && <span className="block">Aforo {fechaCortaCR(p.ultimoAforo.fecha)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>

        <div className="space-y-4">
          <Card titulo="Prioridad de pastoreo" icono={Leaf} acciones={<Link href={`/app/${slug}/mapa?color=prioridad`} className="btn-ghost">Ver en mapa</Link>}>
            <ul className="space-y-2 text-sm">
              {porPrioridad.map(({ k, n }) => (
                <li key={k} className="flex items-start gap-2">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: PRIORIDADES[k].color }} aria-hidden />
                  <span className="flex-1"><b className="font-semibold">{PRIORIDADES[k].label}</b> <span className="text-muted">· {PRIORIDADES[k].descripcion}</span></span>
                  <b className="num">{n}</b>
                </li>
              ))}
            </ul>
          </Card>
          <Card titulo="Cómo se estima" icono={CloudSun}>
            <ul className="space-y-2 text-sm text-muted">
              {fincas.map((f) => {
                const c = climas.get(f.id);
                if (!c) return null;
                return (
                  <li key={f.id}>
                    <b className="font-semibold text-foreground">{f.nombre}</b>: {formatNum(c.altitudMsnm, 0)} msnm (~{formatNum(temperaturaPorAltitud(c.altitudMsnm), 0)} °C), {REGIMENES_LLUVIA[c.regimen].label.toLowerCase()}
                    {c.regimenEsSugerido && " (deducido de la provincia)"}
                    {c.lluvia?.size ? `, con ${plural(c.lluvia.size, "día", "días")} de pluviómetro.` : ", sin pluviómetro: usa la estacionalidad de la zona."}
                  </li>
                );
              })}
              <li>Parte del último aforo o, si no hay, del residuo que dejó el último pastoreo, y suma el crecimiento diario según el pasto, la temperatura y la lluvia.</li>
              <li>{conCalibracion > 0 ? `${plural(conCalibracion, "potrero")} ya se calibra con tus aforos.` : "Con dos aforos seguidos sin pastoreo en medio, el modelo se ajusta a cada potrero."}</li>
              <li>
                <Link href={`/app/${slug}/ajustes`} className="font-medium text-primary underline">Ajusta altitud y régimen de lluvia</Link> en cada finca.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
