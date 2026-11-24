/**
 * Lectura de archivos de mapas en el navegador → polígonos de potreros (WGS84).
 * Formatos: KML/KMZ (Google Earth), GeoJSON, Shapefile en .zip, GPX (perímetros caminados con GPS).
 * Si las coordenadas vienen proyectadas se asume CRTM05 (EPSG:5367), la proyección oficial de Costa Rica.
 */
import turfArea from "@turf/area";
import { ANCHO_DEFECTO, franja, longitudM } from "@/lib/franja";
import { detectarTipoZona } from "@/lib/dominio";

export type Poligono = { type: "Polygon"; coordinates: number[][][] };
export type PoligonoImportado = {
  nombre: string;
  /** Geometría propuesta: el perímetro cerrado o, si es una línea abierta, su franja con el ancho por defecto */
  geometria: Poligono;
  areaHa: number;
  /** Solo para líneas: el eje en WGS84 y su largo, para convertirlo en franja con otro ancho */
  eje?: number[][];
  longitudM?: number;
  /** La línea no cierra un perímetro: solo puede importarse como franja (camino, quebrada…) */
  soloFranja?: boolean;
};
export type LecturaMapa = { poligonos: PoligonoImportado[]; avisos: string[] };

export const FORMATOS_MAPA = ".kml,.kmz,.geojson,.json,.zip,.gpx";
export const MAX_HA_IMPORTADO = 5000;

const CRTM05 =
  "+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

type Geom = { type: string; coordinates?: unknown; geometries?: Geom[] };
type Feat = { type: "Feature"; geometry: Geom | null; properties: Record<string, unknown> | null };
type Coleccion = { type: "FeatureCollection"; features: Feat[]; crs?: { properties?: { name?: string } } };

export class ErrorMapa extends Error {}

async function aColeccion(file: File): Promise<Coleccion> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const xml = (txt: string) => new DOMParser().parseFromString(txt, "text/xml");

  if (ext === "kml" || ext === "gpx") {
    const tg = await import("@tmcw/togeojson");
    const doc = xml(await file.text());
    return (ext === "kml" ? tg.kml(doc) : tg.gpx(doc)) as unknown as Coleccion;
  }
  if (ext === "kmz") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const archivos = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const nombre = Object.keys(archivos).find((n) => n.toLowerCase() === "doc.kml") ?? Object.keys(archivos).find((n) => n.toLowerCase().endsWith(".kml"));
    if (!nombre) throw new ErrorMapa("El KMZ no contiene ningún archivo .kml.");
    const tg = await import("@tmcw/togeojson");
    return tg.kml(xml(strFromU8(archivos[nombre]))) as unknown as Coleccion;
  }
  if (ext === "geojson" || ext === "json") {
    let g: { type?: string };
    try {
      g = JSON.parse(await file.text());
    } catch {
      throw new ErrorMapa("El archivo no es un GeoJSON válido.");
    }
    if (g.type === "FeatureCollection") return g as Coleccion;
    if (g.type === "Feature") return { type: "FeatureCollection", features: [g as Feat] };
    if (g.type) return { type: "FeatureCollection", features: [{ type: "Feature", geometry: g as Geom, properties: {} }] };
    throw new ErrorMapa("El archivo no es un GeoJSON válido.");
  }
  if (ext === "zip") {
    const shp = (await import("shpjs")).default;
    let r: Coleccion | Coleccion[];
    try {
      r = (await shp(await file.arrayBuffer())) as Coleccion | Coleccion[];
    } catch {
      throw new ErrorMapa("No se pudo leer el shapefile. El .zip debe incluir al menos los archivos .shp, .shx y .dbf (y idealmente .prj).");
    }
    const capas = Array.isArray(r) ? r : [r];
    return { type: "FeatureCollection", features: capas.flatMap((c) => c.features) };
  }
  if (ext === "shp") throw new ErrorMapa("Comprime en un .zip el .shp junto con sus archivos .shx, .dbf y .prj.");
  throw new ErrorMapa("Formato no soportado. Usa KML, KMZ, GeoJSON, Shapefile (.zip) o GPX.");
}

/** Busca el nombre del potrero entre los atributos más comunes. */
function nombreDe(props: Record<string, unknown> | null): string | null {
  if (!props) return null;
  const claves = ["nombre", "name", "potrero", "apartado", "lote", "parcela", "label", "id"];
  const mapa = new Map(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of claves) {
    const v = mapa.get(k);
    if (v != null && String(v).trim()) return String(v).trim().slice(0, 120);
  }
  return null;
}

const mismoPunto = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** Quita Z, redondea a 7 decimales (~1 cm), elimina puntos repetidos y cierra el anillo. */
function limpiarAnillo(anillo: number[][], proyectar: ((c: number[]) => number[]) | null): number[][] | null {
  const out: number[][] = [];
  for (const c of anillo) {
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const [x, y] = proyectar ? proyectar([c[0], c[1]]) : [c[0], c[1]];
    const p = [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7];
    if (!out.length || !mismoPunto(out[out.length - 1], p)) out.push(p);
  }
  if (out.length && !mismoPunto(out[0], out[out.length - 1])) out.push([...out[0]]);
  return out.length >= 4 ? out : null;
}

/** Un elemento del archivo: polígono (anillos) o línea (perímetro caminado, camino, quebrada…). */
type Crudo = { anillos: number[][][]; linea?: false } | { anillos: [number[][]]; linea: true };

