import type { LucideIcon } from "lucide-react";
import { ESTADOS, type EstadoPotrero } from "@/lib/dominio";

export function PageHeader({
  titulo,
  descripcion,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[28px]">{titulo}</h1>
        {descripcion && <p className="mt-1 max-w-2xl text-sm text-muted">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

export function Card({
  titulo,
  icono: Icono,
  acciones,
  children,
  className = "",
  id,
}: {
  titulo?: string;
  icono?: LucideIcon;
  acciones?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card card-pad ${className}`}>
      {titulo && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold">
            {Icono && <Icono className="size-[18px] text-primary" aria-hidden />}
            {titulo}
          </h2>
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

const TONOS = {
  listo: "bg-primary-soft text-primary-strong",
  en_descanso: "bg-accent-soft text-accent",
  en_espera: "bg-warning-soft text-warning",
  ocupado: "bg-sky-soft text-sky",
} as const;

export function EstadoBadge({ estado }: { estado: EstadoPotrero }) {
  return (
    <span className={`chip ${TONOS[estado]}`}>
      <span className="size-1.5 rounded-full" style={{ background: ESTADOS[estado].color }} aria-hidden />
      {ESTADOS[estado].label}
    </span>
  );
}

export function Stat({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  tono = "primary",
}: {
  etiqueta: string;
  valor: React.ReactNode;
  detalle?: React.ReactNode;
  icono: LucideIcon;
  tono?: "primary" | "accent" | "sky" | "warning";
}) {
  const t = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    sky: "bg-sky-soft text-sky",
    warning: "bg-warning-soft text-warning",
  }[tono];
  return (
    <div className="card card-pad flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${t}`}>
        <Icono className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{etiqueta}</p>
        <p className="num font-display text-2xl font-bold leading-tight">{valor}</p>
        {detalle && <p className="mt-0.5 text-xs text-muted">{detalle}</p>}
      </div>
    </div>
  );
}

export function Vacio({
  icono: Icono,
  titulo,
  texto,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-surface-2 text-muted">
        <Icono className="size-5" aria-hidden />
      </span>
      <p className="font-semibold">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-muted">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Tabla({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-left text-sm [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
        {children}
      </table>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} aria-hidden />;
}

export function CargandoPagina() {
  return (
    <div className="space-y-4" role="status" aria-label="Cargando">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/** Etiqueta de módulo (hato) con su color. */
export function ModuloChip({ modulo, className = "" }: { modulo: { nombre: string; color: string } | null; className?: string }) {
  if (!modulo) return <span className={`chip bg-surface-2 text-muted ${className}`}>Sin módulo</span>;
  return (
    <span className={`chip ${className}`} style={{ background: `${modulo.color}1f`, color: modulo.color }}>
      <span className="size-2 rounded-sm" style={{ background: modulo.color }} aria-hidden />
      {modulo.nombre}
    </span>
  );
}
