// Archivos de mapa de prueba (San Carlos, Alajuela) para el E2E de importación.
import { zipSync, strToU8 } from "fflate";
import proj4 from "proj4";

const CRTM05 =
  "+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
const BASE = [-84.45, 10.35];

/** Cuadro de ~1 ha (0,0009° × 0,0009°) desplazado n cuadros al este. Anillo en sentido horario. */
export function cuadro(n, fila = 0) {
  const x0 = BASE[0] + n * 0.0012;
  const y0 = BASE[1] + fila * 0.0012;
  const d = 0.0009;
  return [[x0, y0], [x0, y0 + d], [x0 + d, y0 + d], [x0 + d, y0], [x0, y0]];
}

/** [nombre, coords, "linea"] genera un LineString (camino o recorrido GPS) en vez de un polígono. */
const kmlLinea = (nombre, coords) => `
    <Placemark><name>${nombre}</name><LineString><coordinates>${coords.map(([x, y]) => `${x},${y},0`).join(" ")}</coordinates></LineString></Placemark>`;

const kmlPoligono = (nombre, anillo) => `
    <Placemark><name>${nombre}</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${anillo.map(([x, y]) => `${x},${y},0`).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`;

export function kml(pols) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Finca</name>
  <Folder><name>Potreros</name>${pols.map(([n, a, t]) => (t === "linea" ? kmlLinea(n, a) : kmlPoligono(n, a))).join("")}
    <Placemark><name>Casa</name><Point><coordinates>${BASE[0]},${BASE[1]},0</coordinates></Point></Placemark>
  </Folder>
</Document></kml>`;
}

export function kmz(pols) {
  return Buffer.from(zipSync({ "doc.kml": strToU8(kml(pols)) }));
}

/** GeoJSON en CRTM05 (metros), como lo exporta QGIS para Costa Rica. */
export function geojsonCRTM05(pols) {
  const conv = proj4("WGS84", CRTM05);
  return JSON.stringify({
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::5367" } },
    features: pols.map(([nombre, anillo]) => ({
      type: "Feature",
      properties: { NOMBRE: nombre, AREA: 1 },
      geometry: { type: "Polygon", coordinates: [anillo.map((c) => conv.forward(c).map((v) => Math.round(v * 100) / 100))] },
    })),
  });
}

/** Shapefile de polígonos (.shp/.shx/.dbf/.prj) comprimido en .zip. */
export function shapefileZip(pols) {
  const bbox = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  const todos = bbox(pols.flatMap(([, a]) => a));
  const registros = pols.map(([, a]) => {
    const b = Buffer.alloc(44 + 4 + a.length * 16);
    b.writeInt32LE(5, 0);
    bbox(a).forEach((v, i) => b.writeDoubleLE(v, 4 + i * 8));
    b.writeInt32LE(1, 36);
    b.writeInt32LE(a.length, 40);
    b.writeInt32LE(0, 44);
    a.forEach(([x, y], i) => {
      b.writeDoubleLE(x, 48 + i * 16);
      b.writeDoubleLE(y, 56 + i * 16);
    });
    return b;
  });
  const cabecera = (bytes) => {
    const h = Buffer.alloc(100);
    h.writeInt32BE(9994, 0);
    h.writeInt32BE(bytes / 2, 24);
    h.writeInt32LE(1000, 28);
    h.writeInt32LE(5, 32);
    todos.forEach((v, i) => h.writeDoubleLE(v, 36 + i * 8));
    return h;
  };
  const shpLen = 100 + registros.reduce((s, r) => s + 8 + r.length, 0);
  const partesShp = [cabecera(shpLen)];
  const partesShx = [cabecera(100 + 8 * registros.length)];
  let offset = 100;
  registros.forEach((r, i) => {
    const rh = Buffer.alloc(8);
    rh.writeInt32BE(i + 1, 0);
    rh.writeInt32BE(r.length / 2, 4);
    partesShp.push(rh, r);
    const ix = Buffer.alloc(8);
    ix.writeInt32BE(offset / 2, 0);
    ix.writeInt32BE(r.length / 2, 4);
    partesShx.push(ix);
    offset += 8 + r.length;
  });
  // DBF con un campo NOMBRE C(40)
  const largo = 40;
  const dh = Buffer.alloc(32 + 32 + 1);
  dh.writeUInt8(3, 0);
  dh.writeUInt8(126, 1);
  dh.writeUInt8(1, 2);
  dh.writeUInt8(1, 3);
  dh.writeUInt32LE(pols.length, 4);
  dh.writeUInt16LE(dh.length, 8);
  dh.writeUInt16LE(1 + largo, 10);
  dh.write("NOMBRE", 32, "latin1");
  dh.write("C", 43, "latin1");
  dh.writeUInt8(largo, 48);
  dh.writeUInt8(0x0d, 64);
  const filas = pols.map(([n]) => Buffer.from(" " + n.padEnd(largo).slice(0, largo), "latin1"));
  const dbf = Buffer.concat([dh, ...filas, Buffer.from([0x1a])]);
  const prj =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  return Buffer.from(
    zipSync({
      "potreros.shp": new Uint8Array(Buffer.concat(partesShp)),
      "potreros.shx": new Uint8Array(Buffer.concat(partesShx)),
      "potreros.dbf": new Uint8Array(dbf),
      "potreros.prj": strToU8(prj),
    }),
  );
}
