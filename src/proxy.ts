import { auth } from "@/lib/auth/server";

// Chequeo optimista: redirige a login si no hay sesión. La autorización
// real (membresía/rol por organización) se valida en cada acción y route handler.
export default auth.middleware({
  loginUrl: "/auth/sign-in",
  publicRoutes: ["/", "/auth/sign-up", "/terminos", "/privacidad"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|maplibre/|sw.js|manifest.webmanifest|icon.svg|icono-maskable.svg).*)"],
};
