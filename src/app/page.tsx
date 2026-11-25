import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, CloudRain, Map, Repeat2, Sprout, Users } from "lucide-react";
import { getUsuario } from "@/lib/tenant";
import { Logo } from "@/components/logo";
import { PaisajeParcelas } from "@/components/auth-form";
import { PieLegal } from "@/components/legal";

async function Acciones() {
  const user = await getUsuario();
  return user ? (
    <Link href="/app" className="btn">Ir a mis ganaderías <ArrowRight className="size-4" aria-hidden /></Link>
  ) : (
    <>
      <Link href="/auth/sign-up" className="btn">Empezar gratis <ArrowRight className="size-4" aria-hidden /></Link>
      <Link href="/auth/sign-in" className="btn-secondary">Iniciar sesión</Link>
    </>
  );
}

const FUNCIONES = [
  { icon: Map, t: "Mapa satelital de potreros", d: "Dibuja cada aparto sobre la imagen satelital; el área en hectáreas o manzanas se calcula sola." },
  { icon: Repeat2, t: "Rotación sin adivinar", d: "Días de ocupación y descanso por potrero, alertas de sobrepastoreo y sugerencia del siguiente potrero." },
  { icon: Sprout, t: "Abonos y foliares", d: "Dosis por ha o mz, cantidad total, costo en colones y N-P-K aplicado por potrero en el año." },
  { icon: CalendarClock, t: "Tiempos de espera", d: "Cada producto define su período de reingreso: el potrero queda bloqueado hasta que sea seguro pastorear." },
  { icon: CloudRain, t: "Aforos y lluvia", d: "Registra kg de materia seca y milímetros de lluvia para decidir con datos." },
  { icon: Users, t: "Todo el equipo", d: "Propietario, administrador, operadores y lectores, cada uno con sus permisos." },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 font-display text-lg font-bold"><Logo className="size-9" />Repastos</span>
        <nav className="flex gap-2"><Link href="/auth/sign-in" className="btn-ghost">Ingresar</Link></nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="chip mb-4 bg-primary-soft text-primary-strong">Hecho para ganaderías de Costa Rica</p>
            <h1 className="text-4xl font-extrabold leading-[1.1] sm:text-5xl">
              Manejo de repastos claro, <span className="text-primary">potrero por potrero.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Lechería, carne o doble propósito: controla rotaciones, abonos, foliares y tiempos de espera desde el celular, en el campo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Suspense fallback={<span className="h-11" />}>
                <Acciones />
              </Suspense>
            </div>
          </div>
          <div className="relative aspect-[5/4] overflow-hidden rounded-3xl border border-border shadow-card">
            <PaisajeParcelas />
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-1.5">
              {[["#2f9a80", "Listo"], ["#d39a3f", "En descanso"], ["#8a2f45", "En espera"], ["#1f5f86", "Ocupado"]].map(([c, l]) => (
                <span key={l} className="chip bg-surface/90 text-foreground shadow-sm backdrop-blur-sm"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold sm:text-3xl">Todo el control del pastoreo</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCIONES.map(({ icon: Icon, t, d }) => (
                <li key={t} className="rounded-2xl border border-border p-5">
                  <span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" aria-hidden /></span>
                  <h3 className="font-bold">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <PieLegal />
    </div>
  );
}
