"use client";
import { useState } from "react";
import { ActionForm, Field, Submit } from "@/components/forms";
import { TIPOS_PRODUCTO } from "@/lib/dominio";
import type { Resultado } from "@/lib/acciones";

type Producto = {
  nombre: string;
  tipo: string;
  unidad: string;
  ingredienteActivo: string | null;
  registro: string | null;
  n: string | null;
  p: string | null;
  k: string | null;
  cao: string | null;
  mgo: string | null;
  s: string | null;
  b: string | null;
  zn: string | null;
  periodoReingresoDias: number;
  retiroLecheDias: number | null;
  retiroCarneDias: number | null;
  precioUnidad: string | null;
  notas: string | null;
};

const CON_NPK = new Set(["fertilizante", "foliar", "organico"]);
type Nutriente = "n" | "p" | "k" | "cao" | "mgo" | "s" | "b" | "zn";
/** Como aparece en la etiqueta: el fósforo y el potasio se declaran como óxidos (P₂O₅, K₂O). */
const NUTRIENTES: { k: Nutriente; label: string }[] = [
  { k: "n", label: "N" },
  { k: "p", label: "P₂O₅" },
  { k: "k", label: "K₂O" },
  { k: "cao", label: "CaO" },
  { k: "mgo", label: "MgO" },
  { k: "s", label: "S" },
  { k: "b", label: "B" },
  { k: "zn", label: "Zn" },
];
const DE_ENMIENDA: Nutriente[] = ["cao", "mgo", "s"];

export function FormProducto({
  action,
  producto,
}: {
  action: (p: Resultado, fd: FormData) => Promise<Resultado>;
  producto?: Producto;
}) {
  const [tipo, setTipo] = useState(producto?.tipo ?? "fertilizante");
  return (
    <ActionForm action={action} version={producto ? JSON.stringify(producto) : undefined}>
      <Field label="Nombre comercial" name="nombre" required>
        <input className="input" defaultValue={producto?.nombre} placeholder="Ej. Urea 46%" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" name="tipo">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPOS_PRODUCTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
        </Field>
        <Field label="Unidad" name="unidad">
          <select className="input" defaultValue={producto?.unidad ?? (tipo === "fertilizante" || tipo === "enmienda" ? "kg" : "L")}>
              <option value="kg">kg</option>
              <option value="L">L</option>
            </select>
        </Field>
      </div>
      {(CON_NPK.has(tipo) || tipo === "enmienda") && (
        <fieldset>
          <legend className="label">Composición (% de la etiqueta)</legend>
          <div className="grid grid-cols-4 gap-2">
            {NUTRIENTES.filter((x) => tipo !== "enmienda" || DE_ENMIENDA.includes(x.k)).map((x) => (
              <Field key={x.k} label={x.label} name={x.k}>
                <input className="input px-2" type="number" inputMode="decimal" step="any" min={0} max={100} defaultValue={producto?.[x.k] ?? ""} />
              </Field>
            ))}
          </div>
          <p className="hint">
            {tipo === "enmienda"
              ? "Cal agrícola ≈ 52 % CaO; dolomita ≈ 30 % CaO y 18 % MgO. Con esto se calcula la dosis de cal del análisis de suelo."
              : "Ej. la fórmula 18-5-15-6-2 es N 18, P₂O₅ 5, K₂O 15, MgO 6 y S 2."}
          </p>
        </fieldset>
      )}
      {!CON_NPK.has(tipo) && tipo !== "enmienda" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ingrediente activo" name="ingredienteActivo" className="col-span-2">
            <input className="input" defaultValue={producto?.ingredienteActivo ?? ""} />
          </Field>
          <Field label="N.º registro" name="registro" className="col-span-2" hint="Registro SFE/MAG de la etiqueta">
            <input className="input" defaultValue={producto?.registro ?? ""} />
          </Field>
        </div>
      )}
      <Field
        label="Carencia de pastoreo (días)"
        name="reingreso"
        required
        hint="Días que ningún animal puede pastorear después de aplicar (intervalo para pastoreo de la etiqueta). No es el reingreso de personas, que va en horas. 0 si no aplica."
      >
        <input className="input" type="number" inputMode="numeric" min={0} defaultValue={producto?.periodoReingresoDias ?? 0} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Retiro leche (d)" name="retiroLeche" hint="Bloquea a los lotes de ordeño y marca su leche como no apta.">
          <input className="input" type="number" inputMode="numeric" min={0} defaultValue={producto?.retiroLecheDias ?? ""} />
        </Field>
        <Field label="Retiro carne (d)" name="retiroCarne" hint="Avisa: no enviar a sacrificio a los animales expuestos.">
          <input className="input" type="number" inputMode="numeric" min={0} defaultValue={producto?.retiroCarneDias ?? ""} />
        </Field>
      </div>
      <Field label="Precio por unidad (₡)" name="precio" hint="Para calcular el costo de cada aplicación">
        <input className="input" type="number" inputMode="decimal" min={0} step="any" defaultValue={producto?.precioUnidad ?? ""} />
      </Field>
      <Submit className="btn w-full">{producto ? "Guardar cambios" : "Agregar producto"}</Submit>
    </ActionForm>
  );
}
