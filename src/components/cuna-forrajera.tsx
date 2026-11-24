import Link from "next/link";
import { formatNum, type UnidadArea } from "@/lib/dominio";
import { PRIORIDADES, type Prioridad } from "@/lib/forraje";

export type BarraCuna = {
  id: string;
  nombre: string;
  cobertura: number;
  /** Cobertura objetivo para la posición de este potrero en la cuña */
  objetivo: number;
  estimada: boolean;
  prioridad: Prioridad;
};

/**
 * Cuña forrajera: potreros ordenados de mayor a menor cobertura con la línea objetivo
 * (de la cobertura de entrada al residuo). Las barras sobre la línea son excedente; bajo ella, faltante.
 * Una sola serie (cobertura) y una línea de referencia; la tabla de la página es la vista accesible.
 */
export function CunaForrajera({ barras, slug, entrada, residuo }: { barras: BarraCuna[]; slug: string; entrada: number; residuo: number; unidad: UnidadArea }) {
  const max = Math.max(entrada * 1.25, ...barras.map((b) => b.cobertura));
  const h = (kg: number) => `${Math.max(1.5, (kg / max) * 100)}%`;
  const n = barras.length;
  const objetivoY = (kg: number) => 100 - (kg / max) * 100;
  const ticks = [0, Math.round(max / 3 / 500) * 500, Math.round((2 * max) / 3 / 500) * 500].filter((t, i, a) => a.indexOf(t) === i);

  return (
    <figure>
      <div className="flex gap-2">
        {/* Eje Y */}
        <div className="relative h-56 w-10 shrink-0 text-right text-[11px] text-muted" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="num absolute right-0 -translate-y-1/2" style={{ top: `${objetivoY(t)}%` }}>
              {formatNum(t / 1000, 1)}t
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="relative h-56" style={{ minWidth: `${n * 14}px` }}>
            {/* Cuadrícula */}
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${objetivoY(t)}%` }} aria-hidden />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label={`Cuña forrajera de ${n} potreros, de ${formatNum(barras[0]?.cobertura, 0)} a ${formatNum(barras.at(-1)?.cobertura, 0)} kg MS/ha. Objetivo de ${formatNum(entrada, 0)} a ${formatNum(residuo, 0)}.`}>
              {barras.map((b) => (
                <Link
                  key={b.id}
                  href={`/app/${slug}/potreros/${b.id}`}
                  className="group relative flex h-full min-w-[10px] flex-1 items-end"
                  aria-label={`${b.nombre}: ${formatNum(b.cobertura, 0)} kg MS/ha${b.estimada ? " (estimado)" : ""}, ${PRIORIDADES[b.prioridad].label}`}
                >
                  <span
                    className={`w-full rounded-t-[4px] transition-opacity group-hover:opacity-80 ${b.cobertura >= b.objetivo ? "bg-primary" : "bg-primary/45"}`}
                    style={{ height: h(b.cobertura) }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[11px] whitespace-nowrap text-background shadow group-hover:block group-focus-visible:block">
                    <b>{b.nombre}</b> · {formatNum(b.cobertura, 0)} kg MS/ha{b.estimada ? " (est.)" : ""}
                    <br />
                    Objetivo {formatNum(b.objetivo, 0)} · {PRIORIDADES[b.prioridad].label}
                  </span>
                </Link>
              ))}
            </div>
            {/* Línea objetivo */}
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1="0" y1={objetivoY(entrada)} x2="100" y2={objetivoY(residuo)} stroke="var(--foreground)" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" aria-hidden />Sobre el objetivo</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary/45" aria-hidden />Bajo el objetivo</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-foreground" aria-hidden />Objetivo: de {formatNum(entrada, 0)} (entrada) a {formatNum(residuo, 0)} kg MS/ha (residuo)</span>
      </figcaption>
    </figure>
  );
}
