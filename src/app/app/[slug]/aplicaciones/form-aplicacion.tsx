"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { ActionForm, Field, Submit } from "@/components/forms";
import {
  METODOS_APLICACION,
  TIPOS_PRODUCTO,
  dosisPorHa,
  fechaCR,
  formatColones,
  formatNum,
  sumarDias,
  type TipoProducto,
  type UnidadArea,
  formatArea,
  unidadTasa,
} from "@/lib/dominio";
import type { Resultado } from "@/lib/acciones";

type Producto = {
  id: string;
  nombre: string;
  tipo: string;
  unidad: string;
  reingreso: number;
  retiroLeche: number | null;
  retiroCarne: number | null;
  precio: number | null;
};
type Potrero = { id: string; nombre: string; areaHa: number | null; ocupado: boolean; areaTexto: string };

export function FormAplicacion({
  action,
  productos,
  potreros,
  unidad,
  hoy,
}: {
  action: (p: Resultado, fd: FormData) => Promise<Resultado>;
  productos: Producto[];
  potreros: Potrero[];
  unidad: UnidadArea;
  hoy: string;
}) {
  const [productoId, setProductoId] = useState(productos[0].id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dosis, setDosis] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const prod = productos.find((p) => p.id === productoId)!;

  const grupos = useMemo(() => {
    const m = new Map<string, Producto[]>();
    productos.forEach((p) => m.set(p.tipo, [...(m.get(p.tipo) ?? []), p]));
    return [...m];
  }, [productos]);

  const elegidos = potreros.filter((p) => sel.has(p.id));
  const areaHa = elegidos.reduce((s, p) => s + (p.areaHa ?? 0), 0);
  const d = Number(dosis);
  const cantidad = d > 0 ? dosisPorHa(d, unidad) * areaHa : 0;
  const ocupados = elegidos.filter((p) => p.ocupado);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ActionForm
      action={action}
      onSuccess={() => {
        setSel(new Set());
        setDosis("");
      }}
    >
      <Field label="Producto" name="productoId" required>
        <select className="input" value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {grupos.map(([tipo, ps]) => (
              <optgroup key={tipo} label={TIPOS_PRODUCTO[tipo as TipoProducto]}>
                {ps.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </optgroup>
            ))}
          </select>
      </Field>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className={`chip ${prod.reingreso > 0 ? "bg-warning-soft text-warning" : "bg-surface-2 text-muted"}`}>
          Carencia pastoreo: {prod.reingreso} d
        </span>
        {prod.retiroLeche != null && <span className="chip bg-sky-soft text-sky">Retiro leche: {prod.retiroLeche} d</span>}
        {prod.retiroCarne != null && <span className="chip bg-sky-soft text-sky">Retiro carne: {prod.retiroCarne} d</span>}
        {prod.precio != null && <span className="chip bg-surface-2 text-muted">{formatColones(prod.precio)}/{prod.unidad}</span>}
      </div>

      <fieldset>
        <legend className="label flex w-full items-center justify-between">
          <span>Potreros<span className="text-danger" aria-hidden> *</span></span>
          <button
            type="button"
            className="text-xs font-medium text-primary"
            onClick={() => setSel(sel.size === potreros.length ? new Set() : new Set(potreros.map((p) => p.id)))}
          >
            {sel.size === potreros.length ? "Ninguno" : "Todos"}
          </button>
        </legend>
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border p-1.5">
          {potreros.map((p) => (
            <label key={p.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm hover:bg-surface-2">
              <input
                type="checkbox"
                name="potreroIds"
                value={p.id}
                checked={sel.has(p.id)}
                onChange={() => toggle(p.id)}
                className="size-4 accent-[var(--primary)]"
              />
              <span className="flex-1">{p.nombre}</span>
              <span className={`num text-xs ${p.areaHa ? "text-muted" : "text-danger"}`}>{p.areaHa ? p.areaTexto : "sin área"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-campos gap-3">
        <Field label={`Dosis (${prod.unidad}/${unidadTasa(unidad)})`} name="dosis" required>
          <input className="input" type="number" inputMode="decimal" step="any" min={0} value={dosis} onChange={(e) => setDosis(e.target.value)} />
        </Field>
        <Field label="Fecha" name="fecha" required>
          <input className="input" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Método" name="metodo" className="col-span-full">
          <select className="input" defaultValue={prod.tipo === "foliar" || prod.tipo === "herbicida" ? "bomba_espalda" : "voleo"} key={prod.tipo}>
              {Object.entries(METODOS_APLICACION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
        </Field>
        <Field label="Responsable" name="responsable" className="col-span-full">
          <input className="input" placeholder="Quién aplicó" autoComplete="name" />
        </Field>
      </div>
      <Field label="Notas" name="notas">
        <textarea className="input" rows={2} placeholder="Clima, observaciones…" />
      </Field>

      {sel.size > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
          <p className="flex justify-between"><span className="text-muted">Área aprovechable</span><b className="num">{formatArea(areaHa, unidad)}</b></p>
          <p className="flex justify-between"><span className="text-muted">Cantidad total</span><b className="num">{formatNum(cantidad, 1)} {prod.unidad}</b></p>
          {prod.precio != null && <p className="flex justify-between"><span className="text-muted">Costo estimado</span><b className="num">{formatColones(cantidad * prod.precio)}</b></p>}
          {prod.reingreso > 0 && fecha && (
            <p className="flex items-center gap-1.5 pt-1 font-medium text-warning">
              <CalendarClock className="size-4" aria-hidden />
              Sin pastoreo hasta el {fechaCR(sumarDias(fecha, prod.reingreso))}
            </p>
          )}
        </div>
      )}
      {ocupados.length > 0 && (prod.reingreso > 0 || (prod.retiroLeche ?? 0) > 0 || (prod.retiroCarne ?? 0) > 0) && (
        <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {ocupados.map((p) => p.nombre).join(", ")} tiene ganado adentro. Saca el lote antes de aplicar
            {(prod.retiroLeche ?? 0) > 0 && fecha && <>: si se queda, su leche no es apta hasta el {fechaCR(sumarDias(fecha, prod.retiroLeche!))}</>}.
          </span>
        </p>
      )}
      <Submit className="btn w-full">Registrar aplicación</Submit>
    </ActionForm>
  );
}
