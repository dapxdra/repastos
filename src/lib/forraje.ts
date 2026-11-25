/**
 * Modelo de forraje para potreros de Costa Rica (lógica pura, sin servidor).
 *
 * Estima la cobertura (kg MS/ha) de cada potrero entre aforos, su tasa de crecimiento,
 * la etapa de hoja y la prioridad de pastoreo, y la proyecta hacia adelante.
 * No depende de imágenes satelitales: en CR la nubosidad tapa la mayor parte del año
 * las escenas ópticas, así que el modelo trabaja con lo que la finca sí registra:
 * aforos, pastoreos, lluvia del pluviómetro, altitud y época del año.
 *
 * Todos los parámetros son valores de referencia para pasturas tropicales de CR
 * (MAG, INTA, UCR, cooperativas). Se calibran solos con los aforos de cada potrero.
 */
import { diasEntre, hoyCR, sumarDias } from "@/lib/dominio";

// ───────────── Clima ─────────────

/**
 * Régimen de lluvias de la finca:
 * - pacifico: Pacífico Norte y Central (Guanacaste, Puntarenas): verano seco marcado de diciembre a abril.
 * - intermedio: Valle Central y zonas altas: seca moderada, veranillo en julio.
 * - caribe: Caribe y Zona Norte (Limón, San Carlos, Sarapiquí, Upala): llueve todo el año.
 */
export type RegimenLluvia = "pacifico" | "intermedio" | "caribe";

export const REGIMENES_LLUVIA: Record<RegimenLluvia, { label: string; descripcion: string }> = {
  pacifico: { label: "Pacífico seco", descripcion: "Verano marcado de diciembre a abril (Guanacaste, Puntarenas)" },
  intermedio: { label: "Valle Central / altura", descripcion: "Seca moderada y veranillo en julio" },
  caribe: { label: "Caribe / Zona Norte", descripcion: "Lluvioso todo el año (Limón, San Carlos, Sarapiquí)" },
};

/** Factor de crecimiento por mes (enero = 0) según el régimen de lluvia. 1 = sin limitación de agua. */
const ESTACIONALIDAD: Record<RegimenLluvia, number[]> = {
  //          ene   feb   mar   abr   may   jun   jul   ago   sep   oct   nov   dic
  pacifico: [0.35, 0.25, 0.2, 0.3, 0.8, 1, 0.85, 0.95, 1, 1, 0.85, 0.6],
  intermedio: [0.55, 0.5, 0.5, 0.6, 0.9, 1, 0.9, 1, 1, 1, 0.9, 0.7],
  caribe: [0.95, 0.9, 0.9, 0.95, 1, 1, 1, 1, 0.9, 0.9, 1, 1],
};

/** Régimen probable según provincia y cantón (el usuario lo puede cambiar). */
export function regimenSugerido(provincia: string | null, canton: string | null): RegimenLluvia {
  const c = (canton ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/san carlos|sarapiqui|upala|los chiles|guatuso|rio cuarto|turrialba|siquirres|pococi|guacimo/.test(c)) return "caribe";
  if (provincia === "Limón") return "caribe";
  if (provincia === "Guanacaste" || provincia === "Puntarenas") return "pacifico";
  return "intermedio";
}

/** Temperatura media aproximada por altitud en CR (≈27 °C a nivel del mar, −0,58 °C cada 100 m). */
export const temperaturaPorAltitud = (msnm: number) => 27 - 0.0058 * Math.max(0, msnm);

// ───────────── Pastos ─────────────

export type ParametrosPasto = {
  clave: string;
  label: string;
  /** Temperatura base de crecimiento (°C) */
  tBase: number;
  /** Temperatura a la que se alcanza la tasa máxima (°C) */
  tOptima: number;
  /** Grados-día por hoja nueva (filocrono, °C·d) */
  filocrono: number;
  /** Hojas vivas por rebrote al momento ideal de pastoreo */
  hojasObjetivo: number;
  /** Cobertura ideal de entrada (kg MS/ha) */
  entrada: number;
  /** Residuo que debe quedar al salir (kg MS/ha) */
  residuo: number;
  /** Tasa de crecimiento máxima en lluvias y temperatura óptima (kg MS/ha/día) */
  tasaMax: number;
  /** Altura de entrada (cm): regla vertical apoyada en el suelo, hasta donde está la mayoría de las hojas sin estirarlas */
  alturaEntrada: number;
  /** Altura que debe quedar al salir (cm) */
  alturaSalida: number;
};

