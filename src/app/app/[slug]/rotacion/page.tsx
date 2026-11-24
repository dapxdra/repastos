import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AlertTriangle, Beef, History, Lightbulb, MoveRight, Plus, Repeat2 } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { restriccionesDeLotes, retirosLechePorPotrero } from "@/lib/inocuidad";
import { modulosDeOrg, potrerosConForraje, type PotreroConEstado } from "@/lib/consultas";
import {
  CATEGORIAS_LOTE,
  ESTADOS,
  diasEntre,
  fechaCortaCR,
  fechaISOEnCR,
  formatNum,
  hoyCR,
  sugerirSiguiente,
  unidadesAnimales,
  type CategoriaLote,
} from "@/lib/dominio";
import { Card, EstadoBadge, ModuloChip, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ActionForm, Field, Submit } from "@/components/forms";
import { CONSUMO_PCT_PV, ESTADOS_SALIDA, PRIORIDADES, parametrosPasto, type EstadoSalida } from "@/lib/forraje";
import { actualizarLote, crearLote, moverLote, sacarLote } from "../actions";

export const metadata = { title: "Rotación" };

export default async function Rotacion({ params }: PageProps<"/app/[slug]/rotacion">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const esAdmin = puede(rol, "administrador");

  const [potreros, lotes, fincas, historial, modulos, retiros, retirosLeche] = await Promise.all([
    potrerosConForraje(org.id).then((r) => r.potreros),
    db.select().from(schema.lotes).where(eq(schema.lotes.orgId, org.id)).orderBy(schema.lotes.nombre),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)),
    db
      .select({
        id: schema.pastoreos.id,
        entrada: schema.pastoreos.fechaEntrada,
        salida: schema.pastoreos.fechaSalida,
        cabezas: schema.pastoreos.cabezas,
        potrero: schema.potreros.nombre,
        lote: schema.lotes.nombre,
        estadoSalida: schema.pastoreos.estadoSalida,
        alturaSalida: schema.pastoreos.alturaSalidaCm,
      })
      .from(schema.pastoreos)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.pastoreos.potreroId))
      .innerJoin(schema.lotes, eq(schema.lotes.id, schema.pastoreos.loteId))
      .where(eq(schema.pastoreos.orgId, org.id))
      .orderBy(desc(schema.pastoreos.fechaEntrada))
      .limit(25),
    modulosDeOrg(org.id),
    restriccionesDeLotes(org.id, org.tipoProduccion),
    retirosLechePorPotrero(org.id),
  ]);
  const moduloDe = new Map(modulos.map((m) => [m.id, m]));
  const ordenEstado = ["listo", "en_descanso", "ocupado", "en_espera"];
  const porEstado = (a: PotreroConEstado, b: PotreroConEstado) => ordenEstado.indexOf(a.estado) - ordenEstado.indexOf(b.estado);
  // Destinos agrupados por módulo (los potreros en espera aparecen deshabilitados)
  const gruposDestino = [
    ...modulos.map((m) => ({ etiqueta: m.nombre, items: potreros.filter((p) => p.moduloId === m.id).sort(porEstado) })),
    { etiqueta: modulos.length ? "Sin módulo" : "Potreros", items: potreros.filter((p) => !p.moduloId).sort(porEstado) },
  ].filter((g) => g.items.length);
  const opcion = (o: PotreroConEstado) => (
    <option key={o.id} value={o.id} disabled={o.estado === "en_espera"}>
      {o.nombre} — {ESTADOS[o.estado].label}
      {o.estado === "en_descanso" ? ` (${o.diasDescanso}/${o.diasDescansoObjetivo} d)` : ""}
      {o.estado === "en_espera" ? ` hasta ${fechaCortaCR(o.liberacion!)}` : ""}
      {o.estado !== "en_espera" && retirosLeche.has(o.id) ? ` · ordeño no, hasta ${fechaCortaCR(retirosLeche.get(o.id)!.hasta)}` : ""}
    </option>
  );
  const selectModulo = (valor: string | null) => (
    <select className="input" defaultValue={valor ?? ""}>
      <option value="">Sin módulo</option>
      {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
    </select>
  );

  const ubicacion = new Map(potreros.filter((p) => p.loteActual).map((p) => [p.loteActual!.id, p]));
  /** Al mover, cómo quedó el potrero que se deja (corrige el arranque del rebrote en el modelo). */
  const selectSalida = (potrero: string | null) => (
    <Field label={potrero ? `¿Cómo quedó ${potrero}?` : "¿Cómo quedó el potrero que deja?"} name="estadoSalida">
      <select className="input" defaultValue="">
        <option value="">Sin anotar</option>
        {(Object.keys(ESTADOS_SALIDA) as EstadoSalida[]).map((k) => (
          <option key={k} value={k}>{ESTADOS_SALIDA[k].label} — {ESTADOS_SALIDA[k].descripcion.toLowerCase()}</option>
        ))}
      </select>
    </Field>
  );
  const hoy = hoyCR();

  return (
    <>
      <PageHeader titulo="Rotación" descripcion="Dónde está cada lote, cuánto lleva y a dónde moverlo. Los potreros en espera por aplicación no reciben ganado." />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card titulo="Lotes" icono={Beef}>
            {lotes.length === 0 ? (
              <Vacio icono={Beef} titulo="Sin lotes" texto="Crea tu primer lote de animales para empezar a rotar." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {lotes.map((l) => {
                  const p = ubicacion.get(l.id);
                  const ua = unidadesAnimales(l.cabezas, l.pesoPromedioKg ? Number(l.pesoPromedioKg) : null, l.categoria as CategoriaLote);
                  const modulo = l.moduloId ? (moduloDe.get(l.moduloId) ?? null) : null;
                  const sugerido = sugerirSiguiente(potreros, l.moduloId, p?.id);
                  return (
                    <li key={l.id} className="flex flex-col rounded-xl border border-border p-4" data-testid="lote">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{l.nombre}</p>
                          {modulos.length > 0 && <ModuloChip modulo={modulo} className="mt-1" />}
                          <p className="text-xs text-muted">
                            {CATEGORIAS_LOTE[l.categoria as CategoriaLote].label} · <span className="num">{l.cabezas}</span> cab. · <span className="num">{formatNum(ua, 1)}</span> UA
                          </p>
                        </div>
                        {p ? <EstadoBadge estado="ocupado" /> : <span className="chip bg-surface-2 text-muted">Sin potrero</span>}
                      </div>
                      {retiros
                        .filter((r) => r.loteId === l.id)
                        .map((r) => (
                          <p
                            key={r.tipo}
                            role="status"
                            className={`mt-2 flex items-start gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${r.tipo === "leche" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}
                          >
                            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                            {r.tipo === "leche" ? "Leche no apta" : "Sin sacrificio"} hasta el {fechaCortaCR(r.hasta)} · {r.producto}
                          </p>
                        ))}
                      {p && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                          <Link href={`/app/${slug}/potreros/${p.id}`} className="font-medium hover:text-primary">{p.nombre}</Link>
                          <span className={`num text-xs ${p.sobreocupado ? "font-semibold text-warning" : "text-muted"}`}>
                            día {(p.diasOcupacion ?? 0) + 1} / {p.diasOcupacionObjetivo}
                          </span>
                        </div>
                      )}
                      {sugerido ? (
                        <div className="mt-3 rounded-lg border border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2 text-sm">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-strong">
                            <Lightbulb className="size-3.5" aria-hidden /> Siguiente sugerido{modulo ? ` en ${modulo.nombre}` : ""}
                          </p>
                          <p className="mt-0.5">
                            <b className="font-semibold">{sugerido.nombre}</b>{" "}
                            <span className="text-xs text-muted">
                              {sugerido.estado === "listo"
                                ? sugerido.est.cobertura != null
                                  ? `~${formatNum(sugerido.est.cobertura, 0)} kg MS/ha · ${PRIORIDADES[sugerido.prioridad].label.toLowerCase()}`
                                  : sugerido.diasDescanso == null
                                    ? "sin pastoreos"
                                    : `descansó ${sugerido.diasDescanso} d`
                                : `aún en descanso: ${sugerido.diasDescanso}/${sugerido.diasDescansoObjetivo} d`}
                            </span>
                          </p>
                          {esOperador && (
                            <ActionForm action={moverLote.bind(null, slug)} className="mt-2 space-y-2">
                              <input type="hidden" name="loteId" value={l.id} />
                              <input type="hidden" name="potreroId" value={sugerido.id} />
                              {p && selectSalida(p.nombre)}
                              <Submit className="btn min-h-10 w-full">
                                <Repeat2 className="size-4" aria-hidden /> Mover a {sugerido.nombre}
                              </Submit>
                            </ActionForm>
                          )}
                        </div>
                      ) : (
                        modulo && <p className="mt-3 text-xs text-warning">No hay potreros disponibles en {modulo.nombre}.</p>
                      )}
                      {esOperador && p && (
                        <details className="mt-2">
                          <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">Sacar del potrero</summary>
                          <ActionForm action={sacarLote.bind(null, slug, p.loteActual!.pastoreoId)} className="mt-2 space-y-2">
                            <fieldset>
                              <legend className="label">¿Cómo quedó {p.nombre}?</legend>
                              <div className="grid grid-cols-3 gap-2">
                                {(Object.keys(ESTADOS_SALIDA) as EstadoSalida[]).map((k) => (
                                  <button
                                    key={k}
                                    type="submit"
                                    name="estadoSalida"
                                    value={k}
                                    title={ESTADOS_SALIDA[k].descripcion}
                                    className={`min-h-12 rounded-lg border-2 px-2 text-sm font-semibold ${k === "bien" ? "border-primary bg-primary-soft text-primary-strong" : k === "pelado" ? "border-danger/40 bg-danger-soft text-danger" : "border-warning/40 bg-warning-soft text-warning"}`}
                                  >
                                    {ESTADOS_SALIDA[k].label}
                                  </button>
                                ))}
                              </div>
                            </fieldset>
                            <Field
                              label="Altura que quedó (cm)"
                              name="alturaSalida"
                              hint={`Opcional. Objetivo para ${parametrosPasto(p.tipoPasto).label}: ${parametrosPasto(p.tipoPasto).alturaSalida} cm`}
                            >
                              <input className="input" type="number" inputMode="decimal" min={0} max={300} step="any" />
                            </Field>
                            <Submit className="btn-ghost w-full">Sacar sin anotar</Submit>
                          </ActionForm>
                        </details>
                      )}
                      {esOperador && (
                        <details className="mt-auto pt-2">
                          <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">Editar lote</summary>
                          <ActionForm action={actualizarLote.bind(null, slug, l.id)} className="mt-2 grid grid-cols-2 gap-3" version={JSON.stringify([l.nombre, l.categoria, l.cabezas, l.pesoPromedioKg, l.moduloId, l.suplementoKgMs, l.consumoPctPv])}>
                            <Field label="Nombre" name="nombre" required className="col-span-2"><input className="input" defaultValue={l.nombre} /></Field>
                            <Field label="Categoría" name="categoria" className="col-span-2">
                              <select className="input" defaultValue={l.categoria}>
                                {Object.entries(CATEGORIAS_LOTE).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Cabezas" name="cabezas" required><input className="input" type="number" inputMode="numeric" min={0} defaultValue={l.cabezas} /></Field>
                            <Field label="Peso prom. (kg)" name="peso"><input className="input" type="number" inputMode="decimal" min={0} step="any" defaultValue={l.pesoPromedioKg ?? ""} /></Field>
                            <Field label="Suplemento (kg MS/animal/día)" name="suplemento" hint="Concentrado, ensilaje, pacas. Cada kg reemplaza ~0,5 kg de pasto">
                              <input className="input" type="number" inputMode="decimal" min={0} step="any" defaultValue={Number(l.suplementoKgMs) || ""} placeholder="0" />
                            </Field>
                            <Field label="Consumo (% del peso)" name="consumoPct" hint={`Solo con pasto, sin suplemento. Referencia: ${CONSUMO_PCT_PV[l.categoria]} %`}>
                              <input className="input" type="number" inputMode="decimal" min={0.5} max={5} step="0.1" defaultValue={l.consumoPctPv ?? ""} placeholder={String(CONSUMO_PCT_PV[l.categoria])} />
                            </Field>
                            {modulos.length > 0 ? (
                              <Field label="Módulo" name="moduloId" className="col-span-2">{selectModulo(l.moduloId)}</Field>
                            ) : (
                              <input type="hidden" name="moduloId" value="" />
                            )}
                            <Submit className="btn col-span-2">Guardar lote</Submit>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card titulo="Historial de movimientos" icono={History}>
            {historial.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay movimientos.</p>
            ) : (
              <Tabla>
                <thead><tr><th>Lote</th><th>Potrero</th><th>Entrada</th><th>Salida</th><th className="text-right">Días</th><th>Cómo quedó</th></tr></thead>
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="font-medium">{h.lote}</td>
                      <td>{h.potrero}</td>
                      <td className="num">{fechaCortaCR(h.entrada)}</td>
                      <td className="num">{h.salida ? fechaCortaCR(h.salida) : <span className="text-sky">En curso</span>}</td>
                      <td className="num text-right">{diasEntre(fechaISOEnCR(h.entrada), h.salida ? fechaISOEnCR(h.salida) : hoy) + 1}</td>
                      <td className={`text-xs ${h.estadoSalida === "pelado" ? "font-semibold text-danger" : h.estadoSalida === "alto" ? "text-warning" : "text-muted"}`}>
                        {[h.estadoSalida && ESTADOS_SALIDA[h.estadoSalida].label, h.alturaSalida && `${formatNum(Number(h.alturaSalida))} cm`].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {esOperador && lotes.length > 0 && potreros.length > 0 && (
            <Card titulo="Mover lote" icono={MoveRight}>
              <ActionForm action={moverLote.bind(null, slug)}>
                <Field label="Lote" name="loteId" required>
                  <select className="input">
                      {lotes.map((l) => <option key={l.id} value={l.id}>{l.nombre} ({l.cabezas} cab.)</option>)}
                    </select>
                </Field>
                <Field label="Potrero destino" name="potreroId" required hint="Agrupados por módulo, listos primero. Los que están en espera no se pueden elegir.">
                  <select className="input">
                    {gruposDestino.length === 1
                      ? gruposDestino[0].items.map(opcion)
                      : gruposDestino.map((g) => (
                          <optgroup key={g.etiqueta} label={g.etiqueta}>
                            {g.items.map(opcion)}
                          </optgroup>
                        ))}
                  </select>
                </Field>
                {ubicacion.size > 0 && selectSalida(null)}
                <Field label="Notas" name="notas">
                  <input className="input" placeholder="Opcional" />
                </Field>
                <Submit className="btn w-full"><Repeat2 className="size-4" aria-hidden />Mover</Submit>
              </ActionForm>
            </Card>
          )}

          {esAdmin && fincas.length > 0 && (
            <Card titulo="Nuevo lote" icono={Plus}>
              <ActionForm action={crearLote.bind(null, slug)}>
                <Field label="Nombre" name="nombre" required>
                  <input className="input" placeholder="Ej. Vacas de ordeño A" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Categoría" name="categoria" className="col-span-2">
                    <select className="input" defaultValue={org.tipoProduccion === "carne" ? "novillos_engorde" : "vacas_produccion"}>
                        {Object.entries(CATEGORIAS_LOTE).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                      </select>
                  </Field>
                  <Field label="Cabezas" name="cabezas" required>
                    <input className="input" type="number" inputMode="numeric" min={0} />
                  </Field>
                  <Field label="Peso prom. (kg)" name="peso">
                    <input className="input" type="number" inputMode="decimal" min={0} step="any" />
                  </Field>
                  <Field label="Suplemento (kg MS/animal/día)" name="suplemento" hint="Concentrado, ensilaje, pacas. Cada kg reemplaza ~0,5 kg de pasto" className="col-span-2">
                    <input className="input" type="number" inputMode="decimal" min={0} step="any" placeholder="0" />
                  </Field>
                </div>
                {modulos.length > 0 && (
                  <Field label="Módulo" name="moduloId" hint="El hato rota dentro de este módulo">
                    {selectModulo(null)}
                  </Field>
                )}
                {fincas.length > 1 ? (
                  <Field label="Finca" name="fincaId">
                    <select className="input">{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
                  </Field>
                ) : (
                  <input type="hidden" name="fincaId" value={fincas[0].id} />
                )}
                <Submit className="btn w-full">Crear lote</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
