import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Modelo multi-tenant: cada cliente (ganadería) es una `organizacion`.
 * Toda tabla de negocio lleva `org_id` y toda consulta se filtra por él.
 * Los usuarios viven en el esquema `neon_auth` (Neon Auth); aquí solo
 * guardamos su id en `membresias`.
 *
 * Unidades: las áreas se guardan SIEMPRE en hectáreas y las dosis por hectárea;
 * la interfaz convierte a manzanas según la preferencia de la organización.
 */

export const rolEnum = pgEnum("rol", ["propietario", "administrador", "operador", "lector"]);
export const tipoProduccionEnum = pgEnum("tipo_produccion", ["leche", "carne", "doble_proposito"]);
export const unidadAreaEnum = pgEnum("unidad_area", ["ha", "mz"]);
export const categoriaLoteEnum = pgEnum("categoria_lote", [
  "vacas_produccion",
  "vacas_secas",
  "novillas",
  "terneros",
  "toros",
  "novillos_engorde",
  "vacas_cria",
  "mixto",
]);
export const tipoProductoEnum = pgEnum("tipo_producto", [
  "fertilizante",
  "foliar",
  "enmienda",
  "herbicida",
  "insecticida",
  "fungicida",
  "organico",
  "otro",
]);
export const unidadProductoEnum = pgEnum("unidad_producto", ["kg", "L"]);
export const metodoAplicacionEnum = pgEnum("metodo_aplicacion", [
  "voleo",
  "bomba_espalda",
  "aguilon",
  "dron",
  "fertirriego",
  "manual",
]);
export const tipoZonaEnum = pgEnum("tipo_zona", ["bosque", "proteccion", "agua", "camino", "instalaciones", "corte", "otro"]);
export const regimenLluviaEnum = pgEnum("regimen_lluvia", ["pacifico", "intermedio", "caribe"]);
export const tipoEventoEnum = pgEnum("tipo_evento", ["siembra", "chapia", "cosecha", "riego", "cercas", "tarea", "nota"]);
export const metodoAforoEnum = pgEnum("metodo_aforo", ["cuadro_corte", "regla_altura", "plato", "visual"]);
export const estadoSalidaEnum = pgEnum("estado_salida", ["alto", "bien", "pelado"]);
export const plagaEnum = pgEnum("plaga", ["salivazo_ninfas", "salivazo_adultos", "gusano_medidor", "gusano_soldado", "otra"]);

const creadoEn = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
};

const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizaciones.id, { onDelete: "cascade" });

export const organizaciones = pgTable("organizaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull().unique(),
  tipoProduccion: tipoProduccionEnum("tipo_produccion").notNull().default("doble_proposito"),
  unidadArea: unidadAreaEnum("unidad_area").notNull().default("ha"),
  ...creadoEn,
});

export const membresias = pgTable(
  "membresias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    rol: rolEnum("rol").notNull().default("lector"),
    ...creadoEn,
  },
  (t) => [uniqueIndex("membresias_org_user_uq").on(t.orgId, t.userId), index("membresias_user_idx").on(t.userId)],
);

/** Finca / área de trabajo dentro de una organización. */
export const fincas = pgTable(
  "fincas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    nombre: text("nombre").notNull(),
    ubicacion: text("ubicacion"),
    provincia: text("provincia"),
    canton: text("canton"),
    areaHa: numeric("area_ha", { precision: 10, scale: 2 }),
    /** Altitud media (msnm): define la temperatura y la velocidad de rebrote */
    altitudMsnm: integer("altitud_msnm"),
    /** Régimen de lluvias; si es null se deduce de provincia y cantón */
    regimenLluvia: regimenLluviaEnum("regimen_lluvia"),
    /** Centro del mapa [lng, lat] */
    centro: jsonb("centro").$type<[number, number]>(),
    ...creadoEn,
  },
  (t) => [index("fincas_org_idx").on(t.orgId)],
);

