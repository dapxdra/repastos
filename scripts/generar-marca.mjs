// Genera todos los archivos de marca de Repastos a partir de un único isotipo.
// Uso: npm run marca
//
// Concepto: tres briznas de pasto cuya altura es el estado del potrero en la
// rotación (lo mismo que mide un aforo):
//   corta, mostaza  → recién pastoreado
//   media, lima     → en recuperación (tiempo de espera)
//   alta, crema     → listo para entrar
//
// La geometría se escribe en src/components/logo-geometria.ts, que usa el
// componente <Logo>. No edites ese archivo a mano.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..");
const APP = path.join(RAIZ, "src/app");
const PUB = path.join(RAIZ, "public");
const MARCA = path.join(PUB, "marca");

const COLORES = {
  verde: "#074f37", // bosque (igual a --primary)
  degradado: ["#0a6245", "#053a29"],
  tinta: "#311e18", // café (igual a --foreground)
  gris: "#6b5d52",
  fondo: "#f3ecdc", // crema (igual a --background)
};
/** Estados de la rotación según el fondo sobre el que va el isotipo. */
const SOBRE_VERDE = { recup: "#cce087", pasto: "#dda54e", listo: "#f3ecdc" }; // lima, mostaza, crema
const SOBRE_CLARO = { recup: "#77864b", pasto: "#dda54e", listo: "#074f37" }; // oliva, mostaza, bosque
const MONO = { recup: COLORES.tinta, pasto: COLORES.tinta, listo: COLORES.tinta };

// ---------- Geometría (viewBox 64×64) ----------
const r = (x) => Math.round(x * 10) / 10;
function brizna(bx, by, w, tx, ty, curva) {
  const my = r((by + ty) / 2);
  return `M${r(bx - w / 2)} ${by}Q${r(bx - w / 2 + curva)} ${my} ${tx} ${ty}Q${r(bx + w / 2 + curva)} ${my} ${r(bx + w / 2)} ${by}Z`;
}
const G = {
  pastoreo: brizna(21, 49, 8, 17, 30, 2.5),
  recuperacion: brizna(30.5, 49, 8.5, 30, 19, 3),
  listo: brizna(40, 49, 9, 45.5, 10, 1.5),
  suelo: "M14 53.5H48",
};

/** Isotipo sin fondo. `suelo`: línea de tierra (se omite en el favicon). */
function isotipo({ c = SOBRE_VERDE, suelo = true } = {}) {
  return `<path d="${G.pastoreo}" fill="${c.pasto}"/><path d="${G.recuperacion}" fill="${c.recup}"/><path d="${G.listo}" fill="${c.listo}"/>${suelo ? `<path d="${G.suelo}" stroke="${c.listo}" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>` : ""}`;
}

// ---------- Composiciones ----------
const degradado = (id = "f") =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORES.degradado[0]}"/><stop offset="1" stop-color="${COLORES.degradado[1]}"/></linearGradient>`;

