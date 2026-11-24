import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { longitudM } from "@/lib/franja";
import { areaAprovechable, calcularEstado, fechaISOEnCR, hoyCR, sumarDias, type EstadoCalculado, type TipoZona } from "@/lib/dominio";
import { LAMINA_RIEGO_MM, calibracionAltura, estimarPotrero, parametrosPasto, prioridad, residuoSalida, puntajePrioridad, regimenSugerido, tasaEntreAforos, type ContextoClima, type EstadoSalida, type Estimacion, type Prioridad } from "@/lib/forraje";

export type OpcionesPotreros = { geometria?: boolean };

export type PotreroConEstado = EstadoCalculado & {
  id: string;
  nombre: string;
  fincaId: string;
  fincaNombre: string;
  moduloId: string | null;
  modulo: { id: string; nombre: string; color: string } | null;
  /** Área total del potrero (dibujada o digitada) */
  areaHa: number | null;
  /** Área que se pastorea: total − zonas no pastoreables − descuento. Úsala para carga y dosis. */
  areaUtilHa: number | null;
  areaExcluidaHa: number;
  descuentoHa: number;
  tipoPasto: string | null;
  /** Altitud propia del potrero (msnm); null = la de la finca */
  altitudMsnm: number | null;
  diasDescansoObjetivo: number;
  diasOcupacionObjetivo: number;
  /** Solo viene si se pidió con `{ geometria: true }` (pesa; únicamente el mapa la usa). */
  geometria: { type: "Polygon"; coordinates: number[][][] } | null;
  tieneGeometria: boolean;
  loteActual: { id: string; nombre: string; cabezas: number; pastoreoId: string } | null;
  liberacion: string | null;
  productoEspera: string | null;
  ultimoAforo: { kgMsHa: number; fecha: string; hojas: number | null } | null;
  /** Fechas CR (YYYY-MM-DD) de la última salida y de la entrada del pastoreo en curso */
  ultimaSalidaFecha: string | null;
  /** Cómo quedó el potrero en la última salida */
  salida: { estado: EstadoSalida | null; alturaCm: number | null } | null;
  ocupadoDesdeFecha: string | null;
};

