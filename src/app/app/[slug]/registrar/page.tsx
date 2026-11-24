import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { puede, requireOrg } from "@/lib/tenant";
import { calibracionAlturaOrg, potrerosConEstado } from "@/lib/consultas";
import { parametrosPasto } from "@/lib/forraje";
import { PageHeader } from "@/components/ui";
import { RegistroCampo, type DatosCampo } from "./registro-campo";

export const metadata = { title: "Registrar" };

/**
 * Registro de campo para el celular: recorrido de aforos, lluvia y movimientos de ganado.
 * Funciona sin señal: guarda en el teléfono y envía cuando vuelve la conexión.
 */
export default async function Registrar({ params }: PageProps<"/app/[slug]/registrar">) {
  const { slug } = await params;
  const { org, rol } = await requireOrg(slug);
  if (!puede(rol, "operador")) {
    return (
      <>
        <PageHeader titulo="Registrar" />
        <p className="text-sm text-muted">Tu rol es de solo lectura: pide a un administrador que te dé permiso de operador.</p>
      </>
    );
  }

  const [potreros, lotes, fincas, factor] = await Promise.all([
    potrerosConEstado(org.id),
    db
      .select({ id: schema.lotes.id, nombre: schema.lotes.nombre, cabezas: schema.lotes.cabezas })
      .from(schema.lotes)
      .where(eq(schema.lotes.orgId, org.id))
      .orderBy(schema.lotes.nombre),
    db.select({ id: schema.fincas.id, nombre: schema.fincas.nombre }).from(schema.fincas).where(eq(schema.fincas.orgId, org.id)),
    calibracionAlturaOrg(org.id),
  ]);

  const datos: DatosCampo = {
    generado: new Date().toISOString(),
    factor,
    fincas,
    lotes,
    potreros: potreros.map((p) => {
      const pp = parametrosPasto(p.tipoPasto);
      return {
        id: p.id,
        nombre: p.nombre,
        modulo: p.modulo ? { id: p.modulo.id, nombre: p.modulo.nombre, color: p.modulo.color } : null,
        tipoPasto: p.tipoPasto,
        pasto: pp.label,
        alturaEntrada: pp.alturaEntrada,
        alturaSalida: pp.alturaSalida,
        hojasObjetivo: pp.hojasObjetivo,
        enEspera: p.estado === "en_espera" ? p.liberacion : null,
        lote: p.loteActual ? { id: p.loteActual.id, pastoreoId: p.loteActual.pastoreoId } : null,
      };
    }),
  };

  return <RegistroCampo slug={slug} datos={datos} />;
}
