"use client";
import { useId, useState } from "react";
import { AlertTriangle, FileUp, X } from "lucide-react";
import { TIPOS_ZONA, TIPOS_ZONA_IDS, detectarTipoZona, formatArea, formatNum, type TipoZona, type UnidadArea } from "@/lib/dominio";
import { MAX_HA_IMPORTADO, type Poligono, type PoligonoImportado } from "@/lib/importar-mapa";
import { ANCHO_DEFECTO, ANCHO_MAX_M, ANCHO_MIN_M, franja } from "@/lib/franja";
import turfArea from "@turf/area";
import type { Resultado } from "@/lib/acciones";

/** Cada polígono se vuelve un potrero nuevo, actualiza uno existente o queda como área no pastoreable (zona). */
export type FilaImport = {
  nombre: string;
  incluir: boolean;
  potreroId: string | null;
  zona: TipoZona | null;
  /** Solo si una línea se importa como franja: ancho en metros tal como lo escribe el usuario */
  ancho: string | null;
};

export const anchoNum = (a: string | null) => (a == null ? null : Number(a.replace(",", ".")));
const anchoValido = (n: number | null) => n != null && Number.isFinite(n) && n >= ANCHO_MIN_M && n <= ANCHO_MAX_M;

const cacheFranjas = new WeakMap<PoligonoImportado, Map<number, { geometria: Poligono; areaHa: number }>>();

/** Geometría y área que tendrá la fila: el polígono del archivo o la franja de la línea con su ancho. */
export function formaFila(p: PoligonoImportado, f: FilaImport | undefined): { geometria: Poligono; areaHa: number } {
  const n = anchoNum(f?.ancho ?? null);
  if (!p.eje || !anchoValido(n)) return p;
  let m = cacheFranjas.get(p);
  if (!m) cacheFranjas.set(p, (m = new Map()));
  let r = m.get(n!);
  if (!r) {
    const g = franja(p.eje, n!) ?? p.geometria;
    r = { geometria: g, areaHa: turfArea({ type: "Feature", geometry: g, properties: {} }) / 10_000 };
    m.set(n!, r);
  }
  return r;
}

/** Normaliza nombres para emparejar "Potrero 7" con "potrero  7" o "POTRERO 7". */
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function filasIniciales(poligonos: PoligonoImportado[], existentes: { id: string; nombre: string }[]): FilaImport[] {
  const porNombre = new Map(existentes.map((p) => [normalizar(p.nombre), p.id]));
  const usados = new Set<string>();
  return poligonos.map((p) => {
    const id = porNombre.get(normalizar(p.nombre));
    const potreroId = id && !usados.has(id) ? id : null;
    if (p.soloFranja) {
      // Línea abierta: camino, quebrada, cerca… siempre como franja no pastoreable
      const zona = detectarTipoZona(p.nombre) ?? "camino";
      return { nombre: p.nombre, incluir: true, potreroId: null, zona, ancho: String(ANCHO_DEFECTO[zona]) };
    }
    if (potreroId) usados.add(potreroId);
    // "Bosque", "Camino", "Quebrada"… se proponen como áreas no pastoreables
    const zona = potreroId ? null : detectarTipoZona(p.nombre);
    return { nombre: p.nombre, incluir: p.areaHa <= MAX_HA_IMPORTADO, potreroId, zona, ancho: null };
  });
}

type Props = {
  archivo: string;
  poligonos: PoligonoImportado[];
  avisos: string[];
  filas: FilaImport[];
  setFilas: (f: FilaImport[]) => void;
  fincas: { id: string; nombre: string }[];
  modulos: { id: string; nombre: string }[];
  existentes: { id: string; nombre: string }[];
  unidad: UnidadArea;
  enfocar: (i: number) => void;
  importar: (payload: string) => Promise<Resultado>;
  onCancelar: () => void;
  onListo: (mensaje: string) => void;
};

