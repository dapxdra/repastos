/**
 * Interpretación de análisis de suelo y encalado (lógica pura).
 *
 * Niveles críticos para la solución extractora KCl-Olsen modificado que usan los laboratorios de CR
 * (CIA-UCR, INTA), según Bertsch (1995) "La fertilidad de los suelos y su manejo". Son referencias generales:
 * la recomendación final debe revisarla un agrónomo con el informe del laboratorio.
 */

export type Analisis = {
  ph: number | null;
  acidez: number | null;
  ca: number | null;
  mg: number | null;
  k: number | null;
  p: number | null;
  zn: number | null;
  cu: number | null;
  fe: number | null;
  mn: number | null;
  mo: number | null;
};

export type Nivel = "bajo" | "adecuado" | "alto";
export const NIVELES: Record<Nivel, { label: string }> = {
  bajo: { label: "Bajo" },
  adecuado: { label: "Adecuado" },
  alto: { label: "Alto" },
};

type Rango = { clave: keyof Analisis; label: string; unidad: string; bajo: number; alto: number; altoEsMalo?: boolean };
/** [bajo, alto): por debajo de `bajo` es deficiente; por encima de `alto`, alto. */
export const RANGOS: Rango[] = [
  { clave: "ph", label: "pH (agua)", unidad: "", bajo: 5.5, alto: 6.5 },
  { clave: "acidez", label: "Acidez intercambiable", unidad: "cmol(+)/L", bajo: 0, alto: 0.5, altoEsMalo: true },
  { clave: "ca", label: "Calcio", unidad: "cmol(+)/L", bajo: 4, alto: 20 },
  { clave: "mg", label: "Magnesio", unidad: "cmol(+)/L", bajo: 1, alto: 10 },
  { clave: "k", label: "Potasio", unidad: "cmol(+)/L", bajo: 0.2, alto: 1.5 },
  { clave: "p", label: "Fósforo", unidad: "mg/L", bajo: 10, alto: 40 },
  { clave: "zn", label: "Zinc", unidad: "mg/L", bajo: 3, alto: 15 },
  { clave: "cu", label: "Cobre", unidad: "mg/L", bajo: 1, alto: 20 },
  { clave: "fe", label: "Hierro", unidad: "mg/L", bajo: 10, alto: 100 },
  { clave: "mn", label: "Manganeso", unidad: "mg/L", bajo: 5, alto: 50 },
  { clave: "mo", label: "Materia orgánica", unidad: "%", bajo: 2, alto: 5 },
];

export function nivel(r: Rango, v: number | null): Nivel | null {
  if (v == null) return null;
  if (r.altoEsMalo) return v > r.alto ? "alto" : "adecuado";
  return v < r.bajo ? "bajo" : v > r.alto ? "alto" : "adecuado";
}

/** CICE (cmol(+)/L) = acidez + Ca + Mg + K */
export function cice(a: Analisis) {
  if (a.acidez == null || a.ca == null || a.mg == null || a.k == null) return null;
  return a.acidez + a.ca + a.mg + a.k;
}
/** Saturación de acidez (%) = acidez / CICE × 100 */
export function saturacionAcidez(a: Analisis) {
  const c = cice(a);
  return c && a.acidez != null ? (a.acidez / c) * 100 : null;
}

/** Relaciones entre bases: rango adecuado. */
export const RELACIONES = [
  { label: "Ca/Mg", calc: (a: Analisis) => (a.ca != null && a.mg ? a.ca / a.mg : null), min: 2, max: 5 },
  { label: "Mg/K", calc: (a: Analisis) => (a.mg != null && a.k ? a.mg / a.k : null), min: 2.5, max: 15 },
  { label: "Ca/K", calc: (a: Analisis) => (a.ca != null && a.k ? a.ca / a.k : null), min: 5, max: 25 },
  { label: "(Ca+Mg)/K", calc: (a: Analisis) => (a.ca != null && a.mg != null && a.k ? (a.ca + a.mg) / a.k : null), min: 10, max: 40 },
];

/**
 * Saturación de acidez que tolera cada pasto (%), orientativa.
 * Las brachiarias toleran suelos ácidos; los Panicum (Mombasa, Tanzania), el kikuyo y el raigrás menos.
 */