/**
 * Módulo de pastoreo: grupo de apartos asignado a un hato (Ordeño AM, Ordeño PM, Secas, Novillas…).
 * Cada hato rota dentro de su módulo; la numeración de apartos suele reiniciar por módulo.
 */
export const modulos = pgTable(
  "modulos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    nombre: text("nombre").notNull(),
    /** Color hex del módulo en el mapa (como la leyenda de los mapas de la finca) */
    color: text("color").notNull(),
    orden: integer("orden").notNull().default(0),
    ...creadoEn,
  },
  (t) => [index("modulos_org_idx").on(t.orgId), uniqueIndex("modulos_org_nombre_uq").on(t.orgId, t.nombre)],
);

/** Potrero / apartado de pastoreo. */
export const potreros = pgTable(
  "potreros",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    fincaId: uuid("finca_id")
      .notNull()
      .references(() => fincas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    moduloId: uuid("modulo_id").references(() => modulos.id, { onDelete: "set null" }),
    areaHa: numeric("area_ha", { precision: 14, scale: 6 }),
    /** Parte del potrero cubierta por zonas no pastoreables (calculada al guardar zonas o límites) */
    areaExcluidaHa: numeric("area_excluida_ha", { precision: 14, scale: 6 }).notNull().default("0"),
    /** Descuento digitado: árboles dispersos, charral, pendientes que no se mapearon */
    descuentoHa: numeric("descuento_ha", { precision: 14, scale: 6 }).notNull().default("0"),
    tipoPasto: text("tipo_pasto"),
    /** Altitud propia (msnm); null = la de la finca. En fincas de ladera cambia la temperatura y el descanso. */
    altitudMsnm: integer("altitud_msnm"),
    diasDescansoObjetivo: integer("dias_descanso_objetivo").notNull().default(30),
    diasOcupacionObjetivo: integer("dias_ocupacion_objetivo").notNull().default(1),
    /** Polígono GeoJSON (Polygon) dibujado en el mapa */
    geometria: jsonb("geometria").$type<{ type: "Polygon"; coordinates: number[][][] }>(),
    notas: text("notas"),
    ...creadoEn,
  },
  (t) => [index("potreros_org_idx").on(t.orgId), index("potreros_finca_idx").on(t.fincaId), index("potreros_modulo_idx").on(t.moduloId)],
);

/**
 * Zona no pastoreable de una finca (bosque, caminos, quebradas, instalaciones…).
 * Su intersección con cada potrero se descuenta del área aprovechable.
 */
export const zonas = pgTable(
  "zonas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    fincaId: uuid("finca_id")
      .notNull()
      .references(() => fincas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    tipo: tipoZonaEnum("tipo").notNull().default("otro"),
    geometria: jsonb("geometria").$type<{ type: "Polygon"; coordinates: number[][][] }>().notNull(),
    areaHa: numeric("area_ha", { precision: 14, scale: 6 }).notNull(),
    /** Si vino como línea (camino, quebrada): su eje y el ancho de la franja en metros */
    eje: jsonb("eje").$type<{ type: "LineString"; coordinates: number[][] }>(),
    anchoM: numeric("ancho_m", { precision: 8, scale: 2 }),
    ...creadoEn,
  },
  (t) => [index("zonas_org_idx").on(t.orgId), index("zonas_finca_idx").on(t.fincaId)],
);

