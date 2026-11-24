"use client";
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type Tema = "claro" | "oscuro" | "sistema";
const CLAVE = "repastos-tema";
const EVENTO = "repastos-tema";

/**
 * Se ejecuta en <head> antes de pintar: aplica el tema guardado sin parpadeo.
 * Por defecto la app es clara; "sistema" sigue la preferencia del dispositivo.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CLAVE}");var o=t==="oscuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=o?"dark":"light"}catch(e){}})()`;

function leer(): Tema {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === "oscuro" || t === "sistema" ? t : "claro";
  } catch {
    return "claro";
  }
}

function aplicar(t: Tema) {
  const oscuro = t === "oscuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = oscuro ? "dark" : "light";
}

function suscribir(cb: () => void) {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const alCambiarSistema = () => {
    if (leer() === "sistema") aplicar("sistema");
    cb();
  };
  window.addEventListener(EVENTO, cb);
  window.addEventListener("storage", cb);
  mq.addEventListener("change", alCambiarSistema);
  return () => {
    window.removeEventListener(EVENTO, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", alCambiarSistema);
  };
}

function guardar(t: Tema) {
  try {
    localStorage.setItem(CLAVE, t);
  } catch {}
  aplicar(t);
  window.dispatchEvent(new Event(EVENTO));
}

const OPCIONES = [
  { valor: "claro", label: "Claro", icon: Sun },
  { valor: "oscuro", label: "Oscuro", icon: Moon },
  { valor: "sistema", label: "Sistema", icon: Monitor },
] as const;

/** Selector de apariencia: claro, oscuro o igual que el dispositivo. */
export function SelectorTema({ className = "" }: { className?: string }) {
  const tema = useSyncExternalStore(suscribir, leer, () => "claro" as Tema);
  return (
    <div role="radiogroup" aria-label="Apariencia" className={`grid grid-cols-3 gap-0.5 rounded-lg bg-surface-2 p-0.5 ${className}`}>
      {OPCIONES.map(({ valor, label, icon: Icon }) => {
        const on = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => guardar(valor)}
            className={`flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150 ${
              on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
