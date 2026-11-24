import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Origen de las teselas satelitales (mismo valor por defecto que en mapa-potreros.tsx).
const TESELAS = new URL(
  process.env.NEXT_PUBLIC_SATELLITE_TILES ??
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
).origin;

// CSP sin nonces (compatible con el prerender parcial). El worker de MapLibre se sirve desde /maplibre/.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TESELAS}`,
  "font-src 'self'",
  `connect-src 'self' ${TESELAS}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const CABECERAS_SEGURIDAD = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

// Archivos adjuntos: hasta 10 MB + margen del multipart.
const LIMITE_BODY = "12mb";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Subir archivos (10 MB) e importar mapas (KML/Shapefile con muchos polígonos) en una sola acción
    serverActions: { bodySizeLimit: LIMITE_BODY },
    // El proxy (auth) guarda el body en memoria; por defecto lo corta en 10 MB.
    proxyClientMaxBodySize: LIMITE_BODY,
  },
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_SEGURIDAD }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
