// Verifica que toda página, ruta API y acción de servidor exija un usuario autenticado.
// Corre antes de cada build (prebuild): si algo queda sin proteger, el build falla.
//   node scripts/verificar-auth.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const APP = join(RAIZ, "src", "app");
const rel = (f) => relative(RAIZ, f).split(sep).join("/");

/** Únicas páginas públicas: sin ellas nadie podría conocer el producto, registrarse ni leer las condiciones. */
const PAGINAS_PUBLICAS = new Set([
  "src/app/page.tsx",
  "src/app/auth/sign-in/page.tsx",
  "src/app/auth/sign-up/page.tsx",
  "src/app/terminos/page.tsx",
  "src/app/privacidad/page.tsx",
]);
const RUTAS_PROXY_PUBLICAS = new Set(["/", "/auth/sign-up", "/terminos", "/privacidad"]);
/** Rutas API públicas: el propio manejador de Neon Auth (inicio de sesión y registro). */
const API_PUBLICAS = new Set(["src/app/api/auth/[...path]/route.ts"]);

const CHEQUEO_PAGINA = /\brequire(Org|Usuario)\(/;
const CHEQUEO_API = /\bauth\.getSession\(/;

const archivos = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)]));

const errores = [];
const todos = archivos(join(RAIZ, "src"));

// 1. Páginas
for (const f of todos.filter((f) => f.startsWith(APP) && /[\\/]page\.tsx$/.test(f))) {
  if (PAGINAS_PUBLICAS.has(rel(f))) continue;
  if (!CHEQUEO_PAGINA.test(readFileSync(f, "utf8"))) errores.push(`${rel(f)}: la página no llama requireOrg()/requireUsuario()`);
}

// 2. Rutas API
for (const f of todos.filter((f) => f.startsWith(APP) && /[\\/]route\.ts$/.test(f))) {
  if (API_PUBLICAS.has(rel(f))) continue;
  if (!CHEQUEO_API.test(readFileSync(f, "utf8"))) errores.push(`${rel(f)}: la ruta no verifica la sesión con auth.getSession()`);
}

// 3. Acciones de servidor: cada función exportada de un archivo "use server" verifica la sesión
for (const f of todos.filter((f) => /\.tsx?$/.test(f))) {
  const s = readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/.test(s)) continue;
  for (const bloque of s.split(/\nexport async function /).slice(1)) {
    const nombre = bloque.match(/^\w+/)?.[0];
    const cuerpo = bloque.split(/\nexport /)[0];
    if (!CHEQUEO_PAGINA.test(cuerpo)) errores.push(`${rel(f)}: la acción ${nombre}() no llama requireOrg()/requireUsuario()`);
  }
  if (/\nexport (const|function|default)/.test(s)) errores.push(`${rel(f)}: en un archivo "use server" exporta solo "export async function"`);
}

// 4. El proxy no puede abrir rutas fuera de la lista
const proxy = readFileSync(join(RAIZ, "src", "proxy.ts"), "utf8");
const publicas = [...(proxy.match(/publicRoutes:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
for (const r of publicas) if (!RUTAS_PROXY_PUBLICAS.has(r)) errores.push(`src/proxy.ts: ruta pública no autorizada "${r}"`);

if (errores.length) {
  console.error(`✗ verificar-auth: ${errores.length} punto(s) sin autenticación\n  ${errores.join("\n  ")}`);
  process.exit(1);
}
console.log("✓ verificar-auth: todas las páginas, rutas API y acciones exigen un usuario autenticado");