/** Referencias por especie. La clave se busca dentro del nombre del pasto del potrero. */
export const PASTOS: ParametrosPasto[] = [
  { clave: "kikuyo", label: "Kikuyo", tBase: 8, tOptima: 18, filocrono: 75, hojasObjetivo: 4, entrada: 2600, residuo: 1400, tasaMax: 55, alturaEntrada: 17, alturaSalida: 7 },
  { clave: "estrella", label: "Estrella africana", tBase: 12, tOptima: 27, filocrono: 90, hojasObjetivo: 4, entrada: 2800, residuo: 1500, tasaMax: 60, alturaEntrada: 30, alturaSalida: 13 },
  { clave: "transvala", label: "Transvala", tBase: 12, tOptima: 27, filocrono: 90, hojasObjetivo: 4, entrada: 2600, residuo: 1400, tasaMax: 55, alturaEntrada: 30, alturaSalida: 12 },
  { clave: "mulato", label: "Brachiaria híbrido (Mulato II)", tBase: 15, tOptima: 28, filocrono: 75, hojasObjetivo: 4.5, entrada: 3200, residuo: 1700, tasaMax: 70, alturaEntrada: 40, alturaSalida: 20 },
  { clave: "cayman", label: "Brachiaria híbrido (Cayman)", tBase: 15, tOptima: 28, filocrono: 75, hojasObjetivo: 4.5, entrada: 3200, residuo: 1700, tasaMax: 70, alturaEntrada: 40, alturaSalida: 20 },
  { clave: "brachiaria", label: "Brachiaria (Marandú, Toledo, decumbens)", tBase: 15, tOptima: 28, filocrono: 75, hojasObjetivo: 4.5, entrada: 3000, residuo: 1600, tasaMax: 65, alturaEntrada: 32, alturaSalida: 16 },
  { clave: "mombasa", label: "Mombasa", tBase: 15, tOptima: 29, filocrono: 110, hojasObjetivo: 3, entrada: 3500, residuo: 1800, tasaMax: 80, alturaEntrada: 90, alturaSalida: 45 },
  { clave: "tanzania", label: "Tanzania", tBase: 15, tOptima: 29, filocrono: 110, hojasObjetivo: 3, entrada: 3300, residuo: 1700, tasaMax: 75, alturaEntrada: 70, alturaSalida: 35 },
  { clave: "camerun", label: "Camerún", tBase: 15, tOptima: 29, filocrono: 110, hojasObjetivo: 3.5, entrada: 3600, residuo: 1800, tasaMax: 80, alturaEntrada: 100, alturaSalida: 45 },
  { clave: "raigras", label: "Raigrás", tBase: 4, tOptima: 15, filocrono: 110, hojasObjetivo: 3, entrada: 2600, residuo: 1500, tasaMax: 45, alturaEntrada: 22, alturaSalida: 6 },
  { clave: "ratana", label: "Ratana", tBase: 12, tOptima: 26, filocrono: 90, hojasObjetivo: 4, entrada: 2200, residuo: 1200, tasaMax: 35, alturaEntrada: 20, alturaSalida: 8 },
];
export const PASTO_GENERICO: ParametrosPasto = {
  clave: "natural",
  label: "Natural / sin definir",
  tBase: 12,
  tOptima: 26,
  filocrono: 90,
  hojasObjetivo: 4,
  entrada: 2400,
  residuo: 1300,
  tasaMax: 40,
  alturaEntrada: 30,
  alturaSalida: 12,
};

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parametrosPasto(tipoPasto: string | null | undefined): ParametrosPasto {
  if (!tipoPasto) return PASTO_GENERICO;
  const n = normalizar(tipoPasto);
  return PASTOS.find((p) => n.includes(p.clave)) ?? (/marandu|toledo|decumbens|brizantha|humidicola/.test(n) ? PASTOS.find((p) => p.clave === "brachiaria")! : PASTO_GENERICO);
}

// ───────────── Altura → kg MS/ha ─────────────

/**
 * Convierte la altura medida con regla a kg MS/ha para una especie.
 * Recta que pasa por (altura de salida, residuo) y (altura de entrada, cobertura de entrada), así la medida
 * queda en la misma escala que usa el modelo. `factor` es la calibración de la finca con cuadros de corte.
 * Por encima de 1,5 × la altura de entrada el pasto se acama y la relación deja de ser lineal: se acota.
 */
