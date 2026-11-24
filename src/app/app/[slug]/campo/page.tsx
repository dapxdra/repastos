import { and, desc, eq, gte, sql } from "drizzle-orm";
import { CloudRain, Ruler } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { METODOS_AFORO, fechaCortaCR, formatNum, hoyCR, sumarDias } from "@/lib/dominio";
import { Card, PageHeader, Tabla } from "@/components/ui";
import { ActionForm, Field, Submit } from "@/components/forms";
import { calibracionAlturaOrg } from "@/lib/consultas";
import { kgDesdeAltura, parametrosPasto } from "@/lib/forraje";
import { registrarAforo, registrarLluvia } from "../actions";

export const metadata = { title: "Aforos y lluvia" };

export default async function Campo({ params }: PageProps<"/app/[slug]/campo">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esOperador = puede(rol, "operador");
  const hoy = hoyCR();
  const desde = sumarDias(hoy, -29);

  const [potreros, fincas, aforos, lluvias, factor] = await Promise.all([
    db
      .select({ id: schema.potreros.id, nombre: schema.potreros.nombre, tipoPasto: schema.potreros.tipoPasto })
      .from(schema.potreros)
      .where(eq(schema.potreros.orgId, org.id))
      .orderBy(sql`length(${schema.potreros.nombre})`, schema.potreros.nombre),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)),
    db
      .select({ id: schema.aforos.id, fecha: schema.aforos.fecha, kg: schema.aforos.kgMsHa, altura: schema.aforos.alturaCm, hojas: schema.aforos.hojas, metodo: schema.aforos.metodo, potrero: schema.potreros.nombre })
      .from(schema.aforos)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.aforos.potreroId))
      .where(eq(schema.aforos.orgId, org.id))
      .orderBy(desc(schema.aforos.fecha), desc(schema.aforos.creadoEn))
      .limit(30),
    db
      .select({ fecha: sql<string>`${schema.lluvias.fecha}::text`, mm: sql<number>`sum(${schema.lluvias.mm})::float` })
      .from(schema.lluvias)
      .where(and(eq(schema.lluvias.orgId, org.id), gte(schema.lluvias.fecha, desde)))
      .groupBy(schema.lluvias.fecha),
    calibracionAlturaOrg(org.id),
  ]);

  // Alturas de referencia de los pastos que hay en la finca
  const especies = [...new Map(potreros.map((p) => parametrosPasto(p.tipoPasto)).map((pp) => [pp.clave, pp])).values()];
  const porDia = new Map(lluvias.map((l) => [l.fecha, l.mm]));
  const dias = Array.from({ length: 30 }, (_, i) => sumarDias(desde, i));
  const max = Math.max(10, ...lluvias.map((l) => l.mm));
  const total = lluvias.reduce((s, l) => s + l.mm, 0);

  return (
    <>
      <PageHeader titulo="Aforos y lluvia" descripcion="Mide el forraje disponible antes de cada pastoreo y lleva el registro del pluviómetro." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Lluvia, últimos 30 días" icono={CloudRain} acciones={<span className="num text-sm font-semibold">{formatNum(total, 0)} mm</span>}>
          <figure>
            <div className="flex h-36 items-end gap-[3px]" role="img" aria-label={`Lluvia diaria de los últimos 30 días, total ${formatNum(total, 0)} mm`}>
              {dias.map((d) => {
                const mm = porDia.get(d) ?? 0;
                return (
                  <div key={d} className="group relative flex h-full flex-1 items-end">
                    <div className="w-full rounded-t-[3px] bg-sky/80" style={{ height: `${Math.max(mm > 0 ? 3 : 0, (mm / max) * 100)}%` }} />
                    <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[11px] whitespace-nowrap text-background group-hover:block">
                      {fechaCortaCR(d)}: {formatNum(mm)} mm
                    </span>
                  </div>
                );
              })}
            </div>
            <figcaption className="mt-1 flex justify-between text-xs text-muted"><span>{fechaCortaCR(desde)}</span><span>Hoy</span></figcaption>
          </figure>
          {esOperador && fincas.length > 0 && (
            <ActionForm action={registrarLluvia.bind(null, slug)} className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
              {fincas.length > 1 ? (
                <Field label="Finca" name="fincaId" className="col-span-2 sm:col-span-3">
                  <select className="input">{fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select>
                </Field>
              ) : (
                <input type="hidden" name="fincaId" value={fincas[0].id} />
              )}
              <Field label="Fecha" name="fecha">
                <input className="input" type="date" defaultValue={hoy} max={hoy} />
              </Field>
              <Field label="Milímetros" name="mm" required>
                <input className="input" type="number" inputMode="decimal" min={0} step="0.1" />
              </Field>
              <Submit className="btn col-span-2 sm:col-span-1">Guardar</Submit>
            </ActionForm>
          )}
        </Card>

        <Card titulo="Registrar aforo" icono={Ruler}>
          {esOperador && potreros.length > 0 ? (
            <ActionForm action={registrarAforo.bind(null, slug)} className="grid grid-cols-2 gap-3">
              <Field label="Potrero" name="potreroId" className="col-span-2">
                <select className="input">
                  {potreros.map((x) => {
                    const pp = parametrosPasto(x.tipoPasto);
                    return <option key={x.id} value={x.id}>{x.nombre} — {pp.label}: entrar {pp.alturaEntrada} cm, salir {pp.alturaSalida} cm</option>;
                  })}
                </select>
              </Field>
              <Field label="Método" name="metodo">
                <select className="input" defaultValue="regla_altura">{Object.entries(METODOS_AFORO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
              <Field label="Fecha" name="fecha">
                <input className="input" type="date" defaultValue={hoy} max={hoy} />
              </Field>
              <Field label="Altura (cm)" name="alturaCm" hint="Regla parada en el suelo; mide en 20 puntos y anota el promedio">
                <input className="input" type="number" inputMode="decimal" min={0} step="any" />
              </Field>
              <Field label="kg MS/ha" name="kgMsHa" hint="Solo si pesaste (cuadro de corte o plato). Con regla se calcula de la altura">
                <input className="input" type="number" inputMode="decimal" min={0} step="any" />
              </Field>
              <Field label="Hojas por rebrote" name="hojas" hint="Hojas vivas en un tallo típico" className="col-span-2">
                <input className="input" type="number" inputMode="decimal" min={0} max={12} step="0.5" />
              </Field>
              <Submit className="btn col-span-2">Guardar aforo</Submit>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">Crea potreros para registrar aforos.</p>
          )}
        </Card>
      </div>

      {especies.length > 0 && (
        <Card titulo="Alturas de referencia" icono={Ruler} className="mt-4">
          <Tabla>
            <thead><tr><th>Pasto</th><th className="text-right">Entrar con</th><th className="text-right">Sacar con</th><th className="text-right">Hojas al entrar</th><th className="text-right">≈ kg MS/ha al entrar</th></tr></thead>
            <tbody>
              {especies.map((e) => (
                <tr key={e.clave}>
                  <td className="font-medium">{e.label}</td>
                  <td className="num text-right font-semibold text-primary">{e.alturaEntrada} cm</td>
                  <td className="num text-right font-semibold">{e.alturaSalida} cm</td>
                  <td className="num text-right">{formatNum(e.hojasObjetivo, 1)}</td>
                  <td className="num text-right text-muted">{formatNum(kgDesdeAltura(e, e.alturaEntrada, factor), 0)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <p className="mt-3 text-xs text-muted">
            {factor === 1
              ? "Valores de referencia. Para calibrar la regla a tu finca registra al menos 3 cuadros de corte anotando también la altura."
              : `Regla calibrada con tus cuadros de corte: la finca rinde ${formatNum(factor * 100, 0)} % de la referencia por cm.`}
          </p>
        </Card>
      )}

      <Card titulo="Aforos recientes" icono={Ruler} className="mt-4">
        {aforos.length === 0 ? (
          <p className="text-sm text-muted">Sin aforos registrados.</p>
        ) : (
          <Tabla>
            <thead><tr><th>Fecha</th><th>Potrero</th><th>Método</th><th className="text-right">kg MS/ha</th><th className="text-right">Altura</th><th className="text-right">Hojas</th></tr></thead>
            <tbody>
              {aforos.map((a) => (
                <tr key={a.id}>
                  <td className="num">{fechaCortaCR(a.fecha)}</td>
                  <td className="font-medium">{a.potrero}</td>
                  <td className="text-muted">{METODOS_AFORO[a.metodo]}</td>
                  <td className="num text-right font-semibold">{formatNum(Number(a.kg), 0)}</td>
                  <td className="num text-right">{a.altura ? `${formatNum(Number(a.altura))} cm` : "—"}</td>
                  <td className="num text-right">{a.hojas ? formatNum(Number(a.hojas), 1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Card>
    </>
  );
}