/** Lote / grupo de animales que rota entre potreros. */
export const lotes = pgTable(
  "lotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    fincaId: uuid("finca_id")
      .notNull()
      .references(() => fincas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    /** Módulo donde rota este hato */
    moduloId: uuid("modulo_id").references(() => modulos.id, { onDelete: "set null" }),
    categoria: categoriaLoteEnum("categoria").notNull().default("mixto"),
    cabezas: integer("cabezas").notNull().default(0),
    pesoPromedioKg: numeric("peso_promedio_kg", { precision: 8, scale: 2 }),
    /** Suplemento por animal y día (kg de materia seca): concentrado, ensilaje, pacas… */
    suplementoKgMs: numeric("suplemento_kg_ms", { precision: 6, scale: 2 }).notNull().default("0"),
    /** Consumo de MS en % del peso vivo; null = referencia de la categoría */
    consumoPctPv: numeric("consumo_pct_pv", { precision: 4, scale: 2 }),
    ...creadoEn,
  },
  (t) => [index("lotes_org_idx").on(t.orgId)],
);

/** Evento de pastoreo: un lote ocupa un potrero entre entrada y salida. */
export const pastoreos = pgTable(
  "pastoreos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    loteId: uuid("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    cabezas: integer("cabezas"),
    fechaEntrada: timestamp("fecha_entrada", { withTimezone: true }).notNull().defaultNow(),
    fechaSalida: timestamp("fecha_salida", { withTimezone: true }),
    /** Cómo quedó el potrero al sacar el ganado (residuo): corrige el punto de partida del rebrote */
    estadoSalida: estadoSalidaEnum("estado_salida"),
    /** Altura del residuo al salir (cm, regla) */
    alturaSalidaCm: numeric("altura_salida_cm", { precision: 5, scale: 1 }),
    notas: text("notas"),
    ...creadoEn,
  },
  (t) => [index("pastoreos_org_idx").on(t.orgId), index("pastoreos_potrero_idx").on(t.potreroId)],
);

/** Aforo: forraje disponible (kg de materia seca por hectárea). */
export const aforos = pgTable(
  "aforos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull().defaultNow(),
    metodo: metodoAforoEnum("metodo").notNull().default("cuadro_corte"),
    kgMsHa: numeric("kg_ms_ha", { precision: 10, scale: 2 }).notNull(),
    alturaCm: numeric("altura_cm", { precision: 6, scale: 1 }),
    /** Hojas vivas por rebrote (etapa de hoja) */
    hojas: numeric("hojas", { precision: 3, scale: 1 }),
    ...creadoEn,
  },
  (t) => [index("aforos_org_idx").on(t.orgId), index("aforos_potrero_idx").on(t.potreroId)],
);

/** Registro de lluvia (pluviómetro) por finca. */
export const lluvias = pgTable(
  "lluvias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    fincaId: uuid("finca_id")
      .notNull()
      .references(() => fincas.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull().defaultNow(),
    mm: numeric("mm", { precision: 6, scale: 1 }).notNull(),
    ...creadoEn,
  },
  (t) => [index("lluvias_org_idx").on(t.orgId), uniqueIndex("lluvias_finca_fecha_uq").on(t.fincaId, t.fecha)],
);

/**
 * Catálogo de insumos de cada organización.
 * `periodoReingresoDias`: días que el ganado NO puede entrar al potrero tras aplicar (tiempo de espera de pastoreo).
 * `retiroLecheDias` / `retiroCarneDias`: retiro indicado en la etiqueta, si aplica.
 */
export const productos = pgTable(
  "productos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    nombre: text("nombre").notNull(),
    tipo: tipoProductoEnum("tipo").notNull(),
    ingredienteActivo: text("ingrediente_activo"),
    registro: text("registro"),
    unidad: unidadProductoEnum("unidad").notNull().default("kg"),
    /** Composición en % como en la etiqueta: N, P₂O₅, K₂O, CaO, MgO, S, B, Zn */
    n: numeric("n", { precision: 5, scale: 2 }),
    p: numeric("p", { precision: 5, scale: 2 }),
    k: numeric("k", { precision: 5, scale: 2 }),
    cao: numeric("cao", { precision: 5, scale: 2 }),
    mgo: numeric("mgo", { precision: 5, scale: 2 }),
    s: numeric("s", { precision: 5, scale: 2 }),
    b: numeric("b", { precision: 5, scale: 2 }),
    zn: numeric("zn", { precision: 5, scale: 2 }),
    periodoReingresoDias: integer("periodo_reingreso_dias").notNull().default(0),
    retiroLecheDias: integer("retiro_leche_dias"),
    retiroCarneDias: integer("retiro_carne_dias"),
    /** Precio en colones por unidad (kg o L) */
    precioUnidad: numeric("precio_unidad", { precision: 12, scale: 2 }),
    notas: text("notas"),
    ...creadoEn,
  },
  (t) => [index("productos_org_idx").on(t.orgId)],
);