export function kgDesdeAltura(p: ParametrosPasto, cm: number, factor = 1) {
  const pendiente = (p.entrada - p.residuo) / Math.max(1, p.alturaEntrada - p.alturaSalida);
  const h = Math.min(cm, p.alturaEntrada * 1.5);
  return Math.round(Math.max(300, (p.residuo + (h - p.alturaSalida) * pendiente) * factor));
}

/** Calibración de la regla con aforos que tienen kg medido (cuadro de corte o plato) y altura. Necesita ≥ 3 pares. */
export function calibracionAltura(pares: { kg: number; cm: number; p: ParametrosPasto }[]) {
  const r = pares
    .filter((x) => x.cm > 0 && x.kg > 0)
    .map((x) => x.kg / kgDesdeAltura(x.p, x.cm))
    .sort((a, b) => a - b);
  if (r.length < 3) return 1;
  const mediana = r[Math.floor(r.length / 2)];
  return Math.min(1.6, Math.max(0.6, mediana));
}

/** Cómo quedó el potrero al sacar el ganado. */
export type EstadoSalida = "alto" | "bien" | "pelado";
export const ESTADOS_SALIDA: Record<EstadoSalida, { label: string; descripcion: string }> = {
  alto: { label: "Quedó alto", descripcion: "Sobró pasto: subpastoreo" },
  bien: { label: "Bien", descripcion: "Quedó el residuo justo" },
  pelado: { label: "Pelado", descripcion: "Se comió de más: sobrepastoreo, el rebrote tardará" },
};

/** Residuo real (kg MS/ha) con que arranca el rebrote, según lo registrado al salir. */
export function residuoSalida(p: ParametrosPasto, s: { alturaCm: number | null; estado: EstadoSalida | null }, factor = 1) {
  if (s.alturaCm != null && s.alturaCm > 0) return kgDesdeAltura(p, s.alturaCm, factor);
  if (s.estado === "alto") return Math.round(p.residuo * 1.3);
  if (s.estado === "pelado") return Math.round(p.residuo * 0.65);
  return p.residuo;
}

// ───────────── Crecimiento ─────────────

export type ContextoClima = {
  regimen: RegimenLluvia;
  altitudMsnm: number;
  /**
   * Lluvia real (mm por fecha YYYY-MM-DD) si la finca lleva pluviómetro.
   * Con el pluviómetro al día alimenta el balance hídrico del suelo; si no, se usa la estacionalidad del régimen.
   */
  lluvia?: Map<string, number>;
  /** Riego del potrero (mm por fecha) */
  riego?: Map<string, number>;
  /**
   * Nitrógeno aplicado al potrero (kg N/ha por fecha). `undefined` = la ganadería no registra abonos:
   * se asume un potrero abonado (la tasa de referencia) para no castigar a quien no los anota.
   */
  nitrogeno?: { fecha: string; kgHa: number }[];
  /** Fecha de hoy: después de hoy no hay lluvia medida y se usa la estacionalidad */
  hoy?: string;
};

// ───────────── Balance hídrico ─────────────

/**
 * Evapotranspiración de referencia ETo (mm/día) por mes y régimen, a baja altitud.
 * Valores medios aproximados de estaciones del IMN (Liberia, Alajuela/San José, Los Chiles/Limón).
 */
const ETO: Record<RegimenLluvia, number[]> = {
  //          ene  feb  mar  abr  may  jun  jul  ago  sep  oct  nov  dic
  pacifico: [6.0, 6.8, 7.2, 7.0, 5.2, 4.4, 4.8, 4.6, 4.0, 3.8, 4.4, 5.4],
  intermedio: [4.4, 5.0, 5.4, 5.2, 4.2, 3.8, 4.0, 3.9, 3.6, 3.5, 3.7, 4.0],
  caribe: [3.2, 3.6, 4.0, 4.2, 3.9, 3.5, 3.4, 3.6, 3.7, 3.4, 3.0, 2.9],
};
/** Agua aprovechable en la zona de raíces de un pastizal (mm): suelo franco, ~60 cm de raíces. */
export const CAPACIDAD_SUELO_MM = 100;
/** Fracción del agua aprovechable que el pasto usa sin estrés (FAO-56, p ≈ 0,5). */
const SIN_ESTRES = 0.5;
/** Coeficiente de cultivo de un pastizal tropical en crecimiento. */
const KC_PASTO = 0.95;
/** Lámina de riego si la labor no trae los mm. */
export const LAMINA_RIEGO_MM = 20;

