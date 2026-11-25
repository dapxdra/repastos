/**
 * Lógica de dominio pura (sin dependencias de servidor): la usan la app y la Neon Function `api`.
 */

export const ZONA_HORARIA = "America/Costa_Rica";
/** 1 manzana = 6 987,3 m² */
export const HA_POR_MZ = 0.69873;
/** Unidad animal: 450 kg de peso vivo */
export const KG_POR_UA = 450;

export type UnidadArea = "ha" | "mz";

export const aUnidad = (ha: number, u: UnidadArea) => (u === "mz" ? ha / HA_POR_MZ : ha);
export const aHectareas = (valor: number, u: UnidadArea) => (u === "mz" ? valor * HA_POR_MZ : valor);
/** Dosis ingresada por unidad de área → dosis por hectárea */
export const dosisPorHa = (dosis: number, u: UnidadArea) => (u === "mz" ? dosis / HA_POR_MZ : dosis);
export const dosisEnUnidad = (porHa: number, u: UnidadArea) => (u === "mz" ? porHa * HA_POR_MZ : porHa);

const nf = (max = 1) => new Intl.NumberFormat("es-CR", { maximumFractionDigits: max });
export const formatNum = (n: number | null | undefined, max = 1) => (n == null || Number.isNaN(n) ? "—" : nf(max).format(n));
export const formatArea = (ha: number | string | null | undefined, u: UnidadArea, max = 2) =>
  ha == null || ha === "" ? "—" : `${formatNum(aUnidad(Number(ha), u), max)} ${u}`;
export const formatColones = (n: number | string | null | undefined) =>
  n == null || n === ""
    ? "—"
    : new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(Number(n));

