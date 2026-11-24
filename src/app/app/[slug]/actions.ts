"use server";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import turfArea from "@turf/area";
import { db, schema } from "@/db";
import { ErrorUsuario, puede, requireOrg } from "@/lib/tenant";
import { subirObjeto } from "@/lib/storage";
import { datos, ejecutar, v, type Resultado } from "@/lib/acciones";
import { COLORES_MODULO, MODULOS_SUGERIDOS, TIPOS_ZONA, TIPOS_ZONA_IDS, aHectareas, areaAprovechable, diasEntre, dosisPorHa, fechaCR, hoyCR, loteDeOrdeno, sumarDias } from "@/lib/dominio";
import { recalcularExcluidas } from "@/lib/area-excluida";
import { calibracionAlturaOrg, potrerosConForraje } from "@/lib/consultas";
import { kgDesdeAltura, parametrosPasto } from "@/lib/forraje";
import { nivelPlaga } from "@/lib/plagas";
import { generarPlan } from "@/lib/plan";
import { retirosLechePorPotrero } from "@/lib/inocuidad";
import { ANCHO_DEFECTO, ANCHO_MAX_M, ANCHO_MIN_M, MAX_LONGITUD_M, franja, longitudM } from "@/lib/franja";

type Tabla = typeof schema.fincas | typeof schema.potreros | typeof schema.lotes | typeof schema.productos | typeof schema.modulos | typeof schema.zonas;

/** Verifica que un registro pertenezca a la organización (aislamiento entre clientes). */
async function deLaOrg(tabla: Tabla, id: string, orgId: string) {
  const [fila] = await db
    .select({ id: tabla.id })
    .from(tabla as typeof schema.fincas)
    .where(and(eq(tabla.id, id), eq(tabla.orgId, orgId)))
    .limit(1);
  if (!fila) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");
}

const rev = (slug: string) => revalidatePath(`/app/${slug}`, "layout");

/** Módulo opcional en formularios: "" = sin módulo. */
const regimenOpc = () => z.preprocess((x) => (x === "" || x == null ? null : x), z.enum(["pacifico", "intermedio", "caribe"]).nullable());
const pctOpc = () =>
  z.preprocess((x) => (x === "" || x == null ? undefined : x), z.coerce.number({ error: "Número inválido" }).min(0.5, "Mínimo 0,5 %").max(5, "Máximo 5 %").optional());

const moduloOpc = () => z.preprocess((x) => (x === "" || x == null ? null : x), z.uuid({ error: "Módulo inválido" }).nullable());

/** Verifica que el módulo (si viene) sea de la organización. */
async function moduloValido(moduloId: string | null | undefined, orgId: string) {
  if (moduloId) await deLaOrg(schema.modulos, moduloId, orgId);
  return moduloId ?? null;
}

const esDuplicado = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "23505" || x?.cause?.code === "23505";
};

/** Límite de cordura para un potrero dibujado (evita polígonos trazados con el mapa alejado). */
const MAX_HA_POTRERO = 5000;

const poligono = z
  .string()
  .transform((s, ctx) => {
    try {
      const g = JSON.parse(s);
      if (g?.type !== "Polygon" || !Array.isArray(g.coordinates)) throw new Error();
      return g as { type: "Polygon"; coordinates: number[][][] };
    } catch {
      ctx.addIssue({ code: "custom", message: "Polígono inválido" });
      return z.NEVER;
    }
  })
  .refine(
    (g) => turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000 <= MAX_HA_POTRERO,
    `Un área no puede medir más de ${MAX_HA_POTRERO.toLocaleString("es-CR")} ha. Acerca el mapa a tu finca y vuelve a dibujarla.`,
  );

type Pol = { type: "Polygon"; coordinates: number[][][] };
const haDe = (g: Pol) => turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000;

/** Eje de un camino o quebrada (coordenadas WGS84). */
const ejeLinea = z
  .array(z.array(z.number()).min(2), { error: "Línea inválida" })
  .min(2, "La línea necesita al menos dos puntos")
  .max(20_000, "La línea tiene demasiados puntos")
  .refine((cs) => cs.every((c) => Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90), "Coordenadas inválidas")
  .transform((cs) => cs.map((c) => [c[0], c[1]]))
  .refine((cs) => longitudM(cs) <= MAX_LONGITUD_M, `Una línea no puede medir más de ${MAX_LONGITUD_M / 1000} km.`);

const ejeJson = z
  .string()
  .transform((s, ctx) => {
    try {
      const g = JSON.parse(s);
      return Array.isArray(g) ? g : g?.coordinates;
    } catch {
      ctx.addIssue({ code: "custom", message: "Línea inválida" });
      return z.NEVER;
    }
  })
  .pipe(ejeLinea);

const anchoM = () =>
  z.coerce
    .number({ error: "Ancho inválido" })
    .min(ANCHO_MIN_M, `El ancho mínimo es ${ANCHO_MIN_M} m`)
    .max(ANCHO_MAX_M, `El ancho máximo es ${ANCHO_MAX_M} m`);

/** Convierte el eje en la franja que se descuenta; el servidor la calcula, no confía en el navegador. */
function aFranja(eje: number[][], ancho: number): Pol {
  const g = franja(eje, ancho);
  if (!g) throw new ErrorUsuario("La línea es demasiado corta.");
  if (haDe(g) > MAX_HA_POTRERO) throw new ErrorUsuario(`La franja mide más de ${MAX_HA_POTRERO.toLocaleString("es-CR")} ha. Revisa el ancho.`);
  return g;
}

// ───────────── Organización y fincas ─────────────

export async function actualizarOrganizacion(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        nombre: v.texto(80),
        tipoProduccion: z.enum(["leche", "carne", "doble_proposito"]),
        unidadArea: z.enum(["ha", "mz"]),
      })
      .parse(datos(fd));
    await db.update(schema.organizaciones).set(d).where(eq(schema.organizaciones.id, org.id));
    rev(slug);
    return "Ajustes guardados";
  });
}

export async function crearFinca(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        nombre: v.texto(),
        provincia: v.opcional(40),
        canton: v.opcional(60),
        ubicacion: v.opcional(),
        area: v.numOpc(),
        altitud: v.enteroOpc(0, 3800),
        regimen: regimenOpc(),
      })
      .parse(datos(fd));
    await db.insert(schema.fincas).values({
      altitudMsnm: d.altitud ?? null,
      regimenLluvia: d.regimen,
      orgId: org.id,
      nombre: d.nombre,
      provincia: d.provincia,
      canton: d.canton,
      ubicacion: d.ubicacion,
      areaHa: d.area == null ? undefined : aHectareas(d.area, org.unidadArea).toFixed(2),
    });
    rev(slug);
    return `Finca "${d.nombre}" creada`;
  });
}

// ───────────── Potreros ─────────────

export async function crearPotrero(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        fincaId: v.id(),
        nombre: v.texto(),
        tipoPasto: v.opcional(80),
        area: v.numOpc(),
        diasDescanso: v.entero(1, 365).default(30),
        diasOcupacion: v.entero(1, 60).default(1),
        geometria: z.preprocess((x) => (x === "" ? undefined : x), poligono.optional()),
        moduloId: moduloOpc(),
      })
      .parse({ diasDescanso: 30, diasOcupacion: 1, ...datos(fd) });
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    const moduloId = await moduloValido(d.moduloId, org.id);
    // Si hay polígono, el área se calcula de él (m² → ha); si no, se usa la digitada.
    const areaHa = d.geometria
      ? turfArea({ type: "Feature", geometry: d.geometria, properties: {} }) / 10_000
      : d.area != null
        ? aHectareas(d.area, org.unidadArea)
        : undefined;
    await db.insert(schema.potreros).values({
      orgId: org.id,
      fincaId: d.fincaId,
      nombre: d.nombre,
      moduloId,
      tipoPasto: d.tipoPasto,
      areaHa: areaHa?.toFixed(6),
      diasDescansoObjetivo: d.diasDescanso,
      diasOcupacionObjetivo: d.diasOcupacion,
      geometria: d.geometria,
    });
    if (d.geometria) await recalcularExcluidas(db, org.id, [d.fincaId]);
    rev(slug);
    return `Potrero "${d.nombre}" creado`;
  });
}

