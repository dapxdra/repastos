/**
 * Neon Function "api": backend junto a los datos.
 * GET /health                     -> sin auth
 * GET /orgs/:orgId/resumen        -> requiere JWT de Neon Auth y membresía en la organización.
 *   Estado de rotación de cada potrero: ocupado / en espera (tiempo de reingreso) / en descanso / listo.
 */
import { Hono } from "hono";
import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { calcularEstado, hoyCR } from "../src/lib/dominio";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL!));
  return jwks;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const app = new Hono<{ Variables: { userId: string } }>();

app.get("/health", (c) => c.json({ ok: true, servicio: "repastos-api" }));

app.use("/orgs/*", async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Falta token" }, 401);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: new URL(process.env.NEON_AUTH_BASE_URL!).origin,
    });
    if (!payload.sub) return c.json({ error: "Token sin sujeto" }, 401);
    c.set("userId", payload.sub);
  } catch {
    return c.json({ error: "Token inválido" }, 401);
  }
  await next();
});

app.get("/orgs/:orgId/resumen", async (c) => {
  const orgId = c.req.param("orgId");
  const userId = c.get("userId");
  if (!UUID.test(orgId)) return c.json({ error: "Organización inválida" }, 400);

  const miembro = await pool.query("select rol from membresias where org_id = $1 and user_id = $2", [orgId, userId]);
  if (miembro.rowCount === 0) return c.json({ error: "Sin acceso a esta organización" }, 403);

  const hoy = hoyCR();
  const { rows } = await pool.query(
    `select p.id, p.nombre, p.dias_descanso_objetivo, p.dias_ocupacion_objetivo,
            (select min(fecha_entrada) from pastoreos x where x.potrero_id = p.id and x.fecha_salida is null) as ocupado_desde,
            (select max(fecha_salida) from pastoreos x where x.potrero_id = p.id) as ultima_salida,
            (select max(fecha_liberacion)::text from aplicaciones a where a.potrero_id = p.id and a.fecha_liberacion > $2::date) as liberacion
       from potreros p
      where p.org_id = $1
      order by p.nombre`,
    [orgId, hoy],
  );

  const potreros = rows.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    ...calcularEstado(
      {
        ocupadoDesde: r.ocupado_desde,
        ultimaSalida: r.ultima_salida,
        liberacion: r.liberacion,
        diasDescansoObjetivo: r.dias_descanso_objetivo,
        diasOcupacionObjetivo: r.dias_ocupacion_objetivo,
      },
      hoy,
    ),
  }));
  const n = (e: string) => potreros.filter((p) => p.estado === e).length;

  return c.json({
    generadoEn: new Date().toISOString(),
    totales: {
      potreros: potreros.length,
      ocupados: n("ocupado"),
      enEspera: n("en_espera"),
      enDescanso: n("en_descanso"),
      listos: n("listo"),
    },
    potreros,
  });
});

export default app;