/** Estado de todos los potreros de una organización en una sola consulta. */
export async function potrerosConEstado(orgId: string, { geometria = false }: OpcionesPotreros = {}): Promise<PotreroConEstado[]> {
  const hoy = hoyCR();
  const { rows } = await db.execute<{
    id: string;
    nombre: string;
    finca_id: string;
    finca_nombre: string;
    modulo_id: string | null;
    modulo_nombre: string | null;
    modulo_color: string | null;
    area_ha: string | null;
    area_excluida_ha: string;
    descuento_ha: string;
    tipo_pasto: string | null;
    altitud_msnm: number | null;
    dias_descanso_objetivo: number;
    dias_ocupacion_objetivo: number;
    geometria: PotreroConEstado["geometria"];
    tiene_geometria: boolean;
    pastoreo_id: string | null;
    ocupado_desde: string | null;
    lote_id: string | null;
    lote_nombre: string | null;
    lote_cabezas: number | null;
    ultima_salida: string | null;
    estado_salida: EstadoSalida | null;
    altura_salida_cm: string | null;
    liberacion: string | null;
    producto_espera: string | null;
    aforo_kg: string | null;
    aforo_fecha: string | null;
    aforo_hojas: string | null;
  }>(sql`
    select p.id, p.nombre, p.finca_id, f.nombre as finca_nombre, m.id as modulo_id, m.nombre as modulo_nombre, m.color as modulo_color, p.area_ha, p.area_excluida_ha, p.descuento_ha, p.tipo_pasto, p.altitud_msnm,
           p.dias_descanso_objetivo, p.dias_ocupacion_objetivo,
           ${geometria ? sql`p.geometria` : sql`null::jsonb`} as geometria, p.geometria is not null as tiene_geometria,
           ab.id as pastoreo_id, ab.fecha_entrada as ocupado_desde, l.id as lote_id, l.nombre as lote_nombre,
           coalesce(ab.cabezas, l.cabezas) as lote_cabezas,
           us.fecha_salida as ultima_salida, us.estado_salida, us.altura_salida_cm,
           esp.fecha_liberacion::text as liberacion, esp.producto as producto_espera,
           af.kg_ms_ha as aforo_kg, af.fecha::text as aforo_fecha, af.hojas as aforo_hojas
      from potreros p
      join fincas f on f.id = p.finca_id
      left join modulos m on m.id = p.modulo_id
      left join lateral (
        select * from pastoreos x where x.potrero_id = p.id and x.org_id = p.org_id and x.fecha_salida is null
        order by x.fecha_entrada desc limit 1
      ) ab on true
      left join lotes l on l.id = ab.lote_id
      left join lateral (
        select fecha_salida, estado_salida, altura_salida_cm from pastoreos s
         where s.potrero_id = p.id and s.org_id = p.org_id and s.fecha_salida is not null
         order by s.fecha_salida desc limit 1
      ) us on true
      left join lateral (
        select a.fecha_liberacion, pr.nombre as producto
          from aplicaciones a join productos pr on pr.id = a.producto_id
         where a.potrero_id = p.id and a.org_id = p.org_id and a.fecha_liberacion > ${hoy}::date
         order by a.fecha_liberacion desc limit 1
      ) esp on true
      left join lateral (
        select kg_ms_ha, fecha, hojas from aforos z where z.potrero_id = p.id and z.org_id = p.org_id
        order by z.fecha desc, z.creado_en desc limit 1
      ) af on true
     where p.org_id = ${orgId}
     order by f.nombre, m.orden nulls last, m.nombre nulls last, length(p.nombre), p.nombre`);

  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    fincaId: r.finca_id,
    fincaNombre: r.finca_nombre,
    moduloId: r.modulo_id,
    modulo: r.modulo_id ? { id: r.modulo_id, nombre: r.modulo_nombre!, color: r.modulo_color! } : null,
    areaHa: r.area_ha == null ? null : Number(r.area_ha),
    areaUtilHa: areaAprovechable(r.area_ha == null ? null : Number(r.area_ha), Number(r.area_excluida_ha), Number(r.descuento_ha)),
    areaExcluidaHa: Number(r.area_excluida_ha),
    descuentoHa: Number(r.descuento_ha),
    tipoPasto: r.tipo_pasto,
    altitudMsnm: r.altitud_msnm,
    diasDescansoObjetivo: r.dias_descanso_objetivo,
    diasOcupacionObjetivo: r.dias_ocupacion_objetivo,
    geometria: r.geometria,
    tieneGeometria: r.tiene_geometria,
    loteActual: r.lote_id
      ? { id: r.lote_id, nombre: r.lote_nombre!, cabezas: r.lote_cabezas ?? 0, pastoreoId: r.pastoreo_id! }
      : null,
    liberacion: r.liberacion,
    productoEspera: r.producto_espera,
    ultimoAforo: r.aforo_kg ? { kgMsHa: Number(r.aforo_kg), fecha: r.aforo_fecha!, hojas: r.aforo_hojas == null ? null : Number(r.aforo_hojas) } : null,
    ultimaSalidaFecha: r.ultima_salida ? fechaISOEnCR(r.ultima_salida) : null,
    salida:
      r.estado_salida || r.altura_salida_cm
        ? { estado: r.estado_salida, alturaCm: r.altura_salida_cm == null ? null : Number(r.altura_salida_cm) }
        : null,
    ocupadoDesdeFecha: r.ocupado_desde ? fechaISOEnCR(r.ocupado_desde) : null,
    ...calcularEstado(
      {
        ocupadoDesde: r.ocupado_desde,
        ultimaSalida: r.ultima_salida,
        liberacion: r.liberacion,
        diasDescansoObjetivo: r.dias_descanso_objetivo,
        diasOcupacionObjetivo: r.dias_ocupacion_objetivo,
      },
      hoy,
    ),
  }));
}

export type Modulo = { id: string; nombre: string; color: string; orden: number };

/** Módulos de la organización en su orden. */
export async function modulosDeOrg(orgId: string): Promise<Modulo[]> {
  return db
    .select({ id: schema.modulos.id, nombre: schema.modulos.nombre, color: schema.modulos.color, orden: schema.modulos.orden })
    .from(schema.modulos)
    .where(eq(schema.modulos.orgId, orgId))
    .orderBy(schema.modulos.orden, schema.modulos.nombre);
}

export type Zona = {
  id: string;
  fincaId: string;
  nombre: string;
  tipo: TipoZona;
  areaHa: number;
  geometria: { type: "Polygon"; coordinates: number[][][] };
  /** Franjas trazadas sobre una línea: ancho en metros y largo del eje */
  anchoM: number | null;
  largoM: number | null;
};