export async function actualizarPotrero(slug: string, potreroId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await deLaOrg(schema.potreros, potreroId, org.id);
    const d = z
      .object({
        nombre: v.texto(),
        tipoPasto: v.opcional(80),
        area: v.numOpc(),
        diasDescanso: v.entero(1, 365),
        diasOcupacion: v.entero(1, 60),
        notas: v.opcional(1000),
        moduloId: moduloOpc(),
        descuento: v.numOpc(),
        altitud: v.enteroOpc(0, 4000),
      })
      .parse(datos(fd));
    const moduloId = await moduloValido(d.moduloId, org.id);
    const [actual] = await db
      .select({ geometria: schema.potreros.geometria, areaHa: schema.potreros.areaHa, excluida: schema.potreros.areaExcluidaHa })
      .from(schema.potreros)
      .where(eq(schema.potreros.id, potreroId));
    const areaHa = actual?.geometria ? Number(actual.areaHa) : d.area == null ? null : aHectareas(d.area, org.unidadArea);
    const descuentoHa = d.descuento == null ? 0 : aHectareas(d.descuento, org.unidadArea);
    if (descuentoHa > 0 && areaHa != null && descuentoHa > areaHa - Number(actual?.excluida ?? 0) + 1e-9) {
      throw new ErrorUsuario("El descuento no puede ser mayor que el área que queda para pastorear.");
    }
    await db
      .update(schema.potreros)
      .set({
        nombre: d.nombre,
        moduloId,
        tipoPasto: d.tipoPasto ?? null,
        altitudMsnm: d.altitud ?? null,
        diasDescansoObjetivo: d.diasDescanso,
        diasOcupacionObjetivo: d.diasOcupacion,
        notas: d.notas ?? null,
        descuentoHa: descuentoHa.toFixed(6),
        // Con polígono el área la manda el mapa
        ...(actual?.geometria ? {} : { areaHa: d.area == null ? null : aHectareas(d.area, org.unidadArea).toFixed(6) }),
      })
      .where(eq(schema.potreros.id, potreroId));
    rev(slug);
    return "Potrero actualizado";
  });
}

/**
 * Altitud de cada potrero dibujado, desde el modelo de elevación Copernicus GLO-90 (servicio público de Open-Meteo).
 * Solo envía el punto central de cada polígono; completa los potreros sin altitud (o todos, si se pide).
 */
export async function calcularAltitudes(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const todos = fd.get("todos") === "1";
    const potreros = await db
      .select({ id: schema.potreros.id, geometria: schema.potreros.geometria })
      .from(schema.potreros)
      .where(and(eq(schema.potreros.orgId, org.id), sql`${schema.potreros.geometria} is not null`, todos ? sql`true` : isNull(schema.potreros.altitudMsnm)));
    if (!potreros.length) return todos ? "No hay potreros dibujados en el mapa." : "Todos los potreros dibujados ya tienen altitud.";

    const centro = (g: Pol) => {
      const anillo = g.coordinates[0].slice(0, -1);
      return [anillo.reduce((s, c) => s + c[0], 0) / anillo.length, anillo.reduce((s, c) => s + c[1], 0) / anillo.length];
    };
    let n = 0;
    for (let i = 0; i < potreros.length; i += 100) {
      const lote = potreros.slice(i, i + 100);
      const puntos = lote.map((p) => centro(p.geometria!));
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${puntos.map((c) => c[1].toFixed(5)).join(",")}&longitude=${puntos.map((c) => c[0].toFixed(5)).join(",")}`;
      let elevacion: number[];
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        elevacion = ((await res.json()) as { elevation: number[] }).elevation;
      } catch {
        throw new ErrorUsuario(n ? `Se calcularon ${n} potreros; el servicio de elevación no respondió para el resto. Intenta de nuevo.` : "El servicio de elevación no respondió. Intenta más tarde.");
      }
      for (const [k, p] of lote.entries()) {
        const msnm = elevacion[k];
        if (typeof msnm !== "number" || !Number.isFinite(msnm) || msnm < 0 || msnm > 4000) continue;
        await db.update(schema.potreros).set({ altitudMsnm: Math.round(msnm) }).where(and(eq(schema.potreros.id, p.id), eq(schema.potreros.orgId, org.id)));
        n++;
      }
    }
    rev(slug);
    return `Altitud calculada para ${n} potrero${n === 1 ? "" : "s"}`;
  });
}

export async function guardarGeometria(slug: string, potreroId: string, geojson: string): Promise<Resultado> {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await deLaOrg(schema.potreros, potreroId, org.id);
    const g = poligono.parse(geojson);
    const ha = turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000;
    const [p] = await db
      .update(schema.potreros)
      .set({ geometria: g, areaHa: ha.toFixed(6) })
      .where(eq(schema.potreros.id, potreroId))
      .returning({ fincaId: schema.potreros.fincaId });
    await recalcularExcluidas(db, org.id, [p.fincaId]);
    rev(slug);
    return "Límite del potrero guardado";
  });
}

/**
 * Importa polígonos leídos de un archivo (KML, KMZ, GeoJSON, Shapefile, GPX).
 * Cada elemento crea un potrero nuevo o reemplaza el límite de uno existente.
 */
export async function importarPotreros(slug: string, payload: string): Promise<Resultado> {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const r = z
      .object({
        fincaId: v.id(),
        tipoPasto: v.opcional(80),
        diasDescanso: v.entero(1, 365),
        diasOcupacion: v.entero(1, 60),
        moduloId: moduloOpc(),
        items: z
          .array(
            z
              .object({
                nombre: v.texto(),
                geometria: poligono.optional(),
                eje: ejeLinea.optional(),
                anchoM: anchoM().optional(),
                potreroId: z.uuid().nullable(),
                zona: z.enum(TIPOS_ZONA_IDS).nullable().default(null),
              })
              .refine((i) => (i.eje ? i.anchoM != null && i.zona != null && !i.potreroId : i.geometria != null), "Falta la geometría o el ancho de la línea"),
          )
          .min(1, "Selecciona al menos un polígono.")
          .max(500, "Importa como máximo 500 polígonos a la vez."),
      })
      .safeParse(JSON.parse(payload));
    if (!r.success) {
      // Mensaje con el número de fila para que el usuario sepa qué polígono corregir
      const i = r.error.issues[0];
      const fila = i.path[0] === "items" && typeof i.path[1] === "number" ? `Fila ${i.path[1] + 1}: ` : "";
      throw new ErrorUsuario(fila + i.message);
    }
    const d = {
      ...r.data,
      items: r.data.items.map((i, n) => {
        if (!i.eje) return { ...i, geometria: i.geometria! };
        try {
          return { ...i, geometria: aFranja(i.eje, i.anchoM!) };
        } catch (e) {
          throw e instanceof ErrorUsuario ? new ErrorUsuario(`Fila ${n + 1}: ${e.message}`) : e;
        }
      }),
    };
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    const moduloId = await moduloValido(d.moduloId, org.id);

    const destinos = [...new Set(d.items.flatMap((i) => (i.potreroId ? [i.potreroId] : [])))];
    if (destinos.length) {
      const propios = await db
        .select({ id: schema.potreros.id })
        .from(schema.potreros)
        .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, destinos)));
      if (propios.length !== destinos.length) throw new ErrorUsuario("Algún potrero de destino no pertenece a esta ganadería.");
      if (destinos.length !== d.items.filter((i) => i.potreroId).length) {
        throw new ErrorUsuario("Dos polígonos apuntan al mismo potrero existente.");
      }
    }

    const ha = (g: { type: "Polygon"; coordinates: number[][][] }) =>
      (turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000).toFixed(6);
    const zonasNuevas = d.items.filter((i) => i.zona);
    const nuevos = d.items.filter((i) => !i.potreroId && !i.zona);
    const existentes = d.items.filter((i) => i.potreroId && !i.zona);
    await db.transaction(async (tx) => {
      if (zonasNuevas.length) {
        await tx.insert(schema.zonas).values(
          zonasNuevas.map((i) => ({
            orgId: org.id,
            fincaId: d.fincaId,
            nombre: i.nombre,
            tipo: i.zona!,
            geometria: i.geometria,
            areaHa: ha(i.geometria),
            ...(i.eje ? { eje: { type: "LineString" as const, coordinates: i.eje }, anchoM: i.anchoM!.toFixed(2) } : {}),
          })),
        );
      }
      if (nuevos.length) {
        await tx.insert(schema.potreros).values(
          nuevos.map((i) => ({
            orgId: org.id,
            fincaId: d.fincaId,
            nombre: i.nombre,
            moduloId,
            tipoPasto: d.tipoPasto,
            areaHa: ha(i.geometria),
            diasDescansoObjetivo: d.diasDescanso,
            diasOcupacionObjetivo: d.diasOcupacion,
            geometria: i.geometria,
          })),
        );
      }
      for (const i of existentes) {
        await tx
          .update(schema.potreros)
          .set({ geometria: i.geometria, areaHa: ha(i.geometria), ...(moduloId ? { moduloId } : {}) })
          .where(and(eq(schema.potreros.id, i.potreroId!), eq(schema.potreros.orgId, org.id)));
      }
      const fincasTocadas = existentes.length
        ? await tx
            .selectDistinct({ fincaId: schema.potreros.fincaId })
            .from(schema.potreros)
            .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, existentes.map((i) => i.potreroId!))))
        : [];
      await recalcularExcluidas(tx, org.id, [d.fincaId, ...fincasTocadas.map((x) => x.fincaId)]);
    });
    rev(slug);
    const partes = [
      nuevos.length ? `${nuevos.length} potrero${nuevos.length === 1 ? "" : "s"} creado${nuevos.length === 1 ? "" : "s"}` : "",
      existentes.length ? `${existentes.length} límite${existentes.length === 1 ? "" : "s"} actualizado${existentes.length === 1 ? "" : "s"}` : "",
      zonasNuevas.length ? `${zonasNuevas.length} área${zonasNuevas.length === 1 ? "" : "s"} no pastoreable${zonasNuevas.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
  });
}

