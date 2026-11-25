import { useId } from "react";
import { LOGO } from "@/components/logo-geometria";

/**
 * Isotipo de Repastos: tres briznas de pasto cuya altura es el estado del
 * potrero en la rotación: recién pastoreado (mostaza, corta), en recuperación
 * (lima, media) y listo para entrar (crema, alta).
 * `variante="suelta"` lo dibuja sin baldosa, con los colores del tema.
 */
export function Logo({ className = "size-8", variante = "baldosa" }: { className?: string; variante?: "baldosa" | "suelta" }) {
  const id = useId();
  const baldosa = variante === "baldosa";
  const c = baldosa
    ? { pasto: "#dda54e", recup: "#cce087", listo: "#f3ecdc" }
    : { pasto: "var(--marca-pasto)", recup: "var(--marca-recup)", listo: "var(--marca-listo)" };
  return (
    <svg viewBox={baldosa ? "0 0 64 64" : "6.5 7.5 50 50"} className={className} aria-hidden>
      {baldosa && (
        <>
          <defs>
            <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0a6245" />
              <stop offset="1" stopColor="#053a29" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="15" fill={`url(#${id}f)`} />
        </>
      )}
      <path d={LOGO.pastoreo} fill={c.pasto} />
      <path d={LOGO.recuperacion} fill={c.recup} />
      <path d={LOGO.listo} fill={c.listo} />
      <path d={LOGO.suelo} stroke={c.listo} strokeOpacity=".55" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/** Logo completo: isotipo + nombre. */
export function LogoCompleto({ className = "", tamano = "size-9" }: { className?: string; tamano?: string }) {
  return (
    <span className={`flex items-center gap-2 font-display text-lg font-extrabold tracking-tight ${className}`}>
      <Logo className={tamano} />
      Repastos
    </span>
  );
}
