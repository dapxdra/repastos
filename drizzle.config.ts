import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migraciones por conexión directa (sin pooler).
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
  // El esquema neon_auth lo administra Neon Auth; Drizzle solo toca public.
  schemaFilter: ["public"],
});
