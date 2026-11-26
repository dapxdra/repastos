import Link from "next/link";
import { eq } from "drizzle-orm";
import { Fence, Layers3, Mountain, Plus, Sparkles, Trash2, Trees } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { modulosDeOrg, potrerosConEstado, zonasDeOrg, type PotreroConEstado } from "@/lib/consultas";
import { MODULOS_SUGERIDOS, TIPOS_ZONA, TIPOS_ZONA_IDS, descansoQuePermite, detalleEstado, formatArea, simboloUnidad, formatNum, plural } from "@/lib/dominio";
import { Card, EstadoBadge, ModuloChip, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { MarcarGrupo, SelectorColor } from "@/components/modulos";
import { actualizarModulo, asignarModulo, calcularAltitudes, crearModulo, crearModulosSugeridos, crearPotrero, eliminarModulo } from "../actions";

export const metadata = { title: "Potreros" };

const promedio = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export default async function Potreros({ params }: PageProps<"/app/[slug]/potreros">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const u = org.unidadArea;
  const esAdmin = puede(rol, "administrador");
  const [potreros, fincas, modulos, zonas] = await Promise.all([
    potrerosConEstado(org.id),
    db
      .select({ id: schema.fincas.id, nombre: schema.fincas.nombre, areaHa: schema.fincas.areaHa })
      .from(schema.fincas)
      .where(eq(schema.fincas.orgId, org.id))
      .orderBy(schema.fincas.nombre),
    modulosDeOrg(org.id),
    zonasDeOrg(org.id),
  ]);

  const grupos: { key: string; modulo: (typeof modulos)[number] | null; items: PotreroConEstado[] }[] = [
    ...modulos.map((m) => ({ key: m.id, modulo: m, items: potreros.filter((p) => p.moduloId === m.id) })),
    { key: "sin-modulo", modulo: null, items: potreros.filter((p) => !p.moduloId) },
  ].filter((g) => g.items.length > 0);
  const area = (xs: PotreroConEstado[]) => xs.reduce((s, p) => s + (p.areaUtilHa ?? 0), 0);

  // Uso del suelo por finca: lo pastoreable frente a bosque, caminos, agua, instalaciones…
  const usoSuelo = fincas
    .map((f) => {
      const ps = potreros.filter((p) => p.fincaId === f.id);
      const zs = zonas.filter((z) => z.fincaId === f.id);
      const pastoreable = area(ps);
      const porTipo = TIPOS_ZONA_IDS.map((t) => ({ t, ha: zs.filter((z) => z.tipo === t).reduce((s, z) => s + z.areaHa, 0) })).filter((x) => x.ha > 0);
      const descuentos = ps.reduce((s, p) => s + p.descuentoHa, 0);
      const mapeado = pastoreable + porTipo.reduce((s, x) => s + x.ha, 0) + descuentos;
      return { f, pastoreable, porTipo, descuentos, mapeado, total: f.areaHa == null ? null : Number(f.areaHa) };
    })
    .filter((x) => x.mapeado > 0);

  const tabla = (
    <Tabla>
      <thead>
        <tr>
          {esAdmin && <th className="w-10"><span className="sr-only">Marcar</span></th>}
          <th>Potrero</th>
          <th>Estado</th>
          <th>Pasto</th>
          <th className="text-right">Área aprovechable</th>
          <th className="text-right">Aforo</th>
        </tr>
      </thead>
      {grupos.map((g) => {
        const ocup = Math.round(promedio(g.items.map((p) => p.diasOcupacionObjetivo)));
        const desc = Math.round(promedio(g.items.map((p) => p.diasDescansoObjetivo)));
        const permite = descansoQuePermite(g.items.length, ocup);
        return (
          <tbody key={g.key} data-testid={`grupo-${g.modulo?.nombre ?? "sin-modulo"}`}>
            <tr className="bg-surface-2/70">
              {esAdmin && (
                <td>
                  <MarcarGrupo grupo={g.key} etiqueta={`Marcar todos los potreros de ${g.modulo?.nombre ?? "sin módulo"}`} />
                </td>
              )}
              <td colSpan={5}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ModuloChip modulo={g.modulo} />
                  <span className="text-xs text-muted">
                    {plural(g.items.length, "potrero")} · <span className="num">{formatArea(area(g.items), u, 1)}</span>
                    {g.modulo && g.items.length > 1 && (
                      <>
                        {" · "}
                        <span className={permite < desc ? "font-semibold text-warning" : ""}>
                          rotando {ocup} d por potrero, cada uno descansa {permite} d (objetivo {desc})
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </td>
            </tr>
            {g.items.map((p) => (
              <tr key={p.id}>
                {esAdmin && (
                  <td>
                    <input type="checkbox" name="potreroIds" value={p.id} data-grupo={g.key} className="size-5 accent-[var(--primary)]" aria-label={`Marcar ${p.nombre}`} />
                  </td>
                )}
                <td>
                  <Link href={`/app/${slug}/potreros/${p.id}`} className="font-medium hover:text-primary">{p.nombre}</Link>
                  <span className="block text-xs text-muted">{detalleEstado(p)}</span>
                </td>
                <td><EstadoBadge estado={p.estado} /></td>
                <td className="text-muted">{p.tipoPasto ?? "—"}</td>
                <td className="num text-right">
                  {formatArea(p.areaUtilHa, u)}
                  {p.areaHa != null && p.areaUtilHa != null && p.areaHa - p.areaUtilHa > 0.005 && (
                    <span className="block text-xs text-muted" title="Área total del potrero; se descuentan bosque, caminos y otras áreas no pastoreables">
                      de {formatArea(p.areaHa, u)}
                    </span>
                  )}
                </td>
                <td className="num text-right">{p.ultimoAforo ? `${formatNum(p.ultimoAforo.kgMsHa, 0)} kg` : "—"}</td>
              </tr>
            ))}
          </tbody>
        );
      })}
    </Tabla>
  );

  return (
    <>
      <PageHeader
        titulo="Potreros"
        descripcion="Potreros agrupados por módulo de pastoreo: cada hato rota dentro de su módulo."
        acciones={<Link href={`/app/${slug}/mapa`} className="btn-secondary">Dibujar o importar en el mapa</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card titulo={plural(potreros.length, "potrero")} icono={Fence}>
          {potreros.length === 0 ? (
            <Vacio icono={Fence} titulo="Sin potreros" texto="Dibújalos o impórtalos en el mapa, o agrégalos con el formulario." />
          ) : esAdmin ? (
            <ActionForm action={asignarModulo.bind(null, slug)} className="space-y-3">
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
                <Field label="Asignar los potreros marcados a" name="moduloId" className="min-w-52 flex-1">
                  <select className="input" defaultValue={modulos[0]?.id ?? ""}>
                    {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    <option value="">Sin módulo</option>
                  </select>
                </Field>
                <Submit className="btn">Asignar</Submit>
              </div>
              {tabla}
            </ActionForm>
          ) : (
            tabla
          )}
        </Card>

        <div className="space-y-4">
          {usoSuelo.length > 0 && (
            <Card titulo="Uso del suelo" icono={Trees}>
              <div className="space-y-4" data-testid="uso-suelo">
                {usoSuelo.map(({ f, pastoreable, porTipo, descuentos, mapeado, total }) => {
                  const base = Math.max(total ?? 0, mapeado);
                  const filas = [
                    { k: "pastoreable", label: "Pastoreable", color: "#9db54a", ha: pastoreable },
                    ...porTipo.map((x) => ({ k: x.t, label: TIPOS_ZONA[x.t].label.split(" (")[0], color: TIPOS_ZONA[x.t].color, ha: x.ha })),
                    ...(descuentos > 0 ? [{ k: "descuento", label: "Descontado a mano", color: "#a7a29a", ha: descuentos }] : []),
                    ...(total != null && total - mapeado > 0.05 ? [{ k: "sin", label: "Sin mapear", color: "transparent", ha: total - mapeado }] : []),
                  ];
                  return (
                    <div key={f.id}>
                      {fincas.length > 1 && <p className="mb-1 text-sm font-semibold">{f.nombre}</p>}
                      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border" aria-hidden>
                        {filas.map((x) => (
                          <span key={x.k} style={{ width: `${(x.ha / base) * 100}%`, background: x.color }} />
                        ))}
                      </div>
                      <dl className="mt-2 space-y-1 text-sm">
                        {filas.map((x) => (
                          <div key={x.k} className="flex items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-sm ring-1 ring-border" style={{ background: x.color }} aria-hidden />
                            <dt className={`flex-1 ${x.k === "pastoreable" ? "font-semibold" : "text-muted"}`}>{x.label}</dt>
                            <dd className="num">{formatArea(x.ha, u, 1)}</dd>
                            <dd className="num w-10 text-right text-xs text-muted">{formatNum((x.ha / base) * 100, 0)} %</dd>
                          </div>
                        ))}
                      </dl>
                      {total == null && (
                        <p className="hint mt-1">Anota el área total de la finca en Ajustes para ver cuánto falta por mapear.</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="hint mt-3">Marca bosque, caminos o quebradas en el mapa: se descuentan solos del potrero que los toque.</p>
            </Card>
          )}

          <Card titulo="Módulos por hato" icono={Layers3}>
            {modulos.length === 0 ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted">
                  Agrupa los potreros por hato (por ejemplo, Ordeño AM, Ordeño PM o Secas) para que cada lote rote dentro de su módulo.
                </p>
                {esAdmin && (
                  <BotonAccion action={crearModulosSugeridos.bind(null, slug)} className="btn-secondary w-full">
                    <Sparkles className="size-4" aria-hidden /> Crear {MODULOS_SUGERIDOS[org.tipoProduccion].join(", ")}
                  </BotonAccion>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border" aria-label="Módulos">
                {modulos.map((m) => {
                  const items = potreros.filter((p) => p.moduloId === m.id);
                  return (
                    <li key={m.id} className="py-2.5">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg [&::-webkit-details-marker]:hidden">
                          <span className="size-4 shrink-0 rounded" style={{ background: m.color }} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{m.nombre}</span>
                            <span className="block text-xs text-muted">
                              {plural(items.length, "potrero")} · <span className="num">{formatArea(area(items), u, 1)}</span>
                            </span>
                          </span>
                          {esAdmin && <span className="text-xs font-medium text-primary group-open:hidden">Editar</span>}
                        </summary>
                        {esAdmin && (
                          <div className="mt-3 space-y-3 rounded-xl bg-surface-2 p-3">
                            <ActionForm action={actualizarModulo.bind(null, slug, m.id)} className="space-y-3" version={`${m.nombre}|${m.color}`}>
                              <Field label="Nombre" name="nombre" required><input className="input" defaultValue={m.nombre} maxLength={60} /></Field>
                              <SelectorColor valor={m.color} />
                              <Submit className="btn w-full">Guardar módulo</Submit>
                            </ActionForm>
                            <BotonAccion
                              action={eliminarModulo.bind(null, slug, m.id)}
                              className="btn-ghost w-full text-danger"
                              confirmar={`¿Eliminar el módulo ${m.nombre}? Sus potreros y lotes quedan sin módulo; no se borran.`}
                            >
                              <Trash2 className="size-4" aria-hidden /> Eliminar módulo
                            </BotonAccion>
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
            {esAdmin && (
              <details className="mt-3 border-t border-border pt-3">
                <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <Plus className="size-4" aria-hidden /> Nuevo módulo
                </summary>
                <ActionForm action={crearModulo.bind(null, slug)} className="mt-3 space-y-3">
                  <Field label="Nombre del módulo" name="nombre" required><input className="input" placeholder="Ej. Ordeño AM" maxLength={60} /></Field>
                  <SelectorColor valor={undefined} />
                  <Submit className="btn w-full">Crear módulo</Submit>
                </ActionForm>
              </details>
            )}
          </Card>

          {esAdmin && fincas.length > 0 && (
            <Card titulo="Agregar sin mapa" icono={Plus} className="h-fit">
              <ActionForm action={crearPotrero.bind(null, slug)}>
                <Field label="Nombre" name="nombre" required><input className="input" /></Field>
                {fincas.length > 1 ? (
                  <Field label="Finca" name="fincaId"><select className="input">{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></Field>
                ) : (
                  <input type="hidden" name="fincaId" value={fincas[0].id} />
                )}
                {modulos.length > 0 && (
                  <Field label="Módulo" name="moduloId">
                    <select className="input">
                      <option value="">Sin módulo</option>
                      {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Tipo de pasto" name="tipoPasto">
                  <input className="input" list="pastos-cr" />
                </Field>
                <Field label={`Área (${simboloUnidad(u)})`} name="area"><input className="input" type="number" inputMode="decimal" step="any" min={0} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Días descanso" name="diasDescanso"><input className="input" type="number" min={1} defaultValue={30} /></Field>
                  <Field label="Días ocupación" name="diasOcupacion"><input className="input" type="number" min={1} defaultValue={1} /></Field>
                </div>
                <Submit className="btn w-full">Agregar potrero</Submit>
              </ActionForm>
            </Card>
          )}

          {esAdmin && potreros.some((p) => p.tieneGeometria) && (
            <Card titulo="Altitud por potrero" icono={Mountain} className="h-fit">
              <p className="mb-3 text-sm text-muted">
                En fincas de ladera cada 100 m de desnivel son ~0,6 °C y varios días más de descanso. Calcula la altitud de los potreros
                dibujados con el modelo de elevación Copernicus (se envía solo el punto central de cada potrero a Open-Meteo).
                {" "}{potreros.filter((p) => p.tieneGeometria && p.altitudMsnm == null).length} de {potreros.filter((p) => p.tieneGeometria).length} potreros dibujados sin altitud.
              </p>
              <ActionForm action={calcularAltitudes.bind(null, slug)} className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="todos" value="1" className="size-4 accent-[var(--primary)]" />
                  Recalcular también los que ya tienen altitud
                </label>
                <Submit className="btn-secondary w-full"><Mountain className="size-4" aria-hidden />Calcular altitudes</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
