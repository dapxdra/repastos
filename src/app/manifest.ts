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
    background_color: "#f7f9f5",
    theme_color: "#1f7a3a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icono-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
