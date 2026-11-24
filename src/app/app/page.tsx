import { Suspense } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronRight, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requireUsuario } from "@/lib/tenant";
import { TIPOS_PRODUCCION } from "@/lib/dominio";
import { SignOutButton } from "@/components/nav";
import { Logo } from "@/components/logo";
import { CargandoPagina } from "@/components/ui";
import { FormNuevaGanaderia } from "./form-nueva";

export const metadata = { title: "Mis ganaderías" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl p-6"><CargandoPagina /></div>}>
      <MisGanaderias />
    </Suspense>
  );
}

async function MisGanaderias() {
  const user = await requireUsuario();
  const orgs = await db
    .select({ nombre: schema.organizaciones.nombre, slug: schema.organizaciones.slug, tipo: schema.organizaciones.tipoProduccion, rol: schema.membresias.rol })
    .from(schema.membresias)
    .innerJoin(schema.organizaciones, eq(schema.organizaciones.id, schema.membresias.orgId))
    .where(eq(schema.membresias.userId, user.id))
    .orderBy(schema.organizaciones.nombre);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-2xl font-bold">Mis ganaderías</h1>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <SignOutButton />
      </header>

      {orgs.length > 0 && (
        <ul className="card mb-6 divide-y divide-border overflow-hidden">
          {orgs.map((o) => (
            <li key={o.slug}>
              <Link href={`/app/${o.slug}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft font-display text-lg font-bold text-primary-strong">
                  {o.nombre.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.nombre}</span>
                  <span className="block text-xs text-muted">{TIPOS_PRODUCCION[o.tipo]} · {o.rol}</span>
                </span>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card card-pad">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Plus className="size-5 text-primary" aria-hidden />Nueva ganadería</h2>
        <p className="mb-4 text-sm text-muted">
          {orgs.length === 0 ? "Crea tu primera ganadería para empezar." : "Cada ganadería tiene sus propias fincas, equipo y datos."}
        </p>
        <FormNuevaGanaderia />
      </section>
    </main>
  );
}
