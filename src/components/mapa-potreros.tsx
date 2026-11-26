"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Map as MLMap, Marker, GeoJSONSource } from "maplibre-gl";
import type { TerraDraw } from "terra-draw";
import turfArea from "@turf/area";
import { PenLine, X, Undo2, Layers, ArrowRight, Check, FileUp, CheckCircle2, Trees, Trash2 } from "lucide-react";
import { ESTADOS, TIPOS_ZONA, TIPOS_ZONA_IDS, formatArea, formatNum, plural, type EstadoPotrero, type TipoZona, type UnidadArea } from "@/lib/dominio";
import { ActionForm, BotonAccion, Field, Submit } from "@/components/forms";
import { ModuloChip } from "@/components/ui";
import type { Resultado } from "@/lib/acciones";
import { ErrorMapa, FORMATOS_MAPA, leerArchivoMapa, type PoligonoImportado } from "@/lib/importar-mapa";
import { PanelImportar, filasIniciales, formaFila, type FilaImport } from "@/components/panel-importar";
import { ANCHO_DEFECTO, ANCHO_MAX_M, ANCHO_MIN_M, franja, longitudM } from "@/lib/franja";
import { PRIORIDADES, type Prioridad } from "@/lib/forraje";

export type ColorPor = "estado" | "modulo" | "prioridad";
const ORDEN_PRIORIDAD: Prioridad[] = ["pasado", "pastorear", "pronto", "esperar", "bloqueado", "ocupado", "sin_datos"];

type Poligono = { type: "Polygon"; coordinates: number[][][] };

export type PotreroMapa = {
  id: string;
  nombre: string;
  fincaNombre: string;
  estado: EstadoPotrero;
  areaHa: number | null;
  /** Área sin bosque, caminos ni otras áreas no pastoreables */
  areaUtilHa: number | null;
  tipoPasto: string | null;
  geometria: Poligono | null;
  detalle: string;
  modulo: ModuloMapa | null;
  /** Prioridad de pastoreo según el modelo de forraje */
  prioridad: Prioridad;
  /** Cobertura estimada hoy (kg MS/ha) */
  cobertura: number | null;
};

/** Área no pastoreable (bosque, camino, agua, instalaciones…) */
export type ZonaMapa = {
  id: string;
  nombre: string;
  tipo: TipoZona;
  areaHa: number;
  geometria: Poligono;
  fincaNombre: string;
  /** Solo si es una franja trazada sobre una línea (camino, quebrada…) */
  anchoM: number | null;
  largoM: number | null;
};

const anchoOk = (n: number) => Number.isFinite(n) && n >= ANCHO_MIN_M && n <= ANCHO_MAX_M;

export type ModuloMapa = { id: string; nombre: string; color: string };
const SIN_MODULO = "#9aa3a8";

type Props = {
  slug: string;
  unidad: UnidadArea;
  potreros: PotreroMapa[];
  fincas: { id: string; nombre: string }[];
  modulos: ModuloMapa[];
  zonas: ZonaMapa[];
  editable: boolean;
  crearPotrero: (p: Resultado, fd: FormData) => Promise<Resultado>;
  guardarGeometria: (potreroId: string, geojson: string) => Promise<Resultado>;
  importarPotreros: (payload: string) => Promise<Resultado>;
  crearZona: (p: Resultado, fd: FormData) => Promise<Resultado>;
  actualizarZona: (zonaId: string, p: Resultado, fd: FormData) => Promise<Resultado>;
  guardarGeometriaZona: (zonaId: string, geojson: string) => Promise<Resultado>;
  eliminarZona: (zonaId: string, p: Resultado) => Promise<Resultado>;
  alto?: string;
  colorInicial?: ColorPor;
};

const TILES =
  process.env.NEXT_PUBLIC_SATELLITE_TILES ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ATRIBUCION = process.env.NEXT_PUBLIC_SATELLITE_ATTRIBUTION ?? "Imágenes © Esri, Maxar, Earthstar Geographics";
/** Centro de Costa Rica */
const CENTRO_CR: [number, number] = [-84.1, 9.85];

