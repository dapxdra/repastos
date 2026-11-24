CREATE TYPE "public"."plaga" AS ENUM('salivazo_ninfas', 'salivazo_adultos', 'gusano_medidor', 'gusano_soldado', 'otra');--> statement-breakpoint
CREATE TABLE "analisis_suelo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finca_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"potrero_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"fecha" date NOT NULL,
	"laboratorio" text,
	"ph" numeric(4, 2),
	"acidez" numeric(6, 2),
	"ca" numeric(6, 2),
	"mg" numeric(6, 2),
	"k" numeric(6, 2),
	"p" numeric(7, 2),
	"zn" numeric(7, 2),
	"cu" numeric(7, 2),
	"fe" numeric(7, 2),
	"mn" numeric(7, 2),
	"mo" numeric(5, 2),
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoreos_plaga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"plaga" "plaga" NOT NULL,
	"conteo" numeric(8, 2) NOT NULL,
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "cao" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "mgo" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "s" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "b" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "zn" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "analisis_suelo" ADD CONSTRAINT "analisis_suelo_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisis_suelo" ADD CONSTRAINT "analisis_suelo_finca_id_fincas_id_fk" FOREIGN KEY ("finca_id") REFERENCES "public"."fincas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoreos_plaga" ADD CONSTRAINT "monitoreos_plaga_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoreos_plaga" ADD CONSTRAINT "monitoreos_plaga_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analisis_suelo_org_idx" ON "analisis_suelo" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "monitoreos_plaga_org_idx" ON "monitoreos_plaga" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "monitoreos_plaga_potrero_idx" ON "monitoreos_plaga" USING btree ("potrero_id");