export function saturacionTolerada(tipoPasto: string | null | undefined) {
  const n = (tipoPasto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/brachiaria|mulato|cayman|marandu|toledo|decumbens|brizantha|humidicola/.test(n)) return 35;
  if (/ratana/.test(n)) return 30;
  if (/estrella|transvala/.test(n)) return 25;
  if (/mombasa|tanzania|camerun|king/.test(n)) return 20;
  if (/kikuyo/.test(n)) return 15;
  if (/raigras|ryegrass/.test(n)) return 10;
  return 25;
}

/** Equivalente en carbonato de calcio (fracción) de una enmienda según su CaO y MgO. */
export const equivalenteCaCO3 = (caoPct: number, mgoPct: number) => (caoPct * 1.785 + mgoPct * 2.48) / 100;

/** Tope por aplicación en un pastizal establecido (cal al voleo, sin incorporar). */
export const MAX_CAL_POR_VEZ_T = 2;

export type Recomendacion = {
  /** t/ha de CaCO3 puro para bajar la saturación de acidez a la tolerada */
  caco3Tha: number;
  rasObjetivo: number;
  ras: number | null;
  /** Usar cal dolomita (falta Mg o la relación Ca/Mg es alta) */
  dolomita: boolean;
  notas: string[];
};

/**
 * Encalado por saturación de acidez (Cochrane, Salinas y Sánchez, 1980), como se usa en CR:
 * t CaCO3/ha = 1,5 × (acidez − RAS × CICE / 100), con RAS = saturación de acidez que tolera el pasto.
 */
export function recomendar(a: Analisis, rasObjetivo: number): Recomendacion {
  const c = cice(a);
  const ras = saturacionAcidez(a);
  const notas: string[] = [];
  let caco3 = 0;
  if (c != null && a.acidez != null) caco3 = Math.max(0, 1.5 * (a.acidez - (rasObjetivo * c) / 100));
  const relCaMg = a.ca != null && a.mg ? a.ca / a.mg : null;
  const dolomita = (a.mg != null && a.mg < 1) || (relCaMg != null && relCaMg > 5);

  if (caco3 > 0) {
    notas.push(
      caco3 > MAX_CAL_POR_VEZ_T
        ? `Aplicar en ${Math.ceil(caco3 / MAX_CAL_POR_VEZ_T)} partes de hasta ${MAX_CAL_POR_VEZ_T} t/ha, al inicio de las lluvias.`
        : "Aplicar al voleo al inicio de las lluvias, de preferencia después de un pastoreo.",
    );
  } else if (a.ca != null && a.ca < 4) {
    notas.push("La acidez no limita, pero el calcio está bajo: una dosis de mantenimiento (0,5–1 t/ha de cal) o yeso agrícola lo corrige.");
  }
  if (dolomita) notas.push("Magnesio bajo o relación Ca/Mg alta: usar cal dolomita.");
  if (a.k != null && a.k < 0.2) notas.push("Potasio bajo: incluir K₂O en el abonamiento (fórmulas completas o KCl).");
  if (a.p != null && a.p < 10) notas.push("Fósforo bajo: abonar con P₂O₅ al establecer o renovar; en pastos establecidos, fórmulas con fósforo.");
  if (a.zn != null && a.zn < 3) notas.push("Zinc bajo: fórmulas con elementos menores o un foliar con zinc.");
  if (a.ph != null && a.ph > 7) notas.push("pH alto: no encalar; vigilar la disponibilidad de P, Zn y Fe.");
  return { caco3Tha: Math.round(caco3 * 100) / 100, rasObjetivo, ras, dolomita, notas };
}

/** Convierte una fila de la base (numéricos como texto) en un Analisis. */
export function aAnalisis(r: Record<keyof Analisis, string | null>): Analisis {
  const n = (x: string | null) => (x == null ? null : Number(x));
  return { ph: n(r.ph), acidez: n(r.acidez), ca: n(r.ca), mg: n(r.mg), k: n(r.k), p: n(r.p), zn: n(r.zn), cu: n(r.cu), fe: n(r.fe), mn: n(r.mn), mo: n(r.mo) };
}

/** Por encima de ~300 kg N/ha/año la respuesta del pasto cae y crecen las pérdidas por lavado y volatilización. */
export const N_ANUAL_MAX = 300;
