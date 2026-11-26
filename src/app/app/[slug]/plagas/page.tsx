import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { AlertTriangle, Bug, Info, Plus, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { fechaCortaCR, formatNum, hoyCR, sumarDias } from "@/lib/dominio";
import { NIVELES_PLAGA, PLAGAS, nivelPlaga, type Plaga } from "@/lib/plagas";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { eliminarMonitoreo, registrarMonitoreo } from "../actions";

export const metadata = { title: "Plagas" };

/** Un foco sigue activo si su último conteo, de hace 21 días o menos, supera el umbral de alerta. */
const DIAS_FOCO = 21;

export default async function Plagas({ params }: PageProps<"/app/[slug]/plagas">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const esAdmin = puede(rol, "administrador");
  const hoy = hoyCR();

  const [monitoreos, potreros] = await Promise.all([
    db
      .select({
        id: schema.monitoreosPlaga.id,
        fecha: schema.monitoreosPlaga.fecha,
        plaga: schema.monitoreosPlaga.plaga,
        conteo: schema.monitoreosPlaga.conteo,
        notas: schema.monitoreosPlaga.notas,
        potreroId: schema.monitoreosPlaga.potreroId,
        potrero: schema.potreros.nombre,
      })
      .from(schema.monitoreosPlaga)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.monitoreosPlaga.potreroId))
      .where(and(eq(schema.monitoreosPlaga.orgId, org.id), gte(schema.monitoreosPlaga.fecha, sumarDias(hoy, -365))))
      .orderBy(desc(schema.monitoreosPlaga.fecha), desc(schema.monitoreosPlaga.creadoEn))
      .limit(300),
    db
      .select({ id: schema.potreros.id, nombre: schema.potreros.nombre })
      .from(schema.potreros)
      .where(eq(schema.potreros.orgId, org.id))
      .orderBy(schema.potreros.nombre),
  ]);

  // Último conteo de cada plaga en cada potrero → focos activos
  const ultimos = monitoreos.filter((m, i, xs) => xs.findIndex((x) => x.potreroId === m.potreroId && x.plaga === m.plaga) === i);
  const focos = ultimos
    .map((m) => ({ ...m, nivel: nivelPlaga(m.plaga, Number(m.conteo)) }))
    .filter((m) => m.fecha >= sumarDias(hoy, -DIAS_FOCO) && (m.nivel === "accion" || m.nivel === "alerta"))
    .sort((a, b) => (a.nivel === b.nivel ? b.fecha.localeCompare(a.fecha) : a.nivel === "accion" ? -1 : 1));

  return (
    <>
      <PageHeader titulo="Plagas" descripcion="Monitoreo de salivazo, gusano medidor y gusano soldado por potrero, con umbrales para decidir cuándo actuar." />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card titulo={`Focos activos (últimos ${DIAS_FOCO} días)`} icono={AlertTriangle}>
            {focos.length === 0 ? (
              <p className="text-sm text-muted">Ningún potrero sobre el umbral de alerta.</p>
            ) : (
              <ul className="space-y-2">
                {focos.map((f) => (
                  <li key={f.id} className={`rounded-xl px-3 py-2 text-sm ${NIVELES_PLAGA[f.nivel!].clase}`}>
                    <p className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                      <Link href={`/app/${slug}/potreros/${f.potreroId}`} className="underline-offset-2 hover:underline">{f.potrero}</Link>
                      <span>{NIVELES_PLAGA[f.nivel!].label}</span>
                    </p>
                    <p>
                      {PLAGAS[f.plaga].label}: <b className="num">{formatNum(Number(f.conteo), 1)}</b> {PLAGAS[f.plaga].unidad} · {fechaCortaCR(f.fecha)}
                    </p>
                    {f.nivel === "accion" && <p className="mt-1 text-xs opacity-90">{PLAGAS[f.plaga].manejo}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Monitoreos" icono={Bug}>
            {monitoreos.length === 0 ? (
              <Vacio icono={Bug} titulo="Sin monitoreos" texto="Revisa los potreros al inicio de las lluvias, cuando aparece el salivazo." />
            ) : (
              <Tabla>
                <thead>
                  <tr><th>Fecha</th><th>Potrero</th><th>Plaga</th><th className="text-right">Conteo</th><th>Nivel</th>{esAdmin && <th><span className="sr-only">Acciones</span></th>}</tr>
                </thead>
                <tbody>
                  {monitoreos.slice(0, 60).map((m) => {
                    const nv = nivelPlaga(m.plaga, Number(m.conteo));
                    return (
                      <tr key={m.id}>
                        <td className="num whitespace-nowrap">{fechaCortaCR(m.fecha)}</td>
                        <td className="font-medium">{m.potrero}</td>
                        <td>{PLAGAS[m.plaga].label}{m.notas && <span className="block text-xs text-muted">{m.notas}</span>}</td>
                        <td className="num text-right">{formatNum(Number(m.conteo), 1)}</td>
                        <td>{nv ? <span className={`chip ${NIVELES_PLAGA[nv].clase}`}>{NIVELES_PLAGA[nv].label}</span> : "—"}</td>
                        {esAdmin && (
                          <td>
                            <BotonAccion action={eliminarMonitoreo.bind(null, slug, m.id)} className="btn-ghost min-h-9 px-2" confirmar="¿Eliminar este monitoreo?">
                              <Trash2 className="size-4" aria-hidden /><span className="sr-only">Eliminar</span>
                            </BotonAccion>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {esOperador && potreros.length > 0 && (
            <Card titulo="Registrar monitoreo" icono={Plus}>
              <ActionForm action={registrarMonitoreo.bind(null, slug)} className="space-y-3">
                <Field label="Potrero" name="potreroId">
                  <select className="input">{potreros.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                </Field>
                <Field label="Plaga" name="plaga">
                  <select className="input">
                    {(Object.keys(PLAGAS) as Plaga[]).map((k) => <option key={k} value={k}>{PLAGAS[k].label} — {PLAGAS[k].unidad}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Conteo promedio" name="conteo" required>
                    <input className="input" type="number" inputMode="decimal" step="any" min={0} />
                  </Field>
                  <Field label="Fecha" name="fecha">
                    <input className="input" type="date" max={hoy} defaultValue={hoy} />
                  </Field>
                </div>
                <Field label="Notas" name="notas">
                  <input className="input" placeholder="Ej. daño amarillento en manchones" />
                </Field>
                <Submit className="btn w-full">Guardar monitoreo</Submit>
              </ActionForm>
            </Card>
          )}

          <Card titulo="Cómo muestrear" icono={Info}>
            <ul className="space-y-3 text-sm">
              {(Object.keys(PLAGAS) as Plaga[])
                .filter((k) => PLAGAS[k].accion != null)
                .map((k) => (
                  <li key={k}>
                    <p className="font-semibold">{PLAGAS[k].label}</p>
                    <p className="text-muted">{PLAGAS[k].muestreo}</p>
                    <p className="num mt-0.5 text-xs">
                      Vigilar desde <b>{PLAGAS[k].alerta}</b> · actuar desde <b>{PLAGAS[k].accion}</b> {PLAGAS[k].unidad}
                    </p>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Umbrales orientativos para priorizar potreros; ajústelos con su técnico. Los insecticidas deben estar registrados ante el SFE y su carencia anotada en Insumos.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