/** Aplicación de un producto en un potrero (abono, foliar, herbicida…). Una fila por potrero. */
export const aplicaciones = pgTable(
  "aplicaciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    /** Agrupa las filas creadas en una misma jornada sobre varios potreros */
    grupoId: uuid("grupo_id").notNull(),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "restrict" }),
    fecha: date("fecha").notNull().defaultNow(),
    dosisPorHa: numeric("dosis_por_ha", { precision: 14, scale: 6 }).notNull(),
    cantidadTotal: numeric("cantidad_total", { precision: 12, scale: 3 }).notNull(),
    metodo: metodoAplicacionEnum("metodo").notNull().default("voleo"),
    costoTotal: numeric("costo_total", { precision: 14, scale: 2 }),
    /** Copia del período de reingreso al momento de aplicar (inmutable ante cambios del catálogo) */
    reingresoDias: integer("reingreso_dias").notNull().default(0),
    fechaLiberacion: date("fecha_liberacion").notNull(),
    responsable: text("responsable"),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [
    index("aplicaciones_org_idx").on(t.orgId),
    index("aplicaciones_potrero_idx").on(t.potreroId),
    index("aplicaciones_liberacion_idx").on(t.orgId, t.fechaLiberacion),
  ],
);

/**
 * Labor o evento de un potrero: siembra/resiembra, chapia, cosecha (ensilaje, pacas), riego, cercas, tareas y notas.
 * Las tareas con hecha = false son pendientes.
 */
export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    grupoId: uuid("grupo_id").notNull(),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    tipo: tipoEventoEnum("tipo").notNull(),
    fecha: date("fecha").notNull().defaultNow(),
    titulo: text("titulo"),
    /** Cantidad cosechada o sembrada y su unidad (pacas, kg, t, sacos) */
    cantidad: numeric("cantidad", { precision: 12, scale: 2 }),
    unidad: text("unidad"),
    /** Costo de la labor en colones (jornales, maquinaria) */
    costo: numeric("costo", { precision: 14, scale: 2 }),
    hecha: boolean("hecha").notNull().default(true),
    responsable: text("responsable"),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("eventos_org_idx").on(t.orgId), index("eventos_potrero_idx").on(t.potreroId)],
);

/** Plan de pastoreo: orden de potreros que seguirá cada lote y días previstos en cada uno. */
export const planPastoreo = pgTable(
  "plan_pastoreo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    loteId: uuid("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    orden: integer("orden").notNull(),
    dias: integer("dias").notNull().default(1),
    ...creadoEn,
  },
  (t) => [index("plan_org_idx").on(t.orgId), index("plan_lote_idx").on(t.loteId)],
);

