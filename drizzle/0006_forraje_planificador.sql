CREATE TYPE "public"."regimen_lluvia" AS ENUM('pacifico', 'intermedio', 'caribe');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento" AS ENUM('siembra', 'chapia', 'cosecha', 'riego', 'cercas', 'tarea', 'nota');--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"tipo" "tipo_evento" NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"titulo" text,
	"cantidad" numeric(12, 2),
	"unidad" text,
	"costo" numeric(14, 2),
	"hecha" boolean DEFAULT true NOT NULL,
	"responsable" text,
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_pastoreo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"orden" integer NOT NULL,
	"dias" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aforos" ADD COLUMN "hojas" numeric(3, 1);--> statement-breakpoint
ALTER TABLE "fincas" ADD COLUMN "altitud_msnm" integer;--> statement-breakpoint
ALTER TABLE "fincas" ADD COLUMN "regimen_lluvia" "regimen_lluvia";--> statement-breakpoint
ALTER TABLE "lotes" ADD COLUMN "suplemento_kg_ms" numeric(6, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "lotes" ADD COLUMN "consumo_pct_pv" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_pastoreo" ADD CONSTRAINT "plan_pastoreo_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_pastoreo" ADD CONSTRAINT "plan_pastoreo_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_pastoreo" ADD CONSTRAINT "plan_pastoreo_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_org_idx" ON "eventos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "eventos_potrero_idx" ON "eventos" USING btree ("potrero_id");--> statement-breakpoint
CREATE INDEX "plan_org_idx" ON "plan_pastoreo" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "plan_lote_idx" ON "plan_pastoreo" USING btree ("lote_id");