"use client";
import { Printer, Share2 } from "lucide-react";

/** Imprimir o guardar como PDF, y compartir el resumen por WhatsApp (lo más usado en fincas de CR). */
export function AccionesReporte({ resumen }: { resumen: string }) {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(resumen)}`} target="_blank" rel="noopener noreferrer">
        <Share2 className="size-4" aria-hidden />WhatsApp
      </a>
      <button type="button" className="btn" onClick={() => window.print()}>
        <Printer className="size-4" aria-hidden />Imprimir o PDF
      </button>
    </div>
  );
}
