import { desc, eq, sql } from "drizzle-orm";
import { CheckCircle2, ClipboardList, ListTodo, Plus, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { modulosDeOrg } from "@/lib/consultas";
import { TIPOS_EVENTO, fechaCortaCR, formatColones, formatNum, hoyCR, type TipoEvento } from "@/lib/dominio";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { completarEvento, eliminarEvento, registrarEvento } from "../actions";

export const metadata = { title: "Labores" };

export default async function Labores({ params }: PageProps<"/app/[slug]/labores">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const esAdmin = puede(rol, "administrador");
  const hoy = hoyCR();

  const [potreros, modulos, grupos] = await Promise.all([
    db
      .select({ id: schema.potreros.id, nombre: schema.potreros.nombre, moduloId: schema.potreros.moduloId })
      .from(schema.potreros)
      .where(eq(schema.potreros.orgId, org.id))
      .orderBy(sql`length(${schema.potreros.nombre})`, schema.potreros.nombre),
    modulosDeOrg(org.id),
    db
      .select({
        grupoId: schema.eventos.grupoId,
        tipo: schema.eventos.tipo,
        fecha: sql<string>`min(${schema.eventos.fecha})::text`,
        titulo: sql<string | null>`min(${schema.eventos.titulo})`,
        hecha: sql<boolean>`bool_and(${schema.eventos.hecha})`,
        cantidad: sql<string | null>`sum(${schema.eventos.cantidad})`,
        unidad: sql<string | null>`min(${schema.eventos.unidad})`,
        costo: sql<string | null>`sum(${schema.eventos.costo})`,
        responsable: sql<string | null>`min(${schema.eventos.responsable})`,
        notas: sql<string | null>`min(${schema.eventos.notas})`,
        potreros: sql<string[]>`array_agg(${schema.potreros.nombre} order by length(${schema.potreros.nombre}), ${schema.potreros.nombre})`,
      })
      .from(schema.eventos)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.eventos.potreroId))
      .where(eq(schema.eventos.orgId, org.id))
      .groupBy(schema.eventos.grupoId, schema.eventos.tipo)
      .orderBy(desc(sql`min(${schema.eventos.fecha})`))
      .limit(80),
  ]);
  const pendientes = grupos.filter((g) => !g.hecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hechas = grupos.filter((g) => g.hecha);
  const gruposPotreros = [
    ...modulos.map((m) => ({ etiqueta: m.nombre, color: m.color, items: potreros.filter((p) => p.moduloId === m.id) })),
    { etiqueta: modulos.length ? "Sin módulo" : "Potreros", color: null, items: potreros.filter((p) => !p.moduloId) },
  ].filter((g) => g.items.length);
  const resumen = (g: (typeof grupos)[number]) => (g.potreros.length > 4 ? `${g.potreros.slice(0, 4).join(", ")} y ${g.potreros.length - 4} más` : g.potreros.join(", "));

  return (
    <>
      <PageHeader
        titulo="Labores"
        descripcion="Siembras, chapias, cosechas de ensilaje o pacas, riego, cercas, tareas y notas por potrero. Los abonos y agroquímicos van en Aplicaciones."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card titulo="Tareas pendientes" icono={ListTodo}>
            {pendientes.length === 0 ? (
              <p className="text-sm text-muted">No hay tareas pendientes.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pendientes.map((g) => (
                  <li key={g.grupoId} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{g.titulo ?? TIPOS_EVENTO[g.tipo as TipoEvento].label}</p>
                      <p className="truncate text-xs text-muted">
                        <span className={`num ${g.fecha < hoy ? "font-semibold text-warning" : ""}`}>{fechaCortaCR(g.fecha)}</span> · {resumen(g)}
                        {g.responsable && ` · ${g.responsable}`}
                      </p>
                    </div>
                    {esOperador && (
                      <BotonAccion action={completarEvento.bind(null, slug, g.grupoId)} className="btn-secondary">
                        <CheckCircle2 className="size-4" aria-hidden />Hecha
                      </BotonAccion>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Historial" icono={ClipboardList}>
            {hechas.length === 0 ? (
              <Vacio icono={ClipboardList} titulo="Sin labores registradas" texto="Registra siembras, chapias o cosechas para llevar los días desde cada labor." />
            ) : (
              <Tabla>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Labor</th>
                    <th>Potreros</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Costo</th>
                    {esAdmin && <th><span className="sr-only">Acciones</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {hechas.map((g) => (
                    <tr key={g.grupoId}>
                      <td className="num whitespace-nowrap">{fechaCortaCR(g.fecha)}</td>
                      <td>
                        <span className="font-medium">{g.titulo ?? TIPOS_EVENTO[g.tipo as TipoEvento].label}</span>
                        {g.titulo && <span className="block text-xs text-muted">{TIPOS_EVENTO[g.tipo as TipoEvento].label}</span>}
                        {g.notas && <span className="block max-w-xs truncate text-xs text-muted">{g.notas}</span>}
                      </td>
                      <td className="max-w-[220px] truncate text-muted">{resumen(g)}</td>
                      <td className="num text-right">{g.cantidad ? `${formatNum(Number(g.cantidad), 1)} ${g.unidad ?? ""}` : "—"}</td>
                      <td className="num text-right">{formatColones(g.costo)}</td>
                      {esAdmin && (
                        <td>
                          <BotonAccion action={eliminarEvento.bind(null, slug, g.grupoId)} className="btn-ghost min-h-9 px-2" confirmar="¿Eliminar esta labor de todos sus potreros?">
                            <Trash2 className="size-4" aria-hidden />
                            <span className="sr-only">Eliminar</span>
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

        {esOperador && potreros.length > 0 && (
          <Card titulo="Registrar labor" icono={Plus} className="self-start">
            <ActionForm action={registrarEvento.bind(null, slug)}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Labor" name="tipo" className="col-span-2">
                  <select className="input" defaultValue="chapia">
                    {Object.entries(TIPOS_EVENTO).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Detalle" name="titulo" className="col-span-2" hint="Ej. Resiembra con Mulato II, pacas de Transvala">
                  <input className="input" placeholder="Opcional" />
                </Field>
                <Field label="Fecha" name="fecha">
                  <input className="input" type="date" defaultValue={hoy} />
                </Field>
                <Field label="Costo total (₡)" name="costo">
                  <input className="input" type="number" inputMode="decimal" min={0} step="any" placeholder="Jornales, maquinaria" />
                </Field>
                <Field label="Cantidad" name="cantidad">
                  <input className="input" type="number" inputMode="decimal" min={0} step="any" />
                </Field>
                <Field label="Unidad" name="unidad">
                  <input className="input" list="unidades-labor" placeholder="pacas, kg, jornales" />
                </Field>
                <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="pendiente" className="size-5 accent-[var(--primary)]" />
                  Es una tarea pendiente (solo para «Tarea»)
                </label>
                <Field label="Responsable" name="responsable" className="col-span-2">
                  <input className="input" placeholder="Opcional" />
                </Field>
                <Field label="Notas" name="notas" className="col-span-2">
                  <textarea className="input" rows={2} />
                </Field>
              </div>
              <fieldset>
                <legend className="label">Potreros</legend>
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border p-3">
                  {gruposPotreros.map((g) => (
                    <div key={g.etiqueta}>
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                        {g.color && <span className="size-2 rounded-sm" style={{ background: g.color }} aria-hidden />}
                        {g.etiqueta}
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-2">
                        {g.items.map((p) => (
                          <label key={p.id} className="flex min-h-10 items-center gap-2 text-sm">
                            <input type="checkbox" name="potreroIds" value={p.id} className="size-4 accent-[var(--primary)]" />
                            <span className="truncate">{p.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="hint">La cantidad y el costo se reparten entre los potreros marcados.</p>
              </fieldset>
              <Submit className="btn w-full">Guardar labor</Submit>
              <datalist id="unidades-labor">
                {["pacas", "kg", "t", "sacos", "jornales", "horas", "m", "kg semilla"].map((x) => <option key={x} value={x} />)}
              </datalist>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