// ───────────── Áreas no pastoreables ─────────────

export async function crearZona(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const fd2 = datos(fd);
    const base = z.object({ fincaId: v.id(), tipo: z.enum(TIPOS_ZONA_IDS, { error: "Elige el tipo de área" }), nombre: v.opcional(120) });
    const d = fd2.eje
      ? base.extend({ eje: ejeJson, anchoM: anchoM() }).parse(fd2)
      : base.extend({ geometria: poligono }).parse(fd2);
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    const nombre = d.nombre ?? TIPOS_ZONA[d.tipo].label.split(" (")[0];
    const geometria = "eje" in d ? aFranja(d.eje, d.anchoM) : d.geometria;
    await db.insert(schema.zonas).values({
      orgId: org.id,
      fincaId: d.fincaId,
      nombre,
      tipo: d.tipo,
      geometria,
      areaHa: haDe(geometria).toFixed(6),
      ...("eje" in d ? { eje: { type: "LineString" as const, coordinates: d.eje }, anchoM: d.anchoM.toFixed(2) } : {}),
    });
    await recalcularExcluidas(db, org.id, [d.fincaId]);
    rev(slug);
    return `«${nombre}» guardada como área no pastoreable`;
  });
}

export async function actualizarZona(slug: string, zonaId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const [zona] = await db
      .select({ eje: schema.zonas.eje, anchoM: schema.zonas.anchoM, fincaId: schema.zonas.fincaId })
      .from(schema.zonas)
      .where(and(eq(schema.zonas.id, zonaId), eq(schema.zonas.orgId, org.id)));
    if (!zona) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");
    const d = z
      .object({
        tipo: z.enum(TIPOS_ZONA_IDS, { error: "Elige el tipo de área" }),
        nombre: v.texto(120),
        anchoM: z.preprocess((x) => (x === "" || x == null ? undefined : x), anchoM().optional()),
      })
      .parse(datos(fd));
    const cambiaAncho = zona.eje && d.anchoM != null && d.anchoM !== Number(zona.anchoM);
    const geometria = cambiaAncho ? aFranja(zona.eje!.coordinates, d.anchoM!) : null;
    await db
      .update(schema.zonas)
      .set({ tipo: d.tipo, nombre: d.nombre, ...(geometria ? { geometria, areaHa: haDe(geometria).toFixed(6), anchoM: d.anchoM!.toFixed(2) } : {}) })
      .where(eq(schema.zonas.id, zonaId));
    if (geometria) await recalcularExcluidas(db, org.id, [zona.fincaId]);
    rev(slug);
    return "Área actualizada";
  });
}

export async function guardarGeometriaZona(slug: string, zonaId: string, geojson: string): Promise<Resultado> {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const [actual] = await db
      .select({ tipo: schema.zonas.tipo, anchoM: schema.zonas.anchoM })
      .from(schema.zonas)
      .where(and(eq(schema.zonas.id, zonaId), eq(schema.zonas.orgId, org.id)));
    if (!actual) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");
    let tipoGeo: string | undefined;
    try {
      tipoGeo = JSON.parse(geojson)?.type;
    } catch {}
    let cambios;
    if (tipoGeo === "LineString") {
      const eje = ejeJson.parse(geojson);
      const ancho = actual.anchoM == null ? ANCHO_DEFECTO[actual.tipo] : Number(actual.anchoM);
      const g = aFranja(eje, ancho);
      cambios = { geometria: g, areaHa: haDe(g).toFixed(6), eje: { type: "LineString" as const, coordinates: eje }, anchoM: ancho.toFixed(2) };
    } else {
      const g = poligono.parse(geojson);
      cambios = { geometria: g, areaHa: haDe(g).toFixed(6), eje: null, anchoM: null };
    }
    const [zona] = await db
      .update(schema.zonas)
      .set(cambios)
      .where(eq(schema.zonas.id, zonaId))
      .returning({ fincaId: schema.zonas.fincaId });
    await recalcularExcluidas(db, org.id, [zona.fincaId]);
    rev(slug);
    return "Límite del área guardado";
  });
}

export async function eliminarZona(slug: string, zonaId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const [zona] = await db
      .delete(schema.zonas)
      .where(and(eq(schema.zonas.id, zonaId), eq(schema.zonas.orgId, org.id)))
      .returning({ fincaId: schema.zonas.fincaId, nombre: schema.zonas.nombre });
    if (!zona) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");
    await recalcularExcluidas(db, org.id, [zona.fincaId]);
    rev(slug);
    return `«${zona.nombre}» eliminada`;
  });
}

// ───────────── Lotes y rotación ─────────────

const CATEGORIAS = [
  "vacas_produccion",
  "vacas_secas",
  "novillas",
  "terneros",
  "toros",
  "novillos_engorde",
  "vacas_cria",
  "mixto",
] as const;

export async function crearLote(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        fincaId: v.id(),
        nombre: v.texto(),
        categoria: z.enum(CATEGORIAS),
        cabezas: v.entero(0, 100000),
        peso: v.numOpc(),
        moduloId: moduloOpc(),
        suplemento: v.numOpc(),
        consumoPct: pctOpc(),
      })
      .parse(datos(fd));
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    await db.insert(schema.lotes).values({
      orgId: org.id,
      fincaId: d.fincaId,
      moduloId: await moduloValido(d.moduloId, org.id),
      nombre: d.nombre,
      categoria: d.categoria,
      cabezas: d.cabezas,
      pesoPromedioKg: d.peso?.toString(),
      suplementoKgMs: (d.suplemento ?? 0).toString(),
      consumoPctPv: d.consumoPct?.toString() ?? null,
    });
    rev(slug);
    return `Lote "${d.nombre}" creado`;
  });
}

export async function actualizarLote(slug: string, loteId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    await deLaOrg(schema.lotes, loteId, org.id);
    const d = z
      .object({ nombre: v.texto(), categoria: z.enum(CATEGORIAS), cabezas: v.entero(0, 100000), peso: v.numOpc(), moduloId: moduloOpc(), suplemento: v.numOpc(), consumoPct: pctOpc() })
      .parse(datos(fd));
    await db
      .update(schema.lotes)
      .set({
        nombre: d.nombre,
        categoria: d.categoria,
        cabezas: d.cabezas,
        pesoPromedioKg: d.peso?.toString() ?? null,
        moduloId: await moduloValido(d.moduloId, org.id),
        suplementoKgMs: (d.suplemento ?? 0).toString(),
        consumoPctPv: d.consumoPct?.toString() ?? null,
      })
      .where(and(eq(schema.lotes.id, loteId), eq(schema.lotes.orgId, org.id)));
    rev(slug);
    return "Lote actualizado";
  });
}

// ───────────── Módulos por hato ─────────────

const colorModulo = () =>
  z.string().refine((c) => COLORES_MODULO.some((x) => x.hex === c), "Elige un color de la lista");