/** Archivos (fotos, mapas, documentos) en Neon Object Storage. Guardamos la key, no los bytes. */
export const archivos = pgTable(
  "archivos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    potreroId: uuid("potrero_id").references(() => potreros.id, { onDelete: "set null" }),
    key: text("key").notNull().unique(),
    nombre: text("nombre").notNull(),
    contentType: text("content_type").notNull(),
    tamano: integer("tamano").notNull(),
    subidoPor: text("subido_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("archivos_org_idx").on(t.orgId)],
);

/**
 * Análisis químico de suelo (extracción KCl-Olsen modificado, como CIA-UCR e INTA).
 * Una muestra compuesta suele representar varios potreros (un módulo o un lote homogéneo).
 */
export const analisisSuelo = pgTable(
  "analisis_suelo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    fincaId: uuid("finca_id")
      .notNull()
      .references(() => fincas.id, { onDelete: "cascade" }),
    /** Nombre de la muestra (ej. "Módulo ordeño A") */
    nombre: text("nombre").notNull(),
    /** Potreros que representa la muestra */
    potreroIds: uuid("potrero_ids").array().notNull().default(sql`'{}'::uuid[]`),
    fecha: date("fecha").notNull(),
    laboratorio: text("laboratorio"),
    ph: numeric("ph", { precision: 4, scale: 2 }),
    /** Acidez intercambiable, Ca, Mg, K en cmol(+)/L */
    acidez: numeric("acidez", { precision: 6, scale: 2 }),
    ca: numeric("ca", { precision: 6, scale: 2 }),
    mg: numeric("mg", { precision: 6, scale: 2 }),
    k: numeric("k", { precision: 6, scale: 2 }),
    /** P, Zn, Cu, Fe, Mn en mg/L */
    p: numeric("p", { precision: 7, scale: 2 }),
    zn: numeric("zn", { precision: 7, scale: 2 }),
    cu: numeric("cu", { precision: 7, scale: 2 }),
    fe: numeric("fe", { precision: 7, scale: 2 }),
    mn: numeric("mn", { precision: 7, scale: 2 }),
    /** Materia orgánica (%) */
    mo: numeric("mo", { precision: 5, scale: 2 }),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("analisis_suelo_org_idx").on(t.orgId)],
);

/** Conteo de una plaga en un potrero (monitoreo). */
export const monitoreosPlaga = pgTable(
  "monitoreos_plaga",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    potreroId: uuid("potrero_id")
      .notNull()
      .references(() => potreros.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    plaga: plagaEnum("plaga").notNull(),
    /** Conteo en la unidad de la plaga (por m² o por 10 pases de red) */
    conteo: numeric("conteo", { precision: 8, scale: 2 }).notNull(),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("monitoreos_plaga_org_idx").on(t.orgId), index("monitoreos_plaga_potrero_idx").on(t.potreroId)],
);

/**
 * Leche producida en un período: un día (desde = hasta) o la liquidación quincenal de la cooperativa.
 * `loteId` null = toda la ganadería.
 */
export const produccionLeche = pgTable(
  "produccion_leche",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    loteId: uuid("lote_id").references(() => lotes.id, { onDelete: "set null" }),
    desde: date("desde").notNull(),
    hasta: date("hasta").notNull(),
    litros: numeric("litros", { precision: 12, scale: 1 }).notNull(),
    /** Vacas en ordeño en el período (para litros/vaca/día) */
    vacas: integer("vacas"),
    /** Precio pagado por litro (₡), si se conoce */
    precioLitro: numeric("precio_litro", { precision: 10, scale: 2 }),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("produccion_leche_org_idx").on(t.orgId)],
);

/** Pesaje de un lote: peso promedio de los animales pesados. */
export const pesajes = pgTable(
  "pesajes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    loteId: uuid("lote_id")
      .notNull()
      .references(() => lotes.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    cabezas: integer("cabezas").notNull(),
    pesoPromedioKg: numeric("peso_promedio_kg", { precision: 8, scale: 2 }).notNull(),
    notas: text("notas"),
    creadoPor: text("creado_por").notNull(),
    ...creadoEn,
  },
  (t) => [index("pesajes_org_idx").on(t.orgId), index("pesajes_lote_idx").on(t.loteId)],
);

export type Rol = (typeof rolEnum.enumValues)[number];
export type UnidadArea = (typeof unidadAreaEnum.enumValues)[number];
export type TipoProducto = (typeof tipoProductoEnum.enumValues)[number];
