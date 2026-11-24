CREATE TYPE "public"."tipo_zona" AS ENUM('bosque', 'proteccion', 'agua', 'camino', 'instalaciones', 'corte', 'otro');--> statement-breakpoint
CREATE TABLE "zonas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finca_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_zona" DEFAULT 'otro' NOT NULL,
	"geometria" jsonb NOT NULL,
	"area_ha" numeric(14, 6) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "area_excluida_ha" numeric(14, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "descuento_ha" numeric(14, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "zonas" ADD CONSTRAINT "zonas_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zonas" ADD CONSTRAINT "zonas_finca_id_fincas_id_fk" FOREIGN KEY ("finca_id") REFERENCES "public"."fincas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "zonas_org_idx" ON "zonas" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "zonas_finca_idx" ON "zonas" USING btree ("finca_id");