export async function crearModulo(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z.object({ nombre: v.texto(60), color: colorModulo() }).parse(datos(fd));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.modulos).where(eq(schema.modulos.orgId, org.id));
    try {
      await db.insert(schema.modulos).values({ orgId: org.id, nombre: d.nombre, color: d.color, orden: n });
    } catch (e) {
      if (esDuplicado(e)) throw new ErrorUsuario(`Ya existe el módulo "${d.nombre}".`);
      throw e;
    }
    rev(slug);
    return `Módulo "${d.nombre}" creado`;
  });
}

/** Crea de un clic los módulos típicos según el tipo de ganadería (omite los que ya existen). */
export async function crearModulosSugeridos(slug: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const nombres = MODULOS_SUGERIDOS[org.tipoProduccion];
    const creados = await db
      .insert(schema.modulos)
      .values(nombres.map((nombre, i) => ({ orgId: org.id, nombre, color: COLORES_MODULO[i % COLORES_MODULO.length].hex, orden: i })))
      .onConflictDoNothing()
      .returning({ id: schema.modulos.id });
    rev(slug);
    return `${creados.length} módulo${creados.length === 1 ? "" : "s"} creado${creados.length === 1 ? "" : "s"}`;
  });
}

export async function actualizarModulo(slug: string, moduloId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await deLaOrg(schema.modulos, moduloId, org.id);
    const d = z.object({ nombre: v.texto(60), color: colorModulo() }).parse(datos(fd));
    try {
      await db.update(schema.modulos).set(d).where(and(eq(schema.modulos.id, moduloId), eq(schema.modulos.orgId, org.id)));
    } catch (e) {
      if (esDuplicado(e)) throw new ErrorUsuario(`Ya existe el módulo "${d.nombre}".`);
      throw e;
    }
    rev(slug);
    return "Módulo actualizado";
  });
}

/** Borra el módulo; sus apartos y hatos quedan sin módulo (no se borran). */
export async function eliminarModulo(slug: string, moduloId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.modulos).where(and(eq(schema.modulos.id, moduloId), eq(schema.modulos.orgId, org.id)));
    rev(slug);
    return "Módulo eliminado";
  });
}

/** Asigna (o quita, con moduloId vacío) el módulo de varios potreros a la vez. */
export async function asignarModulo(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        moduloId: moduloOpc(),
        potreroIds: z.preprocess((x) => (x == null ? [] : Array.isArray(x) ? x : [x]), z.array(z.uuid()).min(1, "Marca al menos un potrero en la lista.")),
      })
      .parse(datos(fd));
    const moduloId = await moduloValido(d.moduloId, org.id);
    const r = await db
      .update(schema.potreros)
      .set({ moduloId })
      .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, d.potreroIds)))
      .returning({ id: schema.potreros.id });
    rev(slug);
    const n = `${r.length} potrero${r.length === 1 ? "" : "s"}`;
    if (!moduloId) return `${n} sin módulo`;
    const [m] = await db.select({ nombre: schema.modulos.nombre }).from(schema.modulos).where(eq(schema.modulos.id, moduloId));
    return `${n} asignado${r.length === 1 ? "" : "s"} a ${m.nombre}`;
  });
}

export async function moverLote(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const d = z
      .object({ loteId: v.id(), potreroId: v.id(), notas: v.opcional(500) })
      .and(salidaForm)
      .and(cuandoForm)
      .parse(datos(fd));
    const cuando = momento(d.cuando);
    await deLaOrg(schema.lotes, d.loteId, org.id);
    await deLaOrg(schema.potreros, d.potreroId, org.id);

    const [lote] = await db
      .select({ cabezas: schema.lotes.cabezas, nombre: schema.lotes.nombre, moduloId: schema.lotes.moduloId, categoria: schema.lotes.categoria })
      .from(schema.lotes)
      .where(eq(schema.lotes.id, d.loteId));
    const ordeno = loteDeOrdeno(lote.categoria, org.tipoProduccion);

    // Idempotente: un registro reenviado desde la cola del celular no duplica el movimiento
    const [yaEsta] = await db
      .select({ id: schema.pastoreos.id, potrero: schema.potreros.nombre })
      .from(schema.pastoreos)
      .innerJoin(schema.potreros, eq(schema.potreros.id, schema.pastoreos.potreroId))
      .where(and(eq(schema.pastoreos.orgId, org.id), eq(schema.pastoreos.loteId, d.loteId), eq(schema.pastoreos.potreroId, d.potreroId), isNull(schema.pastoreos.fechaSalida)));
    if (yaEsta) return `${lote.nombre} ya está en ${yaEsta.potrero}`;

    // Carencia de pastoreo (y retiro de leche si el lote se ordeña): no se mete ganado a un potrero con un producto activo.
    const hoy = hoyCR();
    const aplicadas = await db
      .select({
        liberacion: schema.aplicaciones.fechaLiberacion,
        leche: sql<string | null>`(${schema.aplicaciones.fecha} + ${schema.productos.retiroLecheDias})::text`,
        carne: sql<string | null>`(${schema.aplicaciones.fecha} + ${schema.productos.retiroCarneDias})::text`,
        producto: schema.productos.nombre,
      })
      .from(schema.aplicaciones)
      .innerJoin(schema.productos, eq(schema.productos.id, schema.aplicaciones.productoId))
      .where(
        and(
          eq(schema.aplicaciones.orgId, org.id),
          eq(schema.aplicaciones.potreroId, d.potreroId),
          sql`greatest(${schema.aplicaciones.fechaLiberacion},
                       ${schema.aplicaciones.fecha} + coalesce(${schema.productos.retiroLecheDias}, 0),
                       ${schema.aplicaciones.fecha} + coalesce(${schema.productos.retiroCarneDias}, 0)) > ${hoy}::date`,
        ),
      );
    const bloqueo = aplicadas
      .flatMap((a) => [
        { hasta: a.liberacion, producto: a.producto, motivo: "carencia de pastoreo" },
        ...(ordeno && a.leche ? [{ hasta: a.leche, producto: a.producto, motivo: "retiro de leche" }] : []),
      ])
      .filter((b) => b.hasta > hoy)
      .sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
    if (bloqueo) {
      throw new ErrorUsuario(
        `Potrero bloqueado por ${bloqueo.producto} (${bloqueo.motivo}) hasta el ${fechaCR(bloqueo.hasta)}. Elige otro potrero.`,
      );
    }
    const carneHasta = aplicadas.map((a) => a.carne).filter((x): x is string => !!x && x > hoy).sort().at(-1);

    const [destino] = await db
      .select({ nombre: schema.potreros.nombre, moduloId: schema.potreros.moduloId })
      .from(schema.potreros)
      .where(eq(schema.potreros.id, d.potreroId));
    await db.transaction(async (tx) => {
      // Un lote está en un solo potrero a la vez: cierra su pastoreo abierto.
      await tx
        .update(schema.pastoreos)
        .set({ fechaSalida: sql`greatest(${cuando.sql}, ${schema.pastoreos.fechaEntrada})`, ...valoresSalida(d) })
        .where(and(eq(schema.pastoreos.orgId, org.id), eq(schema.pastoreos.loteId, d.loteId), isNull(schema.pastoreos.fechaSalida)));
      await tx.insert(schema.pastoreos).values({
        orgId: org.id,
        ...(cuando.fecha ? { fechaEntrada: cuando.fecha } : {}),
        potreroId: d.potreroId,
        loteId: d.loteId,
        cabezas: lote.cabezas,
        notas: d.notas,
      });
      // El potrero sale del plan del lote: ya se ejecutó
      await tx
        .delete(schema.planPastoreo)
        .where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, d.loteId), eq(schema.planPastoreo.potreroId, d.potreroId)));
    });
    rev(slug);
    // Se permite salir del módulo (p. ej. por falta de forraje), pero se avisa.
    const fuera = lote.moduloId && destino.moduloId !== lote.moduloId ? " (fuera de su módulo)" : "";
    const aviso = carneHasta ? `. Retiro de carne: no enviar a sacrificio antes del ${fechaCR(carneHasta)}` : "";
    return `${lote.nombre} movido a ${destino.nombre}${fuera}${aviso}`;
  });
}

