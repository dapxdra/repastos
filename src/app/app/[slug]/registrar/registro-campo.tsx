"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Beef, Check, ChevronLeft, ChevronRight, CloudOff, CloudRain, CloudUpload, LogIn, Ruler, Trash2, TriangleAlert } from "lucide-react";
import { fechaCortaCR, formatNum, hoyCR, sumarDias } from "@/lib/dominio";
import { ESTADOS_SALIDA, kgDesdeAltura, parametrosPasto, type EstadoSalida } from "@/lib/forraje";

export type DatosCampo = {
  generado: string;
  factor: number;
  fincas: { id: string; nombre: string }[];
  lotes: { id: string; nombre: string; cabezas: number }[];
  potreros: {
    id: string;
    nombre: string;
    modulo: { id: string; nombre: string; color: string } | null;
    tipoPasto: string | null;
    pasto: string;
    alturaEntrada: number;
    alturaSalida: number;
    hojasObjetivo: number;
    /** Fecha de liberación si está en carencia */
    enEspera: string | null;
    lote: { id: string; pastoreoId: string } | null;
  }[];
};

type Tipo = "aforo" | "lluvia" | "mover" | "sacar";
type Item = { id: string; tipo: Tipo; datos: Record<string, string>; etiqueta: string; creado: string; error?: string };
type Recorrido = { fecha: string; hechos: string[] };

// ───────────── Almacenamiento en el teléfono ─────────────
// La cola vive en localStorage: sobrevive a cerrar el navegador o apagar el celular hasta que haya señal.