/** ETo del día, menor en altura (más frío): ~ −8 % cada 1000 m. */
export function etoDia(fecha: string, ctx: ContextoClima) {
  const mes = Number(fecha.slice(5, 7)) - 1;
  return ETO[ctx.regimen][mes] * Math.max(0.6, 1 - 0.00008 * Math.max(0, ctx.altitudMsnm));
}

/** El pluviómetro está al día en `fecha`: algún dato en los 10 días previos y al menos 4 en los 30 previos. */
const alDia = new WeakMap<Map<string, number>, Map<string, boolean>>();
function pluviometroAlDia(lluvia: Map<string, number>, fecha: string) {
  let c = alDia.get(lluvia);
  if (!c) alDia.set(lluvia, (c = new Map()));
  const guardado = c.get(fecha);
  if (guardado != null) return guardado;
  const r = contarRegistros(lluvia, fecha);
  c.set(fecha, r);
  return r;
}
function contarRegistros(lluvia: Map<string, number>, fecha: string) {
  let recientes = 0;
  let mes = 0;
  for (let i = 0; i < 30; i++) {
    if (lluvia.has(sumarDias(fecha, -i))) {
      mes++;
      if (i < 10) recientes++;
    }
  }
  return recientes > 0 && mes >= 4;
}

type SerieAgua = { factores: Map<string, number>; ultimo: { fecha: string; agua: number } };
/** Caché del balance por mapa de lluvia/riego y por altitud/régimen (la ETo cambia con ellos). */
const seriesAgua = new WeakMap<object, Map<string, SerieAgua>>();

/**
 * Balance de agua del suelo (un "balde"): entra lluvia + riego, sale ETc ajustada por estrés.
 * Devuelve el factor de agua del día: 1 sin estrés, baja al secarse el suelo.
 * Con el pluviómetro al día los días sin dato cuentan como 0 mm (por eso existe "No llovió").
 */
function factorBalance(fecha: string, ctx: ContextoClima, lluvia: Map<string, number>) {
  const clave = ctx.riego ?? lluvia;
  let porSitio = seriesAgua.get(clave);
  if (!porSitio) seriesAgua.set(clave, (porSitio = new Map()));
  const sitio = `${ctx.regimen}:${Math.round(ctx.altitudMsnm / 50)}`;
  let s = porSitio.get(sitio);
  if (!s) {
    const fechas = [...lluvia.keys(), ...(ctx.riego?.keys() ?? [])].sort();
    const inicio = sumarDias(fechas[0] ?? fecha, -1);
    const mes = Number(inicio.slice(5, 7)) - 1;
    s = { factores: new Map(), ultimo: { fecha: inicio, agua: CAPACIDAD_SUELO_MM * ESTACIONALIDAD[ctx.regimen][mes] } };
    porSitio.set(sitio, s);
  }
  if (fecha <= s.ultimo.fecha) return s.factores.get(fecha) ?? null;
  let { agua } = s.ultimo;
  let dia = s.ultimo.fecha;
  while (dia < fecha) {
    dia = sumarDias(dia, 1);
    agua = Math.min(CAPACIDAD_SUELO_MM, agua + (lluvia.get(dia) ?? 0) + (ctx.riego?.get(dia) ?? 0));
    const ks = Math.min(1, agua / (CAPACIDAD_SUELO_MM * SIN_ESTRES));
    agua = Math.max(0, agua - etoDia(dia, ctx) * KC_PASTO * ks);
    s.factores.set(dia, Math.max(0.1, ks));
  }
  s.ultimo = { fecha: dia, agua };
  return s.factores.get(fecha) ?? null;
}

/** Factor de temperatura 0–1: 0 bajo la base, 1 en el óptimo, baja un poco por encima. */
export function factorTemperatura(p: ParametrosPasto, t: number) {
  if (t <= p.tBase) return 0;
  if (t <= p.tOptima) return (t - p.tBase) / (p.tOptima - p.tBase);
  return Math.max(0.6, 1 - (t - p.tOptima) * 0.04);
}

/**
 * Factor de agua para una fecha:
 * - hasta hoy, con el pluviómetro al día: balance hídrico (lluvia + riego − evapotranspiración);
 * - si no (sin pluviómetro o fechas futuras): estacionalidad del régimen, mejorada por el riego reciente.
 */
