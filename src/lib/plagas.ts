/**
 * Plagas de pasturas en CR: cómo muestrear, umbrales orientativos y manejo (lógica pura).
 * Los umbrales son referencias para priorizar potreros; ajústelos con su técnico según la finca y la época.
 */

export type Plaga = "salivazo_ninfas" | "salivazo_adultos" | "gusano_medidor" | "gusano_soldado" | "otra";
export type NivelPlaga = "bajo" | "alerta" | "accion";

export const PLAGAS: Record<Plaga, { label: string; unidad: string; muestreo: string; alerta: number | null; accion: number | null; manejo: string }> = {
  salivazo_ninfas: {
    label: "Salivazo (ninfas)",
    unidad: "masas de espuma por m²",
    muestreo: "Contar las masas de espuma en la base de las macollas en 10 marcos de 1 m² en zigzag; anotar el promedio.",
    alerta: 10,
    accion: 20,
    manejo:
      "Pastorear a la altura de salida sin dejar mucho material seco en la base. Control biológico con el hongo Metarhizium anisopliae al inicio de las lluvias, cuando aparecen las primeras ninfas. Las brachiarias (decumbens, Marandú) y la estrella son susceptibles; los híbridos Mulato II y Cayman toleran mejor.",
  },
  salivazo_adultos: {
    label: "Salivazo (adultos)",
    unidad: "adultos en 10 pases dobles de red",
    muestreo: "Dar 10 pases dobles con red entomológica caminando en diagonal; contar los adultos (insectos negros con bandas).",
    alerta: 10,
    accion: 25,
    manejo:
      "Los adultos indican la generación siguiente: programe Metarhizium y revise ninfas en 15–20 días. Pastoree el potrero para bajar la altura. Un insecticida solo si es necesario, registrado ante el SFE y respetando su carencia de pastoreo.",
  },
  gusano_medidor: {
    label: "Gusano medidor (Mocis)",
    unidad: "larvas por m²",
    muestreo: "Sacudir el pasto sobre un marco de 1 m² en 10 puntos y contar las larvas (se mueven 'midiendo').",
    alerta: 6,
    accion: 12,
    manejo:
      "Ataca sobre todo a la estrella y avanza en frentes. Si el potrero está cerca de su punto, adelante el pastoreo o el corte. En larvas pequeñas, Bacillus thuringiensis. Revise los potreros vecinos.",
  },
  gusano_soldado: {
    label: "Gusano soldado / cogollero (Spodoptera)",
    unidad: "larvas por m²",
    muestreo: "Revisar 10 marcos de 1 m², sobre todo al atardecer, y contar las larvas en el cogollo y el suelo.",
    alerta: 5,
    accion: 10,
    manejo: "Pastoreo adelantado del potrero afectado y Bacillus thuringiensis en larvas pequeñas. Común después de veranillos.",
  },
  otra: {
    label: "Otra plaga u observación",
    unidad: "conteo",
    muestreo: "Describa en las notas qué se contó y cómo.",
    alerta: null,
    accion: null,
    manejo: "Consulte a su técnico con fotos y conteos.",
  },
};

export function nivelPlaga(plaga: Plaga, conteo: number): NivelPlaga | null {
  const p = PLAGAS[plaga];
  if (p.accion == null || p.alerta == null) return null;
  return conteo >= p.accion ? "accion" : conteo >= p.alerta ? "alerta" : "bajo";
}

export const NIVELES_PLAGA: Record<NivelPlaga, { label: string; clase: string }> = {
  bajo: { label: "Bajo umbral", clase: "bg-primary-soft text-primary-strong" },
  alerta: { label: "Vigilar", clase: "bg-warning-soft text-warning" },
  accion: { label: "Actuar", clase: "bg-danger-soft text-danger" },
};