/** Ícono en baldosa. `rx` 15 = redondeado; 0 = a sangre (maskable/iOS). */
function baldosa(interior, { rx = 15, escala = 1, dx = 0, dy = 0 } = {}) {
  const t = 32 - 32 * escala;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${degradado()}</defs><rect width="64" height="64" rx="${rx}" fill="url(#f)"/><g transform="translate(${r(t + dx)} ${r(t + dy)}) scale(${escala})">${interior}</g></svg>`;
}
// Favicon: sin suelo y más grande, para que las briznas se lean a 16 px
const favicon = () => baldosa(isotipo({ suelo: false }), { rx: 14, escala: 1.14, dy: 2.5 });

const suelto = (interior, vb = "6.5 7.5 50 50") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${interior}</svg>`;

const FUENTE = `'Plus Jakarta Sans','Segoe UI',Inter,Arial,sans-serif`;
function horizontal(interior, { texto = COLORES.tinta } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 72"><defs>${degradado()}</defs><g transform="translate(4 4)"><rect width="64" height="64" rx="15" fill="url(#f)"/>${interior}</g><text x="84" y="50" font-family="${FUENTE}" font-size="40" font-weight="800" letter-spacing="-1" fill="${texto}">Repastos</text></svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png().toBuffer();

/** ICO con imágenes PNG embebidas (soportado desde Windows Vista). */
function ico(imagenes) {
  const cab = Buffer.alloc(6 + 16 * imagenes.length);
  cab.writeUInt16LE(0, 0);
  cab.writeUInt16LE(1, 2);
  cab.writeUInt16LE(imagenes.length, 4);
  let off = cab.length;
  imagenes.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    cab.writeUInt8(size >= 256 ? 0 : size, e);
    cab.writeUInt8(size >= 256 ? 0 : size, e + 1);
    cab.writeUInt16LE(1, e + 4);
    cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(buf.length, e + 8);
    cab.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([cab, ...imagenes.map((x) => x.buf)]);
}

async function opengraph(interior) {
  const W = 1200, H = 630;
  const lineas = [
    "M0 470 C 300 430 520 520 820 470 S 1100 420 1200 450",
    "M0 560 C 260 530 600 600 900 560 S 1120 520 1200 540",
    "M760 630 L 840 380",
    "M1000 630 L 1050 360",
  ].map((d) => `<path d="${d}" stroke="${COLORES.verde}" stroke-opacity=".12" stroke-width="3" fill="none"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${degradado()}</defs>
<rect width="${W}" height="${H}" fill="${COLORES.fondo}"/>${lineas}
<rect width="${W}" height="10" fill="${COLORES.verde}"/><rect width="120" height="10" fill="${SOBRE_VERDE.recup}"/><rect x="120" width="120" height="10" fill="${SOBRE_VERDE.pasto}"/>
<g transform="translate(96 150) scale(3.9)"><rect width="64" height="64" rx="15" fill="url(#f)"/>${interior}</g>
<text x="390" y="270" font-family="${FUENTE}" font-size="112" font-weight="800" letter-spacing="-3" fill="${COLORES.tinta}">Repastos</text>
<text x="394" y="338" font-family="${FUENTE}" font-size="34" font-weight="500" fill="${COLORES.gris}">Potreros, rotaciones, aforos y tiempos de espera</text>
<text x="394" y="384" font-family="${FUENTE}" font-size="34" font-weight="500" fill="${COLORES.gris}">para ganaderías de Costa Rica.</text></svg>`;
  return sharp(Buffer.from(svg), { density: 144 }).resize(W, H).png().toBuffer();
}

function geometriaTs() {
  return `// Generado por scripts/generar-marca.mjs — no editar a mano (npm run marca).
export const LOGO = ${JSON.stringify(G, null, 2)} as const;
`;
}

async function main() {
  fs.mkdirSync(MARCA, { recursive: true });
  const escribir = (p, c) => (fs.writeFileSync(p, c), console.log("✓", path.relative(RAIZ, p)));

  const marca = isotipo();
  const redondeado = baldosa(marca);
  const maskable = baldosa(marca, { rx: 0, escala: 0.78 });
  const aSangre = baldosa(marca, { rx: 0, escala: 0.88 });
  const fav = favicon();

  escribir(path.join(RAIZ, "src/components/logo-geometria.ts"), geometriaTs());

  // Favicon y app icons (convenciones de Next en src/app)
  escribir(path.join(APP, "icon.svg"), fav);
  escribir(path.join(APP, "favicon.ico"), ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(fav, size) })))));
  escribir(path.join(APP, "apple-icon.png"), await png(aSangre, 180));
  escribir(path.join(APP, "opengraph-image.png"), await opengraph(marca));
  escribir(path.join(APP, "opengraph-image.alt.txt"), "Repastos: gestión de potreros para ganaderías de Costa Rica");

  // PWA (manifest)
  escribir(path.join(PUB, "icono-maskable.svg"), maskable);
  escribir(path.join(PUB, "icono-192.png"), await png(redondeado, 192));
  escribir(path.join(PUB, "icono-512.png"), await png(redondeado, 512));
  escribir(path.join(PUB, "icono-maskable-512.png"), await png(maskable, 512));

  // Kit de marca
  escribir(path.join(MARCA, "isotipo.svg"), suelto(isotipo({ c: SOBRE_CLARO })));
  escribir(path.join(MARCA, "isotipo-blanco.svg"), suelto(isotipo()));
  escribir(path.join(MARCA, "isotipo-mono.svg"), suelto(isotipo({ c: MONO })));
  escribir(path.join(MARCA, "icono-app.svg"), redondeado);
  escribir(path.join(MARCA, "favicon.svg"), fav);
  escribir(path.join(MARCA, "logo-horizontal.svg"), horizontal(marca));
  escribir(path.join(MARCA, "logo-horizontal-blanco.svg"), horizontal(marca, { texto: COLORES.fondo }));
  escribir(path.join(MARCA, "icono-1024.png"), await png(redondeado, 1024));

}

await main();
