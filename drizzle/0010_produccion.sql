CREATE TABLE "pesajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lote_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"cabezas" integer NOT NULL,
	"peso_promedio_kg" numeric(8, 2) NOT NULL,
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produccion_leche" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lote_id" uuid,
	"desde" date NOT NULL,
	"hasta" date NOT NULL,
	"litros" numeric(12, 1) NOT NULL,
	"vacas" integer,
	"precio_litro" numeric(10, 2),
	"notas" text,
	"creado_por" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pesajes" ADD CONSTRAINT "pesajes_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesajes" ADD CONSTRAINT "pesajes_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produccion_leche" ADD CONSTRAINT "produccion_leche_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produccion_leche" ADD CONSTRAINT "produccion_leche_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pesajes_org_idx" ON "pesajes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pesajes_lote_idx" ON "pesajes" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "produccion_leche_org_idx" ON "produccion_leche" USING btree ("org_id");