/** Cómo quedó el potrero al sacar el ganado (ambos opcionales). */
const salidaForm = z.object({
  estadoSalida: z.preprocess((x) => (x === "" || x == null ? null : x), z.enum(["alto", "bien", "pelado"]).nullable()),
  alturaSalida: z.preprocess(
    (x) => (x === "" || x == null ? undefined : x),
    z.coerce.number({ error: "Número inválido" }).min(0, "No puede ser negativo").max(300, "Máximo 300 cm").optional(),
  ),
});
type Salida = z.infer<typeof salidaForm>;

/** Momento real del registro (lo manda la cola del celular cuando se anotó sin señal). */
const cuandoForm = z.object({
  cuando: z.preprocess((x) => (x === "" || x == null ? undefined : x), z.iso.datetime({ offset: true, error: "Hora inválida" }).optional()),
});
function momento(cuando: string | undefined) {
  if (!cuando) return { sql: sql`now()`, fecha: null as Date | null };
  const t = new Date(cuando);
  if (t.getTime() > Date.now() + 5 * 60_000) throw new ErrorUsuario("La hora del registro no puede ser futura.");
  if (t.getTime() < Date.now() - 14 * 86_400_000) throw new ErrorUsuario("El registro tiene más de 14 días; anótalo a mano.");
  return { sql: sql`${t.toISOString()}::timestamptz`, fecha: t };
}
const valoresSalida = (s: Salida) => ({
  estadoSalida: s.estadoSalida ?? null,
  alturaSalidaCm: s.alturaSalida != null ? s.alturaSalida.toString() : null,
});

export async function sacarLote(slug: string, pastoreoId: string, _p: Resultado, fd?: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const s = salidaForm.and(cuandoForm).parse(fd ? datos(fd) : {});
    const cuando = momento(s.cuando);
    await db
      .update(schema.pastoreos)
      .set({ fechaSalida: sql`greatest(${cuando.sql}, ${schema.pastoreos.fechaEntrada})`, ...valoresSalida(s) })
      .where(and(eq(schema.pastoreos.id, pastoreoId), eq(schema.pastoreos.orgId, org.id), isNull(schema.pastoreos.fechaSalida)));
    rev(slug);
    return s.estadoSalida === "pelado"
      ? "Lote retirado. Quedó pelado: el rebrote tardará más; considera abonar y alargar el descanso"
      : "Lote retirado; el potrero inicia su descanso";
  });
}

// ───────────── Registros de campo ─────────────

export async function registrarAforo(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const d = z
      .object({
        potreroId: v.id(),
        fecha: v.fecha(),
        metodo: z.enum(["cuadro_corte", "regla_altura", "plato", "visual"]),
        kgMsHa: v.numOpc(),
        alturaCm: v.numOpc(),
        hojas: z.preprocess(
          (x) => (x === "" || x == null ? undefined : x),
          z.coerce.number({ error: "Número inválido" }).min(0, "No puede ser negativo").max(12, "Máximo 12 hojas").optional(),
        ),
      })
      .parse(datos(fd));
    if (d.fecha > hoyCR()) throw new ErrorUsuario("La fecha del aforo no puede ser futura.");
    const [potrero] = await db
      .select({ tipoPasto: schema.potreros.tipoPasto })
      .from(schema.potreros)
      .where(and(eq(schema.potreros.id, d.potreroId), eq(schema.potreros.orgId, org.id)));
    if (!potrero) throw new ErrorUsuario("Registro no encontrado en esta ganadería.");

    // Con regla basta la altura: los kg salen de la ecuación de la especie, calibrada con los cuadros de corte de la finca
    let kg = d.kgMsHa && d.kgMsHa > 0 ? d.kgMsHa : null;
    let calculado = false;
    if (kg == null) {
      if (!d.alturaCm) throw new ErrorUsuario("Anota la altura en cm o los kg de MS/ha.");
      kg = kgDesdeAltura(parametrosPasto(potrero.tipoPasto), d.alturaCm, await calibracionAlturaOrg(org.id));
      calculado = true;
    }
    // Idempotente ante reenvíos de la cola sin señal
    const [repetido] = await db
      .select({ id: schema.aforos.id })
      .from(schema.aforos)
      .where(
        and(
          eq(schema.aforos.orgId, org.id),
          eq(schema.aforos.potreroId, d.potreroId),
          eq(schema.aforos.fecha, d.fecha),
          eq(schema.aforos.metodo, d.metodo),
          sql`${schema.aforos.alturaCm} is not distinct from ${d.alturaCm ?? null}::numeric`,
          sql`${schema.aforos.hojas} is not distinct from ${d.hojas ?? null}::numeric`,
          ...(calculado ? [] : [sql`${schema.aforos.kgMsHa} = ${kg}::numeric`]),
        ),
      )
      .limit(1);
    if (repetido) return "Ese aforo ya estaba registrado";
    await db.insert(schema.aforos).values({
      orgId: org.id,
      potreroId: d.potreroId,
      fecha: d.fecha,
      metodo: d.metodo,
      kgMsHa: kg.toString(),
      alturaCm: d.alturaCm?.toString(),
      hojas: d.hojas?.toString(),
    });
    rev(slug);
    return calculado ? `Aforo registrado: ${d.alturaCm} cm ≈ ${kg.toLocaleString("es-CR")} kg MS/ha` : "Aforo registrado";
  });
}

export async function registrarLluvia(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const d = z.object({ fincaId: v.id(), fecha: v.fecha(), mm: v.num(0) }).parse(datos(fd));
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    await db
      .insert(schema.lluvias)
      .values({ orgId: org.id, fincaId: d.fincaId, fecha: d.fecha, mm: d.mm.toString() })
      .onConflictDoUpdate({ target: [schema.lluvias.fincaId, schema.lluvias.fecha], set: { mm: d.mm.toString() } });
    rev(slug);
    return `${d.mm} mm registrados`;
  });
}

// ───────────── Insumos y aplicaciones ─────────────

/** % de un nutriente en la etiqueta (0–100) */
const pctNutriente = () =>
  z.preprocess((x) => (x === "" || x == null ? undefined : x), z.coerce.number({ error: "Número inválido" }).min(0, "No puede ser negativo").max(100, "Máximo 100 %").optional());

const TIPOS = ["fertilizante", "foliar", "enmienda", "herbicida", "insecticida", "fungicida", "organico", "otro"] as const;

export async function guardarProducto(slug: string, productoId: string | null, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    if (productoId) await deLaOrg(schema.productos, productoId, org.id);
    const d = z
      .object({
        nombre: v.texto(),
        tipo: z.enum(TIPOS),
        unidad: z.enum(["kg", "L"]),
        ingredienteActivo: v.opcional(120),
        registro: v.opcional(60),
        n: pctNutriente(),
        p: pctNutriente(),
        k: pctNutriente(),
        cao: pctNutriente(),
        mgo: pctNutriente(),
        s: pctNutriente(),
        b: pctNutriente(),
        zn: pctNutriente(),
        reingreso: v.entero(0, 365),
        retiroLeche: v.enteroOpc(0, 365),
        retiroCarne: v.enteroOpc(0, 365),
        precio: v.numOpc(),
        notas: v.opcional(500),
      })
      .parse(datos(fd));
    const valores = {
      nombre: d.nombre,
      tipo: d.tipo,
      unidad: d.unidad,
      ingredienteActivo: d.ingredienteActivo ?? null,
      registro: d.registro ?? null,
      n: d.n?.toString() ?? null,
      p: d.p?.toString() ?? null,
      k: d.k?.toString() ?? null,
      cao: d.cao?.toString() ?? null,
      mgo: d.mgo?.toString() ?? null,
      s: d.s?.toString() ?? null,
      b: d.b?.toString() ?? null,
      zn: d.zn?.toString() ?? null,
      periodoReingresoDias: d.reingreso,
      retiroLecheDias: d.retiroLeche ?? null,
      retiroCarneDias: d.retiroCarne ?? null,
      precioUnidad: d.precio?.toString() ?? null,
      notas: d.notas ?? null,
    };
    if (productoId) await db.update(schema.productos).set(valores).where(eq(schema.productos.id, productoId));
    else await db.insert(schema.productos).values({ orgId: org.id, ...valores });
    rev(slug);
    return productoId ? "Producto actualizado" : `Producto "${d.nombre}" agregado`;
  });
}