/** Áreas no pastoreables (bosque, caminos, agua, instalaciones…) de la organización. */
export async function zonasDeOrg(orgId: string): Promise<Zona[]> {
  const xs = await db
    .select({ id: schema.zonas.id, fincaId: schema.zonas.fincaId, nombre: schema.zonas.nombre, tipo: schema.zonas.tipo, areaHa: schema.zonas.areaHa, geometria: schema.zonas.geometria, eje: schema.zonas.eje, anchoM: schema.zonas.anchoM })
    .from(schema.zonas)
    .where(eq(schema.zonas.orgId, orgId))
    .orderBy(schema.zonas.tipo, schema.zonas.nombre);
  return xs.map(({ eje, ...z }) => ({
    ...z,
    areaHa: Number(z.areaHa),
    anchoM: z.anchoM == null ? null : Number(z.anchoM),
    largoM: eje ? longitudM(eje.coordinates) : null,
  }));
}

// ───────────── Forraje (cobertura estimada, prioridad) ─────────────

export type PotreroForraje = PotreroConEstado & { est: Estimacion; prioridad: Prioridad; puntaje: number };

export type Clima = ContextoClima & { fincaId: string; regimenEsSugerido: boolean };

/** Clima de cada finca: altitud, régimen de lluvia y pluviómetro de los últimos 6 meses. */
export async function climasDeOrg(orgId: string): Promise<Map<string, Clima>> {
  const desde = sumarDias(hoyCR(), -200);
  const [fincas, lluvias] = await Promise.all([
    db
      .select({ id: schema.fincas.id, provincia: schema.fincas.provincia, canton: schema.fincas.canton, altitud: schema.fincas.altitudMsnm, regimen: schema.fincas.regimenLluvia })
      .from(schema.fincas)
      .where(eq(schema.fincas.orgId, orgId)),
    db.execute<{ finca_id: string; fecha: string; mm: string }>(
      sql`select finca_id, fecha::text as fecha, mm from lluvias where org_id = ${orgId} and fecha >= ${desde}::date`,
    ),
  ]);
  const porFinca = new Map<string, Map<string, number>>();
  for (const l of lluvias.rows) {
    if (!porFinca.has(l.finca_id)) porFinca.set(l.finca_id, new Map());
    porFinca.get(l.finca_id)!.set(l.fecha, Number(l.mm));
  }
  return new Map(
    fincas.map((f) => [
      f.id,
      {
        fincaId: f.id,
        // Sin altitud se asume una finca de bajura media (300 msnm)
        altitudMsnm: f.altitud ?? 300,
        regimen: f.regimen ?? regimenSugerido(f.provincia, f.canton),
        regimenEsSugerido: f.regimen == null,
        lluvia: porFinca.get(f.id),
      },
    ]),
  );
}

/** Tasa de crecimiento medida entre los dos últimos aforos de cada potrero (si no hubo pastoreo entre ambos). */
async function tasasMedidas(orgId: string) {
  const { rows } = await db.execute<{ potrero_id: string; kg: string; fecha: string; kg_prev: string; fecha_prev: string; pastoreado: boolean }>(sql`
    select a.potrero_id, a.kg_ms_ha as kg, a.fecha::text as fecha, b.kg_ms_ha as kg_prev, b.fecha::text as fecha_prev,
           exists (
             select 1 from pastoreos s
              where s.potrero_id = a.potrero_id and s.org_id = a.org_id
                and (s.fecha_entrada at time zone 'America/Costa_Rica')::date <= a.fecha
                and coalesce((s.fecha_salida at time zone 'America/Costa_Rica')::date, a.fecha) >= b.fecha
           ) as pastoreado
      from (select distinct on (potrero_id) * from aforos where org_id = ${orgId} order by potrero_id, fecha desc, creado_en desc) a
      join lateral (
        select kg_ms_ha, fecha from aforos z where z.potrero_id = a.potrero_id and z.org_id = a.org_id and z.fecha < a.fecha
        order by z.fecha desc, z.creado_en desc limit 1
      ) b on true`);
  const out = new Map<string, { kgDia: number; fecha: string }>();
  for (const r of rows) {
    if (r.pastoreado) continue;
    const t = tasaEntreAforos({ kg: Number(r.kg_prev), fecha: r.fecha_prev }, { kg: Number(r.kg), fecha: r.fecha });
    if (t != null) out.set(r.potrero_id, { kgDia: t, fecha: r.fecha });
  }
  return out;
}

/**
 * Calibración de la regla de altura de la ganadería: compara los aforos con kg medido (cuadro de corte o plato)
 * y altura con lo que predice la ecuación de cada especie. Usa los últimos 365 días.
 */
