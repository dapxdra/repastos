import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Hourglass, Sprout, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { potrerosConEstado } from "@/lib/consultas";
import {
  METODOS_APLICACION,
  TIPOS_PRODUCTO,
  dosisEnUnidad,
  fechaCortaCR,
  formatArea,
  formatColones,
  formatNum,
  hoyCR,
  type TipoProducto,
} from "@/lib/dominio";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { BotonAccion } from "@/components/forms";
import { FormAplicacion } from "./form-aplicacion";
import { eliminarAplicacion, registrarAplicacion } from "../actions";

export const metadata = { title: "Aplicaciones" };

export default async function Aplicaciones({ params }: PageProps<"/app/[slug]/aplicaciones">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const u = org.unidadArea;
  const hoy = hoyCR();

  const [productos, potreros, grupos] = await Promise.all([
    db.select().from(schema.productos).where(eq(schema.productos.orgId, org.id)).orderBy(schema.productos.tipo, schema.productos.nombre),
    potrerosConEstado(org.id),
    db
      .select({
        grupoId: schema.aplicaciones.grupoId,
        fecha: schema.aplicaciones.fecha,
        producto: schema.productos.nombre,
        tipo: schema.productos.tipo,
        unidad: schema.productos.unidad,
        metodo: schema.aplicaciones.metodo,
        dosisPorHa: sql<string>`max(${schema.aplicaciones.dosisPorHa})`,
        cantidad: sql<string>`sum(${schema.aplicaciones.cantidadTotal})`,
        costo: sql<string | null>`sum(${schema.aplicaciones.costoTotal})`,
        liberacion: sql<string>`max(${schema.aplicaciones.fechaLiberacion})::text`,
        reingreso: sql<number>`max(${schema.aplicaciones.reingresoDias})::int`,
        potreros: sql<string>`string_agg(${schema.potreros.nombre}, ', ' order by ${schema.potreros.nombre})`,
        responsable: sql<string | null>`max(${schema.aplicaciones.responsable})`,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.aplicaciones.potreroId))
      .where(eq(schema.aplicaciones.orgId, org.id))
      .groupBy(schema.aplicaciones.grupoId, schema.aplicaciones.fecha, schema.productos.nombre, schema.productos.tipo, schema.productos.unidad, schema.aplicaciones.metodo)
      .orderBy(desc(schema.aplicaciones.fecha))
      .limit(50),
  ]);

  const enEspera = potreros.filter((p) => p.estado === "en_espera" || p.aplicacionConGanado);

  return (
    <>
      <PageHeader
        titulo="Aplicaciones"
        descripcion="Abonos, foliares, enmiendas y agroquímicos. Cada aplicación calcula la cantidad por potrero, el costo y el tiempo de espera antes de volver a pastorear."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card titulo="Potreros en tiempo de espera" icono={Hourglass}>
            {enEspera.length === 0 ? (
              <p className="text-sm text-muted">Ningún potrero tiene restricciones de reingreso.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {enEspera.map((p) => (
                  <li key={p.id} className="rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/app/${slug}/potreros/${p.id}`} className="font-semibold hover:underline">{p.nombre}</Link>
                      <span className="num text-sm font-semibold text-warning">{p.diasParaLiberar} d</span>
                    </div>
                    <p className="text-xs text-muted">{p.productoEspera} · libre el {fechaCortaCR(p.liberacion!)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo="Registro de aplicaciones" icono={Sprout}>
            {grupos.length === 0 ? (
              <Vacio icono={Sprout} titulo="Sin aplicaciones registradas" texto="Registra la primera con el formulario." />
            ) : (
              <Tabla>
                <thead>
                  <tr><th>Fecha</th><th>Producto</th><th>Potreros</th><th className="text-right">Dosis/{u}</th><th className="text-right">Total</th><th className="text-right">Costo</th><th>Espera</th><th /></tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr key={g.grupoId}>
                      <td className="num whitespace-nowrap">{fechaCortaCR(g.fecha)}</td>
                      <td>
                        <span className="font-medium">{g.producto}</span>
                        <span className="block text-xs text-muted">{TIPOS_PRODUCTO[g.tipo as TipoProducto]} · {METODOS_APLICACION[g.metodo]}</span>
                      </td>
                      <td className="max-w-48 truncate" title={g.potreros}>{g.potreros}</td>
                      <td className="num text-right">{formatNum(dosisEnUnidad(Number(g.dosisPorHa), u), 1)} {g.unidad}</td>
                      <td className="num text-right">{formatNum(Number(g.cantidad), 1)} {g.unidad}</td>
                      <td className="num text-right">{formatColones(g.costo)}</td>
                      <td className="num whitespace-nowrap">
                        {g.reingreso === 0 ? (
                          <span className="text-muted">—</span>
                        ) : g.liberacion > hoy ? (
                          <span className="font-semibold text-warning">hasta {fechaCortaCR(g.liberacion)}</span>
                        ) : (
                          <span className="text-primary">cumplida</span>
                        )}
                      </td>
                      <td>
                        {puede(rol, "administrador") && (
                          <BotonAccion action={eliminarAplicacion.bind(null, slug, g.grupoId)} className="btn-ghost text-danger" confirmar="¿Eliminar esta aplicación? Se quitará también su tiempo de espera.">
                            <Trash2 className="size-4" aria-label="Eliminar" />
                          </BotonAccion>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Card>
        </div>

        {puede(rol, "operador") && (
          <Card titulo="Registrar aplicación" icono={Sprout} className="h-fit lg:sticky lg:top-8">
            {productos.length === 0 || potreros.length === 0 ? (
              <p className="text-sm text-muted">
                Necesitas al menos un potrero y un producto. <Link href={`/app/${slug}/insumos`} className="text-primary underline">Ir a insumos</Link>
              </p>
            ) : (
              <FormAplicacion
                action={registrarAplicacion.bind(null, slug)}
                unidad={u}
                hoy={hoy}
                productos={productos.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  tipo: p.tipo,
                  unidad: p.unidad,
                  reingreso: p.periodoReingresoDias,
                  retiroLeche: p.retiroLecheDias,
                  retiroCarne: p.retiroCarneDias,
                  precio: p.precioUnidad ? Number(p.precioUnidad) : null,
                }))}
                potreros={potreros.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  areaHa: p.areaUtilHa,
                  ocupado: p.estado === "ocupado",
                  areaTexto: formatArea(p.areaUtilHa, u, 1),
                }))}
              />
            )}
          </Card>
        )}
      </div>
    </>
  );
}
