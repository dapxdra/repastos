/**
 * Caminos, quebradas y cercas vivas suelen venir como líneas (QGIS, Google Earth, GPS).
 * Para descontarlos del área de pastoreo se convierten en una franja (buffer) del ancho indicado.
 * Funciona en el navegador y en el servidor: proyección local en metros + unión con polyclip.
 */
import turfArea from "@turf/area";
import turfUnion from "@turf/union";
import type { TipoZona } from "@/lib/dominio";

export type Poligono = { type: "Polygon"; coordinates: number[][][] };
export type Linea = { type: "LineString"; coordinates: number[][] };

/** Ancho típico en metros según lo que representa la línea. */
export const ANCHO_DEFECTO: Record<TipoZona, number> = {
  camino: 4,
  agua: 3,
  // Ley Forestal art. 33: 15 m a cada lado de ríos y quebradas en zona rural plana
  proteccion: 30,
  bosque: 10,
  instalaciones: 6,
  corte: 6,
  otro: 4,
};
export const ANCHO_MIN_M = 0.5;
export const ANCHO_MAX_M = 200;
export const MAX_LONGITUD_M = 100_000;

const R = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

/** Longitud de una línea en metros (haversine). */
export function longitudM(coords: number[][]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const a = Math.sin(rad(y2 - y1) / 2) ** 2 + Math.cos(rad(y1)) * Math.cos(rad(y2)) * Math.sin(rad(x2 - x1) / 2) ** 2;
    s += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return s;
}

/** Douglas–Peucker en metros: los tracks de GPS traen miles de puntos casi alineados. */
function simplificar(pts: number[][], tol: number): number[][] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const pila: [number, number][] = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > max) [max, idx] = [d, i];
    }
    if (idx > 0 && max > tol) {
      keep[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Franja de `anchoM` metros centrada en la línea (extremos redondeados).
 * Devuelve null si la línea no tiene al menos dos puntos distintos.
 */
export function franja(coords: number[][], anchoM: number): Poligono | null {
  const validos = coords.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (validos.length < 2) return null;
  const lon0 = validos.reduce((s, c) => s + c[0], 0) / validos.length;
  const lat0 = validos.reduce((s, c) => s + c[1], 0) / validos.length;
  const kx = (Math.PI / 180) * R * Math.cos(rad(lat0));
  const ky = (Math.PI / 180) * R;
  const aLocal = (c: number[]) => [(c[0] - lon0) * kx, (c[1] - lat0) * ky];
  const aGeo = ([x, y]: number[]) => [Math.round((lon0 + x / kx) * 1e7) / 1e7, Math.round((lat0 + y / ky) * 1e7) / 1e7];

  const h = Math.max(ANCHO_MIN_M, anchoM) / 2;
  let pts: number[][] = [];
  for (const c of validos.map(aLocal)) {
    const u = pts[pts.length - 1];
    if (!u || Math.hypot(c[0] - u[0], c[1] - u[1]) > 0.05) pts.push(c);
  }
  if (pts.length < 2) return null;
  pts = simplificar(pts, Math.min(0.5, h / 4));

  const piezas: number[][][][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    const nx = (-(by - ay) / L) * h;
    const ny = ((bx - ax) / L) * h;
    piezas.push([[[ax + nx, ay + ny], [ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]]]);
  }
  // Círculos en cada vértice: rellenan las curvas y redondean los extremos
  const N = 16;
  for (const [cx, cy] of pts) {
    const anillo = Array.from({ length: N + 1 }, (_, k) => {
      const t = (2 * Math.PI * (k % N)) / N;
      return [cx + h * Math.cos(t), cy + h * Math.sin(t)];
    });
    piezas.push([anillo]);
  }

  const geo = piezas.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: p.map((r) => r.map(aGeo)) } }));
  const u = geo.length === 1 ? geo[0] : turfUnion({ type: "FeatureCollection", features: geo });
  if (!u) return null;
  const g = u.geometry;
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates };
  // Una línea continua da un solo polígono; por si acaso, se queda el mayor
  const mayor = g.coordinates
    .map((c) => ({ c, a: turfArea({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: c } }) }))
    .sort((a, b) => b.a - a.a)[0];
  return { type: "Polygon", coordinates: mayor.c };
}