function bboxDe(potreros: { geometria: Poligono | null }[]): [number, number, number, number] | null {
  const pts = potreros.flatMap((p) => p.geometria?.coordinates[0] ?? []);
  if (!pts.length) return null;
  const xs = pts.map((c) => c[0]);
  const ys = pts.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function centroide(g: Poligono): [number, number] {
  const ring = g.coordinates[0].slice(0, -1);
  const x = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const y = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [x, y];
}

function colorDe(p: PotreroMapa, modo: ColorPor) {
  if (modo === "modulo") return p.modulo?.color ?? SIN_MODULO;
  if (modo === "prioridad") return PRIORIDADES[p.prioridad].color;
  return ESTADOS[p.estado].color;
}

function bboxCoords(coords: number[][]): [number, number, number, number] {
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function MapaPotreros({
  colorInicial = "estado",
  slug,
  unidad,
  potreros,
  fincas,
  modulos,
  zonas,
  editable,
  crearPotrero,
  guardarGeometria,
  importarPotreros,
  crearZona,
  actualizarZona,
  guardarGeometriaZona,
  eliminarZona,
  alto = "h-[calc(100dvh-14rem)] lg:h-[calc(100dvh-11rem)]",
}: Props) {
  const router = useRouter();
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MLMap | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const marcadores = useRef<Marker[]>([]);
  const [listo, setListo] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [zonaSel, setZonaSel] = useState<string | null>(null);
  /** Qué se está creando con el trazo nuevo */
  const [tipoTrazo, setTipoTrazo] = useState<"potrero" | "zona">("potrero");
  /** "nuevo" = dibujando algo nuevo; id = redibujando ese potrero o área */
  const [dibujando, setDibujando] = useState<null | "nuevo" | string>(null);
  const [trazo, setTrazo] = useState<Poligono | null>(null);
  /** Área cerrada (potrero, bosque) o línea con ancho (camino, quebrada) */
  const [forma, setForma] = useState<"area" | "linea">("area");
  const [eje, setEje] = useState<number[][] | null>(null);
  const [ancho, setAncho] = useState(String(ANCHO_DEFECTO.camino));
  const [tipoLinea, setTipoLinea] = useState<TipoZona>("camino");
  const anchoRef = useRef(ANCHO_DEFECTO.camino);
  const [guardandoLimite, setGuardandoLimite] = useState<string | null>(null);
  // Importación de archivos de mapas
  const inputArchivo = useRef<HTMLInputElement>(null);
  const marcadoresImport = useRef<Marker[]>([]);
  const importando = useRef(false);
  const [lectura, setLectura] = useState<{ archivo: string; poligonos: PoligonoImportado[]; avisos: string[] } | null>(null);
  const [filas, setFilas] = useState<FilaImport[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [colorPor, setColorPor] = useState<ColorPor>(colorInicial === "modulo" && modulos.length === 0 ? "estado" : colorInicial);

  const conGeo = useMemo(() => potreros.filter((p) => p.geometria), [potreros]);
  const sinGeo = useMemo(() => potreros.filter((p) => !p.geometria), [potreros]);
  const sel = potreros.find((p) => p.id === seleccion) ?? null;
  const zSel = zonas.find((z) => z.id === zonaSel) ?? null;
  const tiposPresentes = TIPOS_ZONA_IDS.filter((t) => zonas.some((z) => z.tipo === t));

  const geoZonas = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: zonas.map((z) => ({
        type: "Feature" as const,
        id: z.id,
        geometry: z.geometria,
        properties: { id: z.id, color: TIPOS_ZONA[z.tipo].color },
      })),
    }),
    [zonas],
  );

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: conGeo.map((p) => ({
        type: "Feature" as const,
        id: p.id,
        geometry: p.geometria!,
        properties: { id: p.id, color: colorDe(p, colorPor) },
      })),
    }),
    [conGeo, colorPor],
  );

  // Inicializa el mapa una sola vez (MapLibre y Terra Draw se cargan solo en el navegador).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      const { TerraDraw, TerraDrawPolygonMode, TerraDrawLineStringMode } = await import("terra-draw");
      const { TerraDrawMapLibreGLAdapter } = await import("terra-draw-maplibre-gl-adapter");
      if (cancelado || !contenedor.current) return;
      // Worker servido desde public/ (lo copia scripts/copiar-worker-mapa.mjs en dev/build)
      maplibregl.setWorkerUrl(new URL("/maplibre/maplibre-gl-worker.mjs", window.location.origin).href);
      const bb = bboxDe([...potreros, ...zonas]);
      const map = new maplibregl.Map({
        container: contenedor.current,
        style: {
          version: 8,
          sources: { sat: { type: "raster", tiles: [TILES], tileSize: 256, maxzoom: 19, attribution: ATRIBUCION } },
          layers: [{ id: "sat", type: "raster", source: "sat" }],
        },
        center: CENTRO_CR,
        zoom: 7,
        maxZoom: 19,
        attributionControl: { compact: true },
        ...(bb ? { bounds: bb, fitBoundsOptions: { padding: 48, maxZoom: 17 } } : {}),
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
        "top-right",
      );
      map.on("load", () => {
        map.addSource("potreros", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
        map.addLayer({
          id: "potreros-fill",
          type: "fill",
          source: "potreros",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.6, 0.38],
          },
        });
        map.addLayer({
          id: "potreros-line",
          type: "line",
          source: "potreros",
          paint: {
            "line-color": ["case", ["boolean", ["feature-state", "sel"], false], "#ffffff", ["get", "color"]],
            "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 3, 2],
          },
        });
        map.addSource("zonas", { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
        map.addLayer({
          id: "zonas-fill",
          type: "fill",
          source: "zonas",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.9, 0.72],
          },
        });
        map.addLayer({
          id: "zonas-line",
          type: "line",
          source: "zonas",
          paint: {
            "line-color": "#ffffff",
            "line-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 1, 0.9],
            "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 3, 2],
            "line-dasharray": [3, 2],
          },
        });
        // Vista previa de la franja de una línea recién trazada
        map.addSource("franja", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "franja-fill", type: "fill", source: "franja", paint: { "fill-color": "#ffd166", "fill-opacity": 0.45 } });
        map.addLayer({ id: "franja-line", type: "line", source: "franja", paint: { "line-color": "#ffffff", "line-width": 1.5, "line-dasharray": [2, 1.5] } });
        map.addSource("importados", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "importados-fill",
          type: "fill",
          source: "importados",
          paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "incluir"], 0.45, 0.08] },
        });
        map.addLayer({
          id: "importados-line",
          type: "line",
          source: "importados",
          paint: { "line-color": ["case", ["get", "incluir"], "#ffd166", "#ffffff"], "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
        // Tocar un polígono importado lo incluye o excluye
        map.on("click", "importados-fill", (e) => {
          const i = e.features?.[0]?.properties?.i as number | undefined;
          if (i != null) setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, incluir: !f.incluir } : f)));
        });
        // Un toque elige el área no pastoreable si cae sobre ella; si no, el potrero de abajo
        map.on("click", (e) => {
          if (draw.current?.getMode() === "polygon" || draw.current?.getMode() === "linestring" || importando.current) return;
          const fs = map.queryRenderedFeatures(e.point, { layers: ["zonas-fill", "potreros-fill"] });
          const z = fs.find((x) => x.layer.id === "zonas-fill")?.properties?.id as string | undefined;
          const p = fs.find((x) => x.layer.id === "potreros-fill")?.properties?.id as string | undefined;
          if (z) {
            setZonaSel(z);
            setSeleccion(null);
          } else if (p) {
            setSeleccion(p);
            setZonaSel(null);
          }
        });
        for (const capa of ["potreros-fill", "zonas-fill"]) {
          map.on("mouseenter", capa, () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", capa, () => (map.getCanvas().style.cursor = ""));
        }

        const td = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map }),
          modes: [
            new TerraDrawPolygonMode({
              styles: { fillColor: "#ffd166", fillOpacity: 0.35, outlineColor: "#ffd166", outlineWidth: 3, closingPointColor: "#ffffff" },
            }),
            new TerraDrawLineStringMode({
              styles: { lineStringColor: "#ffd166", lineStringWidth: 3, closingPointColor: "#ffffff", coordinatePointColor: "#ffd166" },
            }),
          ],
        });
        td.start();
        td.on("finish", (id) => {
          const f = td.getSnapshotFeature(id);
          if (f?.geometry.type === "Polygon") {
            setEje(null);
            setTrazo(f.geometry as Poligono);
            td.setMode("static");
          } else if (f?.geometry.type === "LineString") {
            const cs = (f.geometry.coordinates as number[][]).map((c) => [c[0], c[1]]);
            setEje(cs);
            setTrazo(franja(cs, anchoRef.current));
            td.setMode("static");
          }
        });
        draw.current = td;
        mapa.current = map;
        setListo(true);
      });
    })();
    return () => {
      cancelado = true;
      draw.current?.stop();
      mapa.current?.remove();
      mapa.current = null;
      draw.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza polígonos y etiquetas cuando cambian los datos.
  useEffect(() => {
    const map = mapa.current;
    if (!listo || !map) return;
    (map.getSource("potreros") as GeoJSONSource).setData(geojson);
    marcadores.current.forEach((m) => m.remove());
    (async () => {
      const maplibregl = await import("maplibre-gl");
      marcadores.current = conGeo.map((p) => {
        const el = document.createElement("div");
        el.className =
          "pointer-events-none rounded-md bg-surface/90 px-1.5 py-0.5 text-[11px] font-semibold text-foreground shadow backdrop-blur-sm whitespace-nowrap";
        el.textContent = p.nombre;
        return new maplibregl.Marker({ element: el }).setLngLat(centroide(p.geometria!)).addTo(map);
      });
    })();
  }, [listo, geojson, conGeo]);

  useEffect(() => {
    const map = mapa.current;
    if (!listo || !map) return;
    (map.getSource("zonas") as GeoJSONSource).setData(geoZonas);
  }, [listo, geoZonas]);

  useEffect(() => {
    const map = mapa.current;
    if (!listo || !map) return;
    zonas.forEach((z) => map.setFeatureState({ source: "zonas", id: z.id }, { sel: z.id === zonaSel }));
  }, [listo, zonaSel, zonas]);

  // Resalta el potrero seleccionado.
  useEffect(() => {
    const map = mapa.current;
    if (!listo || !map) return;
    conGeo.forEach((p) => map.setFeatureState({ source: "potreros", id: p.id }, { sel: p.id === seleccion }));
  }, [listo, seleccion, conGeo]);

  const fijarAncho = useCallback((txt: string, linea: number[][] | null) => {
    setAncho(txt);
    const n = Number(txt.replace(",", "."));
    if (!anchoOk(n)) return;
    anchoRef.current = n;
    if (linea) setTrazo(franja(linea, n));
  }, []);

  const empezarDibujo = useCallback(
    (modo: "nuevo" | string, f: "area" | "linea" = "area", anchoInicial?: number) => {
      draw.current?.clear();
      draw.current?.setMode(f === "linea" ? "linestring" : "polygon");
      setTrazo(null);
      setEje(null);
      setForma(f);
      setDibujando(modo);
      if (anchoInicial != null) fijarAncho(String(anchoInicial), null);
      if (modo === "nuevo") {
        setSeleccion(null);
        setZonaSel(null);
        setTipoTrazo(f === "linea" ? "zona" : "potrero");
      }
    },
    [fijarAncho],
  );

  const cancelarDibujo = useCallback(() => {
    draw.current?.clear();
    draw.current?.setMode("static");
    setTrazo(null);
    setEje(null);
    setForma("area");
    setDibujando(null);
  }, []);

  useEffect(() => {
    const map = mapa.current;
    if (!listo || !map) return;
    (map.getSource("franja") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: eje && trazo ? [{ type: "Feature", geometry: trazo, properties: {} }] : [],
    });
  }, [listo, eje, trazo]);

  const areaTrazoHa = trazo ? turfArea({ type: "Feature", geometry: trazo, properties: {} }) / 10_000 : null;

  async function guardarLimite(id: string) {
    if (!trazo) return;
    setGuardandoLimite(id);
    const esZona = zonas.some((z) => z.id === id);
    const geo = esZona && eje ? { type: "LineString", coordinates: eje } : trazo;
    const r = await (esZona ? guardarGeometriaZona : guardarGeometria)(id, JSON.stringify(geo));
    setGuardandoLimite(null);
    if (r?.ok) {
      cancelarDibujo();
      router.refresh();
    } else alert(r?.error ?? "No se pudo guardar");
  }

  // Vista previa de los polígonos importados (numerados para ubicarlos en la lista)
  useEffect(() => {
    const map = mapa.current;
    importando.current = !!lectura;
    if (!listo || !map) return;
    (map.getSource("importados") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (lectura?.poligonos ?? []).map((p, i) => ({
        type: "Feature",
        geometry: formaFila(p, filas[i]).geometria,
        properties: { i, incluir: filas[i]?.incluir ?? false, color: filas[i]?.zona ? TIPOS_ZONA[filas[i].zona!].color : "#ffd166" },
      })),
    });
  }, [listo, lectura, filas]);

  useEffect(() => {
    const map = mapa.current;
    marcadoresImport.current.forEach((m) => m.remove());
    marcadoresImport.current = [];
    if (!listo || !map || !lectura) return;
    let cancelado = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelado) return;
      marcadoresImport.current = lectura.poligonos.map((p, i) => {
        const el = document.createElement("div");
        el.className = "pointer-events-none grid size-6 place-items-center rounded-full bg-[#8a5f17] text-[11px] font-bold text-white shadow ring-2 ring-white";
        el.textContent = String(i + 1);
        return new maplibregl.Marker({ element: el }).setLngLat(centroide(p.geometria)).addTo(map);
      });
      map.fitBounds(bboxCoords(lectura.poligonos.flatMap((p) => p.geometria.coordinates[0])), { padding: 60, maxZoom: 17 });
    })();
    return () => {
      cancelado = true;
    };
  }, [listo, lectura]);

  async function abrirArchivo(file: File | undefined) {
    if (!file) return;
    cancelarDibujo();
    setSeleccion(null);
    setZonaSel(null);
    setAviso(null);
    setLeyendo(true);
    try {
      const r = await leerArchivoMapa(file);
      setFilas(filasIniciales(r.poligonos, potreros));
      setLectura({ archivo: file.name, ...r });
    } catch (e) {
      setAviso({ tono: "error", texto: e instanceof ErrorMapa ? e.message : "No se pudo leer el archivo. Verifica que no esté dañado." });
    } finally {
      setLeyendo(false);
      if (inputArchivo.current) inputArchivo.current.value = "";
    }
  }

  function cerrarImport() {
    setLectura(null);
    setFilas([]);
  }

  const enfocarImportado = (i: number) => {
    const p = lectura?.poligonos[i];
    if (p && mapa.current) mapa.current.fitBounds(bboxCoords(p.geometria.coordinates[0]), { padding: 80, maxZoom: 18 });
  };

  const irAZona = (z: ZonaMapa) => {
    setZonaSel(z.id);
    setSeleccion(null);
    if (mapa.current) mapa.current.fitBounds(bboxCoords(z.geometria.coordinates[0]), { padding: 80, maxZoom: 18 });
  };

  const irA = (p: PotreroMapa) => {
    setSeleccion(p.id);
    setZonaSel(null);
    if (p.geometria && mapa.current) {
      const c = p.geometria.coordinates[0];
      const xs = c.map((x) => x[0]);
      const ys = c.map((x) => x[1]);
      mapa.current.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: 80, maxZoom: 18 });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className={`relative overflow-hidden rounded-2xl border border-border bg-surface-2 ${alto}`}>
        {/* MapLibre fuerza position:relative en el contenedor, así que se dimensiona con size-full */}
        <div ref={contenedor} className="size-full" role="region" aria-label="Mapa satelital de potreros" />

        {/* Leyenda y modo de color */}
        <div className="absolute bottom-3 left-3 right-14 flex flex-col items-start gap-1.5">
          {(
            <div role="radiogroup" aria-label="Colorear potreros por" className="flex rounded-lg bg-surface/90 p-0.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
              {(["estado", "prioridad", ...(modulos.length ? (["modulo"] as const) : [])] as ColorPor[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={colorPor === m}
                  onClick={() => setColorPor(m)}
                  className={`min-h-8 rounded-md px-3 ${colorPor === m ? "bg-primary text-on-primary" : "hover:bg-surface-2"}`}
                >
                  {m === "estado" ? "Estado" : m === "prioridad" ? "Prioridad" : "Módulo"}
                </button>
              ))}
            </div>
          )}
          <div className="pointer-events-none flex flex-wrap gap-1.5" data-testid="leyenda">
            {colorPor === "prioridad"
              ? ORDEN_PRIORIDAD.filter((k) => potreros.some((p) => p.prioridad === k)).map((k) => (
                  <span key={k} className="chip bg-surface/90 text-foreground shadow-sm backdrop-blur-sm" title={PRIORIDADES[k].descripcion}>
                    <span className="size-2 rounded-full" style={{ background: PRIORIDADES[k].color }} aria-hidden />
                    {PRIORIDADES[k].label}
                  </span>
                ))
              : colorPor === "estado"
              ? (Object.keys(ESTADOS) as EstadoPotrero[]).map((k) => (
                  <span key={k} className="chip bg-surface/90 text-foreground shadow-sm backdrop-blur-sm">
                    <span className="size-2 rounded-full" style={{ background: ESTADOS[k].color }} aria-hidden />
                    {ESTADOS[k].label}
                  </span>
                ))
              : [...modulos, ...(potreros.some((p) => !p.modulo) ? [{ id: "sin", nombre: "Sin módulo", color: SIN_MODULO }] : [])].map((m) => (
                  <span key={m.id} className="chip bg-surface/90 text-foreground shadow-sm backdrop-blur-sm">
                    <span className="size-2 rounded-sm" style={{ background: m.color }} aria-hidden />
                    {m.nombre}
                  </span>
                ))}
            {tiposPresentes.map((t) => (
              <span key={t} className="chip bg-surface/90 text-foreground shadow-sm backdrop-blur-sm">
                <span className="size-2 rounded-sm ring-1 ring-black/10" style={{ background: TIPOS_ZONA[t].color }} aria-hidden />
                {TIPOS_ZONA[t].label.split(" (")[0]}
              </span>
            ))}
          </div>
        </div>

        {/* Barra de dibujo */}
        {editable && (
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {lectura ? null : !dibujando ? (
              <>
                <button type="button" className="btn shadow-lg" onClick={() => empezarDibujo("nuevo")} disabled={!listo || fincas.length === 0}>
                  <PenLine className="size-4" aria-hidden />
                  Dibujar
                </button>
                <button
                  type="button"
                  className="btn-secondary shadow-lg"
                  onClick={() => inputArchivo.current?.click()}
                  disabled={!listo || fincas.length === 0 || leyendo}
                  title="KML, KMZ, GeoJSON, Shapefile (.zip) o GPX"
                >
                  <FileUp className="size-4" aria-hidden />
                  {leyendo ? "Leyendo…" : "Importar archivo"}
                </button>
                <input
                  ref={inputArchivo}
                  type="file"
                  accept={FORMATOS_MAPA}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Archivo de mapa"
                  data-testid="archivo-mapa"
                  onChange={(e) => abrirArchivo(e.target.files?.[0])}
                />
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-surface/95 p-1.5 pl-3 text-sm shadow-lg backdrop-blur">
                {!trazo && dibujando === "nuevo" && (
                  <div role="radiogroup" aria-label="Forma" className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5 text-xs font-semibold">
                    {(
                      [
                        ["area", "Área"],
                        ["linea", "Línea"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={forma === v}
                        onClick={() => empezarDibujo("nuevo", v)}
                        title={v === "linea" ? "Caminos, quebradas o cercas: se convierten en una franja con el ancho que indiques" : "Potreros, bosques, instalaciones"}
                        className={`min-h-8 rounded-md px-2.5 ${forma === v ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="font-medium">
                  {trazo ? (
                    areaTrazoHa! > 5000 ? (
                      <span className="text-danger">Área demasiado grande: acerca el mapa a tu finca y vuelve a dibujar</span>
                    ) : (
                      <>{eje ? "Franja" : "Área"}: <b className="num">{formatArea(areaTrazoHa!, unidad)}</b></>
                    )
                  ) : forma === "linea" ? (
                    "Toca el mapa para marcar el recorrido; toca el último punto otra vez para terminar"
                  ) : (
                    "Toca el mapa para marcar las esquinas; toca el primer punto para cerrar"
                  )}
                </span>
                {trazo && (
                  <button type="button" className="btn-ghost" onClick={() => empezarDibujo(dibujando, forma, anchoRef.current)} aria-label="Volver a dibujar">
                    <Undo2 className="size-4" aria-hidden />
                  </button>
                )}
                <button type="button" className="btn-ghost" onClick={cancelarDibujo} aria-label="Cancelar dibujo">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel lateral */}
      <aside className="space-y-4">
        {aviso && (
          <p
            role={aviso.tono === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${aviso.tono === "error" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-strong"}`}
          >
            {aviso.tono === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span className="flex-1">{aviso.texto}</span>
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso">
              <X className="size-4" aria-hidden />
            </button>
          </p>
        )}
        {lectura ? (
          <PanelImportar
            archivo={lectura.archivo}
            poligonos={lectura.poligonos}
            avisos={lectura.avisos}
            filas={filas}
            setFilas={setFilas}
            fincas={fincas}
            modulos={modulos}
            existentes={potreros.map((p) => ({ id: p.id, nombre: p.nombre }))}
            unidad={unidad}
            enfocar={enfocarImportado}
            importar={importarPotreros}
            onCancelar={cerrarImport}
            onListo={(m) => {
              cerrarImport();
              setAviso({ tono: "ok", texto: m });
              router.refresh();
            }}
          />
        ) : dibujando === "nuevo" && trazo && eje ? (
          <div className="card card-pad">
            <ActionForm
              action={crearZona}
              onSuccess={() => {
                cancelarDibujo();
                router.refresh();
              }}
            >
              <input type="hidden" name="eje" value={JSON.stringify(eje)} />
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                Línea de <b className="num">{formatNum(longitudM(eje), 0)} m</b> → franja de <b className="num">{formatArea(areaTrazoHa, unidad)}</b>. Se descuenta sola de los potreros que cruce.
              </p>
              <Field label="Tipo" name="tipo" required>
                <select
                  className="input"
                  value={tipoLinea}
                  onChange={(e) => {
                    const t = e.target.value as TipoZona;
                    // Propone el ancho típico del tipo, salvo que el usuario ya lo haya cambiado
                    if (ancho === String(ANCHO_DEFECTO[tipoLinea])) fijarAncho(String(ANCHO_DEFECTO[t]), eje);
                    setTipoLinea(t);
                  }}
                >
                  {TIPOS_ZONA_IDS.map((t) => <option key={t} value={t}>{TIPOS_ZONA[t].label}</option>)}
                </select>
              </Field>
              <Field label="Ancho (m)" name="anchoM" required hint="Ancho total de la franja: camino ~4 m; protección de quebrada 15 m por lado (30 m)">
                <input
                  className="input num"
                  type="number"
                  inputMode="decimal"
                  min={ANCHO_MIN_M}
                  max={ANCHO_MAX_M}
                  step="0.5"
                  value={ancho}
                  onChange={(e) => fijarAncho(e.target.value, eje)}
                />
              </Field>
              <Field label="Nombre" name="nombre" hint="Opcional, p. ej. Camino a la lechería">
                <input className="input" maxLength={120} />
              </Field>
              <Field label="Finca" name="fincaId" required>
                <select className="input">
                  {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </Field>
              <Submit className="btn w-full">Guardar área no pastoreable</Submit>
            </ActionForm>
          </div>
        ) : dibujando === "nuevo" && trazo && tipoTrazo === "zona" ? (
          <div className="card card-pad">
            <SelectorTrazo valor={tipoTrazo} cambiar={setTipoTrazo} />
            <ActionForm
              action={crearZona}
              onSuccess={() => {
                cancelarDibujo();
                router.refresh();
              }}
            >
              <input type="hidden" name="geometria" value={JSON.stringify(trazo)} />
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                Área: <b className="num">{formatArea(areaTrazoHa, unidad)}</b>. Se descuenta sola de los potreros que toque.
              </p>
              <Field label="Tipo" name="tipo" required>
                <select className="input" defaultValue="bosque">
                  {TIPOS_ZONA_IDS.map((t) => <option key={t} value={t}>{TIPOS_ZONA[t].label}</option>)}
                </select>
              </Field>
              <Field label="Nombre" name="nombre" hint="Opcional, p. ej. Bosque de la quebrada">
                <input className="input" maxLength={120} />
              </Field>
              <Field label="Finca" name="fincaId" required>
                <select className="input">
                  {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </Field>
              <Submit className="btn w-full">Guardar área no pastoreable</Submit>
            </ActionForm>
          </div>
        ) : dibujando === "nuevo" && trazo ? (
          <div className="card card-pad">
            <SelectorTrazo valor={tipoTrazo} cambiar={setTipoTrazo} />
            <ActionForm
              action={crearPotrero}
              onSuccess={() => {
                cancelarDibujo();
                router.refresh();
              }}
            >
              <input type="hidden" name="geometria" value={JSON.stringify(trazo)} />
              <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-strong">
                Área calculada: <b className="num">{formatArea(areaTrazoHa, unidad)}</b>
              </p>
              <Field label="Nombre" name="nombre" required>
                <input className="input" placeholder="Ej. Potrero 7" autoFocus />
              </Field>
              <Field label="Finca" name="fincaId" required>
                <select className="input">
                    {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
              </Field>
              {modulos.length > 0 && (
                <Field label="Módulo" name="moduloId">
                  <select className="input">
                    <option value="">Sin módulo</option>
                    {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Tipo de pasto" name="tipoPasto">
                <input className="input" list="pastos-cr" placeholder="Ej. Estrella africana" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Días de descanso" name="diasDescanso" hint="Objetivo">
                  <input className="input" type="number" inputMode="numeric" min={1} defaultValue={30} />
                </Field>
                <Field label="Días de ocupación" name="diasOcupacion" hint="Objetivo">
                  <input className="input" type="number" inputMode="numeric" min={1} defaultValue={1} />
                </Field>
              </div>
              <Submit className="btn w-full">Guardar potrero</Submit>
            </ActionForm>
          </div>
        ) : sel ? (
          <div className="card card-pad">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{sel.nombre}</h2>
                <p className="text-xs text-muted">{sel.fincaNombre}</p>
                {modulos.length > 0 && <ModuloChip modulo={sel.modulo} className="mt-1.5" />}
              </div>
              <button type="button" className="btn-ghost -mr-2 -mt-1" onClick={() => setSeleccion(null)} aria-label="Cerrar detalle">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <span className="chip mb-3" style={{ background: `${ESTADOS[sel.estado].color}22`, color: "var(--foreground)" }}>
              <span className="size-1.5 rounded-full" style={{ background: ESTADOS[sel.estado].color }} aria-hidden />
              {ESTADOS[sel.estado].label}
            </span>
            <p className="text-sm">{sel.detalle}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Área aprovechable</dt><dd className="num font-semibold">{formatArea(sel.areaUtilHa, unidad)}</dd></div>
              <div><dt className="text-xs text-muted">Pasto</dt><dd className="font-semibold">{sel.tipoPasto ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Cobertura estimada</dt><dd className="num font-semibold">{sel.cobertura == null ? "—" : `${formatNum(sel.cobertura, 0)} kg MS/ha`}</dd></div>
              <div>
                <dt className="text-xs text-muted">Prioridad</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <span className="size-2 rounded-full" style={{ background: PRIORIDADES[sel.prioridad].color }} aria-hidden />
                  {PRIORIDADES[sel.prioridad].label}
                </dd>
              </div>
              {sel.areaHa != null && sel.areaUtilHa != null && sel.areaHa - sel.areaUtilHa > 0.005 && (
                <div className="col-span-2">
                  <dt className="text-xs text-muted">No pastoreable dentro del potrero</dt>
                  <dd className="num font-semibold">{formatArea(sel.areaHa - sel.areaUtilHa, unidad)} de {formatArea(sel.areaHa, unidad)}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/app/${slug}/potreros/${sel.id}`} className="btn flex-1">
                Ver historial <ArrowRight className="size-4" aria-hidden />
              </Link>
              {editable && dibujando !== sel.id && (
                <button type="button" className="btn-secondary" onClick={() => empezarDibujo(sel.id)}>
                  <PenLine className="size-4" aria-hidden /> {sel.geometria ? "Redibujar" : "Dibujar"}
                </button>
              )}
            </div>
            {dibujando === sel.id && trazo && (
              <button type="button" className="btn mt-2 w-full" onClick={() => guardarLimite(sel.id)} disabled={guardandoLimite === sel.id}>
                <Check className="size-4" aria-hidden /> Guardar límite ({formatArea(areaTrazoHa, unidad)})
              </button>
            )}
          </div>
        ) : zSel ? (
          <div className="card card-pad" data-testid="detalle-zona">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{zSel.nombre}</h2>
                <p className="text-xs text-muted">{zSel.fincaNombre} · área no pastoreable</p>
              </div>
              <button type="button" className="btn-ghost -mr-2 -mt-1" onClick={() => setZonaSel(null)} aria-label="Cerrar detalle">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <span className="chip mb-3" style={{ background: `${TIPOS_ZONA[zSel.tipo].color}26`, color: "var(--foreground)" }}>
              <span className="size-2 rounded-sm" style={{ background: TIPOS_ZONA[zSel.tipo].color }} aria-hidden />
              {TIPOS_ZONA[zSel.tipo].label}
            </span>
            <p className="text-sm">
              <span className="text-muted">Área:</span> <b className="num">{formatArea(zSel.areaHa, unidad)}</b>
              {zSel.anchoM != null && (
                <span className="block text-xs text-muted">
                  Franja de <span className="num">{formatNum(zSel.anchoM, 1)}</span> m de ancho
                  {zSel.largoM != null && <> sobre <span className="num">{formatNum(zSel.largoM, 0)}</span> m de línea</>}
                </span>
              )}
            </p>
            {editable && (
              <>
                <ActionForm
                  key={zSel.id}
                  action={actualizarZona.bind(null, zSel.id)}
                  className="mt-3 space-y-3 border-t border-border pt-3"
                  version={`${zSel.nombre}|${zSel.tipo}|${zSel.anchoM}`}
                >
                  <Field label="Nombre" name="nombre" required>
                    <input className="input" defaultValue={zSel.nombre} maxLength={120} />
                  </Field>
                  <Field label="Tipo" name="tipo" required>
                    <select className="input" defaultValue={zSel.tipo}>
                      {TIPOS_ZONA_IDS.map((t) => <option key={t} value={t}>{TIPOS_ZONA[t].label}</option>)}
                    </select>
                  </Field>
                  {zSel.anchoM != null && (
                    <Field label="Ancho (m)" name="anchoM" required>
                      <input className="input num" type="number" inputMode="decimal" min={ANCHO_MIN_M} max={ANCHO_MAX_M} step="0.5" defaultValue={zSel.anchoM} />
                    </Field>
                  )}
                  <Submit className="btn w-full">Guardar</Submit>
                </ActionForm>
                <div className="mt-2 flex gap-2">
                  {dibujando !== zSel.id && (
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      onClick={() => (zSel.anchoM != null ? empezarDibujo(zSel.id, "linea", zSel.anchoM) : empezarDibujo(zSel.id))}
                    >
                      <PenLine className="size-4" aria-hidden /> Redibujar
                    </button>
                  )}
                  <BotonAccion
                    key={`del-${zSel.id}`}
                    action={eliminarZona.bind(null, zSel.id)}
                    className="btn-ghost text-danger"
                    confirmar={`¿Eliminar «${zSel.nombre}»? Su área vuelve a contarse como pastoreable.`}
                  >
                    <Trash2 className="size-4" aria-hidden /> Eliminar
                  </BotonAccion>
                </div>
                {dibujando === zSel.id && trazo && (
                  <button type="button" className="btn mt-2 w-full" onClick={() => guardarLimite(zSel.id)} disabled={guardandoLimite === zSel.id}>
                    <Check className="size-4" aria-hidden /> Guardar límite ({formatArea(areaTrazoHa, unidad)})
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="card card-pad text-sm text-muted">
            <p className="flex items-center gap-2 font-semibold text-foreground"><Layers className="size-4 text-primary" aria-hidden /> {plural(potreros.length, "potrero")}</p>
            <p className="mt-1">
              {editable
                ? fincas.length === 0
                  ? "Crea una finca en Ajustes para empezar a dibujar."
                  : conGeo.length === 0
                    ? "¿Ya tienes el mapa de la finca? Usa «Importar archivo» (KML/KMZ de Google Earth, Shapefile, GeoJSON o GPX). Si no, acércate a tu finca y toca «Dibujar»."
                    : "Toca un potrero para ver su estado. Con «Dibujar» agregas potreros o marcas bosque, caminos y quebradas, que no cuentan como área de pastoreo."
                : "Toca un potrero para ver su estado."}
            </p>
          </div>
        )}

        <div className="card overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 text-sm font-bold">Potreros</h2>
          <ul className="max-h-[42dvh] divide-y divide-border overflow-y-auto">
            {potreros.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => irA(p)}
                  aria-pressed={seleccion === p.id}
                  className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface-2 ${seleccion === p.id ? "bg-surface-2" : ""}`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: colorDe(p, colorPor) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.nombre}</span>
                  <span className="text-xs text-muted">{p.geometria ? formatArea(p.areaUtilHa, unidad, 1) : "sin dibujar"}</span>
                </button>
              </li>
            ))}
          </ul>
          {sinGeo.length > 0 && editable && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted">
              {sinGeo.length} sin límite dibujado: selecciónalo y usa «Dibujar».
            </p>
          )}
        </div>

        {zonas.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-bold">
              <Trees className="size-4 text-primary" aria-hidden /> Áreas no pastoreables
              <span className="num ml-auto text-xs font-medium text-muted">{formatArea(zonas.reduce((s, z) => s + z.areaHa, 0), unidad, 1)}</span>
            </h2>
            <ul className="max-h-[30dvh] divide-y divide-border overflow-y-auto" aria-label="Áreas no pastoreables">
              {zonas.map((z) => (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => irAZona(z)}
                    aria-pressed={zonaSel === z.id}
                    className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface-2 ${zonaSel === z.id ? "bg-surface-2" : ""}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: TIPOS_ZONA[z.tipo].color }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{z.nombre}</span>
                    <span className="text-xs text-muted">{formatArea(z.areaHa, unidad, 1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

/** Elige si el polígono recién trazado es un potrero o un área no pastoreable. */
function SelectorTrazo({ valor, cambiar }: { valor: "potrero" | "zona"; cambiar: (v: "potrero" | "zona") => void }) {
  return (
    <div role="radiogroup" aria-label="¿Qué dibujaste?" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
      {(
        [
          ["potrero", "Potrero"],
          ["zona", "No pastoreable"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => cambiar(v)}
          className={`min-h-10 rounded-lg px-3 ${valor === v ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
