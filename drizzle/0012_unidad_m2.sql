-- Metros cuadrados como unidad de área (y la predeterminada). Las áreas se siguen guardando en hectáreas:
-- esto solo cambia cómo se muestran y digitan.
-- Se recrea el tipo en vez de `ADD VALUE`: un valor agregado con ADD VALUE no se puede usar (DEFAULT/UPDATE)
-- dentro de la misma transacción, y las migraciones corren en una sola.
ALTER TYPE "public"."unidad_area" RENAME TO "unidad_area_old";--> statement-breakpoint
CREATE TYPE "public"."unidad_area" AS ENUM('m2', 'ha', 'mz');--> statement-breakpoint
ALTER TABLE "organizaciones" ALTER COLUMN "unidad_area" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organizaciones" ALTER COLUMN "unidad_area" SET DATA TYPE "public"."unidad_area" USING "unidad_area"::text::"public"."unidad_area";--> statement-breakpoint
ALTER TABLE "organizaciones" ALTER COLUMN "unidad_area" SET DEFAULT 'm2';--> statement-breakpoint
DROP TYPE "public"."unidad_area_old";--> statement-breakpoint
-- Las ganaderías en hectáreas tenían el valor predeterminado anterior: pasan a m². Las que eligieron manzanas se quedan igual.
UPDATE "organizaciones" SET "unidad_area" = 'm2' WHERE "unidad_area" = 'ha';
