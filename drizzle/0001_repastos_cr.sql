CREATE TYPE "public"."categoria_lote" AS ENUM('vacas_produccion', 'vacas_secas', 'novillas', 'terneros', 'toros', 'novillos_engorde', 'vacas_cria', 'mixto');--> statement-breakpoint
CREATE TYPE "public"."metodo_aforo" AS ENUM('cuadro_corte', 'regla_altura', 'plato', 'visual');--> statement-breakpoint
CREATE TYPE "public"."metodo_aplicacion" AS ENUM('voleo', 'bomba_espalda', 'aguilon', 'dron', 'fertirriego', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tipo_produccion" AS ENUM('leche', 'carne', 'doble_proposito');--> statement-breakpoint
CREATE TYPE "public"."tipo_producto" AS ENUM('fertilizante', 'foliar', 'enmienda', 'herbicida', 'insecticida', 'fungicida', 'organico', 'otro');--> statement-breakpoint
CREATE TYPE "public"."unidad_area" AS ENUM('ha', 'mz');--> statement-breakpoint
CREATE TYPE "public"."unidad_producto" AS ENUM('kg', 'L');--> statement-breakpoint
CREATE TABLE "aplicaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"grupo_id" uuid NOT NULL,
	"potrero_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"dosis_por_ha" numeric(10, 3) NOT NULL,
	"cantidad_total" numeric(12, 3) NOT NULL,
	"metodo" "metodo_aplicacion" DEFAULT 'voleo' NOT NULL,
	"costo_total" numeric(14, 2),
	"reingreso_dias" integer DEFAULT 0 NOT NULL,
	"fecha_liberacion" date NOT NULL,
	"responsable" text,
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lluvias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"finca_id" uuid NOT NULL,
	"fecha" date DEFAULT now() NOT NULL,
	"mm" numeric(6, 1) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_producto" NOT NULL,
	"ingrediente_activo" text,
	"registro" text,
	"unidad" "unidad_producto" DEFAULT 'kg' NOT NULL,
	"n" numeric(5, 2),
	"p" numeric(5, 2),
	"k" numeric(5, 2),
	"periodo_reingreso_dias" integer DEFAULT 0 NOT NULL,
	"retiro_leche_dias" integer,
	"retiro_carne_dias" integer,
	"precio_unidad" numeric(12, 2),
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "potreros" ALTER COLUMN "area_ha" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "aforos" ADD COLUMN "metodo" "metodo_aforo" DEFAULT 'cuadro_corte' NOT NULL;--> statement-breakpoint
ALTER TABLE "aforos" ADD COLUMN "altura_cm" numeric(6, 1);--> statement-breakpoint
ALTER TABLE "fincas" ADD COLUMN "provincia" text;--> statement-breakpoint
ALTER TABLE "fincas" ADD COLUMN "canton" text;--> statement-breakpoint
ALTER TABLE "fincas" ADD COLUMN "centro" jsonb;--> statement-breakpoint
ALTER TABLE "lotes" ADD COLUMN "categoria" "categoria_lote" DEFAULT 'mixto' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "tipo_produccion" "tipo_produccion" DEFAULT 'doble_proposito' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizaciones" ADD COLUMN "unidad_area" "unidad_area" DEFAULT 'ha' NOT NULL;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD COLUMN "cabezas" integer;--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "dias_ocupacion_objetivo" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "geometria" jsonb;--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_potrero_id_potreros_id_fk" FOREIGN KEY ("potrero_id") REFERENCES "public"."potreros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lluvias" ADD CONSTRAINT "lluvias_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lluvias" ADD CONSTRAINT "lluvias_finca_id_fincas_id_fk" FOREIGN KEY ("finca_id") REFERENCES "public"."fincas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aplicaciones_org_idx" ON "aplicaciones" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_potrero_idx" ON "aplicaciones" USING btree ("potrero_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_liberacion_idx" ON "aplicaciones" USING btree ("org_id","fecha_liberacion");--> statement-breakpoint
CREATE INDEX "lluvias_org_idx" ON "lluvias" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lluvias_finca_fecha_uq" ON "lluvias" USING btree ("finca_id","fecha");--> statement-breakpoint
CREATE INDEX "productos_org_idx" ON "productos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "aforos_potrero_idx" ON "aforos" USING btree ("potrero_id");