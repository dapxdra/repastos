"use client";
import { ActionForm, Field, Submit } from "@/components/forms";
import { TIPOS_PRODUCCION } from "@/lib/dominio";
import { crearOrganizacion } from "./actions";

export function FormNuevaGanaderia() {
  return (
    <ActionForm action={crearOrganizacion}>
      <Field label="Nombre" name="nombre" required>
        <input className="input" placeholder="Ej. Ganadería La Esperanza" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo de producción" name="tipoProduccion">
          <select className="input" defaultValue="leche">
              {Object.entries(TIPOS_PRODUCCION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
        </Field>
        <Field label="Unidad de área" name="unidadArea">
          <select className="input" defaultValue="ha">
              <option value="ha">Hectáreas (ha)</option>
              <option value="mz">Manzanas (mz)</option>
            </select>
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="aceptaTerminos" required className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <span>
          Acepto los <a href="/terminos" target="_blank" rel="noopener" className="font-medium text-primary underline">Términos y condiciones</a> y
          la <a href="/privacidad" target="_blank" rel="noopener" className="font-medium text-primary underline">Política de privacidad</a>, y
          autorizo el tratamiento de los datos de esta ganadería según esa política.
        </span>
      </label>
      <Submit>Crear ganadería</Submit>
    </ActionForm>
  );
}
