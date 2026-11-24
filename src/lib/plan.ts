/**
 * Planificador de pastoreo: calcula fechas, oferta y demanda de los potreros planificados para un lote.
 * Lógica pura; recibe los potreros ya estimados por `potrerosConForraje`.
 */
import type { PotreroForraje } from "@/lib/consultas";
import { CATEGORIAS_LOTE, diasEntre, hoyCR, sumarDias, type CategoriaLote } from "@/lib/dominio";
import { APROVECHAMIENTO, balance, demandaPasto, proyectar, type Balance, type ContextoClima } from "@/lib/forraje";

export type LotePlan = {
  id: string;
  cabezas: number;
  pesoPromedioKg: string | null;
  categoria: string;
  suplementoKgMs: string;
  consumoPctPv: string | null;
  moduloId: string | null;
};

export function demandaDeLote(l: LotePlan) {
  const peso = l.pesoPromedioKg ? Number(l.pesoPromedioKg) : CATEGORIAS_LOTE[l.categoria as CategoriaLote].pesoRef;
  return demandaPasto({
    cabezas: l.cabezas,
    pesoKg: peso,
    categoria: l.categoria,
    suplementoKgMs: Number(l.suplementoKgMs),
    consumoPct: l.consumoPctPv == null ? null : Number(l.consumoPctPv),
  });
}

export type FilaPlan = {
  itemId: string | null;
  potrero: PotreroForraje;
  entrada: string;
  salida: string;
  dias: number;
  /** Cobertura proyectada a la fecha de entrada (kg MS/ha) */
  cobertura: number | null;
  /** kg MS cosechables en el potrero a la entrada */
  oferta: number | null;
  /** kg MS de pasto que pide el lote en la estadía */
  demanda: number;
  balance: Balance | null;
  /** El potrero sigue en carencia (o en retiro de leche, si el lote se ordeña) a la fecha de entrada */
  bloqueado: boolean;
  /** Motivo y fecha del bloqueo, si lo hay */
  bloqueo: Bloqueo | null;
  /** Llega con menos del descanso mínimo (rebrote sin recuperar) */
  descansoCorto: boolean;
  /** Días de descanso que tendrá al entrar (null = nunca pastoreado) */
  descansoAlEntrar: number | null;
  /** Días que alcanzaría el forraje para este lote */
  diasQueAlcanza: number | null;
};

export type Bloqueo = { hasta: string; producto: string | null; motivo: "carencia" | "retiro de leche" };
/** Retiro de leche vigente por potrero (solo se pasa para lotes de ordeño). */
export type RetirosLeche = Map<string, { hasta: string; producto: string }>;

/**
 * Más de 3 días en el mismo potrero y el ganado empieza a comerse el rebrote
 * (en trópico el rebrote es pastoreable a partir del día 3–4).
 */
export const MAX_DIAS_SIN_REBROTE = 3;
/** Fracción del descanso objetivo por debajo de la cual el potrero no se planifica. */
export const DESCANSO_MINIMO = 0.7;

/** Bloqueo más tardío del potrero que sigue vigente en `fecha`. */
export function bloqueoEn(p: PotreroForraje, fecha: string, retirosLeche?: RetirosLeche): Bloqueo | null {
  const opciones: Bloqueo[] = [];
  if (p.liberacion && p.liberacion > fecha) opciones.push({ hasta: p.liberacion, producto: p.productoEspera, motivo: "carencia" });
  const r = retirosLeche?.get(p.id);
  if (r && r.hasta > fecha) opciones.push({ hasta: r.hasta, producto: r.producto, motivo: "retiro de leche" });
  return opciones.sort((a, b) => b.hasta.localeCompare(a.hasta))[0] ?? null;
}

/** Días de descanso que lleva el potrero en `fecha` (null si nunca se ha pastoreado). */
const descansoEn = (p: PotreroForraje, fecha: string, hoy: string) =>
  p.diasDescanso == null ? null : p.diasDescanso + Math.max(0, diasEntre(hoy, fecha));
const descansoSuficiente = (p: PotreroForraje, fecha: string, hoy: string) => {
  const d = descansoEn(p, fecha, hoy);
  return d == null || d >= Math.floor(p.diasDescansoObjetivo * DESCANSO_MINIMO);
};

/** Fecha en que el lote queda libre para entrar al primer potrero del plan. */
export function inicioPlan(actual: PotreroForraje | undefined, hoy = hoyCR()) {
  if (!actual?.ocupadoDesdeFecha) return hoy;
  const fin = sumarDias(actual.ocupadoDesdeFecha, actual.diasOcupacionObjetivo);
  return fin > hoy ? fin : hoy;
}

