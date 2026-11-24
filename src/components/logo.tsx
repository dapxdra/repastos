/** Isotipo de Repastos: hoja de pasto sobre parcelas. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M6 22h20M6 26h20" stroke="var(--on-primary)" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M16 21c0-6 2.5-10 8-12-1 5.5-3.8 9.5-8 12Zm0 0c0-4.5-2-7.5-6.5-9 .6 4.2 2.8 7.3 6.5 9Z"
        fill="var(--on-primary)"
      />
    </svg>
  );
}
