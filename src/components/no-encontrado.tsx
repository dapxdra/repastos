import Link from "next/link";
import { SearchX } from "lucide-react";

/** Pantalla de «no encontrado». No distingue entre «no existe» y «no tienes acceso» para no revelar qué ganaderías existen. */
export function NoEncontrado({ titulo = "Página no encontrada" }: { titulo?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4" data-testid="no-encontrado">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <SearchX className="size-7" aria-hidden />
        </span>
        <p className="font-display text-sm font-bold text-muted">404</p>
        <h1 className="mt-1 text-2xl font-bold">{titulo}</h1>
        <p className="mt-2 text-muted">No existe o no tienes acceso. Si alguien te invitó, pídele que revise el correo con el que te agregó.</p>
        <Link href="/app" className="btn mt-6">Ir a mis ganaderías</Link>
      </div>
    </main>
  );
}
