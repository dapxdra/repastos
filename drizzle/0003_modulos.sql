CREATE TABLE "modulos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lotes" ADD COLUMN "modulo_id" uuid;--> statement-breakpoint
ALTER TABLE "potreros" ADD COLUMN "modulo_id" uuid;--> statement-breakpoint
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_org_id_organizaciones_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modulos_org_idx" ON "modulos" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modulos_org_nombre_uq" ON "modulos" USING btree ("org_id","nombre");--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_modulo_id_modulos_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "potreros" ADD CONSTRAINT "potreros_modulo_id_modulos_id_fk" FOREIGN KEY ("modulo_id") REFERENCES "public"."modulos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "potreros_modulo_idx" ON "potreros" USING btree ("modulo_id");