export async function registrarAplicacion(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const raw = datos(fd);
    const d = z
      .object({
        potreroIds: z.array(v.id()).min(1, "Selecciona al menos un potrero"),
        productoId: v.id(),
        fecha: v.fecha(),
        dosis: v.numPos(),
        metodo: z.enum(["voleo", "bomba_espalda", "aguilon", "dron", "fertirriego", "manual"]),
        responsable: v.opcional(80),
        notas: v.opcional(500),
      })
      .parse({ ...raw, potreroIds: [raw.potreroIds ?? []].flat() });
    if (d.fecha > hoyCR()) throw new ErrorUsuario("La fecha de aplicación no puede ser futura.");

    const [producto] = await db
      .select()
      .from(schema.productos)
      .where(and(eq(schema.productos.id, d.productoId), eq(schema.productos.orgId, org.id)));
    if (!producto) throw new ErrorUsuario("Producto no encontrado.");
    const potreros = await db
      .select({
        id: schema.potreros.id,
        nombre: schema.potreros.nombre,
        total: schema.potreros.areaHa,
        excluida: schema.potreros.areaExcluidaHa,
        descuento: schema.potreros.descuentoHa,
      })
      .from(schema.potreros)
      .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, d.potreroIds)))
      .then((xs) => xs.map((p) => ({ ...p, areaHa: areaAprovechable(p.total == null ? null : Number(p.total), Number(p.excluida), Number(p.descuento)) })));
    if (potreros.length !== d.potreroIds.length) throw new ErrorUsuario("Algún potrero no pertenece a esta ganadería.");
    const sinArea = potreros.filter((p) => !p.areaHa || p.areaHa <= 0);
    if (sinArea.length) {
      throw new ErrorUsuario(`Define el área de: ${sinArea.map((p) => p.nombre).join(", ")} (dibújalo en el mapa o edítalo).`);
    }

    const porHa = dosisPorHa(d.dosis, org.unidadArea);
    const reingreso = producto.periodoReingresoDias;
    const grupoId = crypto.randomUUID();
    await db.insert(schema.aplicaciones).values(
      potreros.map((p) => {
        const cantidad = porHa * p.areaHa!;
        return {
          orgId: org.id,
          grupoId,
          potreroId: p.id,
          productoId: producto.id,
          fecha: d.fecha,
          dosisPorHa: porHa.toFixed(6),
          cantidadTotal: cantidad.toFixed(3),
          metodo: d.metodo,
          costoTotal: producto.precioUnidad ? (cantidad * Number(producto.precioUnidad)).toFixed(2) : null,
          reingresoDias: reingreso,
          fechaLiberacion: sumarDias(d.fecha, reingreso),
          responsable: d.responsable,
          notas: d.notas,
          creadoPor: user.id,
        };
      }),
    );
    rev(slug);
    let msj = reingreso > 0 ? `Aplicación registrada. Sin pastoreo hasta el ${fechaCR(sumarDias(d.fecha, reingreso))}.` : "Aplicación registrada.";

    // Lotes que estaban adentro: su leche / carne queda en retiro
    const { retiroLecheDias: rl, retiroCarneDias: rc } = producto;
    if ((rl ?? 0) > 0 || (rc ?? 0) > 0) {
      const adentro = await db
        .select({ nombre: schema.lotes.nombre, categoria: schema.lotes.categoria })
        .from(schema.pastoreos)
        .innerJoin(schema.lotes, eq(schema.lotes.id, schema.pastoreos.loteId))
        .where(and(eq(schema.pastoreos.orgId, org.id), inArray(schema.pastoreos.potreroId, d.potreroIds), isNull(schema.pastoreos.fechaSalida)));
      for (const l of adentro) {
        const partes = [
          rl && loteDeOrdeno(l.categoria, org.tipoProduccion) ? `leche no apta hasta el ${fechaCR(sumarDias(d.fecha, rl))}` : null,
          rc ? `carne hasta el ${fechaCR(sumarDias(d.fecha, rc))}` : null,
        ].filter(Boolean);
        if (partes.length) msj += ` ⚠ ${l.nombre} estaba adentro: ${partes.join("; ")}.`;
      }
    }
    return msj;
  });
}

export async function eliminarAplicacion(slug: string, grupoId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db
      .delete(schema.aplicaciones)
      .where(and(eq(schema.aplicaciones.orgId, org.id), eq(schema.aplicaciones.grupoId, grupoId)));
    rev(slug);
    return "Aplicación eliminada";
  });
}

// ───────────── Suelos y plagas ─────────────

const numSuelo = (max: number) =>
  z.preprocess((x) => (x === "" || x == null ? undefined : x), z.coerce.number({ error: "Número inválido" }).min(0, "No puede ser negativo").max(max, `Máximo ${max}`).optional());

export async function registrarAnalisis(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const raw = datos(fd);
    const d = z
      .object({
        fincaId: v.id(),
        nombre: v.texto(80),
        potreroIds: z.array(v.id()),
        fecha: v.fecha(),
        laboratorio: v.opcional(80),
        ph: numSuelo(14),
        acidez: numSuelo(30),
        ca: numSuelo(60),
        mg: numSuelo(30),
        k: numSuelo(10),
        p: numSuelo(500),
        zn: numSuelo(200),
        cu: numSuelo(200),
        fe: numSuelo(1000),
        mn: numSuelo(1000),
        mo: numSuelo(100),
        notas: v.opcional(1000),
      })
      .parse({ ...raw, potreroIds: [raw.potreroIds ?? []].flat() });
    if (d.fecha > hoyCR()) throw new ErrorUsuario("La fecha del análisis no puede ser futura.");
    if (d.ph == null && d.acidez == null && d.ca == null && d.p == null) throw new ErrorUsuario("Anota al menos el pH, la acidez, el calcio o el fósforo.");
    await deLaOrg(schema.fincas, d.fincaId, org.id);
    if (d.potreroIds.length) {
      const n = await db
        .select({ id: schema.potreros.id })
        .from(schema.potreros)
        .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, d.potreroIds)));
      if (n.length !== new Set(d.potreroIds).size) throw new ErrorUsuario("Algún potrero no pertenece a esta ganadería.");
    }
    const num = (x: number | undefined) => (x == null ? null : x.toString());
    await db.insert(schema.analisisSuelo).values({
      orgId: org.id,
      fincaId: d.fincaId,
      nombre: d.nombre,
      potreroIds: [...new Set(d.potreroIds)],
      fecha: d.fecha,
      laboratorio: d.laboratorio ?? null,
      ph: num(d.ph),
      acidez: num(d.acidez),
      ca: num(d.ca),
      mg: num(d.mg),
      k: num(d.k),
      p: num(d.p),
      zn: num(d.zn),
      cu: num(d.cu),
      fe: num(d.fe),
      mn: num(d.mn),
      mo: num(d.mo),
      notas: d.notas ?? null,
      creadoPor: user.id,
    });
    rev(slug);
    return `Análisis "${d.nombre}" guardado`;
  });
}

export async function eliminarAnalisis(slug: string, id: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.analisisSuelo).where(and(eq(schema.analisisSuelo.id, id), eq(schema.analisisSuelo.orgId, org.id)));
    rev(slug);
    return "Análisis eliminado";
  });
}

export async function registrarMonitoreo(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const d = z
      .object({
        potreroId: v.id(),
        fecha: v.fecha(),
        plaga: z.enum(["salivazo_ninfas", "salivazo_adultos", "gusano_medidor", "gusano_soldado", "otra"]),
        conteo: v.num(0),
        notas: v.opcional(500),
      })
      .parse(datos(fd));
    if (d.fecha > hoyCR()) throw new ErrorUsuario("La fecha no puede ser futura.");
    if (d.plaga === "otra" && !d.notas) throw new ErrorUsuario("Describe en las notas qué plaga observaste.");
    await deLaOrg(schema.potreros, d.potreroId, org.id);
    await db.insert(schema.monitoreosPlaga).values({
      orgId: org.id,
      potreroId: d.potreroId,
      fecha: d.fecha,
      plaga: d.plaga,
      conteo: d.conteo.toString(),
      notas: d.notas ?? null,
      creadoPor: user.id,
    });
    rev(slug);
    const nv = nivelPlaga(d.plaga, d.conteo);
    return nv === "accion" ? "Monitoreo guardado: sobre el umbral de acción" : nv === "alerta" ? "Monitoreo guardado: vigilar este potrero" : "Monitoreo guardado";
  });
}

