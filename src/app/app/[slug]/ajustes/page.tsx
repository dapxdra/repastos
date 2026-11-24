import { eq } from "drizzle-orm";
import { Building2, Home, Users } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { PROVINCIAS_CR, TIPOS_PRODUCCION, formatArea } from "@/lib/dominio";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, Field, Submit } from "@/components/forms";
import { REGIMENES_LLUVIA, regimenSugerido } from "@/lib/forraje";
import { actualizarFinca, actualizarOrganizacion, agregarMiembro, crearFinca } from "../actions";

export const metadata = { title: "Ajustes" };

const ROLES = {
  propietario: "Todo, incluida la gestión del equipo",
  administrador: "Configura fincas, potreros, lotes e insumos",
  operador: "Registra movimientos, aplicaciones, aforos y lluvia",
  lector: "Solo consulta",
};

export default async function Ajustes({ params }: PageProps<"/app/[slug]/ajustes">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esAdmin = puede(rol, "administrador");
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
                <span className="truncate">{m.email}</span>
                <span className="chip bg-surface-2 capitalize text-muted">{m.rol}</span>
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
      </div>
    </>
  );
}