const ofertaKg = (p: PotreroForraje, cobertura: number | null) =>
  cobertura == null || p.areaUtilHa == null ? null : Math.max(0, cobertura - p.est.parametros.residuo) * APROVECHAMIENTO * p.areaUtilHa;

/** Recorre el plan en orden y calcula fechas y balance de cada estadía. */
export function calcularPlan(
  items: { id: string | null; potreroId: string; dias: number }[],
  potreros: PotreroForraje[],
  climas: Map<string, ContextoClima>,
  lote: LotePlan,
  inicio: string,
  hoy = hoyCR(),
  retirosLeche?: RetirosLeche,
): FilaPlan[] {
  const porId = new Map(potreros.map((p) => [p.id, p]));
  const demandaDia = demandaDeLote(lote).pasto;
  let cursor = inicio;
  const filas: FilaPlan[] = [];
  for (const it of items) {
    const p = porId.get(it.potreroId);
    if (!p) continue;
    const cobertura = diasEntre(hoy, cursor) <= 0 ? p.est.cobertura : proyectar(p.est, cursor, hoy);
    const oferta = ofertaKg(p, cobertura);
    const demanda = demandaDia * it.dias;
    const bloqueo = bloqueoEn(p, cursor, retirosLeche);
    filas.push({
      itemId: it.id,
      potrero: p,
      entrada: cursor,
      salida: sumarDias(cursor, it.dias),
      dias: it.dias,
      cobertura,
      oferta,
      demanda,
      balance: oferta == null ? null : balance(oferta, demanda),
      bloqueado: bloqueo != null,
      bloqueo,
      descansoCorto: !descansoSuficiente(p, cursor, hoy),
      descansoAlEntrar: descansoEn(p, cursor, hoy),
      diasQueAlcanza: oferta == null || demandaDia <= 0 ? null : oferta / demandaDia,
    });
    cursor = sumarDias(cursor, it.dias);
  }
  return filas;
}

export type MetodoPlan = "forraje" | "ocupacion" | "descanso";

/**
 * Arma un plan automático para el lote dentro de su módulo:
 * - forraje: potreros más maduros primero; los días salen de oferta ÷ demanda, con tope en la ocupación objetivo
 *   (si sobra pasto, se marca "sobra forraje": conviene franjas o meter más animales, no alargar la estadía).
 * - ocupacion: mismo orden, con los días de ocupación objetivo de cada potrero.
 * - descanso: el que lleva más días descansando primero (rotación fija), días objetivo.
 * En cada fecha de entrada salta potreros en carencia (o en retiro de leche, para lotes de ordeño) y los que no
 * llegan al descanso mínimo; los reconsidera en fechas posteriores. Si ninguno cumple el descanso, usa el que más
 * lleva (queda marcado como "descanso corto" en el plan).
 */
export function generarPlan(
  potreros: PotreroForraje[],
  climas: Map<string, ContextoClima>,
  lote: LotePlan,
  metodo: MetodoPlan,
  horizonteDias: number,
  hoy = hoyCR(),
  retirosLeche?: RetirosLeche,
) {
  const actual = potreros.find((p) => p.loteActual?.id === lote.id);
  const pool = potreros.filter((p) => p.id !== actual?.id && !(p.loteActual && p.loteActual.id !== lote.id) && (lote.moduloId ? p.moduloId === lote.moduloId : true));
  const orden =
    metodo === "descanso"
      ? pool.sort((a, b) => (b.diasDescanso ?? 9999) - (a.diasDescanso ?? 9999))
      : pool.sort((a, b) => b.puntaje - a.puntaje);
  const demandaDia = demandaDeLote(lote).pasto;
  const inicio = inicioPlan(actual, hoy);
  const items: { id: null; potreroId: string; dias: number }[] = [];
  const pendientes = [...orden];
  let cursor = inicio;
  while (pendientes.length && diasEntre(inicio, cursor) < horizonteDias) {
    const libres = pendientes.filter((p) => !bloqueoEn(p, cursor, retirosLeche));
    if (!libres.length) break;
    const p =
      libres.find((x) => descansoSuficiente(x, cursor, hoy)) ??
      [...libres].sort((a, b) => (descansoEn(b, cursor, hoy) ?? 9999) - (descansoEn(a, cursor, hoy) ?? 9999))[0];
    pendientes.splice(pendientes.indexOf(p), 1);
    let dias = Math.max(1, p.diasOcupacionObjetivo);
    if (metodo === "forraje" && demandaDia > 0) {
      const oferta = ofertaKg(p, proyectar(p.est, cursor, hoy) ?? p.est.cobertura);
      if (oferta != null) dias = Math.min(dias, Math.max(1, Math.floor(oferta / demandaDia)));
    }
    items.push({ id: null, potreroId: p.id, dias });
    cursor = sumarDias(cursor, dias);
  }
  return items;
}
