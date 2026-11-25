import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// node-postgres + Drizzle (recomendación de Neon para servidores de larga vida).
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

// En Vercel (Fluid compute) cierra las conexiones inactivas antes de que la instancia se suspenda.
// Fuera de Vercel no hace nada.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