export function PanelImportar({ archivo, poligonos, avisos, filas, setFilas, fincas, modulos, existentes, unidad, enfocar, importar, onCancelar, onListo }: Props) {
  const uid = useId();
  const [fincaId, setFincaId] = useState(fincas[0]?.id ?? "");
  const [tipoPasto, setTipoPasto] = useState("");
  const [moduloId, setModuloId] = useState("");
  const [diasDescanso, setDiasDescanso] = useState("30");
  const [diasOcupacion, setDiasOcupacion] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const elegidas = filas.map((f, i) => ({ ...f, i })).filter((f) => f.incluir);
  const nuevos = elegidas.filter((f) => !f.potreroId && !f.zona).length;
  const zonas = elegidas.filter((f) => f.zona).length;
  const actualizados = elegidas.length - nuevos - zonas;
  const areaElegida = elegidas.reduce((s, f) => s + formaFila(poligonos[f.i], f).areaHa, 0);
  const cambiar = (i: number, c: Partial<FilaImport>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...c } : f)));
  const destinosUsados = new Set(elegidas.flatMap((f) => (f.potreroId ? [f.potreroId] : [])));

  async function enviar() {
    setError(null);
    if (!elegidas.length) return setError("Selecciona al menos un polígono.");
    const vacio = elegidas.find((f) => !f.nombre.trim());
    if (vacio) return setError(`Fila ${vacio.i + 1}: escribe un nombre.`);
    const malAncho = elegidas.find((f) => f.ancho != null && !anchoValido(anchoNum(f.ancho)));
    if (malAncho) return setError(`Fila ${malAncho.i + 1}: el ancho debe estar entre ${ANCHO_MIN_M} y ${ANCHO_MAX_M} m.`);
    setEnviando(true);
    const r = await importar(
      JSON.stringify({
        fincaId,
        tipoPasto,
        moduloId,
        diasDescanso,
        diasOcupacion,
        items: elegidas.map((f) =>
          f.ancho != null && poligonos[f.i].eje
            ? { nombre: f.nombre.trim(), potreroId: null, zona: f.zona, eje: poligonos[f.i].eje, anchoM: anchoNum(f.ancho) }
            : { nombre: f.nombre.trim(), potreroId: f.zona ? null : f.potreroId, zona: f.zona, geometria: JSON.stringify(poligonos[f.i].geometria) },
        ),
      }),
    );
    setEnviando(false);
    if (r?.ok) onListo(r.mensaje ?? "Importación lista");
    else setError(r?.error ?? "No se pudo importar.");
  }

  return (
    <div className="card overflow-hidden" aria-labelledby={`${uid}-t`}>
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={`${uid}-t`} className="flex items-center gap-2 font-bold">
            <FileUp className="size-4 text-primary" aria-hidden /> Importar mapa
          </h2>
          <p className="truncate text-xs text-muted" title={archivo}>{archivo} · {poligonos.length} polígono{poligonos.length === 1 ? "" : "s"}</p>
        </div>
        <button type="button" className="btn-ghost -mr-2" onClick={onCancelar} aria-label="Cancelar importación">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        {avisos.map((a) => (
          <p key={a} className="flex gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {a}
          </p>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label" htmlFor={`${uid}-finca`}>Finca para los nuevos</label>
            <select id={`${uid}-finca`} className="input" value={fincaId} onChange={(e) => setFincaId(e.target.value)}>
              {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
          {modulos.length > 0 && (
            <div className="col-span-2">
              <label className="label" htmlFor={`${uid}-modulo`}>Módulo</label>
              <select id={`${uid}-modulo`} className="input" value={moduloId} onChange={(e) => setModuloId(e.target.value)}>
                <option value="">Sin módulo</option>
                {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className="label" htmlFor={`${uid}-pasto`}>Tipo de pasto</label>
            <input id={`${uid}-pasto`} className="input" list="pastos-cr" placeholder="Opcional" value={tipoPasto} onChange={(e) => setTipoPasto(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-desc`}>Días descanso</label>
            <input id={`${uid}-desc`} className="input" type="number" inputMode="numeric" min={1} value={diasDescanso} onChange={(e) => setDiasDescanso(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-ocup`}>Días ocupación</label>
            <input id={`${uid}-ocup`} className="input" type="number" inputMode="numeric" min={1} value={diasOcupacion} onChange={(e) => setDiasOcupacion(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-y border-border bg-surface-2 px-4 py-2 text-xs">
        <span className="font-semibold">{elegidas.length} de {filas.length} · <span className="num">{formatArea(areaElegida, unidad, 1)}</span></span>
        <span className="flex gap-1">
          <button type="button" className="rounded px-2 py-1 font-medium text-primary hover:bg-surface" onClick={() => setFilas(filas.map((f, i) => ({ ...f, incluir: poligonos[i].areaHa <= MAX_HA_IMPORTADO })))}>Todos</button>
          <button type="button" className="rounded px-2 py-1 font-medium text-primary hover:bg-surface" onClick={() => setFilas(filas.map((f) => ({ ...f, incluir: false })))}>Ninguno</button>
        </span>
      </div>

      <ol className="max-h-[46dvh] divide-y divide-border overflow-y-auto" aria-label="Polígonos del archivo">
        {filas.map((f, i) => {
          const p = poligonos[i];
          const forma = formaFila(p, f);
          const grande = forma.areaHa > MAX_HA_IMPORTADO;
          const valor = f.ancho != null ? `franja:${f.zona}` : f.zona ? `zona:${f.zona}` : (f.potreroId ?? "");
          return (
            <li key={i} className={`px-4 py-2.5 ${f.incluir ? "" : "opacity-60"}`} data-testid="fila-import">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-[var(--primary)]"
                  checked={f.incluir}
                  disabled={grande}
                  onChange={(e) => cambiar(i, { incluir: e.target.checked })}
                  aria-label={`Incluir polígono ${i + 1}`}
                />
                <button type="button" onClick={() => enfocar(i)} className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-white" aria-label={`Ver polígono ${i + 1} en el mapa`}>
                  {i + 1}
                </button>
                <input
                  className="input min-h-9 flex-1 py-1 text-sm"
                  value={f.nombre}
                  onChange={(e) => cambiar(i, { nombre: e.target.value })}
                  aria-label={`Nombre del polígono ${i + 1}`}
                  maxLength={120}
                />
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-[3.25rem] text-xs">
                <span className={`num shrink-0 ${grande ? "font-semibold text-danger" : "text-muted"}`}>
                  {formatArea(forma.areaHa, unidad)}
                  {grande && " · demasiado grande"}
                </span>
                <select
                  className="input min-h-8 flex-1 py-0 text-xs"
                  value={valor}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("franja:")) {
                      const t = val.slice(7) as TipoZona;
                      // Al cambiar de tipo se propone su ancho típico, salvo que el usuario ya lo haya ajustado
                      const ancho = f.ancho == null || (f.zona && f.ancho === String(ANCHO_DEFECTO[f.zona])) ? String(ANCHO_DEFECTO[t]) : f.ancho;
                      cambiar(i, { zona: t, potreroId: null, ancho });
                    } else if (val.startsWith("zona:")) cambiar(i, { zona: val.slice(5) as TipoZona, potreroId: null, ancho: null });
                    else cambiar(i, { zona: null, potreroId: val || null, ancho: null });
                  }}
                  aria-label={`Destino del polígono ${i + 1}`}
                >
                  {p.eje && (
                    <optgroup label="Línea con ancho (no pastoreable)">
                      {TIPOS_ZONA_IDS.map((t) => (
                        <option key={t} value={`franja:${t}`}>Franja: {TIPOS_ZONA[t].label.split(" (")[0]}</option>
                      ))}
                    </optgroup>
                  )}
                  {!p.soloFranja && <option value="">Nuevo potrero</option>}
                  {!p.soloFranja && existentes.length > 0 && (
                    <optgroup label="Actualizar límite de">
                      {existentes.map((x) => (
                        <option key={x.id} value={x.id} disabled={x.id !== f.potreroId && destinosUsados.has(x.id)}>
                          Actualizar: {x.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {!p.soloFranja && (
                    <optgroup label="Área no pastoreable">
                      {TIPOS_ZONA_IDS.map((t) => (
                        <option key={t} value={`zona:${t}`}>No pastoreable: {TIPOS_ZONA[t].label.split(" (")[0]}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              {f.ancho != null && p.longitudM != null && (
                <div className="mt-1.5 flex items-center gap-2 pl-[3.25rem] text-xs text-muted">
                  <label htmlFor={`${uid}-ancho-${i}`}>Ancho</label>
                  <input
                    id={`${uid}-ancho-${i}`}
                    className={`input num min-h-8 w-20 py-0 text-xs ${anchoValido(anchoNum(f.ancho)) ? "" : "border-danger"}`}
                    type="number"
                    inputMode="decimal"
                    min={ANCHO_MIN_M}
                    max={ANCHO_MAX_M}
                    step="0.5"
                    value={f.ancho}
                    onChange={(e) => cambiar(i, { ancho: e.target.value })}
                    aria-label={`Ancho de la franja ${i + 1} (m)`}
                  />
                  <span>m · línea de <span className="num">{formatNum(p.longitudM, 0)}</span> m</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button type="button" className="btn w-full" onClick={enviar} disabled={enviando || !elegidas.length || !fincaId}>
          {enviando
            ? "Importando…"
            : nuevos === elegidas.length
              ? `Crear ${nuevos} potrero${nuevos === 1 ? "" : "s"}`
              : `Importar ${elegidas.length} (${[
                  nuevos && `${nuevos} nuevo${nuevos === 1 ? "" : "s"}`,
                  actualizados && `${actualizados} actualizado${actualizados === 1 ? "" : "s"}`,
                  zonas && `${zonas} no pastoreable${zonas === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(", ")})`}
        </button>
      </div>
    </div>
  );
}
