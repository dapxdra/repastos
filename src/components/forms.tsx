"use client";
import { Fragment, cloneElement, createContext, isValidElement, startTransition, useActionState, useContext, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Resultado =
  | { ok: true; mensaje?: string; n: number }
  | { ok: false; error: string; campos?: Record<string, string>; n: number }
  | null;

type Accion = (prev: Resultado, formData: FormData) => Promise<Resultado>;

const Ctx = createContext<Resultado>(null);
/** Envío en curso de ActionForm (useFormStatus no lo ve porque el envío se despacha a mano). */
const PendienteCtx = createContext<boolean | null>(null);

/**
 * Formulario conectado a una acción de servidor: muestra errores junto a cada campo,
 * un resumen enfocable cuando falla y confirmación al guardar.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  onSuccess,
  version,
  mostrarOk = true,
  ...rest
}: {
  action: Accion;
  children: React.ReactNode;
  className?: string;
  onSuccess?: () => void;
  /**
   * Formularios de edición: valores guardados serializados. React reinicia el formulario tras la acción y
   * un <select>/radio no adopta el nuevo defaultValue; al cambiar `version` los campos se remontan con los
   * valores actuales (el mensaje de confirmación se conserva).
   */
  version?: string;
  /** false: no muestra el mensaje de confirmación (controles compactos en filas) */
  mostrarOk?: boolean;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action" | "children" | "className">) {
  const [estado, formAction, pendiente] = useActionState(action, null);
  const resumen = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado) return;
    if (!estado.ok) resumen.current?.focus();
    else {
      // Solo se limpia al guardar: si el servidor rechaza, el usuario conserva lo que escribió
      formRef.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.n]);

  return (
    <Ctx.Provider value={estado}>
      <PendienteCtx.Provider value={pendiente}>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(e) => {
          // React reinicia el formulario tras cada acción enviada con action={…}, incluso si falla.
          // Con JS se despacha a mano para no perder los datos; sin JS sigue funcionando action.
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(fd));
        }}
        className={className}
        noValidate
        {...rest}
      >
        {estado && !estado.ok && (
          <div
            ref={resumen}
            tabIndex={-1}
            role="alert"
            className="col-span-full flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger outline-none"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {estado.error}
          </div>
        )}
        <Fragment key={version}>{children}</Fragment>
        {estado?.ok && mostrarOk && (
          <p role="status" className="col-span-full flex items-center gap-1.5 text-sm font-medium text-primary">
            <CheckCircle2 className="size-4" aria-hidden />
            {estado.mensaje}
          </p>
        )}
      </form>
      </PendienteCtx.Provider>
    </Ctx.Provider>
  );
}

type Diferido = { $$typeof: symbol; _payload: unknown; _init: (p: unknown) => unknown };
const LAZY = Symbol.for("react.lazy");

/**
 * El hijo de un Field llega desde un Server Component. Cuando el payload RSC repite un elemento idéntico
 * (p. ej. el mismo <input> en dos formularios de la página) lo envía como referencia diferida (lazy), no
 * como elemento; clonarlo así produce un elemento con tipo undefined. Se resuelve antes de clonar
 * (si aún no llegó, _init suspende y React reintenta).
 */
function resolverHijo(hijo: unknown): React.ReactElement<Record<string, unknown>> {
  let x = hijo;
  for (let i = 0; i < 5 && x && typeof x === "object" && (x as Diferido).$$typeof === LAZY; i++) {
    x = (x as Diferido)._init((x as Diferido)._payload);
  }
  if (!isValidElement(x)) throw new Error("Field espera un único control (input, select o textarea) como hijo.");
  return x as React.ReactElement<Record<string, unknown>>;
}

/** Campo con etiqueta visible, ayuda y error asociado por aria-describedby. */
export function Field({
  label,
  name,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  className?: string;
  /** Un único control (input/select/textarea); recibe id, name y atributos ARIA. */
  children: React.ReactElement<Record<string, unknown>>;
}) {
  const estado = useContext(Ctx);
  const id = useId();
  const error = estado && !estado.ok ? estado.campos?.[name] : undefined;
  const desc = [hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  const control = resolverHijo(children);
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {/* Control + ayuda/error juntos: en un grid comparten la segunda fila del subgrid (ver .field en globals.css) */}
      <div>
        {cloneElement(control, {
          id,
          name,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": desc,
          ...(required ? { required: true } : {}),
        })}
        {hint && !error && (
          <p id={`${id}-h`} className="hint">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-e`} className="mt-1 text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function Submit({ children, className = "btn" }: { children: React.ReactNode; className?: string }) {
  const pendienteForm = useContext(PendienteCtx);
  const { pending: pendienteNativo } = useFormStatus();
  const pending = pendienteForm ?? pendienteNativo;
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Botón de una sola acción (p. ej. "Sacar lote") sin campos visibles. */
export function BotonAccion({
  action,
  children,
  className = "btn-secondary",
  confirmar,
}: {
  action: Accion;
  children: React.ReactNode;
  className?: string;
  confirmar?: string;
}) {
  const [estado, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      <Submit className={className}>{children}</Submit>
      {estado && !estado.ok && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {estado.error}
        </p>
      )}
    </form>
  );
}