/** Fecha de hoy en Costa Rica como YYYY-MM-DD */
export function hoyCR(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(ahora);
}
export function sumarDias(fechaISO: string, dias: number) {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function diasEntre(desdeISO: string, hastaISO: string) {
  return Math.round((Date.parse(`${hastaISO}T12:00:00Z`) - Date.parse(`${desdeISO}T12:00:00Z`)) / 86_400_000);
}
export function fechaCR(valor: Date | string) {
  const d = typeof valor === "string" ? new Date(valor.length === 10 ? `${valor}T12:00:00Z` : valor) : valor;
  return d.toLocaleDateString("es-CR", { timeZone: ZONA_HORARIA, day: "numeric", month: "short", year: "numeric" });
}
export function fechaCortaCR(valor: Date | string) {
  const d = typeof valor === "string" ? new Date(valor.length === 10 ? `${valor}T12:00:00Z` : valor) : valor;
  return d.toLocaleDateString("es-CR", { timeZone: ZONA_HORARIA, day: "numeric", month: "short" });
}
/** Convierte un timestamp a fecha CR YYYY-MM-DD */
export const fechaISOEnCR = (d: Date | string) => hoyCR(typeof d === "string" ? new Date(d) : d);

export type EstadoPotrero = "ocupado" | "en_espera" | "en_descanso" | "listo";

export type EntradaEstado = {
  ocupadoDesde: Date | string | null;
  ultimaSalida: Date | string | null;
  /** Mayor fecha de liberación (YYYY-MM-DD) de las aplicaciones del potrero */
  liberacion: string | null;
  diasDescansoObjetivo: number;
  diasOcupacionObjetivo: number;
};

export type EstadoCalculado = {
  estado: EstadoPotrero;
  diasDescanso: number | null;
  diasOcupacion: number | null;
  diasParaLiberar: number | null;
  /** Lleva más días ocupado que el objetivo */
  sobreocupado: boolean;
  /** Se aplicó un producto con espera mientras tenía ganado adentro */
  aplicacionConGanado: boolean;
};

/**
 * Prioridad: ocupado > en espera (tiempo de reingreso de un producto) > en descanso > listo.
 */
export function calcularEstado(e: EntradaEstado, hoy = hoyCR()): EstadoCalculado {
  const esperaActiva = e.liberacion != null && e.liberacion > hoy;
  const diasParaLiberar = esperaActiva ? diasEntre(hoy, e.liberacion!) : null;
  if (e.ocupadoDesde) {
    const diasOcupacion = Math.max(0, diasEntre(fechaISOEnCR(e.ocupadoDesde), hoy));
    return {
      estado: "ocupado",
      diasDescanso: null,
      diasOcupacion,
      diasParaLiberar,
      sobreocupado: diasOcupacion > e.diasOcupacionObjetivo,
      aplicacionConGanado: esperaActiva,
    };
  }
  const diasDescanso = e.ultimaSalida ? Math.max(0, diasEntre(fechaISOEnCR(e.ultimaSalida), hoy)) : null;
  const base = { diasDescanso, diasOcupacion: null, diasParaLiberar, sobreocupado: false, aplicacionConGanado: false };
  if (esperaActiva) return { ...base, estado: "en_espera" };
  if (diasDescanso !== null && diasDescanso < e.diasDescansoObjetivo) return { ...base, estado: "en_descanso" };
  return { ...base, estado: "listo" };
}

/** Frase corta que explica el estado de un potrero. */
export function detalleEstado(p: {
  estado: EstadoPotrero;
  diasDescanso: number | null;
  diasOcupacion: number | null;
  diasParaLiberar: number | null;
  diasDescansoObjetivo: number;
  diasOcupacionObjetivo: number;
  liberacion: string | null;
  productoEspera: string | null;
  loteActual: { nombre: string; cabezas: number } | null;
}) {
  switch (p.estado) {
    case "ocupado":
      return `${p.loteActual?.nombre} (${p.loteActual?.cabezas} cab.) · día ${(p.diasOcupacion ?? 0) + 1} de ${p.diasOcupacionObjetivo}`;
    case "en_espera":
      return `Espera por ${p.productoEspera}: libre el ${fechaCortaCR(p.liberacion!)} (${p.diasParaLiberar} d)`;
    case "en_descanso":
      return `${p.diasDescanso} de ${p.diasDescansoObjetivo} días de descanso`;
    case "listo":
      return p.diasDescanso == null ? "Sin pastoreos registrados" : `Descansó ${p.diasDescanso} días`;
  }
}

export const ESTADOS: Record<EstadoPotrero, { label: string; color: string; descripcion: string }> = {
  listo: { label: "Listo", color: "#2f9a80", descripcion: "Cumplió su descanso, sin restricciones" },
  en_descanso: { label: "En descanso", color: "#d39a3f", descripcion: "Recuperándose después del pastoreo" },
  en_espera: { label: "En espera", color: "#8a2f45", descripcion: "Bloqueado por tiempo de reingreso de un producto" },
  ocupado: { label: "Ocupado", color: "#1f5f86", descripcion: "Con ganado pastoreando" },
};

// ───────────── Módulos por hato ─────────────

/** Paleta de módulos, parecida a las leyendas de los mapas de finca (QGIS). */
export const COLORES_MODULO = [
  { hex: "#3f9a4a", label: "Verde" },
  { hex: "#d0453f", label: "Rojo" },
  { hex: "#4a7fc1", label: "Azul" },
  { hex: "#d08a2a", label: "Naranja" },
  { hex: "#c9b52c", label: "Amarillo" },
  { hex: "#8e62b0", label: "Morado" },
  { hex: "#2a9d8f", label: "Turquesa" },
  { hex: "#c2577f", label: "Rosado" },
  { hex: "#8a6a4a", label: "Café" },
  { hex: "#7d858c", label: "Gris" },
] as const;

/** Módulos típicos según el tipo de ganadería (se pueden crear con un clic). */
export const MODULOS_SUGERIDOS: Record<"leche" | "carne" | "doble_proposito", string[]> = {
  leche: ["Ordeño AM", "Ordeño PM", "Secas", "Prontas", "Reemplazos", "Novillas"],
  carne: ["Engorde", "Desarrollo", "Cría", "Toros"],
  doble_proposito: ["Ordeño", "Secas", "Novillas", "Terneros", "Engorde"],
};

/**
 * Días de descanso que permite un módulo si un hato rota por todos sus apartos:
 * mientras ocupa uno, descansan los otros (n − 1) × días de ocupación.
 */
export function descansoQuePermite(nApartos: number, diasOcupacion: number) {
  return Math.max(0, nApartos - 1) * diasOcupacion;
}

type CandidatoPastoreo = {
  id: string;
  moduloId: string | null;
  estado: EstadoPotrero;
  diasDescanso: number | null;
  diasDescansoObjetivo: number;
  ultimoAforo: { kgMsHa: number } | null;
  /** Cobertura estimada hoy por el modelo de forraje (si se calculó) */
  est?: { cobertura: number | null };
};

/**
 * Siguiente aparto para un hato, dentro de su módulo si tiene.
 * 1) Listos: más forraje (cobertura estimada o último aforo) y luego más días de descanso (los nunca pastoreados primero).
 * 2) Si no hay listos: el que esté más cerca de cumplir su descanso.
 * Nunca sugiere potreros ocupados ni en espera por aplicación.
 */
const kgDe = (p: CandidatoPastoreo) => p.est?.cobertura ?? p.ultimoAforo?.kgMsHa ?? 0;

export function sugerirSiguiente<T extends CandidatoPastoreo>(potreros: T[], moduloId: string | null, excluir?: string): T | null {
  const pool = potreros.filter((p) => p.id !== excluir && (moduloId ? p.moduloId === moduloId : true));
  const listos = pool
    .filter((p) => p.estado === "listo")
    .sort(
      (a, b) =>
        kgDe(b) - kgDe(a) ||
        (b.diasDescanso ?? Number.MAX_SAFE_INTEGER) - (a.diasDescanso ?? Number.MAX_SAFE_INTEGER),
    );
  if (listos.length) return listos[0];
  const descansando = pool
    .filter((p) => p.estado === "en_descanso")
    .sort((a, b) => (b.diasDescanso ?? 0) / b.diasDescansoObjetivo - (a.diasDescanso ?? 0) / a.diasDescansoObjetivo);
  return descansando[0] ?? null;
}

export const CATEGORIAS_LOTE = {
  vacas_produccion: { label: "Vacas en producción", pesoRef: 450 },
  vacas_secas: { label: "Vacas secas", pesoRef: 470 },
  vacas_cria: { label: "Vacas de cría", pesoRef: 430 },
  novillas: { label: "Novillas", pesoRef: 300 },
  terneros: { label: "Terneros", pesoRef: 120 },
  toros: { label: "Toros", pesoRef: 650 },
  novillos_engorde: { label: "Novillos de engorde", pesoRef: 350 },
  mixto: { label: "Mixto", pesoRef: 400 },
} as const;
export type CategoriaLote = keyof typeof CATEGORIAS_LOTE;

/**
 * ¿La leche de este lote se entrega? Aplica el retiro de leche de la etiqueta.
 * Un lote "mixto" se trata como de ordeño en lecherías y doble propósito (criterio conservador).
 */
export function loteDeOrdeno(categoria: string, tipoProduccion: string) {
  return categoria === "vacas_produccion" || (categoria === "mixto" && tipoProduccion !== "carne");
}

export function unidadesAnimales(cabezas: number, pesoPromedioKg: number | null, categoria: CategoriaLote) {
  const peso = pesoPromedioKg ?? CATEGORIAS_LOTE[categoria].pesoRef;
  return (cabezas * peso) / KG_POR_UA;
}

export const TIPOS_PRODUCTO = {
  fertilizante: "Fertilizante / abono",
  foliar: "Foliar",
  enmienda: "Enmienda (cal)",
  herbicida: "Herbicida",
  insecticida: "Insecticida",
  fungicida: "Fungicida",
  organico: "Abono orgánico",
  otro: "Otro",
} as const;

export const METODOS_APLICACION = {
  voleo: "Al voleo",
  bomba_espalda: "Bomba de espalda",
  aguilon: "Aguilón / tractor",
  dron: "Dron",
  fertirriego: "Fertirriego",
  manual: "Manual",
} as const;

export const METODOS_AFORO = {
  cuadro_corte: "Cuadro y corte",
  regla_altura: "Regla de altura",
  plato: "Plato de pasturas",
  visual: "Estimación visual",
} as const;

export const TIPOS_PRODUCCION = {
  leche: "Lechería",
  carne: "Carne / engorde",
  doble_proposito: "Doble propósito",
} as const;

export const PROVINCIAS_CR = ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"] as const;

/** Pastos comunes en ganaderías de Costa Rica (sugerencias; el campo es libre). */
export const PASTOS_CR = [
  "Estrella africana",
  "Kikuyo",
  "Brachiaria brizantha (Marandú)",
  "Brachiaria brizantha (Toledo)",
  "Brachiaria decumbens",
  "Brachiaria híbrido (Mulato II)",
  "Brachiaria híbrido (Cayman)",
  "Mombasa",
  "Tanzania",
  "Ratana",
  "Transvala",
  "Camerún",
  "Raigrás",
  "Natural / naturalizado",
];

/**
 * Fertilizantes de composición estándar para precargar el catálogo.
 * No se precargan agroquímicos: su tiempo de reingreso y retiro deben venir de la etiqueta registrada.
 */
/** Composición en % de etiqueta: N, P₂O₅, K₂O, CaO, MgO, S. */
export const PRODUCTOS_BASE = [
  { nombre: "Urea 46%", tipo: "fertilizante", n: 46, p: 0, k: 0, cao: null, mgo: null, s: null },
  { nombre: "Nitrato de amonio 33,5%", tipo: "fertilizante", n: 33.5, p: 0, k: 0, cao: null, mgo: null, s: null },
  { nombre: "Sulfato de amonio 21%", tipo: "fertilizante", n: 21, p: 0, k: 0, cao: null, mgo: null, s: 24 },
  { nombre: "Fórmula completa 18-5-15-6-2", tipo: "fertilizante", n: 18, p: 5, k: 15, cao: null, mgo: 6, s: 2 },
  { nombre: "Fosfato diamónico (DAP) 18-46-0", tipo: "fertilizante", n: 18, p: 46, k: 0, cao: null, mgo: null, s: null },
  { nombre: "Cloruro de potasio (KCl) 0-0-60", tipo: "fertilizante", n: 0, p: 0, k: 60, cao: null, mgo: null, s: null },
  { nombre: "Carbonato de calcio (cal agrícola)", tipo: "enmienda", n: null, p: null, k: null, cao: 52, mgo: null, s: null },
  { nombre: "Cal dolomita", tipo: "enmienda", n: null, p: null, k: null, cao: 30, mgo: 18, s: null },
] as const;

export type TipoProducto = keyof typeof TIPOS_PRODUCTO;

/** "1 potrero" / "3 potreros" */
export const plural = (n: number, singular: string, pluralForma = `${singular}s`) => `${formatNum(n, 0)} ${n === 1 ? singular : pluralForma}`;

// ───────────── Área aprovechable ─────────────

/** Áreas de la finca que no se pastorean. Se descuentan del potrero que las contenga. */
export const TIPOS_ZONA = {
  bosque: { label: "Bosque", color: "#0d3b24" },
  proteccion: { label: "Protección (ríos, nacientes)", color: "#2f8f6f" },
  agua: { label: "Agua (quebrada, laguna, reservorio)", color: "#2f7fd0" },
  camino: { label: "Camino o callejón", color: "#b9b2a4" },
  instalaciones: { label: "Instalaciones (lechería, corrales, casa)", color: "#9a5b34" },
  corte: { label: "Forraje de corta o cultivo", color: "#b7c43a" },
  otro: { label: "Otra área no pastoreable", color: "#6f6a74" },
} as const;
export type TipoZona = keyof typeof TIPOS_ZONA;
export const TIPOS_ZONA_IDS = Object.keys(TIPOS_ZONA) as [TipoZona, ...TipoZona[]];

/** Reconoce por el nombre las capas típicas de un mapa de finca (QGIS, Google Earth). */
export function detectarTipoZona(nombre: string): TipoZona | null {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/protecci|naciente|ribera|retiro/.test(n)) return "proteccion";
  if (/bosque|montana|reserva|tacotal|charral|arboles|forestal/.test(n)) return "bosque";
  if (/quebrada|\brio\b|laguna|lago|reservorio|estanque|lagunas?|represa/.test(n)) return "agua";
  if (/camino|calle|carretera|trocha|callejon|lastre/.test(n)) return "camino";
  if (/casa|lecheria|sala de ordeno|corral|establo|galeron|bodega|instalacion|manga|biodigestor|planta/.test(n)) return "instalaciones";
  if (/cana|corta|king ?grass|maiz|cultivo|banco forrajero|sorgo/.test(n)) return "corte";
  return null;
}