/** Convierte cualquier geometría a una lista de polígonos y líneas crudos. */
function aCrudos(g: Geom | null): Crudo[] {
  if (!g) return [];
  switch (g.type) {
    case "Polygon":
      return [{ anillos: g.coordinates as number[][][] }];
    case "MultiPolygon":
      return (g.coordinates as number[][][][]).map((anillos) => ({ anillos }));
    case "LineString":
      return (g.coordinates as number[][]).length >= 2 ? [{ anillos: [g.coordinates as number[][]], linea: true }] : [];
    case "MultiLineString":
      return (g.coordinates as number[][][]).filter((l) => l.length >= 2).map((l) => ({ anillos: [l] as [number[][]], linea: true as const }));
    case "GeometryCollection":
      return (g.geometries ?? []).flatMap(aCrudos);
    default:
      return [];
  }
}

/** Quita Z, proyecta, redondea y elimina puntos repetidos de una línea (sin cerrarla). */
function limpiarLinea(linea: number[][], proyectar: ((c: number[]) => number[]) | null): number[][] {
  const out: number[][] = [];
  for (const c of linea) {
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const [x, y] = proyectar ? proyectar([c[0], c[1]]) : [c[0], c[1]];
    const p = [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7];
    if (!out.length || !mismoPunto(out[out.length - 1], p)) out.push(p);
  }
  return out;
}

/**
 * ¿La línea es un perímetro (vuelve cerca de donde empezó, como un recorrido con GPS)?
 * Si no, es un camino, quebrada o cerca: se importa como franja.
 */
function esPerimetro(linea: number[][], largo: number): boolean {
  if (linea.length < 4) return false;
  const brecha = longitudM([linea[0], linea[linea.length - 1]]);
  return brecha <= Math.max(25, largo * 0.1);
}

export async function leerArchivoMapa(file: File): Promise<LecturaMapa> {
  if (file.size > 30 * 1024 * 1024) throw new ErrorMapa("El archivo pesa más de 30 MB.");
  const col = await aColeccion(file);
  const avisos: string[] = [];
  const crudos = (col.features ?? []).map((f) => ({ nombre: nombreDe(f.properties), polys: aCrudos(f.geometry) })).filter((f) => f.polys.length);
  if (!crudos.length) throw new ErrorMapa("El archivo no contiene polígonos ni líneas.");

  // ¿Coordenadas en grados o proyectadas (metros)?
  const coords = crudos.flatMap((c) => c.polys.flatMap((p) => p.anillos.flat()));
  const proyectadas = coords.some((c) => Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90);
  let proyectar: ((c: number[]) => number[]) | null = null;
  if (proyectadas) {
    const crs = col.crs?.properties?.name ?? "";
    if (crs && !/5367|crtm/i.test(crs)) {
      throw new ErrorMapa(`El archivo usa la proyección ${crs}. Expórtalo en WGS84 (EPSG:4326) o CRTM05 (EPSG:5367).`);
    }
    const proj4 = (await import("proj4")).default;
    const conv = proj4(CRTM05, "WGS84");
    proyectar = (c) => conv.forward(c);
    avisos.push("Coordenadas en metros: se interpretaron como CRTM05 (proyección oficial de Costa Rica).");
  }

  const poligonos: PoligonoImportado[] = [];
  let descartados = 0;
  let sinNombre = 0;
  let sinNombreLinea = 0;
  let franjas = 0;
  const ha = (g: Poligono) => turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000;
  for (const c of crudos) {
    c.polys.forEach((crudo, i) => {
      const sufijo = c.polys.length > 1 ? ` (${i + 1})` : "";
      if (crudo.linea) {
        const eje = limpiarLinea(crudo.anillos[0], proyectar);
        const largo = longitudM(eje);
        if (eje.length < 2 || largo < 1) return void descartados++;
        const nombre = (c.nombre ?? `Línea ${++sinNombreLinea}`) + sufijo;
        // Perímetro caminado o límite dibujado como línea: se cierra como polígono
        const anillo = esPerimetro(eje, largo) ? limpiarAnillo(eje, null) : null;
        const cerrado: Poligono | null = anillo ? { type: "Polygon", coordinates: [anillo] } : null;
        if (cerrado && ha(cerrado) >= 0.001) {
          poligonos.push({ nombre, geometria: cerrado, areaHa: ha(cerrado), eje, longitudM: largo });
          return;
        }
        const geometria = franja(eje, ANCHO_DEFECTO[detectarTipoZona(nombre) ?? "camino"]);
        if (!geometria) return void descartados++;
        franjas++;
        poligonos.push({ nombre, geometria, areaHa: ha(geometria), eje, longitudM: largo, soloFranja: true });
        return;
      }
      const limpios = crudo.anillos.map((r) => limpiarAnillo(r, proyectar)).filter((r): r is number[][] => !!r);
      if (!limpios.length) return void descartados++;
      const geometria: Poligono = { type: "Polygon", coordinates: limpios };
      const areaHa = ha(geometria);
      if (areaHa < 0.001) return void descartados++;
      poligonos.push({ nombre: (c.nombre ?? `Potrero ${++sinNombre}`) + sufijo, geometria, areaHa });
    });
  }
  if (franjas) {
    avisos.push(`${franjas === 1 ? "1 línea abierta se convirtió" : `${franjas} líneas abiertas se convirtieron`} en franja (camino, quebrada…). Revisa el ancho en cada fila.`);
  }
  if (!poligonos.length) throw new ErrorMapa("Los polígonos del archivo no tienen área válida.");
  if (descartados) avisos.push(`${descartados} elemento(s) sin área válida se omitieron.`);

  // Verificación de ubicación: Costa Rica y alrededores
  const [x, y] = poligonos[0].geometria.coordinates[0][0];
  if (x < -90 || x > -80 || y < 4 || y > 13) {
    avisos.push("Los polígonos no caen en Costa Rica. Revisa la proyección del archivo antes de importar.");
  }
  return { poligonos, avisos };
}
