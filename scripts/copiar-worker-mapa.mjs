// Copia el Web Worker de MapLibre a public/ (el bundler cambia la ruta relativa que MapLibre espera).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8"));
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log(`maplibre-gl ${version}: worker copiado a public/maplibre/`);
