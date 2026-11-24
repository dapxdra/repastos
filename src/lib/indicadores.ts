/**
 * Indicadores productivos de la ganadería (lógica pura): ganancia de peso, leche por hectárea y vaca,
 * pasto cosechado por potrero y costo del pasto.
 */
import { diasEntre } from "@/lib/dominio";

/** Ganancia diaria de peso entre pesajes consecutivos de un lote. */
export function gananciasDePeso(pesajes: { fecha: string; cabezas: number; peso: number }[]) {
  const xs = [...pesajes].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tramos: { desde: string; hasta: string; dias: number; gdp: number; kgGanados: number }[] = [];
  for (let i = 1; i < xs.length; i++) {
    const dias = diasEntre(xs[i - 1].fecha, xs[i].fecha);
    if (dias < 7) continue; // pesajes muy seguidos: el llenado del rumen distorsiona la ganancia
    const gdp = (xs[i].peso - xs[i - 1].peso) / dias;
    tramos.push({ desde: xs[i - 1].fecha, hasta: xs[i].fecha, dias, gdp, kgGanados: gdp * dias * xs[i].cabezas });
  }
  return tramos;
}

/** Litros producidos por día cubierto y litros/vaca/día (solo registros con vacas). */
export function resumenLeche(registros: { desde: string; hasta: string; litros: number; vacas: number | null }[]) {
  let litros = 0;
  let vacaDias = 0;
  let litrosConVacas = 0;
  for (const r of registros) {
    const n = diasEntre(r.desde, r.hasta) + 1;
    litros += r.litros;
    if (r.vacas) {
      vacaDias += r.vacas * n;
      litrosConVacas += r.litros;
    }
  }
  // Período del primer al último registro: se asume que se anota toda la leche de ese período
  const primero = registros.length ? registros.map((r) => r.desde).sort()[0] : null;
  const ultimo = registros.length ? registros.map((r) => r.hasta).sort().at(-1)! : null;
  const periodo = primero && ultimo ? diasEntre(primero, ultimo) + 1 : 0;
  return {
    litros,
    periodoDias: periodo,
    litrosDia: periodo > 0 ? litros / periodo : null,
    litrosVacaDia: vacaDias > 0 ? litrosConVacas / vacaDias : null,
  };
}

/** Mediana (para comparar potreros contra el resto de la finca). */
export function mediana(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Un potrero rinde poco si cosecha menos del 60 % de la mediana de la finca. */
export const UMBRAL_BAJO_RENDIMIENTO = 0.6;
