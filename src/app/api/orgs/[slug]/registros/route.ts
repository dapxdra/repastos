import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { moverLote, registrarAforo, registrarLluvia, sacarLote } from "@/app/app/[slug]/actions";

/**
 * Recibe los registros de campo guardados en la cola del celular (anotados con o sin señal).
 * Reutiliza las mismas acciones de servidor: mismos permisos (operador), validaciones y bloqueos.
 * Las acciones son idempotentes ante reenvíos (aforo repetido, lote que ya está en el potrero, salida ya cerrada).
 */
const Registro = z.object({
  tipo: z.enum(["aforo", "lluvia", "mover", "sacar"]),
  datos: z.record(z.string().max(40), z.string().max(1000)).refine((d) => Object.keys(d).length <= 20, "Demasiados campos"),
});

/**
 * Protección CSRF: a diferencia de las acciones de servidor, un route handler no compara el origen.
 * Se exige JSON (un formulario de otro sitio no puede enviarlo sin preflight CORS) y que el Origin
 * coincida con el host de esta aplicación.
 */
function mismoOrigen(req: Request) {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return false;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/orgs/[slug]/registros">) {
  const { slug } = await ctx.params;
  // Sesión obligatoria antes de leer el cuerpo (las acciones además verifican membresía y rol)
  const { data: session } = await auth.getSession();
  if (!session?.user) return NextResponse.json({ ok: false, error: "Inicia sesión", n: Date.now() }, { status: 401 });
  if (!mismoOrigen(req)) return NextResponse.json({ ok: false, error: "Origen no permitido", n: Date.now() }, { status: 403 });
  const texto = await req.text().catch(() => "");
  if (texto.length > 20_000) return NextResponse.json({ ok: false, error: "Registro demasiado grande", n: Date.now() }, { status: 413 });
  const cuerpo = Registro.safeParse((() => { try { return JSON.parse(texto); } catch { return null; } })());
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
