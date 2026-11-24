CREATE TYPE "public"."rol" AS ENUM('propietario', 'administrador', 'operador', 'lector');--> statement-breakpoint
CREATE TABLE "aforos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"kg_ms_ha" numeric(10, 2) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"potrero_id" uuid,
	"key" text NOT NULL,
	"nombre" text NOT NULL,
	"content_type" text NOT NULL,
	"tamano" integer NOT NULL,
	"subido_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archivos_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "fincas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"ubicacion" text,
	"area_ha" numeric(10, 2),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finca_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"cabezas" integer DEFAULT 0 NOT NULL,
	"peso_promedio_kg" numeric(8, 2),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membresias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"rol" "rol" DEFAULT 'lector' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizaciones_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pastoreos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"fecha_entrada" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_salida" timestamp with time zone,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "potreros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finca_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"area_ha" numeric(10, 2),
	"tipo_pasto" text,
	"dias_descanso_objetivo" integer DEFAULT 30 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aforos" ADD CONSTRAINT "aforos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aforos" ADD CONSTRAINT "aforos_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fincas" ADD CONSTRAINT "fincas_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_finca_id_fincas_id_fk" FOREIGN KEY ("finca_id") REFERENCES "public"."fincas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "potreros" ADD CONSTRAINT "potreros_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "potreros" ADD CONSTRAINT "potreros_finca_id_fincas_id_fk" FOREIGN KEY ("finca_id") REFERENCES "public"."fincas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aforos_org_idx" ON "aforos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "archivos_org_idx" ON "archivos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "fincas_org_idx" ON "fincas" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lotes_org_idx" ON "lotes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membresias_org_user_uq" ON "membresias" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "membresias_user_idx" ON "membresias" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pastoreos_org_idx" ON "pastoreos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pastoreos_potrero_idx" ON "pastoreos" USING btree ("potrero_id");--> statement-breakpoint
CREATE INDEX "potreros_org_idx" ON "potreros" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "potreros_finca_idx" ON "potreros" USING btree ("finca_id");