const EVENTO = "repastos-local";
function leer<T>(clave: string, defecto: T): T {
  try {
    const s = localStorage.getItem(clave);
    return s ? (JSON.parse(s) as T) : defecto;
  } catch {
    return defecto;
  }
}
function escribir(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento (modo privado): el registro se intenta enviar igual
  }
  window.dispatchEvent(new Event(EVENTO));
}
function suscribir(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENTO, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENTO, cb);
  };
}
/** Valor de localStorage como estado (el servidor y la hidratación ven `defecto`). */
function useLocal<T>(clave: string, defecto: T): T {
  const crudo = useSyncExternalStore(
    suscribir,
    () => {
      try {
        return localStorage.getItem(clave);
      } catch {
        return null;
      }
    },
    () => null,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `defecto` es un literal constante
  return useMemo(() => (crudo ? (JSON.parse(crudo) as T) : defecto), [crudo]);
}

// ───────────── Componente ─────────────

export function RegistroCampo({ slug, datos }: { slug: string; datos: DatosCampo }) {
  const router = useRouter();
  const kCola = `repastos:cola:${slug}`;
  const kRecorrido = `repastos:recorrido:${slug}`;
  const cola = useLocal<Item[]>(kCola, []);
  const recorrido = useLocal<Recorrido>(kRecorrido, { fecha: "", hechos: [] });
  const [estado, setEstado] = useState<"listo" | "enviando" | "sin_senal" | "sesion">("listo");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pestana, setPestana] = useState<"recorrido" | "lluvia" | "ganado">("recorrido");
  const enviando = useRef(false);

  const encolar = (tipo: Tipo, d: Record<string, string>, etiqueta: string) => {
    const item: Item = { id: crypto.randomUUID(), tipo, datos: d, etiqueta, creado: new Date().toISOString() };
    escribir(kCola, [...leer<Item[]>(kCola, []), item]);
    setAviso(`Guardado en el teléfono: ${etiqueta}`);
    void enviar();
  };

  const enviar = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;
    let enviados = 0;
    try {
      for (;;) {
        const sig = leer<Item[]>(kCola, []).find((i) => !i.error);
        if (!sig) {
          setEstado("listo");
          break;
        }
        setEstado("enviando");
        let res: Response;
        try {
          res = await fetch(`/api/orgs/${slug}/registros`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tipo: sig.tipo, datos: sig.datos }),
            cache: "no-store",
            redirect: "manual",
          });
        } catch {
          setEstado("sin_senal");
          break;
        }
        // Sin sesión el proxy redirige al login: no se pierde nada, queda en cola
        if (res.type === "opaqueredirect" || res.status === 401 || res.status === 403) {
          setEstado("sesion");
          break;
        }
        const r = (await res.json().catch(() => null)) as { ok: boolean; mensaje?: string; error?: string } | null;
        if (!r || res.status >= 500) {
          setEstado("sin_senal");
          break;
        }
        const actual = leer<Item[]>(kCola, []);
        if (r.ok) {
          escribir(kCola, actual.filter((i) => i.id !== sig.id));
          enviados++;
          setAviso(r.mensaje ?? "Enviado");
        } else {
          escribir(kCola, actual.map((i) => (i.id === sig.id ? { ...i, error: r.error ?? "No se pudo guardar" } : i)));
        }
      }
    } finally {
      enviando.current = false;
    }
    if (enviados > 0) router.refresh();
  }, [kCola, slug, router]);

  // Reintenta al recuperar la señal y cada 30 s mientras haya pendientes
  useEffect(() => {
    const intentar = () => {
      if (leer<Item[]>(kCola, []).some((i) => !i.error)) void enviar();
    };
    const t0 = setTimeout(intentar, 0);
    const t = setInterval(intentar, 30_000);
    window.addEventListener("online", intentar);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
      window.removeEventListener("online", intentar);
    };
  }, [enviar, kCola]);

  const pendientes = cola.filter((i) => !i.error);
  const conError = cola.filter((i) => i.error);

  // Ubicación de los lotes: la del servidor más los movimientos aún en cola
  const ubicacion = useMemo(() => {
    const m = new Map<string, { potreroId: string; pastoreoId: string | null; pendiente: boolean }>();
    for (const p of datos.potreros) if (p.lote) m.set(p.lote.id, { potreroId: p.id, pastoreoId: p.lote.pastoreoId, pendiente: false });
    for (const i of cola) {
      if (i.error) continue;
      if (i.tipo === "mover") m.set(i.datos.loteId, { potreroId: i.datos.potreroId, pastoreoId: null, pendiente: true });
      if (i.tipo === "sacar") for (const [k, u] of m) if (u.pastoreoId === i.datos.pastoreoId) m.delete(k);
    }
    return m;
  }, [datos.potreros, cola]);
  const ocupados = new Set([...ubicacion.values()].map((u) => u.potreroId));

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-3 font-display text-2xl font-bold">Registrar</h1>

      <EstadoEnvio estado={estado} pendientes={pendientes.length} onEnviar={() => void enviar()} slug={slug} />
      {aviso && (
        <p role="status" className="mt-2 flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm font-medium text-primary-strong">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          {aviso}
        </p>
      )}
      {conError.length > 0 && (
        <ul className="mt-2 space-y-2" aria-label="Registros rechazados">
          {conError.map((i) => (
            <li key={i.id} className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                <b>{i.etiqueta}</b>: {i.error}
              </span>
              <button type="button" className="btn-ghost min-h-9 px-2 text-danger" onClick={() => escribir(kCola, leer<Item[]>(kCola, []).filter((x) => x.id !== i.id))} aria-label={`Descartar ${i.etiqueta}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div role="tablist" aria-label="Tipo de registro" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["recorrido", "Recorrido", Ruler],
            ["lluvia", "Lluvia", CloudRain],
            ["ganado", "Ganado", Beef],
          ] as const
        ).map(([k, l, Icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={pestana === k}
            onClick={() => setPestana(k)}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${pestana === k ? "bg-surface text-primary shadow-sm" : "text-muted"}`}
          >
            <Icon className="size-4" aria-hidden />
            {l}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {pestana === "recorrido" && (
          <PasoRecorrido
            datos={datos}
            ocupados={ocupados}
            hechos={recorrido.fecha === hoyCR() ? recorrido.hechos : []}
            onGuardar={(p, altura, hojas) => {
              const hoy = hoyCR();
              const r = leer<Recorrido>(kRecorrido, { fecha: hoy, hechos: [] });
              escribir(kRecorrido, { fecha: hoy, hechos: [...new Set([...(r.fecha === hoy ? r.hechos : []), p.id])] });
              encolar(
                "aforo",
                { potreroId: p.id, fecha: hoy, metodo: "regla_altura", alturaCm: altura, hojas },
                `${p.nombre}: ${altura} cm${hojas ? ` · ${hojas} hojas` : ""}`,
              );
            }}
          />
        )}
        {pestana === "lluvia" && (
          <PasoLluvia
            fincas={datos.fincas}
            onGuardar={(fincaId, dias, mm) => {
              const fecha = sumarDias(hoyCR(), -dias);
              const finca = datos.fincas.length > 1 ? ` (${datos.fincas.find((f) => f.id === fincaId)?.nombre})` : "";
              encolar("lluvia", { fincaId, fecha, mm }, `Lluvia ${fechaCortaCR(fecha)}: ${mm} mm${finca}`);
            }}
          />
        )}
        {pestana === "ganado" && (
          <PasoGanado
            datos={datos}
            ubicacion={ubicacion}
            ocupados={ocupados}
            onMover={(lote, destino, estadoSalida) =>
              encolar(
                "mover",
                { loteId: lote.id, potreroId: destino.id, estadoSalida: estadoSalida ?? "", cuando: new Date().toISOString(), notas: "Registrado en campo" },
                `${lote.nombre} → ${destino.nombre}`,
              )
            }
            onSacar={(lote, pastoreoId, estadoSalida) =>
              encolar("sacar", { pastoreoId, estadoSalida, cuando: new Date().toISOString() }, `Sacar ${lote.nombre} (${ESTADOS_SALIDA[estadoSalida].label.toLowerCase()})`)
            }
          />
        )}
      </div>

      <p className="mt-6 text-xs text-muted">
        Funciona sin señal: lo que anotes se guarda en este teléfono y se envía solo al volver la conexión. Abre esta pantalla una vez con
        señal antes de salir al potrero. Datos de potreros del {fechaCortaCR(datos.generado)}.
      </p>
    </div>
  );
}

function EstadoEnvio({ estado, pendientes, onEnviar, slug }: { estado: string; pendientes: number; onEnviar: () => void; slug: string }) {
  if (estado === "sesion") {
    return (
      <a href={`/auth/sign-in?redirectTo=/app/${slug}/registrar`} className="flex min-h-12 items-center gap-2 rounded-xl bg-warning-soft px-4 text-sm font-semibold text-warning">
        <LogIn className="size-4" aria-hidden />
        La sesión venció: inicia sesión para enviar {pendientes} registro{pendientes === 1 ? "" : "s"} (no se pierden).
      </a>
    );
  }
  if (pendientes === 0) {
    return (
      <p className="flex min-h-12 items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm text-muted">
        <Check className="size-4 text-primary" aria-hidden />
        Todo enviado.
      </p>
    );
  }
  const sinSenal = estado === "sin_senal";
  return (
    <div className={`flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${sinSenal ? "bg-warning-soft text-warning" : "bg-sky-soft text-sky"}`} role="status">
      {sinSenal ? <CloudOff className="size-4" aria-hidden /> : <CloudUpload className="size-4" aria-hidden />}
      <span className="flex-1">
        {pendientes} por enviar{sinSenal ? " · sin señal, se envían solos al volver" : estado === "enviando" ? " · enviando…" : ""}
      </span>
      <button type="button" onClick={onEnviar} className="btn-ghost min-h-9 px-3" disabled={estado === "enviando"}>
        Enviar
      </button>
    </div>
  );
}

// ───────────── Recorrido de aforos ─────────────

type PotreroCampo = DatosCampo["potreros"][number];

/** Estado del pasto según la altura, con los mismos umbrales de madurez que el modelo de forraje. */
function lectura(p: PotreroCampo, cm: number, factor: number) {
  const pp = parametrosPasto(p.tipoPasto);
  const kg = kgDesdeAltura(pp, cm, factor);
  const m = (kg - pp.residuo) / Math.max(1, pp.entrada - pp.residuo);
  const texto = m >= 1.35 ? "Pasándose: pastorear ya o cortar" : m >= 0.95 ? "Listo para pastorear" : m >= 0.8 ? "Pronto" : "Rebrotando";
  const tono = m >= 1.35 ? "text-warning" : m >= 0.8 ? "text-primary" : "text-muted";
  return { kg, texto, tono };
}

function PasoRecorrido({
  datos,
  ocupados,
  hechos,
  onGuardar,
}: {
  datos: DatosCampo;
  ocupados: Set<string>;
  hechos: string[];
  onGuardar: (p: PotreroCampo, altura: string, hojas: string) => void;
}) {
  const modulos = [...new Map(datos.potreros.filter((p) => p.modulo).map((p) => [p.modulo!.id, p.modulo!])).values()];
  const [modulo, setModulo] = useState<string>("");
  const [incluirOcupados, setIncluirOcupados] = useState(false);
  const lista = datos.potreros.filter((p) => (!modulo || p.modulo?.id === modulo) && (incluirOcupados || !ocupados.has(p.id)));
  const hechosSet = new Set(hechos);
  const [actualId, setActualId] = useState<string | null>(null);
  const actual = lista.find((p) => p.id === actualId) ?? lista.find((p) => !hechosSet.has(p.id)) ?? lista[0];
  const idx = actual ? lista.indexOf(actual) : -1;
  const [altura, setAltura] = useState("");
  const [hojas, setHojas] = useState("");
  const listos = lista.filter((p) => hechosSet.has(p.id)).length;

  if (!actual) return <p className="text-sm text-muted">No hay potreros para recorrer.</p>;
  const cm = Number(altura.replace(",", "."));
  const l = cm > 0 ? lectura(actual, cm, datos.factor) : null;
  const ir = (p: PotreroCampo | undefined) => {
    if (!p) return;
    setActualId(p.id);
    setAltura("");
    setHojas("");
  };
  const siguientePendiente = () => lista.slice(idx + 1).find((p) => !hechosSet.has(p.id) && p.id !== actual.id) ?? lista.find((p) => !hechosSet.has(p.id) && p.id !== actual.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {modulos.length > 0 && (
          <select className="input min-h-11 flex-1" value={modulo} onChange={(e) => { setModulo(e.target.value); setActualId(null); }} aria-label="Módulo a recorrer">
            <option value="">Todos los potreros</option>
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={incluirOcupados} onChange={(e) => setIncluirOcupados(e.target.checked)} />
          Incluir ocupados
        </label>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Hoy: {listos} de {lista.length} medidos</span>
          <span>{idx + 1} / {lista.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${lista.length ? (listos / lista.length) * 100 : 0}%` }} />
        </div>
      </div>

      <form
        className="card card-pad space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(cm > 0)) return;
          onGuardar(actual, String(cm), hojas);
          ir(siguientePendiente());
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-2xl font-bold">
              {actual.nombre}
              {hechosSet.has(actual.id) && <Check className="ml-1.5 inline size-5 text-primary" aria-label="medido hoy" />}
            </p>
            <p className="text-sm text-muted">{actual.pasto}{actual.modulo ? ` · ${actual.modulo.nombre}` : ""}</p>
          </div>
          {ocupados.has(actual.id) && <span className="chip bg-sky-soft text-sky">Con ganado</span>}
          {actual.enEspera && <span className="chip bg-warning-soft text-warning">Carencia hasta {fechaCortaCR(actual.enEspera)}</span>}
        </div>

        <p className="grid grid-cols-2 gap-2 text-center text-sm">
          <span className="rounded-lg bg-primary-soft px-2 py-2 text-primary-strong">Entrar con <b className="num block text-lg">{actual.alturaEntrada} cm</b></span>
          <span className="rounded-lg bg-surface-2 px-2 py-2">Sacar con <b className="num block text-lg">{actual.alturaSalida} cm</b></span>
        </p>

        <label className="block">
          <span className="label">Altura promedio (cm)</span>
          <input
            className="input min-h-16 text-center font-display text-3xl font-bold"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.,][0-9]+)?"
            value={altura}
            onChange={(e) => setAltura(e.target.value)}
            placeholder="0"
            required
            aria-describedby="lectura"
          />
        </label>
        <p id="lectura" className={`min-h-5 text-center text-sm font-semibold ${l?.tono ?? "text-muted"}`} aria-live="polite">
          {l ? `≈ ${formatNum(l.kg, 0)} kg MS/ha · ${l.texto}` : "Mide en 15–20 puntos caminando en zigzag"}
        </p>

        <fieldset>
          <legend className="label">Hojas por rebrote <span className="font-normal text-muted">(opcional, objetivo {formatNum(actual.hojasObjetivo, 1)})</span></legend>
          <div className="grid grid-cols-7 gap-1">
            {["", "2", "2.5", "3", "3.5", "4", "5"].map((h) => (
              <button
                key={h || "nada"}
                type="button"
                onClick={() => setHojas(h)}
                aria-pressed={hojas === h}
                className={`min-h-11 rounded-lg border text-sm font-semibold ${hojas === h ? "border-primary bg-primary-soft text-primary-strong" : "border-border"}`}
              >
                {h ? h.replace(".", ",") : "—"}
              </button>
            ))}
          </div>
        </fieldset>

        <button className="btn min-h-14 w-full text-base" disabled={!(cm > 0)}>
          Guardar y siguiente <ChevronRight className="size-5" aria-hidden />
        </button>
        <div className="flex justify-between">
          <button type="button" className="btn-ghost" onClick={() => ir(lista[idx - 1])} disabled={idx <= 0}>
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </button>
          <button type="button" className="btn-ghost" onClick={() => ir(lista[idx + 1])} disabled={idx >= lista.length - 1}>
            Saltar <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </form>

      <details>
        <summary className="btn-ghost w-full cursor-pointer list-none [&::-webkit-details-marker]:hidden">Ir a un potrero</summary>
        <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {lista.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => ir(p)}
                className={`flex min-h-11 w-full items-center justify-between gap-1 rounded-lg border px-3 text-left text-sm ${p.id === actual.id ? "border-primary" : "border-border"}`}
              >
                <span className="truncate">{p.nombre}</span>
                {hechosSet.has(p.id) && <Check className="size-4 shrink-0 text-primary" aria-label="medido" />}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ───────────── Lluvia ─────────────

function PasoLluvia({ fincas, onGuardar }: { fincas: DatosCampo["fincas"]; onGuardar: (fincaId: string, dias: number, mm: string) => void }) {
  const [fincaId, setFincaId] = useState(fincas[0]?.id ?? "");
  const [dias, setDias] = useState(0);
  const [mm, setMm] = useState("");
  if (!fincas.length) return <p className="text-sm text-muted">Crea una finca en Ajustes.</p>;
  const valor = Number(mm.replace(",", "."));
  const guardar = (x: string) => {
    onGuardar(fincaId, dias, x);
    setMm("");
  };
  return (
    <form
      className="card card-pad space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valor >= 0 && mm !== "") guardar(String(valor));
      }}
    >
      {fincas.length > 1 && (
        <label className="block">
          <span className="label">Finca</span>
          <select className="input" value={fincaId} onChange={(e) => setFincaId(e.target.value)}>
            {fincas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </label>
      )}
      <fieldset>
        <legend className="label">Día</legend>
        <div className="grid grid-cols-3 gap-2">
          {["Hoy", "Ayer", "Anteayer"].map((t, i) => (
            <button
              key={t}
              type="button"
              aria-pressed={dias === i}
              onClick={() => setDias(i)}
              className={`min-h-12 rounded-lg border text-sm font-semibold ${dias === i ? "border-primary bg-primary-soft text-primary-strong" : "border-border"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="label">Milímetros del pluviómetro</span>
        <input className="input min-h-16 text-center font-display text-3xl font-bold" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="0" />
      </label>
      <button className="btn min-h-14 w-full text-base" disabled={mm === "" || !(valor >= 0)}>Guardar lluvia</button>
      <button type="button" className="btn-secondary min-h-12 w-full" onClick={() => guardar("0")}>
        No llovió (0 mm)
      </button>
      <p className="hint">Anotar también los días sin lluvia mejora el cálculo del crecimiento en verano.</p>
    </form>
  );
}

// ───────────── Ganado ─────────────

function PasoGanado({
  datos,
  ubicacion,
  ocupados,
  onMover,
  onSacar,
}: {
  datos: DatosCampo;
  ubicacion: Map<string, { potreroId: string; pastoreoId: string | null; pendiente: boolean }>;
  ocupados: Set<string>;
  onMover: (lote: DatosCampo["lotes"][number], destino: PotreroCampo, estadoSalida: EstadoSalida | null) => void;
  onSacar: (lote: DatosCampo["lotes"][number], pastoreoId: string, estadoSalida: EstadoSalida) => void;
}) {
  const porId = new Map(datos.potreros.map((p) => [p.id, p]));
  const [abierto, setAbierto] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [salida, setSalida] = useState<EstadoSalida | "">("");
  if (!datos.lotes.length) return <p className="text-sm text-muted">No hay lotes registrados.</p>;
  const hoy = hoyCR();

  return (
    <ul className="space-y-3">
      {datos.lotes.map((l) => {
        const u = ubicacion.get(l.id);
        const p = u ? porId.get(u.potreroId) : undefined;
        const abiertoAqui = abierto === l.id;
        return (
          <li key={l.id} className="card card-pad">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-bold">{l.nombre}</p>
                <p className="text-sm text-muted">
                  {l.cabezas} cab. · {p ? <>en <b className="text-foreground">{p.nombre}</b></> : "sin potrero"}
                  {u?.pendiente && <span className="text-sky"> (por enviar)</span>}
                </p>
              </div>
              <button type="button" className="btn-secondary min-h-11" onClick={() => { setAbierto(abiertoAqui ? null : l.id); setDestino(""); setSalida(""); }} aria-expanded={abiertoAqui}>
                {abiertoAqui ? "Cerrar" : "Mover / sacar"}
              </button>
            </div>

            {abiertoAqui && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                {p && (
                  <fieldset>
                    <legend className="label">¿Cómo quedó {p.nombre}? (sacar {p.alturaSalida} cm)</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(ESTADOS_SALIDA) as EstadoSalida[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={salida === k}
                          onClick={() => setSalida(salida === k ? "" : k)}
                          className={`min-h-12 rounded-lg border-2 text-sm font-semibold ${salida === k ? "border-primary bg-primary-soft text-primary-strong" : "border-border"}`}
                        >
                          {ESTADOS_SALIDA[k].label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <label className="block">
                  <span className="label">Mover a</span>
                  <select className="input min-h-12" value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Elige potrero…</option>
                    {datos.potreros
                      .filter((x) => x.id !== p?.id)
                      .map((x) => {
                        const bloqueado = x.enEspera != null && x.enEspera > hoy;
                        return (
                          <option key={x.id} value={x.id} disabled={bloqueado}>
                            {x.nombre}
                            {bloqueado ? ` — carencia hasta ${fechaCortaCR(x.enEspera!)}` : ocupados.has(x.id) ? " — con ganado" : ""}
                          </option>
                        );
                      })}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn min-h-12 w-full"
                  disabled={!destino}
                  onClick={() => {
                    onMover(l, porId.get(destino)!, salida || null);
                    setAbierto(null);
                  }}
                >
                  Mover
                </button>
                {p && (
                  <button
                    type="button"
                    className="btn-secondary min-h-12 w-full"
                    disabled={!salida || !u?.pastoreoId}
                    onClick={() => {
                      onSacar(l, u!.pastoreoId!, salida as EstadoSalida);
                      setAbierto(null);
                    }}
                  >
                    {u?.pastoreoId ? (salida ? "Sacar del potrero" : "Marca cómo quedó para sacar") : "Envía primero el movimiento para sacarlo"}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
