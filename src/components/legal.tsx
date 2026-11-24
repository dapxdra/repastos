import Link from "next/link";
import { Logo } from "@/components/logo";
import { FECHA_VIGENCIA } from "@/lib/legal";

/** Página de texto legal: lectura cómoda (≈70 caracteres por línea) y navegación por secciones. */
export function PaginaLegal({ titulo, resumen, children }: { titulo: string; resumen: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold"><Logo className="size-9" />Repastos</Link>
        <nav className="flex gap-1 text-sm">
          <Link href="/terminos" className="btn-ghost">Términos</Link>
          <Link href="/privacidad" className="btn-ghost">Privacidad</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{titulo}</h1>
        <p className="mt-2 text-sm text-muted">Vigente desde el {FECHA_VIGENCIA}</p>
        <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-[0.95rem] leading-relaxed">{resumen}</p>
        <div className="mt-8 space-y-8 text-[0.95rem] leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_li]:mt-1.5 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <PieLegal />
    </div>
  );
}

export function Seccion({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s${n}`} className="space-y-3">
      <h2 id={`s${n}`} className="scroll-mt-6 text-xl font-bold">{n}. {titulo}</h2>
      {children}
    </section>
  );
}

export function PieLegal() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-8 text-sm text-muted sm:px-6">
      <span>© Repastos · Costa Rica</span>
      <Link href="/terminos" className="hover:text-foreground hover:underline">Términos y condiciones</Link>
      <Link href="/privacidad" className="hover:text-foreground hover:underline">Política de privacidad</Link>
    </footer>
  );
}
