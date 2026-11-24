"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Map,
  Fence,
  Repeat2,
  Sprout,
  CloudRain,
  Package,
  Settings,
  MoreHorizontal,
  LogOut,
  Leaf,
  CalendarRange,
  ClipboardList,
  Calculator,
  FileBarChart,
  PlusCircle,
  Plus,
  Mountain,
  Bug,
  Milk,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { limpiarDatosLocales } from "@/components/service-worker";

const ITEMS = [
  { href: "", label: "Inicio", icon: LayoutDashboard, movil: true },
  { href: "/mapa", label: "Mapa", icon: Map, movil: true },
  { href: "/registrar", label: "Registrar", icon: PlusCircle, movil: true },
  { href: "/rotacion", label: "Rotación", icon: Repeat2, movil: true },
  { href: "/aplicaciones", label: "Aplicaciones", icon: Sprout, movil: false },
  { href: "/forraje", label: "Forraje", icon: Leaf, movil: false },
  { href: "/planificador", label: "Planificador", icon: CalendarRange, movil: false },
  { href: "/potreros", label: "Potreros", icon: Fence, movil: false },
  { href: "/labores", label: "Labores", icon: ClipboardList, movil: false },
  { href: "/campo", label: "Aforos y lluvia", icon: CloudRain, movil: false },
  { href: "/suelos", label: "Suelos", icon: Mountain, movil: false },
  { href: "/plagas", label: "Plagas", icon: Bug, movil: false },
  { href: "/insumos", label: "Insumos", icon: Package, movil: false },
  { href: "/herramientas", label: "Herramientas", icon: Calculator, movil: false },
  { href: "/produccion", label: "Producción", icon: Milk, movil: false },
  { href: "/reportes", label: "Reportes", icon: FileBarChart, movil: false },
  { href: "/ajustes", label: "Ajustes", icon: Settings, movil: false },
];

function activo(pathname: string, base: string, href: string) {
  const full = `${base}${href}`;
  return href === "" ? pathname === base : pathname === full || pathname.startsWith(`${full}/`);
}

export function Sidebar({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/${slug}`;
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const on = activo(pathname, base, href);
        return (
          <Link
            key={href}
            href={`${base}${href}`}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
              on ? "bg-primary-soft text-primary-strong" : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon className="size-[18px]" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/app/${slug}`;
  const masActivo = ITEMS.filter((i) => !i.movil).some((i) => activo(pathname, base, i.href)) || pathname === `${base}/mas`;
  const items = [...ITEMS.filter((i) => i.movil), { href: "/mas", label: "Más", icon: MoreHorizontal, movil: true }];
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-30 print:!hidden border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const on = href === "/mas" ? masActivo : activo(pathname, base, href);
          // Botón central destacado: lo que más se usa en el potrero
          if (href === "/registrar") {
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={`${base}${href}`}
                  aria-current={on ? "page" : undefined}
                  className="-mt-4 flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-primary"
                >
                  <span className={`grid size-12 place-items-center rounded-full bg-primary text-on-primary shadow-lg ring-4 ring-surface ${on ? "outline-2 outline-offset-2 outline-primary" : ""}`}>
                    <Plus className="size-6" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={`${base}${href}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  on ? "text-primary" : "text-muted"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MenuMas({ slug }: { slug: string }) {
  const base = `/app/${slug}`;
  return (
    <ul className="card divide-y divide-border overflow-hidden">
      {ITEMS.filter((i) => !i.movil).map(({ href, label, icon: Icon }) => (
        <li key={href}>
          <Link href={`${base}${href}`} className="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-surface-2">
            <Icon className="size-5 text-primary" aria-hidden />
            {label}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/app" className="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-surface-2">
          <Repeat2 className="size-5 text-primary" aria-hidden />
          Cambiar de ganadería
        </Link>
      </li>
      <li>
        <SignOutButton className="flex min-h-14 w-full items-center gap-3 px-4 font-medium text-danger hover:bg-surface-2" />
      </li>
    </ul>
  );
}

export function SignOutButton({ className = "btn-ghost" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        // La cola de registros sin enviar se conserva: se envía al volver a iniciar sesión
        await limpiarDatosLocales();
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut className="size-[18px]" aria-hidden />
      Cerrar sesión
    </button>
  );
}
