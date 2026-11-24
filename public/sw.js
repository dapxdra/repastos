/*
 * Service worker de Repastos: permite abrir la pantalla "Registrar" sin señal en el potrero.
 * - Archivos de /_next/static (inmutables, con hash): caché primero.
 * - Pantalla /app/<ganadería>/registrar: red primero; sin red, la última copia guardada.
 * Nada más se guarda: el resto de la app necesita conexión. Los registros van en la cola del teléfono
 * (localStorage) y se envían desde la página, no desde aquí.
 */
const VERSION = "repastos-v1";
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;
const REGISTRAR = /^\/app\/[^/]+\/registrar\/?$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  // Al cerrar sesión se borra todo lo guardado
  if (e.data === "limpiar") e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(ESTATICOS).then(async (c) => {
        const guardado = await c.match(req);
        if (guardado) return guardado;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate" && REGISTRAR.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const c = await caches.open(PAGINAS);
        try {
          const res = await fetch(req);
          // Solo se guarda la página real (no la redirección al login)
          if (res.ok && !res.redirected) await c.put(url.pathname, res.clone());
          return res;
        } catch {
          const guardado = await c.match(url.pathname);
          if (guardado) return guardado;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Sin señal</title>" +
              "<body style='font-family:system-ui;padding:24px'><h1>Sin señal</h1><p>Abre la pantalla Registrar una vez con conexión para poder usarla en el potrero.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