/** Área que sí se pastorea: total − zonas no pastoreables dentro del potrero − descuento manual. */
export function areaAprovechable(areaHa: number | null, excluidaHa: number, descuentoHa: number) {
  if (areaHa == null) return null;
  return Math.max(0, areaHa - excluidaHa - descuentoHa);
}

// ───────────── Labores ─────────────

/** Labores de potrero comunes en fincas de CR. */
export const TIPOS_EVENTO = {
  siembra: { label: "Siembra o resiembra", unidad: "kg semilla" },
  chapia: { label: "Chapia / control de malezas", unidad: "jornales" },
  cosecha: { label: "Cosecha (ensilaje, pacas, corta)", unidad: "pacas" },
  riego: { label: "Riego", unidad: "horas" },
  cercas: { label: "Cercas y bebederos", unidad: "m" },
  tarea: { label: "Tarea", unidad: "" },
  nota: { label: "Nota u observación", unidad: "" },
} as const;
export type TipoEvento = keyof typeof TIPOS_EVENTO;

/** Fórmula legible de un insumo: "18-5-15 + 6 MgO + 2 S" (N-P₂O₅-K₂O y secundarios) o "52 CaO". */
export function formulaProducto(p: { n: unknown; p: unknown; k: unknown; cao?: unknown; mgo?: unknown; s?: unknown; b?: unknown; zn?: unknown }) {
  const v = (x: unknown) => (x == null || x === "" ? null : Number(x));
  const npk = [v(p.n), v(p.p), v(p.k)];
  const partes: string[] = [];
  if (npk.some((x) => x)) partes.push(npk.map((x) => formatNum(x ?? 0)).join("-"));
  for (const [x, l] of [[p.cao, "CaO"], [p.mgo, "MgO"], [p.s, "S"], [p.b, "B"], [p.zn, "Zn"]] as const) {
    const n = v(x);
    if (n) partes.push(`${formatNum(n)} ${l}`);
  }
  return partes.length ? partes.join(" + ") : "—";
}
