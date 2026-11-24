import { eq } from "drizzle-orm";
import { Building2, CreditCard, Download, Home, ShieldCheck, Users } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { PROVINCIAS_CR, TIPOS_PRODUCCION, fechaCR, formatArea, hoyCR } from "@/lib/dominio";
import { ESTADOS_SUSCRIPCION, PLANES, estadoEfectivo, suscripcionesActivas } from "@/lib/planes";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { REGIMENES_LLUVIA, regimenSugerido } from "@/lib/forraje";
import { actualizarFinca, actualizarOrganizacion, agregarMiembro, crearFinca, eliminarOrganizacion, quitarMiembro, salirDeGanaderia } from "../actions";

export const metadata = { title: "Ajustes" };

const ROLES = {
  propietario: "Todo, incluida la gestión del equipo",
  administrador: "Configura fincas, potreros, lotes e insumos",
  operador: "Registra movimientos, aplicaciones, aforos y lluvia",
  lector: "Solo consulta",
};

export default async function Ajustes({ params }: PageProps<"/app/[slug]/ajustes">) {
  const { slug } = await params;
  const { org, rol, user } = await requireOrg(slug);
  const esAdmin = puede(rol, "administrador");
  const esPropietario = rol === "propietario";
  const estado = estadoEfectivo(org, hoyCR());
  const plan = PLANES[org.plan];
  const [fincas, miembros] = await Promise.all([
    db.select().from(schema.fincas).where(eq(schema.fincas.orgId, org.id)).orderBy(schema.fincas.nombre),
    db.select().from(schema.membresias).where(eq(schema.membresias.orgId, org.id)).orderBy(schema.membresias.email),
  ]);

  return (
    <>
      <PageHeader titulo="Ajustes" descripcion="Datos de la ganadería, fincas y equipo de trabajo." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Ganadería" icono={Building2}>
          <ActionForm action={actualizarOrganizacion.bind(null, slug)} className="space-y-4" version={`${org.nombre}|${org.tipoProduccion}|${org.unidadArea}`}>
            <fieldset disabled={!esAdmin} className="space-y-4">
              <Field label="Nombre" name="nombre" required><input className="input" defaultValue={org.nombre} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Producción" name="tipoProduccion">
                  <select className="input" defaultValue={org.tipoProduccion}>{Object.entries(TIPOS_PRODUCCION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </Field>
                <Field label="Unidad de área" name="unidadArea" hint="1 mz = 0,6987 ha">
                  <select className="input" defaultValue={org.unidadArea}><option value="ha">Hectáreas (ha)</option><option value="mz">Manzanas (mz)</option></select>
                </Field>
              </div>
            </fieldset>
            {esAdmin && <Submit>Guardar</Submit>}
          </ActionForm>
        </Card>

        <Card titulo="Fincas" icono={Home}>
          <ul className="mb-4 divide-y divide-border text-sm">
            {fincas.length === 0 && <li className="py-2 text-muted">Aún no hay fincas.</li>}
            {fincas.map((f) => {
              const regimen = f.regimenLluvia ?? regimenSugerido(f.provincia, f.canton);
              return (
                <li key={f.id} className="py-2.5">
                  <div className="flex justify-between gap-2">
                    <span>
                      <b className="font-semibold">{f.nombre}</b>
                      <span className="block text-xs text-muted">
                        {[f.canton, f.provincia].filter(Boolean).join(", ") || f.ubicacion || "Sin ubicación"} · {f.altitudMsnm != null ? `${f.altitudMsnm} msnm` : "altitud sin definir"} · {REGIMENES_LLUVIA[regimen].label}
                      </span>
                    </span>
                    <span className="num text-muted">{formatArea(f.areaHa, org.unidadArea, 1)}</span>
                  </div>
                  {esAdmin && (
                    <details className="mt-1">
                      <summary className="btn-ghost -ml-3 cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">Editar finca y clima</summary>
                      <ActionForm action={actualizarFinca.bind(null, slug, f.id)} className="mt-2 grid grid-cols-2 gap-3" version={[f.nombre, f.provincia, f.canton, f.altitudMsnm, f.regimenLluvia].join("|")}>
                        <Field label="Nombre" name="nombre" required className="col-span-2"><input className="input" defaultValue={f.nombre} /></Field>
                        <Field label="Provincia" name="provincia">
                          <select className="input" defaultValue={f.provincia ?? ""}><option value="">—</option>{PROVINCIAS_CR.map((x) => <option key={x}>{x}</option>)}</select>
                        </Field>
                        <Field label="Cantón" name="canton"><input className="input" defaultValue={f.canton ?? ""} /></Field>
                        <Field label="Altitud (msnm)" name="altitud" hint="Define la temperatura y el rebrote">
                          <input className="input" type="number" inputMode="numeric" min={0} max={3800} step={10} defaultValue={f.altitudMsnm ?? ""} placeholder="300" />
                        </Field>
                        <Field label="Régimen de lluvias" name="regimen">
                          <select className="input" defaultValue={f.regimenLluvia ?? ""}>
                            <option value="">Según provincia ({REGIMENES_LLUVIA[regimenSugerido(f.provincia, f.canton)].label})</option>
                            {Object.entries(REGIMENES_LLUVIA).map(([k, r]) => <option key={k} value={k} title={r.descripcion}>{r.label}</option>)}
                          </select>
                        </Field>
                        <div className="col-span-2"><Submit>Guardar finca</Submit></div>
                      </ActionForm>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          {esAdmin && (
            <ActionForm action={crearFinca.bind(null, slug)} className="grid grid-cols-2 gap-3 border-t border-border pt-4">
              <Field label="Nombre de la finca" name="nombre" required className="col-span-2"><input className="input" placeholder="Ej. Finca El Roble" /></Field>
              <Field label="Provincia" name="provincia">
                <select className="input" defaultValue=""><option value="">—</option>{PROVINCIAS_CR.map((x) => <option key={x}>{x}</option>)}</select>
              </Field>
              <Field label="Cantón" name="canton"><input className="input" placeholder="Ej. San Carlos" /></Field>
              <Field label={`Área total (${org.unidadArea})`} name="area"><input className="input" type="number" step="any" min={0} /></Field>
              <Field label="Referencia" name="ubicacion"><input className="input" placeholder="Opcional" /></Field>
              <Field label="Altitud (msnm)" name="altitud" hint="Para estimar el rebrote del pasto">
                <input className="input" type="number" inputMode="numeric" min={0} max={3800} step={10} placeholder="Ej. 1800" />
              </Field>
              <Field label="Régimen de lluvias" name="regimen">
                <select className="input" defaultValue="">
                  <option value="">Según provincia</option>
                  {Object.entries(REGIMENES_LLUVIA).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                </select>
              </Field>
              <div className="col-span-2"><Submit>Agregar finca</Submit></div>
            </ActionForm>
          )}
        </Card>

        <Card titulo="Equipo" icono={Users} className="lg:col-span-2">
          <ul className="mb-4 divide-y divide-border text-sm">
            {miembros.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate">{m.email}{m.userId === user.id && <span className="text-muted"> (tú)</span>}</span>
                <span className="chip bg-surface-2 capitalize text-muted">{m.rol}</span>
                {esAdmin && m.userId !== user.id && m.rol !== "propietario" && (m.rol !== "administrador" || esPropietario) && (
                  <BotonAccion action={quitarMiembro.bind(null, slug, m.id)} className="btn-ghost min-h-9 px-2 text-danger" confirmar={`¿Quitar el acceso de ${m.email} a esta ganadería?`}>
                    Quitar
                  </BotonAccion>
                )}
              </li>
            ))}
          </ul>
          {esAdmin && (
            <ActionForm action={agregarMiembro.bind(null, slug)} className="grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_200px_auto]">
              <Field label="Correo" name="email" required hint="La persona debe haber creado su cuenta"><input className="input" type="email" autoComplete="off" /></Field>
              <Field label="Rol" name="rol">
                <select className="input" defaultValue="operador">{(["administrador", "operador", "lector"] as const).map((r) => <option key={r} value={r} title={ROLES[r]}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
              </Field>
              <Submit>Agregar</Submit>
            </ActionForm>
          )}
          <dl className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
            {Object.entries(ROLES).map(([r, d]) => <div key={r}><dt className="inline font-semibold capitalize text-foreground">{r}: </dt><dd className="inline">{d}</dd></div>)}
          </dl>
        </Card>

        <Card titulo="Membresía" icono={CreditCard}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Plan</dt><dd className="font-semibold">{plan.nombre}</dd></div>
            <div><dt className="text-muted">Estado</dt><dd className="font-semibold">{ESTADOS_SUSCRIPCION[estado]}</dd></div>
            {estado === "prueba" && org.pruebaHasta && <div><dt className="text-muted">Prueba hasta</dt><dd className="font-semibold">{fechaCR(org.pruebaHasta)}</dd></div>}
            {org.suscripcionVence && <div><dt className="text-muted">Próxima renovación</dt><dd className="font-semibold">{fechaCR(org.suscripcionVence.toISOString().slice(0, 10))}</dd></div>}
            <div className="col-span-2">
              <dt className="text-muted">Incluye</dt>
              <dd>{(["potreros", "fincas", "miembros"] as const).map((r) => `${plan.limites[r] ?? "Sin límite de"} ${r}`).join(" · ")}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">
            {suscripcionesActivas()
              ? "Si la membresía vence, la ganadería queda en solo lectura: podrás consultar y exportar tus datos."
              : "El pago en línea de membresías estará disponible pronto. Mientras tanto, todas las funciones están habilitadas."}
          </p>
        </Card>

        <Card titulo="Tus datos" icono={ShieldCheck}>
          <div className="space-y-4 text-sm">
            {esAdmin && (
              <div>
                <a href={`/api/orgs/${slug}/exportar`} className="btn-secondary" download><Download className="size-4" aria-hidden />Descargar todos los datos (JSON)</a>
                <p className="hint">Fincas, potreros, mapas, registros y equipo de esta ganadería.</p>
              </div>
            )}
            {!esPropietario && (
              <BotonAccion action={salirDeGanaderia.bind(null, slug)} className="btn-secondary" confirmar="¿Salir de esta ganadería? Perderás el acceso hasta que te vuelvan a agregar.">
                Salir de esta ganadería
              </BotonAccion>
            )}
            {esPropietario && (
              <details className="rounded-xl border border-danger/40 p-3">
                <summary className="cursor-pointer font-semibold text-danger">Eliminar la ganadería</summary>
                <ActionForm action={eliminarOrganizacion.bind(null, slug)} className="mt-3 space-y-3">
                  <p>Se borrarán <b>para siempre</b> todas las fincas, potreros, mapas, registros y archivos, y nadie del equipo tendrá acceso. Descarga tus datos antes si los necesitas.</p>
                  <Field label={`Escribe «${org.nombre}» para confirmar`} name="confirmacion" required>
                    <input className="input" autoComplete="off" />
                  </Field>
                  <Submit className="btn bg-danger text-background hover:bg-danger/90">Eliminar definitivamente</Submit>
                </ActionForm>
              </details>
            )}
            <p className="text-xs text-muted">
              Consulta los <a href="/terminos" className="underline">Términos</a> y la <a href="/privacidad" className="underline">Política de privacidad</a>.
              {org.terminosVersion && ` Aceptados (versión ${org.terminosVersion}).`}
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