export function factorAgua(fecha: string, ctx: ContextoClima) {
  const hoy = ctx.hoy ?? hoyCR();
  if (fecha <= hoy && ctx.lluvia?.size && pluviometroAlDia(ctx.lluvia, fecha)) {
    const f = factorBalance(fecha, ctx, ctx.lluvia);
    if (f != null) return f;
  }
  const mes = Number(fecha.slice(5, 7)) - 1;
  const estacional = ESTACIONALIDAD[ctx.regimen][mes];
  // Sin pluviómetro, un riego en los últimos 10 días quita el estrés de verano
  if (ctx.riego?.size) {
    for (let i = 0; i < 10; i++) if (ctx.riego.has(sumarDias(fecha, -i))) return Math.max(estacional, 0.9);
  }
  return estacional;
}

// ───────────── Nitrógeno ─────────────

/** El N aplicado se agota en ~5 semanas (absorción, lavado, volatilización): vida media efectiva. */
const DECAIMIENTO_N_DIAS = 35;
/** Sin N el pasto crece al 60 % de un potrero bien abonado (respuesta típica de gramíneas tropicales). */
const PISO_N = 0.6;

/**
 * Factor de nitrógeno 0,6–1 según el N aplicado en los últimos 120 días (kg N/ha, con decaimiento).
 * Ej.: 46 kg N/ha (100 kg de urea) hace 10 días ≈ 0,94; hace 60 días ≈ 0,72; nada ≈ 0,6.
 * Si la ganadería no registra abonos devuelve 1 (la tasa de referencia ya supone un potrero abonado).
 */
export function factorNitrogeno(fecha: string, ctx: ContextoClima) {
  if (!ctx.nitrogeno) return 1;
  let efectivo = 0;
  for (const a of ctx.nitrogeno) {
    const d = diasEntre(a.fecha, fecha);
    if (d >= 0 && d <= 120) efectivo += a.kgHa * Math.exp(-d / DECAIMIENTO_N_DIAS);
  }
  return PISO_N + (1 - PISO_N) * (1 - Math.exp(-efectivo / 20));
}

/** Tasa de crecimiento esperada (kg MS/ha/día) para un pasto en una fecha. */
export function tasaCrecimiento(p: ParametrosPasto, fecha: string, ctx: ContextoClima, calibracion = 1) {
  const t = temperaturaPorAltitud(ctx.altitudMsnm);
  return p.tasaMax * factorTemperatura(p, t) * factorAgua(fecha, ctx) * factorNitrogeno(fecha, ctx) * calibracion;
}

/** Días que tarda en salir una hoja nueva a esa altitud. */
export function diasPorHoja(p: ParametrosPasto, altitudMsnm: number) {
  const gd = temperaturaPorAltitud(altitudMsnm) - p.tBase;
  return gd <= 0 ? Infinity : p.filocrono / gd;
}

/** Descanso que necesita un pasto para llegar a sus hojas objetivo (días). */
export function descansoPorHojas(p: ParametrosPasto, altitudMsnm: number, hojas = p.hojasObjetivo) {
  return Math.round(diasPorHoja(p, altitudMsnm) * hojas);
}

// ───────────── Estimación por potrero ─────────────

export type EntradaEstimacion = {
  tipoPasto: string | null;
  estado: "ocupado" | "en_espera" | "en_descanso" | "listo";
  /** Último aforo */
  aforo: { kgMsHa: number; fecha: string; hojas: number | null } | null;
  /** Fecha (YYYY-MM-DD, hora CR) de la última salida de ganado */
  ultimaSalida: string | null;
  /** Residuo registrado en esa salida (kg MS/ha); null = se asume el residuo de referencia */
  residuoUltimaSalida?: number | null;
  /** Fecha de entrada del pastoreo en curso */
  ocupadoDesde: string | null;
  diasOcupacionObjetivo: number;
  /** Tasa medida entre aforos sin pastoreo de por medio, si existe (kg MS/ha/día) y su fecha */
  tasaMedida: { kgDia: number; fecha: string } | null;
};

export type Fuente = "aforo" | "modelo" | "sin_datos";

