import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowDown, ArrowUp, Beef, CalendarRange, ListOrdered, Plus, Repeat2, Trash2, Wand2, X } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConForraje } from "@/lib/consultas";
import { CATEGORIAS_LOTE, diasEntre, fechaCortaCR, formatNum, hoyCR, loteDeOrdeno, type CategoriaLote } from "@/lib/dominio";
import { BALANCES, PRIORIDADES, SUSTITUCION_SUPLEMENTO } from "@/lib/forraje";
import { DESCANSO_MINIMO, MAX_DIAS_SIN_REBROTE, calcularPlan, demandaDeLote, inicioPlan } from "@/lib/plan";
import { retirosLechePorPotrero } from "@/lib/inocuidad";
import { Card, ModuloChip, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { agregarAlPlan, ajustarPlan, borrarPlan, generarPlanLote, moverLote } from "../actions";

export const metadata = { title: "Planificador" };

const TONO_BALANCE = { liviano: "bg-warning-soft text-warning", justo: "bg-primary-soft text-primary-strong", pesado: "bg-sky-soft text-sky" } as const;

export default async function Planificador({ params, searchParams }: PageProps<"/app/[slug]/planificador">) {
  const { slug } = await params;
  const { lote: loteParam } = (await searchParams) as { lote?: string };
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const hoy = hoyCR();

  const [lotes, modulos] = await Promise.all([
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)).orderBy(schema.lotes.nombre),
    modulosDeOrg(org.id),
  ]);
  if (lotes.length === 0) {
    return (
      <>
        <PageHeader titulo="Planificador de pastoreo" />
        <Vacio icono={Beef} titulo="Sin lotes" texto="Crea tus lotes en Rotación para planificar sus próximos pastoreos.">
          <Link href={`/app/${slug}/rotacion`} className="btn">Ir a Rotación</Link>
        </Vacio>
      </>
    );
  }
  const lote = lotes.find((l) => l.id === loteParam) ?? lotes[0];
  const ordeno = loteDeOrdeno(lote.categoria, org.tipoProduccion);
  const [{ potreros, climas }, items, retirosLeche] = await Promise.all([
    potrerosConForraje(org.id),
    db
      .select({ id: schema.planPastoreo.id, potreroId: schema.planPastoreo.potreroId, dias: schema.planPastoreo.dias })
      .from(schema.planPastoreo)
      .where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, lote.id)))
      .orderBy(asc(schema.planPastoreo.orden), asc(schema.planPastoreo.creadoEn)),
    ordeno ? retirosLechePorPotrero(org.id, hoy) : undefined,
  ]);

  const modulo = modulos.find((m) => m.id === lote.moduloId) ?? null;
  const actual = potreros.find((p) => p.loteActual?.id === lote.id);
  const inicio = inicioPlan(actual, hoy);
  const filas = calcularPlan(items, potreros, climas, lote, inicio, hoy, retirosLeche);
  const dem = demandaDeLote(lote);
  const totalDias = filas.reduce((s, f) => s + f.dias, 0);
  const ofertaTotal = filas.reduce((s, f) => s + (f.oferta ?? 0), 0);
  const demandaTotal = filas.reduce((s, f) => s + f.demanda, 0);
  const enPlan = new Set(items.map((i) => i.potreroId));
  const candidatos = potreros
    .filter((p) => !enPlan.has(p.id) && p.id !== actual?.id && (lote.moduloId ? p.moduloId === lote.moduloId : true))
    .sort((a, b) => b.puntaje - a.puntaje);
  const otros = potreros.filter((p) => !enPlan.has(p.id) && p.id !== actual?.id && lote.moduloId && p.moduloId !== lote.moduloId);
  const primero = filas[0];

  return (
    <>
      <PageHeader
        titulo="Planificador de pastoreo"
        descripcion="Ordena los próximos potreros de cada lote y compara el forraje que habrá al entrar con lo que el lote va a comer. Los potreros en tiempo de espera a esa fecha quedan marcados."
      />

      <nav aria-label="Lotes" className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {lotes.map((l) => (
          <Link
            key={l.id}
            href={`/app/${slug}/planificador?lote=${l.id}`}
            aria-current={l.id === lote.id ? "page" : undefined}
            className={`btn-secondary shrink-0 ${l.id === lote.id ? "border-primary bg-primary-soft text-primary-strong" : ""}`}
          >
            {l.nombre}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card
            titulo={`Plan de ${lote.nombre}`}
            icono={ListOrdered}
            acciones={
              esOperador && filas.length > 0 && (
                <BotonAccion action={borrarPlan.bind(null, slug, lote.id)} className="btn-ghost" confirmar="¿Borrar todo el plan de este lote?">
                  <Trash2 className="size-4" aria-hidden />Borrar plan
                </BotonAccion>
              )
            }
          >
            <p className="mb-3 text-sm text-muted">
              {actual ? (
                <>
                  Ahora en <b className="text-foreground">{actual.nombre}</b> desde el {fechaCortaCR(actual.ocupadoDesdeFecha!)}; sale el {fechaCortaCR(inicio)}.
                </>
              ) : (
                "Sin potrero asignado: el plan empieza hoy."
              )}
            </p>
            {filas.length === 0 ? (
              <Vacio icono={CalendarRange} titulo="Plan vacío" texto="Genera un plan automático o agrega potreros a mano." />
            ) : (
              <>
                <Tabla>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Potrero</th>
                      <th>Entrada</th>
                      <th className="text-right">Días</th>
                      <th className="text-right">kg MS/ha al entrar</th>
                      <th>Oferta vs demanda</th>
                      {esOperador && <th className="sr-only">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={f.itemId} className={f.bloqueado ? "bg-warning-soft/50" : ""}>
                        <td className="num text-muted">{i + 1}</td>
                        <td>
                          <Link href={`/app/${slug}/potreros/${f.potrero.id}`} className="font-medium hover:text-primary">{f.potrero.nombre}</Link>
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <span className="size-2 rounded-full" style={{ background: PRIORIDADES[f.potrero.prioridad].color }} aria-hidden />
                            {PRIORIDADES[f.potrero.prioridad].label}
                            {f.potrero.moduloId !== lote.moduloId && lote.moduloId ? " · fuera del módulo" : ""}
                          </span>
                          {f.bloqueo && (
                            <span className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${f.bloqueo.motivo === "retiro de leche" ? "text-danger" : "text-warning"}`}>
                              <AlertTriangle className="size-3.5" aria-hidden />
                              {f.bloqueo.motivo === "retiro de leche" ? "Retiro de leche" : "Carencia"} de {f.bloqueo.producto ?? "un producto"} hasta {fechaCortaCR(f.bloqueo.hasta)}
                            </span>
                          )}
                          {!f.bloqueo && f.descansoCorto && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warning">
                              <AlertTriangle className="size-3.5" aria-hidden />Descanso corto: {f.descansoAlEntrar} de {f.potrero.diasDescansoObjetivo} d
                            </span>
                          )}
                        </td>
                        <td className="num whitespace-nowrap">{fechaCortaCR(f.entrada)}<span className="block text-xs text-muted">{diasEntre(hoy, f.entrada) <= 0 ? "hoy" : `en ${diasEntre(hoy, f.entrada)} d`}</span></td>
                        <td className="num text-right">
                          {esOperador && f.itemId ? (
                            <ActionForm action={ajustarPlan.bind(null, slug, f.itemId)} className="flex items-center justify-end gap-1" mostrarOk={false} version={String(f.dias)}>
                              <input type="hidden" name="accion" value="dias" />
                              <label className="sr-only" htmlFor={`dias-${f.itemId}`}>Días en {f.potrero.nombre}</label>
                              <input id={`dias-${f.itemId}`} name="dias" className="input min-h-9 w-16 px-2 text-right" type="number" inputMode="numeric" min={1} max={60} defaultValue={f.dias} />
                              <Submit className="btn-ghost min-h-9 px-2">OK</Submit>
                            </ActionForm>
                          ) : (
                            f.dias
                          )}
                          {f.diasQueAlcanza != null && <span className="block text-xs text-muted">alcanza ~{formatNum(f.diasQueAlcanza, 1)} d</span>}
                          {f.dias > MAX_DIAS_SIN_REBROTE && (
                            <span className="block text-xs font-semibold text-warning" title="Desde el día 3–4 el ganado empieza a comerse el rebrote. Divide el potrero en franjas.">
                              come rebrote
                            </span>
                          )}
                        </td>
                        <td className="num text-right">{formatNum(f.cobertura, 0)}</td>
                        <td>
                          {f.balance ? (
                            <span className={`chip ${TONO_BALANCE[f.balance]}`} title={BALANCES[f.balance].descripcion}>{BALANCES[f.balance].label}</span>
                          ) : (
                            <span className="text-xs text-muted">Sin datos de forraje</span>
                          )}
                          {f.oferta != null && (
                            <span className="num mt-0.5 block text-xs text-muted">{formatNum(f.oferta / 1000, 1)} t / {formatNum(f.demanda / 1000, 1)} t</span>
                          )}
                        </td>
                        {esOperador && f.itemId && (
                          <td>
                            <ActionForm action={ajustarPlan.bind(null, slug, f.itemId)} className="flex justify-end" mostrarOk={false}>
                              <button type="submit" name="accion" value="subir" className="btn-ghost min-h-9 px-2" disabled={i === 0} aria-label={`Subir ${f.potrero.nombre}`}><ArrowUp className="size-4" aria-hidden /></button>
                              <button type="submit" name="accion" value="bajar" className="btn-ghost min-h-9 px-2" disabled={i === filas.length - 1} aria-label={`Bajar ${f.potrero.nombre}`}><ArrowDown className="size-4" aria-hidden /></button>
                              <button type="submit" name="accion" value="quitar" className="btn-ghost min-h-9 px-2" aria-label={`Quitar ${f.potrero.nombre} del plan`}><X className="size-4" aria-hidden /></button>
                            </ActionForm>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                  <p>
                    <b className="num">{totalDias}</b> días planificados, hasta el {fechaCortaCR(filas.at(-1)!.salida)} ·{" "}
                    <span className="num">{formatNum(ofertaTotal / 1000, 1)} t</span> de oferta para <span className="num">{formatNum(demandaTotal / 1000, 1)} t</span> de demanda
                  </p>
                  {esOperador && primero && !primero.bloqueado && (
                    <ActionForm action={moverLote.bind(null, slug)} className="flex">
                      <input type="hidden" name="loteId" value={lote.id} />
                      <input type="hidden" name="potreroId" value={primero.potrero.id} />
                      <input type="hidden" name="notas" value="Según plan de pastoreo" />
                      <Submit><Repeat2 className="size-4" aria-hidden />Mover ahora a {primero.potrero.nombre}</Submit>
                    </ActionForm>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card titulo="Demanda del lote" icono={Beef}>
            {modulo && <ModuloChip modulo={modulo} className="mb-2" />}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted">Animales</dt><dd className="num font-semibold">{lote.cabezas} · {CATEGORIAS_LOTE[lote.categoria as CategoriaLote].label}</dd></div>
              <div><dt className="text-xs text-muted">Consumo total por animal</dt><dd className="num font-semibold">{formatNum(dem.consumoAnimal, 1)} kg MS/día</dd></div>
              <div><dt className="text-xs text-muted">Suplemento por animal</dt><dd className="num font-semibold">{formatNum(Number(lote.suplementoKgMs), 1)} kg MS/día</dd></div>
              <div><dt className="text-xs text-muted">Pasto por animal</dt><dd className="num font-semibold">{formatNum(dem.pastoAnimal, 1)} kg MS/día</dd></div>
              <div><dt className="text-xs text-muted">Pasto del lote</dt><dd className="num font-semibold">{formatNum(dem.pasto, 0)} kg MS/día</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              Cada kg de suplemento reemplaza ~{formatNum(SUSTITUCION_SUPLEMENTO, 1)} kg de pasto: la vaca suplementada come más en total.
              {ordeno && " Lote de ordeño: el plan evita potreros en retiro de leche."} El consumo y el suplemento se editan en el lote, en{" "}
              <Link href={`/app/${slug}/rotacion`} className="text-primary underline">Rotación</Link>.
            </p>
          </Card>

          {esOperador && (
            <Card titulo="Plan automático" icono={Wand2}>
              <ActionForm action={generarPlanLote.bind(null, slug, lote.id)}>
                <Field label="Ordenar por" name="metodo">
                  <select className="input" defaultValue="forraje">
                    <option value="forraje">Forraje disponible (días según oferta, hasta el objetivo)</option>
                    <option value="ocupacion">Forraje disponible (días objetivo)</option>
                    <option value="descanso">Días de descanso (rotación fija)</option>
                  </select>
                </Field>
                <Field label="Planificar (días)" name="horizonte">
                  <input className="input" type="number" inputMode="numeric" min={3} max={120} defaultValue={30} />
                </Field>
                <Submit className="btn w-full"><Wand2 className="size-4" aria-hidden />{filas.length ? "Rehacer plan" : "Generar plan"}</Submit>
                <p className="hint">
                  {filas.length > 0 && "Reemplaza el plan actual. "}Nunca pasa de los días de ocupación objetivo de cada potrero y deja para después los que no
                  llevan al menos el {formatNum(DESCANSO_MINIMO * 100, 0)} % de su descanso.
                </p>
              </ActionForm>
            </Card>
          )}

          {esOperador && (candidatos.length > 0 || otros.length > 0) && (
            <Card titulo="Agregar potrero" icono={Plus}>
              <ActionForm action={agregarAlPlan.bind(null, slug, lote.id)} className="grid grid-cols-[1fr_88px] gap-3">
                <Field label="Potrero" name="potreroId" className="col-span-2">
                  <select className="input">
                    {candidatos.length > 0 && (
                      <optgroup label={modulo ? `En ${modulo.nombre}` : "Por prioridad"}>
                        {candidatos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre} — {PRIORIDADES[p.prioridad].label}{p.est.cobertura != null ? ` · ${formatNum(p.est.cobertura, 0)} kg` : ""}</option>
                        ))}
                      </optgroup>
                    )}
                    {otros.length > 0 && (
                      <optgroup label="Fuera del módulo">
                        {otros.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {PRIORIDADES[p.prioridad].label}</option>)}
                      </optgroup>
                    )}
                  </select>
                </Field>
                <Field label="Días" name="dias">
                  <input className="input" type="number" inputMode="numeric" min={1} max={60} defaultValue={1} />
                </Field>
                <Submit className="btn self-end">Agregar</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