export async function eliminarMonitoreo(slug: string, id: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.monitoreosPlaga).where(and(eq(schema.monitoreosPlaga.id, id), eq(schema.monitoreosPlaga.orgId, org.id)));
    rev(slug);
    return "Monitoreo eliminado";
  });
}

// ───────────── Producción ─────────────

export async function registrarLeche(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const d = z
      .object({
        loteId: z.preprocess((x) => (x === "" || x == null ? null : x), z.uuid({ error: "Lote inválido" }).nullable()),
        desde: v.fecha(),
        hasta: v.fecha(),
        litros: v.numPos(),
        vacas: v.enteroOpc(1, 100000),
        precio: v.numOpc(),
        notas: v.opcional(500),
      })
      .parse(datos(fd));
    if (d.hasta < d.desde) throw new ErrorUsuario("La fecha final no puede ser anterior a la inicial.");
    if (d.hasta > hoyCR()) throw new ErrorUsuario("La fecha no puede ser futura.");
    if (diasEntre(d.desde, d.hasta) > 62) throw new ErrorUsuario("Registra períodos de hasta 2 meses (por ejemplo, cada quincena).");
    if (d.loteId) await deLaOrg(schema.lotes, d.loteId, org.id);
    // Evita contar dos veces la misma leche
    const [solapa] = await db
      .select({ id: schema.produccionLeche.id })
      .from(schema.produccionLeche)
      .where(
        and(
          eq(schema.produccionLeche.orgId, org.id),
          d.loteId ? eq(schema.produccionLeche.loteId, d.loteId) : isNull(schema.produccionLeche.loteId),
          sql`${schema.produccionLeche.desde} <= ${d.hasta}::date and ${schema.produccionLeche.hasta} >= ${d.desde}::date`,
        ),
      )
      .limit(1);
    if (solapa) throw new ErrorUsuario("Ya hay leche registrada en esas fechas para ese lote. Revisa o elimina el registro anterior.");
    await db.insert(schema.produccionLeche).values({
      orgId: org.id,
      loteId: d.loteId,
      desde: d.desde,
      hasta: d.hasta,
      litros: d.litros.toString(),
      vacas: d.vacas ?? null,
      precioLitro: d.precio?.toString() ?? null,
      notas: d.notas ?? null,
      creadoPor: user.id,
    });
    rev(slug);
    const dias = diasEntre(d.desde, d.hasta) + 1;
    return `${d.litros.toLocaleString("es-CR")} L registrados${d.vacas ? ` · ${(d.litros / d.vacas / dias).toLocaleString("es-CR", { maximumFractionDigits: 1 })} L/vaca/día` : ""}`;
  });
}

export async function eliminarLeche(slug: string, id: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.produccionLeche).where(and(eq(schema.produccionLeche.id, id), eq(schema.produccionLeche.orgId, org.id)));
    rev(slug);
    return "Registro eliminado";
  });
}

export async function registrarPesaje(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const d = z
      .object({ loteId: v.id(), fecha: v.fecha(), cabezas: v.entero(1, 100000), peso: v.numPos(), notas: v.opcional(500) })
      .parse(datos(fd));
    if (d.fecha > hoyCR()) throw new ErrorUsuario("La fecha no puede ser futura.");
    if (d.peso > 1500) throw new ErrorUsuario("Revisa el peso: es el promedio por animal en kg.");
    await deLaOrg(schema.lotes, d.loteId, org.id);
    const [previo] = await db
      .select({ fecha: schema.pesajes.fecha, peso: schema.pesajes.pesoPromedioKg })
      .from(schema.pesajes)
      .where(and(eq(schema.pesajes.orgId, org.id), eq(schema.pesajes.loteId, d.loteId), sql`${schema.pesajes.fecha} < ${d.fecha}::date`))
      .orderBy(desc(schema.pesajes.fecha))
      .limit(1);
    const [posterior] = await db
      .select({ id: schema.pesajes.id })
      .from(schema.pesajes)
      .where(and(eq(schema.pesajes.orgId, org.id), eq(schema.pesajes.loteId, d.loteId), sql`${schema.pesajes.fecha} > ${d.fecha}::date`))
      .limit(1);
    await db.transaction(async (tx) => {
      await tx.insert(schema.pesajes).values({
        orgId: org.id,
        loteId: d.loteId,
        fecha: d.fecha,
        cabezas: d.cabezas,
        pesoPromedioKg: d.peso.toString(),
        notas: d.notas ?? null,
        creadoPor: user.id,
      });
      // El pesaje más reciente actualiza el peso del lote: así la demanda de pasto usa el peso real
      if (!posterior) await tx.update(schema.lotes).set({ pesoPromedioKg: d.peso.toString() }).where(and(eq(schema.lotes.id, d.loteId), eq(schema.lotes.orgId, org.id)));
    });
    rev(slug);
    if (previo) {
      const dias = diasEntre(previo.fecha, d.fecha);
      if (dias >= 7) {
        const gdp = ((d.peso - Number(previo.peso)) / dias) * 1000;
        return `Pesaje guardado: ${Math.round(gdp).toLocaleString("es-CR")} g/día desde el ${fechaCR(previo.fecha)}`;
      }
    }
    return "Pesaje guardado";
  });
}

export async function eliminarPesaje(slug: string, id: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.pesajes).where(and(eq(schema.pesajes.id, id), eq(schema.pesajes.orgId, org.id)));
    rev(slug);
    return "Pesaje eliminado";
  });
}

// ───────────── Archivos y equipo ─────────────

const MAX_BYTES = 10 * 1024 * 1024;

export async function subirArchivo(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const file = fd.get("archivo");
    if (!(file instanceof File) || file.size === 0) throw new ErrorUsuario("Selecciona un archivo.");
    if (file.size > MAX_BYTES) throw new ErrorUsuario("El archivo supera 10 MB.");
    const potreroId = z
      .preprocess((x) => (x === "" || x == null ? undefined : x), z.uuid().optional())
      .parse(fd.get("potreroId"));
    if (potreroId) await deLaOrg(schema.potreros, potreroId, org.id);

    const nombre = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "archivo";
    const key = `orgs/${org.id}/${crypto.randomUUID()}-${nombre}`;
    const contentType = file.type || "application/octet-stream";
    await subirObjeto(key, new Uint8Array(await file.arrayBuffer()), contentType);
    await db.insert(schema.archivos).values({ orgId: org.id, potreroId, key, nombre, contentType, tamano: file.size, subidoPor: user.id });
    rev(slug);
    return `"${nombre}" subido`;
  });
}

export async function agregarMiembro(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user, rol: miRol } = await requireOrg(slug, "administrador");
    const d = z
      .object({
        email: z.email({ error: "Correo inválido" }).transform((s) => s.trim().toLowerCase()),
        rol: z.enum(["administrador", "operador", "lector"]),
      })
      .parse(datos(fd));
    // Los usuarios viven en el esquema neon_auth (Neon Auth). El invitado debe haberse registrado.
    const { rows } = await db.execute<{ id: string }>(
      sql`select id::text as id from neon_auth."user" where lower(email) = ${d.email} limit 1`,
    );
    if (!rows[0]) throw new ErrorUsuario("Ese correo aún no tiene cuenta en Repastos. Pídele que se registre primero.");
    // Cambiar el rol de alguien que ya es miembro: nadie toca al propietario, solo el
    // propietario cambia el rol de un administrador, y nadie cambia el suyo propio.
    const [actual] = await db
      .select({ rol: schema.membresias.rol })
      .from(schema.membresias)
      .where(and(eq(schema.membresias.orgId, org.id), eq(schema.membresias.userId, rows[0].id)));
    if (actual?.rol === "propietario") throw new ErrorUsuario("No se puede cambiar el rol del propietario.");
    if (actual?.rol === "administrador" && !puede(miRol, "propietario")) {
      throw new ErrorUsuario("Solo el propietario puede cambiar el rol de un administrador.");
    }
    if (rows[0].id === user.id) throw new ErrorUsuario("No puedes cambiar tu propio rol.");
    await db
      .insert(schema.membresias)
      .values({ orgId: org.id, userId: rows[0].id, email: d.email, rol: d.rol })
      .onConflictDoUpdate({ target: [schema.membresias.orgId, schema.membresias.userId], set: { rol: d.rol } });
    rev(slug);
    return `${d.email} agregado como ${d.rol}`;
  });
}