export type Estimacion = {
  /** Cobertura estimada hoy (kg MS/ha) */
  cobertura: number | null;
  fuente: Fuente;
  /** Días desde el último dato real (aforo o salida) */
  diasDesdeDato: number | null;
  /** Tasa de crecimiento actual (kg MS/ha/día) */
  tasa: number;
  /** Hojas por rebrote estimadas */
  hojas: number | null;
  /** Proyección: cobertura en 7 y 14 días si no se pastorea */
  en7: number | null;
  en14: number | null;
  /** Forraje aprovechable sobre el residuo (kg MS/ha) */
  disponible: number | null;
  parametros: ParametrosPasto;
  /** Factor de calibración aplicado (1 = referencia) */
  calibracion: number;
  /** Factores de hoy (0–1): agua del suelo y nitrógeno */
  factores: { agua: number; nitrogeno: number; temperatura: number };
  /** Clima, riego y N del potrero: lo usa `proyectar` */
  contexto: ContextoClima;
};

const MAX_DIAS = 150;

/** Suma el crecimiento diario entre dos fechas (exclusivo de `desde`, inclusivo de `hasta`). */
function crecer(p: ParametrosPasto, base: number, desde: string, hasta: string, ctx: ContextoClima, cal: number) {
  const techo = p.entrada * 1.7; // pasado este punto la senescencia iguala al crecimiento
  const n = Math.min(MAX_DIAS, Math.max(0, diasEntre(desde, hasta)));
  let kg = base;
  for (let i = 1; i <= n; i++) {
    const tasa = tasaCrecimiento(p, sumarDias(desde, i), ctx, cal);
    // El rebrote crece más lento cerca del techo (curva logística simple)
    kg += tasa * Math.max(0.1, 1 - Math.max(0, kg - p.entrada) / (techo - p.entrada));
    if (kg >= techo) return techo;
  }
  return kg;
}

/** Hojas nuevas entre dos fechas: grados-día ÷ filocrono, frenado por la falta de agua (verano). */
function hojasEntre(p: ParametrosPasto, desde: string, hasta: string, ctx: ContextoClima) {
  const gd = temperaturaPorAltitud(ctx.altitudMsnm) - p.tBase;
  if (gd <= 0) return 0;
  const n = Math.min(MAX_DIAS, Math.max(0, diasEntre(desde, hasta)));
  let hojas = 0;
  for (let i = 1; i <= n; i++) hojas += (gd * Math.max(0.3, factorAgua(sumarDias(desde, i), ctx))) / p.filocrono;
  return hojas;
}

export function estimarPotrero(e: EntradaEstimacion, ctx: ContextoClima, hoy = hoyCR()): Estimacion {
  const p = parametrosPasto(e.tipoPasto);
  // Calibración: si se midió una tasa en los últimos 60 días, ajusta el modelo a esta finca
  let cal = 1;
  if (e.tasaMedida && diasEntre(e.tasaMedida.fecha, hoy) <= 60) {
    const ref = tasaCrecimiento(p, e.tasaMedida.fecha, ctx);
    if (ref > 1) cal = Math.min(1.6, Math.max(0.4, e.tasaMedida.kgDia / ref));
  }
  const tasa = tasaCrecimiento(p, hoy, ctx, cal);
  const dph = diasPorHoja(p, ctx.altitudMsnm);
  const extra = {
    factores: { agua: factorAgua(hoy, ctx), nitrogeno: factorNitrogeno(hoy, ctx), temperatura: factorTemperatura(p, temperaturaPorAltitud(ctx.altitudMsnm)) },
    contexto: ctx,
  };

  // Punto de partida: el dato real más reciente (aforo o salida del ganado con su residuo)
  const aforoVale = e.aforo && (!e.ultimaSalida || e.aforo.fecha >= e.ultimaSalida) && (!e.ocupadoDesde || e.aforo.fecha >= e.ocupadoDesde);
  let base: { kg: number; fecha: string; fuente: Fuente; hojas: number } | null = null;
  if (e.estado === "ocupado" && e.ocupadoDesde) {
    // Con ganado adentro, la cobertura baja hacia el residuo a lo largo de la ocupación
    const inicio = aforoVale ? e.aforo!.kgMsHa : p.entrada;
    const avance = Math.min(1, (diasEntre(e.ocupadoDesde, hoy) + 1) / Math.max(1, e.diasOcupacionObjetivo));
    const kg = inicio - (inicio - p.residuo) * avance;
    return {
      cobertura: Math.round(kg),
      fuente: aforoVale ? "aforo" : "modelo",
      diasDesdeDato: diasEntre(e.ocupadoDesde, hoy),
      tasa,
      hojas: null,
      en7: Math.round(crecer(p, p.residuo, hoy, sumarDias(hoy, 7), ctx, cal)),
      en14: Math.round(crecer(p, p.residuo, hoy, sumarDias(hoy, 14), ctx, cal)),
      disponible: Math.max(0, Math.round(kg - p.residuo)),
      parametros: p,
      calibracion: cal,
      ...extra,
    };
  }
  if (aforoVale) {
    const hojasAforo = e.aforo!.hojas ?? (e.ultimaSalida ? hojasEntre(p, e.ultimaSalida, e.aforo!.fecha, ctx) : p.hojasObjetivo);
    base = { kg: e.aforo!.kgMsHa, fecha: e.aforo!.fecha, fuente: "aforo", hojas: hojasAforo };
  } else if (e.ultimaSalida) {
    base = { kg: e.residuoUltimaSalida ?? p.residuo, fecha: e.ultimaSalida, fuente: "modelo", hojas: 0 };
  }
  if (!base) {
    return { cobertura: null, fuente: "sin_datos", diasDesdeDato: null, tasa, hojas: null, en7: null, en14: null, disponible: null, parametros: p, calibracion: cal, ...extra };
  }
  const dias = diasEntre(base.fecha, hoy);
  const hoyKg = crecer(p, base.kg, base.fecha, hoy, ctx, cal);
  const fuente: Fuente = base.fuente === "aforo" && dias <= 3 ? "aforo" : "modelo";
  return {
    cobertura: Math.round(hoyKg),
    fuente,
    diasDesdeDato: dias,
    tasa,
    hojas: Number.isFinite(dph) ? Math.min(8, base.hojas + hojasEntre(p, base.fecha, hoy, ctx)) : null,
    en7: Math.round(crecer(p, hoyKg, hoy, sumarDias(hoy, 7), ctx, cal)),
    en14: Math.round(crecer(p, hoyKg, hoy, sumarDias(hoy, 14), ctx, cal)),
    disponible: Math.max(0, Math.round(hoyKg - p.residuo)),
    parametros: p,
    calibracion: cal,
    ...extra,
  };
}

