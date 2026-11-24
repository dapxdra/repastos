"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Logo } from "@/components/logo";

export function AuthForm({ modo }: { modo: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ver, setVer] = useState(false);
  const registro = modo === "sign-up";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    let error: { status?: number; message?: string } | null = null;
    try {
      ({ error } = registro
        ? await authClient.signUp.email({ email, password, name: String(f.get("name") || email.split("@")[0]) })
        : await authClient.signIn.email({ email, password }));
    } catch (e) {
      // El cliente de Neon Auth lanza AuthApiError (p. ej. 401) en vez de devolver { error }
      const x = e as { status?: number; message?: string };
      error = { status: x?.status, message: x?.message };
    }
    if (error) {
      setCargando(false);
      setError(
        error.status === 401 || /invalid/i.test(error.message ?? "")
          ? "Correo o contraseña incorrectos."
          : /exist/i.test(error.message ?? "")
            ? "Ya existe una cuenta con ese correo."
            : (error.message ?? "No se pudo completar la operación."),
      );
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary-soft lg:block" aria-hidden>
        <PaisajeParcelas />
        <div className="absolute inset-x-12 bottom-12 text-foreground">
          <p className="font-display text-3xl font-bold leading-tight">Cada potrero en su punto.</p>
          <p className="mt-2 max-w-md text-muted">Rotaciones, abonos, foliares y tiempos de espera de tu ganadería, en un solo lugar.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <Link href="/" className="inline-flex items-center gap-2 font-display text-lg font-bold">
            <Logo className="size-9" /> Repastos
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{registro ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h1>
            <p className="mt-1 text-sm text-muted">{registro ? "Gratis para empezar. Sin tarjeta." : "Ingresa para ver tus potreros."}</p>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {registro && (
            <div>
              <label className="label" htmlFor="name">Nombre</label>
              <input className="input" id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Correo electrónico</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" inputMode="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <div className="relative">
              <input
                className="input pr-11"
                id="password"
                name="password"
                type={ver ? "text" : "password"}
                required
                minLength={8}
                autoComplete={registro ? "new-password" : "current-password"}
                aria-describedby={registro ? "pw-hint" : undefined}
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-foreground"
                aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {ver ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            {registro && <p id="pw-hint" className="hint">Mínimo 8 caracteres.</p>}
          </div>

          <button className="btn w-full" disabled={cargando}>
            {cargando && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {registro ? "Crear cuenta" : "Entrar"}
          </button>
          <p className="text-center text-sm text-muted">
            {registro ? (
              <>¿Ya tienes cuenta? <Link className="font-semibold text-primary" href="/auth/sign-in">Inicia sesión</Link></>
            ) : (
              <>¿Nuevo en Repastos? <Link className="font-semibold text-primary" href="/auth/sign-up">Crea una cuenta</Link></>
            )}
          </p>
        </form>
      </div>
    </main>
  );
}

/** Ilustración: parcelas de potreros vistas desde arriba. */
export function PaisajeParcelas({ className = "absolute inset-0 size-full" }: { className?: string }) {
  const celdas = [
    [0, 0, 220, 170, "#9fd3a6"], [230, 0, 180, 120, "#f1d58e"], [420, 0, 260, 200, "#b6ddb5"],
    [0, 180, 150, 210, "#a9cbee"], [160, 130, 250, 160, "#8ccb98"], [420, 210, 120, 180, "#f5bc96"],
    [550, 210, 130, 150, "#b6ddb5"], [160, 300, 250, 190, "#f1d58e"], [0, 400, 150, 200, "#8ccb98"],
    [420, 400, 260, 200, "#9fd3a6"], [160, 500, 250, 100, "#b6ddb5"], [550, 370, 130, 20, "#8ccb98"],
  ] as const;
  return (
    <svg viewBox="0 0 680 600" preserveAspectRatio="xMidYMid slice" className={className}>
      <rect width="680" height="600" style={{ fill: "var(--paisaje-fondo)" }} />
      {celdas.map(([x, y, w, h, c], i) => (
        <rect key={i} x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx="14" fill={c} style={{ opacity: "var(--paisaje-opacidad)" }} />
      ))}
      <path d="M0 395 C 160 380, 300 420, 680 395" stroke="var(--background)" strokeOpacity=".9" strokeWidth="6" fill="none" />
      <rect width="680" height="600" fill="url(#g)" />
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".45" style={{ stopColor: "var(--background)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--background)", stopOpacity: 0.92 }} />
        </linearGradient>
      </defs>
    </svg>
  );
}
