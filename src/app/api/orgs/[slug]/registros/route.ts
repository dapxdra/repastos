import { NextResponse } from "next/server";
import { z } from "zod";
import { moverLote, registrarAforo, registrarLluvia, sacarLote } from "@/app/app/[slug]/actions";

/**
 * Recibe los registros de campo guardados en la cola del celular (anotados con o sin señal).
 * Reutiliza las mismas acciones de servidor: mismos permisos (operador), validaciones y bloqueos.
 * Las acciones son idempotentes ante reenvíos (aforo repetido, lote que ya está en el potrero, salida ya cerrada).
 */
const Registro = z.object({
  tipo: z.enum(["aforo", "lluvia", "mover", "sacar"]),
  datos: z.record(z.string(), z.string().max(200)),
});

export async function POST(req: Request, ctx: RouteContext<"/api/orgs/[slug]/registros">) {
  const { slug } = await ctx.params;
  const cuerpo = Registro.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ ok: false, error: "Registro inválido", n: Date.now() }, { status: 400 });

  const { tipo, datos } = cuerpo.data;
  if (tipo === "sacar" && !z.uuid().safeParse(datos.pastoreoId).success) {
    return NextResponse.json({ ok: false, error: "Pastoreo inválido", n: Date.now() }, { status: 400 });
  }
  const fd = new FormData();
  for (const [k, v] of Object.entries(datos)) fd.set(k, v);

  const r =
    tipo === "aforo"
      ? await registrarAforo(slug, null, fd)
      : tipo === "lluvia"
        ? await registrarLluvia(slug, null, fd)
        : tipo === "mover"
          ? await moverLote(slug, null, fd)
          : await sacarLote(slug, datos.pastoreoId, null, fd);
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