export async function actualizarFinca(slug: string, fincaId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await deLaOrg(schema.fincas, fincaId, org.id);
    const d = z
      .object({
        nombre: v.texto(),
        provincia: v.opcional(40),
        canton: v.opcional(60),
        altitud: v.enteroOpc(0, 3800),
        regimen: regimenOpc(),
      })
      .parse(datos(fd));
    await db
      .update(schema.fincas)
      .set({ nombre: d.nombre, provincia: d.provincia ?? null, canton: d.canton ?? null, altitudMsnm: d.altitud ?? null, regimenLluvia: d.regimen })
      .where(and(eq(schema.fincas.id, fincaId), eq(schema.fincas.orgId, org.id)));
    rev(slug);
    return "Finca actualizada";
  });
}

// ───────────── Labores y eventos de potrero ─────────────

const TIPOS_EVENTO = ["siembra", "chapia", "cosecha", "riego", "cercas", "tarea", "nota"] as const;

export async function registrarEvento(slug: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org, user } = await requireOrg(slug, "operador");
    const raw = datos(fd);
    const d = z
      .object({
        potreroIds: z.array(v.id()).min(1, "Selecciona al menos un potrero"),
        tipo: z.enum(TIPOS_EVENTO, { error: "Elige el tipo de labor" }),
        fecha: v.fecha(),
        titulo: v.opcional(120),
        cantidad: v.numOpc(),
        unidad: v.opcional(30),
        costo: v.numOpc(),
        pendiente: z.preprocess((x) => x === "on" || x === "true", z.boolean()),
        responsable: v.opcional(80),
        notas: v.opcional(1000),
      })
      .parse({ ...raw, potreroIds: [raw.potreroIds ?? []].flat() });
    const hecha = d.tipo === "tarea" ? !d.pendiente : true;
    if (hecha && d.fecha > hoyCR()) throw new ErrorUsuario("Una labor ya hecha no puede tener fecha futura. Márcala como pendiente.");
    const propios = await db
      .select({ id: schema.potreros.id })
      .from(schema.potreros)
      .where(and(eq(schema.potreros.orgId, org.id), inArray(schema.potreros.id, d.potreroIds)));
    if (propios.length !== new Set(d.potreroIds).size) throw new ErrorUsuario("Algún potrero no pertenece a esta ganadería.");
    const grupoId = crypto.randomUUID();
    // Cantidad y costo se reparten entre los potreros: la suma del grupo es lo digitado
    const parte = (x: number | undefined) => (x == null ? null : (x / propios.length).toFixed(2));
    await db.insert(schema.eventos).values(
      propios.map((p) => ({
        orgId: org.id,
        grupoId,
        potreroId: p.id,
        tipo: d.tipo,
        fecha: d.fecha,
        titulo: d.titulo,
        cantidad: parte(d.cantidad),
        unidad: d.unidad,
        costo: parte(d.costo),
        hecha,
        responsable: d.responsable,
        notas: d.notas,
        creadoPor: user.id,
      })),
    );
    rev(slug);
    return hecha ? "Labor registrada" : "Tarea pendiente agregada";
  });
}

export async function completarEvento(slug: string, grupoId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const hoy = hoyCR();
    await db
      .update(schema.eventos)
      .set({ hecha: true, fecha: sql`least(${schema.eventos.fecha}, ${hoy}::date)` })
      .where(and(eq(schema.eventos.orgId, org.id), eq(schema.eventos.grupoId, grupoId)));
    rev(slug);
    return "Tarea completada";
  });
}

export async function eliminarEvento(slug: string, grupoId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "administrador");
    await db.delete(schema.eventos).where(and(eq(schema.eventos.orgId, org.id), eq(schema.eventos.grupoId, grupoId)));
    rev(slug);
    return "Labor eliminada";
  });
}

// ───────────── Planificador de pastoreo ─────────────

async function loteDeOrg(loteId: string, orgId: string) {
  const [l] = await db
    .select()
    .from(schema.lotes)
    .where(and(eq(schema.lotes.id, loteId), eq(schema.lotes.orgId, orgId)));
  if (!l) throw new ErrorUsuario("Lote no encontrado en esta ganadería.");
  return l;
}

/** Reemplaza el plan del lote por uno armado automáticamente. */
export async function generarPlanLote(slug: string, loteId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const lote = await loteDeOrg(loteId, org.id);
    const d = z.object({ metodo: z.enum(["forraje", "ocupacion", "descanso"]), horizonte: v.entero(3, 120) }).parse(datos(fd));
    const [{ potreros, climas }, retirosLeche] = await Promise.all([
      potrerosConForraje(org.id),
      loteDeOrdeno(lote.categoria, org.tipoProduccion) ? retirosLechePorPotrero(org.id) : undefined,
    ]);
    const items = generarPlan(potreros, climas, lote, d.metodo, d.horizonte, hoyCR(), retirosLeche);
    if (!items.length) throw new ErrorUsuario("No hay potreros disponibles para planificar en el módulo de este lote.");
    await db.transaction(async (tx) => {
      await tx.delete(schema.planPastoreo).where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, loteId)));
      await tx.insert(schema.planPastoreo).values(items.map((i, n) => ({ orgId: org.id, loteId, potreroId: i.potreroId, orden: n, dias: i.dias })));
    });
    rev(slug);
    return `Plan de ${items.length} potrero${items.length === 1 ? "" : "s"} para ${lote.nombre}`;
  });
}

export async function agregarAlPlan(slug: string, loteId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    await loteDeOrg(loteId, org.id);
    const d = z.object({ potreroId: v.id(), dias: v.entero(1, 60) }).parse(datos(fd));
    await deLaOrg(schema.potreros, d.potreroId, org.id);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.planPastoreo.orden}), -1)::int` })
      .from(schema.planPastoreo)
      .where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, loteId)));
    await db.insert(schema.planPastoreo).values({ orgId: org.id, loteId, potreroId: d.potreroId, orden: max + 1, dias: d.dias });
    rev(slug);
    return "Potrero agregado al plan";
  });
}

/** Sube o baja un potrero en el plan, lo quita o cambia sus días. */
export async function ajustarPlan(slug: string, itemId: string, _p: Resultado, fd: FormData) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    const [item] = await db
      .select()
      .from(schema.planPastoreo)
      .where(and(eq(schema.planPastoreo.id, itemId), eq(schema.planPastoreo.orgId, org.id)));
    if (!item) throw new ErrorUsuario("Ese potrero ya no está en el plan.");
    const d = z
      .object({
        accion: z.enum(["subir", "bajar", "quitar", "dias"]),
        dias: z.preprocess((x) => (x === "" || x == null ? undefined : x), v.entero(1, 60).optional()),
      })
      .parse(datos(fd));
    if (d.accion === "quitar") {
      await db.delete(schema.planPastoreo).where(eq(schema.planPastoreo.id, itemId));
    } else if (d.accion === "dias") {
      if (d.dias == null) throw new ErrorUsuario("Indica los días.");
      await db.update(schema.planPastoreo).set({ dias: d.dias }).where(eq(schema.planPastoreo.id, itemId));
    } else {
      const todos = await db
        .select({ id: schema.planPastoreo.id })
        .from(schema.planPastoreo)
        .where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, item.loteId)))
        .orderBy(schema.planPastoreo.orden, schema.planPastoreo.creadoEn);
      const i = todos.findIndex((x) => x.id === itemId);
      const j = d.accion === "subir" ? i - 1 : i + 1;
      if (j >= 0 && j < todos.length) {
        [todos[i], todos[j]] = [todos[j], todos[i]];
        // Un solo UPDATE para renumerar todo el plan del lote
        await db.execute(sql`
          update plan_pastoreo p set orden = v.orden
            from (values ${sql.join(todos.map((x, n) => sql`(${x.id}::uuid, ${n}::int)`), sql`, `)}) as v(id, orden)
           where p.id = v.id and p.org_id = ${org.id}`);
      }
    }
    rev(slug);
    return d.accion === "quitar" ? "Quitado del plan" : "Plan actualizado";
  });
}

export async function borrarPlan(slug: string, loteId: string, _p: Resultado) {
  return ejecutar(async () => {
    const { org } = await requireOrg(slug, "operador");
    await db.delete(schema.planPastoreo).where(and(eq(schema.planPastoreo.orgId, org.id), eq(schema.planPastoreo.loteId, loteId)));
    rev(slug);
    return "Plan borrado";
  });
}
