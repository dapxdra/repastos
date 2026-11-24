"use client";
import { COLORES_MODULO } from "@/lib/dominio";

/** Selector de color accesible (radios) para un módulo. */
export function SelectorColor({ name = "color", valor, legend = "Color en el mapa" }: { name?: string; valor?: string; legend?: string }) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {COLORES_MODULO.map((c, i) => (
          <label key={c.hex} className="relative cursor-pointer" title={c.label}>
            <input
              type="radio"
              name={name}
              value={c.hex}
              defaultChecked={valor ? valor === c.hex : i === 0}
              className="peer sr-only"
              aria-label={c.label}
            />
            <span
              className="block size-8 rounded-lg ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary"
              style={{ background: c.hex }}
              aria-hidden
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Casilla que marca o desmarca todos los apartos de un grupo (data-grupo) dentro del formulario. */
export function MarcarGrupo({ grupo, etiqueta }: { grupo: string; etiqueta: string }) {
  return (
    <input
      type="checkbox"
      className="size-5 accent-[var(--primary)]"
      aria-label={etiqueta}
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>(`input[data-grupo="${CSS.escape(grupo)}"]`).forEach((x) => (x.checked = e.currentTarget.checked));
      }}
    />
  );
}