/** Cobertura proyectada en una fecha futura (para el planificador), con el contexto propio del potrero. */
export function proyectar(est: Estimacion, fecha: string, hoy = hoyCR()) {
  if (est.cobertura == null) return null;
  return Math.round(crecer(est.parametros, est.cobertura, hoy, fecha, est.contexto, est.calibracion));
}

/** Tasa medida entre dos aforos consecutivos (kg MS/ha/día), solo si no hubo pastoreo entre ambos. */
export function tasaEntreAforos(a: { kg: number; fecha: string }, b: { kg: number; fecha: string }) {
  const d = diasEntre(a.fecha, b.fecha);
  if (d < 5 || d > 60) return null;
  const tasa = (b.kg - a.kg) / d;
  return tasa > 0 && tasa < 250 ? tasa : null;
}

// ───────────── Prioridad de pastoreo ─────────────

export type Prioridad = "pastorear" | "pronto" | "pasado" | "esperar" | "bloqueado" | "ocupado" | "sin_datos";

export const PRIORIDADES: Record<Prioridad, { label: string; color: string; descripcion: string }> = {
  pasado: { label: "Pasándose", color: "#a8551e", descripcion: "Sobre la entrada ideal: pastorear ya o cortar para ensilaje/pacas" },
  pastorear: { label: "Pastorear ya", color: "#0f6e4c", descripcion: "Llegó a su cobertura u hojas objetivo" },
  pronto: { label: "Pronto", color: "#8fa33a", descripcion: "Le faltan pocos días" },
  esperar: { label: "Esperar", color: "#a9b8b3", descripcion: "Aún rebrotando" },
  bloqueado: { label: "En espera", color: "#8a2f45", descripcion: "Tiempo de reingreso de un producto" },
  ocupado: { label: "Ocupado", color: "#1f5f86", descripcion: "Con ganado" },
  sin_datos: { label: "Sin datos", color: "#8c7f75", descripcion: "Registra un aforo o un pastoreo" },
};

/** Índice de madurez: 1 = en su punto. Combina cobertura y hojas (lo que llegue primero). */
export function madurez(est: Estimacion) {
  if (est.cobertura == null) return null;
  const p = est.parametros;
  const porKg = (est.cobertura - p.residuo) / Math.max(1, p.entrada - p.residuo);
  const porHojas = est.hojas == null ? 0 : est.hojas / p.hojasObjetivo;
  return Math.max(porKg, porHojas);
}

