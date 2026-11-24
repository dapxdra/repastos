import { eq } from "drizzle-orm";
import { Package, Plus, Info } from "lucide-react";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { TIPOS_PRODUCTO, formatColones, formulaProducto, type TipoProducto } from "@/lib/dominio";
import { Card, PageHeader, Tabla } from "@/components/ui";
import { FormProducto } from "./form-producto";
import { guardarProducto } from "../actions";

export const metadata = { title: "Insumos" };

export default async function Insumos({ params }: PageProps<"/app/[slug]/insumos">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  const esAdmin = puede(rol, "administrador");
  const productos = await db
    .select()
    .from(schema.productos)
    .where(eq(schema.productos.orgId, org.id))
    .orderBy(schema.productos.tipo, schema.productos.nombre);

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descripcion="Catálogo de abonos, foliares, enmiendas y agroquímicos con su composición, precio y tiempos de espera."
      />
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        La carencia de pastoreo y los retiros de leche y carne de herbicidas, insecticidas y foliares deben tomarse de la etiqueta del producto registrado ante el SFE/MAG. Repastos bloquea la rotación con la carencia, impide que los lotes de ordeño entren durante el retiro de leche y avisa qué lotes quedan con leche o carne no apta.
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card titulo={`Productos (${productos.length})`} icono={Package}>
          <Tabla>
            <thead>
              <tr><th>Producto</th><th>Tipo</th><th title="N-P₂O₅-K₂O y secundarios (%)">Fórmula</th><th className="text-right">Carencia</th><th className="text-right">Retiro L/C</th><th className="text-right">Precio</th>{esAdmin && <th />}</tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="font-medium">{p.nombre}</span>
                    {(p.ingredienteActivo || p.registro) && (
                      <span className="block text-xs text-muted">{[p.ingredienteActivo, p.registro && `Reg. ${p.registro}`].filter(Boolean).join(" · ")}</span>
                    )}
                  </td>
                  <td className="text-muted">{TIPOS_PRODUCTO[p.tipo as TipoProducto]}</td>
                  <td className="num whitespace-nowrap">{formulaProducto(p)}</td>
                  <td className={`num text-right ${p.periodoReingresoDias > 0 ? "font-semibold text-warning" : "text-muted"}`}>{p.periodoReingresoDias} d</td>
                  <td className="num text-right text-muted">{p.retiroLecheDias ?? "—"} / {p.retiroCarneDias ?? "—"}</td>
                  <td className="num text-right">{p.precioUnidad ? `${formatColones(p.precioUnidad)}/${p.unidad}` : "—"}</td>
                  {esAdmin && (
                    <td>
                      <details className="relative">
                        <summary className="btn-ghost list-none">Editar</summary>
                        <div className="card card-pad absolute right-0 z-10 mt-1 w-[min(92vw,360px)]">
                          <FormProducto action={guardarProducto.bind(null, slug, p.id)} producto={p} />
                        </div>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>
        {esAdmin && (
          <Card titulo="Agregar producto" icono={Plus} className="h-fit">
            <FormProducto action={guardarProducto.bind(null, slug, null)} />
          </Card>
        )}
      </div>
    </>
  );
}