export async function calibracionAlturaOrg(orgId: string) {
  const { rows } = await db.execute<{ kg: string; cm: string; tipo_pasto: string | null }>(sql`
    select a.kg_ms_ha as kg, a.altura_cm as cm, p.tipo_pasto
      from aforos a join potreros p on p.id = a.potrero_id
     where a.org_id = ${orgId} and a.metodo in ('cuadro_corte', 'plato') and a.altura_cm > 0
       and a.fecha >= current_date - 365
     order by a.fecha desc limit 60`);
  return calibracionAltura(rows.map((r) => ({ kg: Number(r.kg), cm: Number(r.cm), p: parametrosPasto(r.tipo_pasto) })));
}

/**
 * Riego (mm por fecha) y nitrógeno aplicado (kg N/ha por fecha) de cada potrero.
 * `registraAbonos`: la ganadería anotó algún abono con N en 6 meses; si no, el modelo no castiga la falta de N.
 */
async function aguaYNitrogeno(orgId: string, hoy: string) {
  const [riegos, abonos] = await Promise.all([
    db.execute<{ potrero_id: string; fecha: string; mm: string }>(sql`
      select potrero_id, fecha::text as fecha,
             sum(case when lower(coalesce(unidad, '')) in ('mm', 'milimetros', 'milímetros') and cantidad > 0 then cantidad else ${LAMINA_RIEGO_MM} end) as mm
        from eventos
       where org_id = ${orgId} and tipo = 'riego' and hecha and fecha >= ${sumarDias(hoy, -200)}::date
       group by potrero_id, fecha`),
    db.execute<{ potrero_id: string; fecha: string; kg_n: string }>(sql`
      select a.potrero_id, a.fecha::text as fecha, sum(a.dosis_por_ha * pr.n / 100) as kg_n
        from aplicaciones a join productos pr on pr.id = a.producto_id
       where a.org_id = ${orgId} and pr.n > 0 and a.fecha >= ${sumarDias(hoy, -180)}::date
       group by a.potrero_id, a.fecha`),
  ]);
  const riego = new Map<string, Map<string, number>>();
  for (const r of riegos.rows) {
    if (!riego.has(r.potrero_id)) riego.set(r.potrero_id, new Map());
    riego.get(r.potrero_id)!.set(r.fecha, Number(r.mm));
  }
  const nitrogeno = new Map<string, { fecha: string; kgHa: number }[]>();
  for (const r of abonos.rows) nitrogeno.set(r.potrero_id, [...(nitrogeno.get(r.potrero_id) ?? []), { fecha: r.fecha, kgHa: Number(r.kg_n) }]);
  return { riego, nitrogeno, registraAbonos: abonos.rows.length > 0 };
}

/** Potreros con su estado, cobertura estimada hoy, proyección y prioridad de pastoreo. */
export async function potrerosConForraje(orgId: string, opciones: OpcionesPotreros = {}) {
  const hoy = hoyCR();
  const [potreros, climas, tasas, factorAltura, extra] = await Promise.all([
    potrerosConEstado(orgId, opciones),
    climasDeOrg(orgId),
    tasasMedidas(orgId),
    calibracionAlturaOrg(orgId),
    aguaYNitrogeno(orgId, hoy),
  ]);
  const conForraje: PotreroForraje[] = potreros.map((p) => {
    const finca = climas.get(p.fincaId) ?? { altitudMsnm: 300, regimen: "intermedio" as const };
    // Contexto propio: altitud del potrero, su riego y su nitrógeno (la lluvia es la de la finca)
    const clima: ContextoClima = {
      ...finca,
      altitudMsnm: p.altitudMsnm ?? finca.altitudMsnm,
      riego: extra.riego.get(p.id),
      nitrogeno: extra.registraAbonos ? (extra.nitrogeno.get(p.id) ?? []) : undefined,
      hoy,
    };
    const est = estimarPotrero(
      {
        tipoPasto: p.tipoPasto,
        estado: p.estado,
        aforo: p.ultimoAforo,
        ultimaSalida: p.ultimaSalidaFecha,
        residuoUltimaSalida: p.salida ? residuoSalida(parametrosPasto(p.tipoPasto), p.salida, factorAltura) : null,
        ocupadoDesde: p.ocupadoDesdeFecha,
        diasOcupacionObjetivo: p.diasOcupacionObjetivo,
        tasaMedida: tasas.get(p.id) ?? null,
      },
      clima,
      hoy,
    );
    return { ...p, est, prioridad: prioridad(p.estado, est), puntaje: puntajePrioridad(p.estado, est) };
  });
  return { potreros: conForraje, climas };
}