export function prioridad(estado: EntradaEstimacion["estado"], est: Estimacion): Prioridad {
  if (estado === "ocupado") return "ocupado";
  if (estado === "en_espera") return "bloqueado";
  const m = madurez(est);
  if (m == null) return "sin_datos";
  if (m >= 1.35) return "pasado";
  if (m >= 0.95) return "pastorear";
  if (m >= 0.8) return "pronto";
  return "esperar";
}

/** Orden de pastoreo: los pasados primero, luego los que están en su punto (más maduros primero). */
export function puntajePrioridad(estado: EntradaEstimacion["estado"], est: Estimacion) {
  if (estado === "ocupado" || estado === "en_espera") return -1;
  return madurez(est) ?? 0;
}

// ───────────── Demanda ─────────────

/** Consumo de materia seca como % del peso vivo por categoría. */
export const CONSUMO_PCT_PV: Record<string, number> = {
  vacas_produccion: 3.0,
  vacas_secas: 2.0,
  vacas_cria: 2.3,
  novillas: 2.5,
  terneros: 3.0,
  toros: 2.0,
  novillos_engorde: 2.5,
  mixto: 2.5,
};

/**
 * Tasa de sustitución: kg MS de pasto que deja de comer el animal por cada kg MS de suplemento.
 * Con concentrado en pastoreo tropical ronda 0,3–0,5; con forrajes conservados (ensilaje, heno) es mayor (0,6–0,9).
 * Se usa 0,5 como valor conservador para dietas mixtas: no sobreestima el pasto que sobra.
 * (Antes se restaba 1:1, lo que hacía ver forraje de sobra en lecherías con mucho concentrado.)
 */
export const SUSTITUCION_SUPLEMENTO = 0.5;

/**
 * Demanda diaria de pasto de un lote (kg MS/día).
 * pasto = consumo en pastoreo − sustitución × suplemento. El suplemento eleva el consumo total del animal.
 */
export function demandaPasto(l: { cabezas: number; pesoKg: number; categoria: string; suplementoKgMs: number; consumoPct?: number | null }) {
  const pct = l.consumoPct ?? CONSUMO_PCT_PV[l.categoria] ?? 2.5;
  /** Consumo solo con pasto (sin suplemento) */
  const base = l.pesoKg * (pct / 100);
  const supl = Math.max(0, l.suplementoKgMs);
  const pasto = Math.max(0, base - SUSTITUCION_SUPLEMENTO * supl);
  const consumo = pasto + supl;
  return {
    /** Consumo total por animal (pasto + suplemento) */
    consumoAnimal: consumo,
    consumoBase: base,
    pastoAnimal: pasto,
    total: consumo * l.cabezas,
    pasto: pasto * l.cabezas,
    suplemento: supl * l.cabezas,
  };
}

/** Balance oferta/demanda de un pastoreo planificado. */
export type Balance = "liviano" | "justo" | "pesado";
export function balance(oferta: number, demanda: number): Balance {
  if (demanda <= 0) return "pesado";
  const r = oferta / demanda;
  return r < 0.9 ? "liviano" : r > 1.2 ? "pesado" : "justo";
}
export const BALANCES: Record<Balance, { label: string; descripcion: string }> = {
  liviano: { label: "Corto de forraje", descripcion: "El potrero no cubre la demanda: suplementar o acortar la estadía" },
  justo: { label: "Ajustado a la demanda", descripcion: "La oferta cubre la demanda sin desperdicio" },
  pesado: { label: "Sobra forraje", descripcion: "Quedará pasto: alargar la estadía, meter más animales o cortar" },
};

/** Fracción de la cobertura sobre el residuo que el ganado realmente cosecha. */
export const APROVECHAMIENTO = 0.85;

/** Suplementos comunes en CR (kg MS por kg tal como ofrecido). */
export const SUPLEMENTOS_CR = [
  { label: "Concentrado (alimento balanceado)", ms: 0.88 },
  { label: "Ensilaje de maíz o sorgo", ms: 0.3 },
  { label: "Pacas de heno", ms: 0.86 },
  { label: "Pulpa de cítricos", ms: 0.2 },
  { label: "Banano de rechazo", ms: 0.2 },
  { label: "Caña de azúcar picada", ms: 0.28 },
  { label: "Melaza", ms: 0.75 },
  { label: "Pasto de corta (King grass, Camerún)", ms: 0.18 },
];
