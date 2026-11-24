import { Suspense } from "react";
import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";
import { requireOrg } from "@/lib/tenant";
import { PASTOS_CR, TIPOS_PRODUCCION } from "@/lib/dominio";
import { BottomNav, Sidebar, SignOutButton } from "@/components/nav";
import { Logo } from "@/components/logo";
import { CargandoPagina } from "@/components/ui";
import { SelectorTema } from "@/components/tema";
import { RegistrarServiceWorker } from "@/components/service-worker";

export default function OrgLayout({ children, params }: LayoutProps<"/app/[slug]">) {
  return (
    <Suspense fallback={<div className="p-6"><CargandoPagina /></div>}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ params, children }: { params: Promise<{ slug: string }>; children: React.ReactNode }) {
  const { slug } = await params;
  const { org, user, rol } = await requireOrg(slug);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr] print:block">
      <aside className="sticky top-0 hidden h-dvh print:!hidden flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href="/app" className="mb-5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2" title="Cambiar de ganadería">
          <Logo className="size-9 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15px] font-bold leading-tight">{org.nombre}</span>
            <span className="block text-xs text-muted">{TIPOS_PRODUCCION[org.tipoProduccion]}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted" aria-hidden />
        </Link>
        <Sidebar slug={slug} />
        <div className="mt-auto border-t border-border pt-3">
          <p className="truncate px-3 text-sm font-medium">{user.name || user.email}</p>
          <p className="truncate px-3 pb-2 text-xs text-muted">{user.email} · {rol}</p>
          <SelectorTema className="mx-1 mb-1" />
          <SignOutButton className="btn-ghost w-full justify-start" />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center print:!hidden gap-2.5 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Logo className="size-8 shrink-0" />
          <Link href="/app" className="min-w-0 flex-1">
            <span className="block truncate font-display font-bold leading-tight">{org.nombre}</span>
            <span className="block text-xs text-muted">{TIPOS_PRODUCCION[org.tipoProduccion]}</span>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:pb-10 lg:pt-8">
          <Suspense fallback={<CargandoPagina />}>{children}</Suspense>
        </main>
      </div>
      <BottomNav slug={slug} />
      <RegistrarServiceWorker />
      <datalist id="pastos-cr">{PASTOS_CR.map((x) => <option key={x} value={x} />)}</datalist>
    </div>
  );
}
