CREATE TYPE "public"."estado_suscripcion" AS ENUM('prueba', 'activa', 'morosa', 'vencida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('prueba', 'basico', 'profesional', 'empresa');--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "plan" "plan" DEFAULT 'prueba' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "estado_suscripcion" "estado_suscripcion" DEFAULT 'prueba' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "prueba_hasta" date DEFAULT (current_date + 30);--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "suscripcion_vence" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "pago_cliente_id" text;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "pago_suscripcion_id" text;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "terminos_version" text;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "terminos_aceptados_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "terminos_aceptados_por" text;