CREATE TYPE "public"."estado_salida" AS ENUM('alto', 'bien', 'pelado');--> statement-breakpoint
ALTER TABLE "pastoreos" ADD COLUMN "estado_salida" "estado_salida";--> statement-breakpoint
ALTER TABLE "pastoreos" ADD COLUMN "altura_salida_cm" numeric(5, 1);