import type { MetadataRoute } from "next";

/** Permite instalar Repastos en el celular como app (ícono en la pantalla de inicio). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Repastos",
    short_name: "Repastos",
    description: "Potreros, rotaciones, aforos y tiempos de espera de tu ganadería.",
    lang: "es-CR",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f3ecdc",
    theme_color: "#074f37",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
