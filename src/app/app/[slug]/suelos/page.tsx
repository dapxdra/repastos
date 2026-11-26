import { and, desc, eq, isNotNull } from "drizzle-orm";
import { FlaskConical, Info, Mountain, Plus, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { potrerosConEstado } from "@/lib/consultas";
import { diasEntre, fechaCR, formatArea, formatNum, hoyCR, porUnidadTasa, unidadTasa } from "@/lib/dominio";
import {
  MAX_CAL_POR_VEZ_T,
  NIVELES,
  RANGOS,
  RELACIONES,
  aAnalisis,
  cice,
  equivalenteCaCO3,
  nivel,
  recomendar,
  saturacionTolerada,
} from "@/lib/suelo";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { MarcarGrupo } from "@/components/modulos";
import { eliminarAnalisis, registrarAnalisis } from "../actions";

export const metadata = { title: "Suelos" };

const TONO = { bajo: "text-warning", adecuado: "text-primary", alto: "text-sky" } as const;
const SACO_KG = 45;

export default async function Suelos({ params }: PageProps<"/app/[slug]/suelos">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const esAdmin = puede(rol, "administrador");
  const u = org.unidadArea;
  const hoy = hoyCR();

  const [analisis, potreros, fincas, cales] = await Promise.all([
    db.select().from(schema.analisisSuelo).where(eq(schema.analisisSuelo.orgId, org.id)).orderBy(desc(schema.analisisSuelo.fecha), desc(schema.analisisSuelo.creadoEn)),
    potrerosConEstado(org.id),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)),
    // Enmiendas del catálogo con su CaO/MgO: para convertir la dosis de CaCO₃ en kg del producto
    db
      .select({ id: schema.productos.id, nombre: schema.productos.nombre, cao: schema.productos.cao, mgo: schema.productos.mgo })
      .from(schema.productos)
      .where(and(eq(schema.productos.orgId, org.id), eq(schema.productos.tipo, "enmienda"), isNotNull(schema.productos.cao))),
  ]);
  const porId = new Map(potreros.map((p) => [p.id, p]));
  const grupos = [...new Map(potreros.map((p) => [p.modulo?.id ?? "", { clave: p.modulo?.id ?? "sin-modulo", nombre: p.modulo?.nombre ?? "Sin módulo", items: [] as typeof potreros }])).values()];
  for (const p of potreros) grupos.find((g) => g.clave === (p.modulo?.id ?? "sin-modulo"))!.items.push(p);
  const porUnidad = (tha: number) => porUnidadTasa(tha, u);
  const ut = unidadTasa(u);

  return (
    <>
      <PageHeader titulo="Suelos" descripcion="Análisis químicos por potrero o módulo, su interpretación y la cal que necesita cada pasto." />
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        Interpretación con los niveles críticos de la solución KCl-Olsen modificado (CIA-UCR, INTA). Es una guía: la recomendación final debe revisarla un agrónomo con el informe del laboratorio.
      </p>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {analisis.length === 0 && (
            <Card>
              <Vacio icono={FlaskConical} titulo="Sin análisis" texto="Registra el análisis de suelo del laboratorio para ver su interpretación y la dosis de cal." />
            </Card>
          )}
          {analisis.map((fila) => {
            const a = aAnalisis(fila);
            const ps = fila.potreroIds.map((id) => porId.get(id)).filter((p) => p != null);
            // El pasto más sensible a la acidez de la muestra manda
            const ras = ps.length ? Math.min(...ps.map((p) => saturacionTolerada(p.tipoPasto))) : 25;
            const r = recomendar(a, ras);
            const area = ps.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);
            const vieja = diasEntre(fila.fecha, hoy) > 3 * 365;
            return (
              <Card
                key={fila.id}
                titulo={fila.nombre}
                icono={Mountain}
                acciones={
                  esAdmin && (
                    <BotonAccion action={eliminarAnalisis.bind(null, slug, fila.id)} className="btn-ghost" confirmar={`¿Eliminar el análisis "${fila.nombre}"?`}>
                      <Trash2 className="size-4" aria-hidden /><span className="sr-only">Eliminar</span>
                    </BotonAccion>
                  )
                }
              >
                <p className="mb-3 text-xs text-muted">
                  {fechaCR(fila.fecha)}{fila.laboratorio ? ` · ${fila.laboratorio}` : ""} ·{" "}
                  {ps.length ? ps.map((p) => p.nombre).join(", ") : "sin potreros asignados"}
                  {vieja && <span className="font-semibold text-warning"> · tiene más de 3 años: conviene repetirlo</span>}
                </p>
                <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {RANGOS.filter((x) => a[x.clave] != null).map((x) => {
                    const nv = nivel(x, a[x.clave]);
                    return (
                      <p key={x.clave} className="flex justify-between gap-2 border-b border-border/60 py-1">
                        <span>{x.label} <span className="text-xs text-muted">{x.unidad}</span></span>
                        <span className="num">
                          {formatNum(a[x.clave], 2)}{" "}
                          {nv && <span className={`text-xs font-semibold ${x.altoEsMalo && nv === "alto" ? "text-danger" : TONO[nv]}`}>{x.altoEsMalo && nv === "alto" ? "Alta" : NIVELES[nv].label}</span>}
                        </span>
                      </p>
                    );
                  })}
                  {cice(a) != null && (
                    <p className="flex justify-between gap-2 border-b border-border/60 py-1">
                      <span>CICE <span className="text-xs text-muted">cmol(+)/L</span></span>
                      <span className="num">{formatNum(cice(a), 2)} {cice(a)! < 5 && <span className="text-xs font-semibold text-warning">Baja</span>}</span>
                    </p>
                  )}
                  {r.ras != null && (
                    <p className="flex justify-between gap-2 border-b border-border/60 py-1">
                      <span>Saturación de acidez</span>
                      <span className={`num font-semibold ${r.ras > ras ? "text-danger" : "text-primary"}`}>{formatNum(r.ras, 0)} % <span className="text-xs font-normal text-muted">(tolera {ras} %)</span></span>
                    </p>
                  )}
                </div>
                {RELACIONES.some((x) => x.calc(a) != null) && (
                  <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {RELACIONES.map((x) => {
                      const v = x.calc(a);
                      if (v == null) return null;
                      const ok = v >= x.min && v <= x.max;
                      return (
                        <span key={x.label} className={`chip ${ok ? "bg-surface-2 text-muted" : "bg-warning-soft text-warning"}`} title={`Adecuado: ${x.min}–${x.max}`}>
                          {x.label} {formatNum(v, 1)}
                        </span>
                      );
                    })}
                  </p>
                )}

                <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                  {r.caco3Tha > 0 ? (
                    <>
                      <p className="font-semibold">
                        Encalar: {formatNum(porUnidad(r.caco3Tha), 2)} t/{ut} de CaCO₃ equivalente{area > 0 && ` · ${formatNum(r.caco3Tha * area, 1)} t para ${formatArea(area, u, 1)}`}
                      </p>
                      {(cales.length ? cales : [{ id: "ref", nombre: "Cal agrícola (52 % CaO)", cao: "52", mgo: null }]).map((c) => {
                        const eq = equivalenteCaCO3(Number(c.cao ?? 0), Number(c.mgo ?? 0));
                        if (eq <= 0) return null;
                        const tha = r.caco3Tha / eq;
                        return (
                          <p key={c.id} className="text-muted">
                            {c.nombre}: <b className="num text-foreground">{formatNum(porUnidad(tha), 2)} t/{ut}</b> ≈ {formatNum((porUnidad(tha) * 1000) / SACO_KG, 0)} sacos de {SACO_KG} kg por {ut}
                          </p>
                        );
                      })}
                    </>
                  ) : (
                    <p className="font-semibold text-primary">La acidez no limita a {ps.length ? "estos pastos" : "un pasto tropical típico"}.</p>
                  )}
                  {r.notas.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
                      {r.notas.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    Fórmula de saturación de acidez: CaCO₃ (t/ha) = 1,5 × (acidez − {ras} % × CICE). Máximo {MAX_CAL_POR_VEZ_T} t/ha por aplicación en pasto establecido.
                  </p>
                </div>
              </Card>
            );
          })}
        </div>

        {esOperador && fincas.length > 0 && (
          <Card titulo="Registrar análisis" icono={Plus} className="h-fit">
            <ActionForm action={registrarAnalisis.bind(null, slug)} className="space-y-3">
              <Field label="Nombre de la muestra" name="nombre" required>
                <input className="input" placeholder="Ej. Módulo ordeño A" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                {fincas.length > 1 ? (
                  <Field label="Finca" name="fincaId">
                    <select className="input">{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
                  </Field>
                ) : (
                  <input type="hidden" name="fincaId" value={fincas[0].id} />
                )}
                <Field label="Fecha del muestreo" name="fecha" required>
                  <input className="input" type="date" max={hoy} defaultValue={hoy} />
                </Field>
                <Field label="Laboratorio" name="laboratorio" className={fincas.length > 1 ? "col-span-2" : ""}>
                  <input className="input" placeholder="CIA-UCR, INTA…" />
                </Field>
              </div>
              <fieldset>
                <legend className="label">Potreros que representa</legend>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
                  {grupos.map((g) => (
                    <div key={g.clave}>
                      {grupos.length > 1 && (
                        <label className="flex min-h-9 items-center gap-2 px-2 text-xs font-semibold text-muted">
                          <MarcarGrupo grupo={g.clave} etiqueta={`Marcar todos los potreros de ${g.nombre}`} />
                          {g.nombre}
                        </label>
                      )}
                      {g.items.map((p) => (
                        <label key={p.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-surface-2">
                          <input type="checkbox" name="potreroIds" value={p.id} data-grupo={g.clave} className="size-4 accent-[var(--primary)]" />
                          {p.nombre}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Resultados</legend>
                <div className="grid grid-cols-3 gap-2">
                  {RANGOS.map((x) => (
                    <Field key={x.clave} label={x.label.replace(" intercambiable", "").replace("Materia orgánica", "M.O.")} name={x.clave} hint={x.unidad || undefined}>
                      <input className="input px-2" type="number" inputMode="decimal" step="any" min={0} />
                    </Field>
                  ))}
                </div>
              </fieldset>
              <Field label="Notas" name="notas">
                <textarea className="input" rows={2} />
              </Field>
              <Submit className="btn w-full">Guardar análisis</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
