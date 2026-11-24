// Prueba end-to-end contra la app en ejecución: node scripts/e2e.mjs [baseUrl] [carpetaCapturas]
// Usa Microsoft Edge instalado (playwright-core, channel "msedge").
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { cuadro, geojsonCRTM05, kml, kmz, shapefileZip } from "./fixtures-mapa.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = process.argv[3];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now();
const A = { email: `e2e-a-${stamp}@example.com`, password: `Repastos-${stamp}!` };
const B = { email: `e2e-b-${stamp}@example.com`, password: `Repastos-${stamp}!` };
const ok = (m) => console.log(`  ✓ ${m}`);
const shot = async (page, nombre, fullPage = true) => SHOTS && page.screenshot({ path: `${SHOTS}/${nombre}.png`, fullPage });
/** Espera el mensaje de confirmación de un ActionForm */
const guardado = (page, texto) => page.getByRole("status").filter({ hasText: texto }).first().waitFor({ timeout: 20_000 });

/** Elige una opción de un <select> por texto parcial */
const elegir = async (sel, texto) => sel.selectOption(await sel.locator("option", { hasText: texto }).first().getAttribute("value"));

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function registrar(ctx, u) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/sign-up`);
  await page.fill("#name", u.email.split("@")[0]);
  await page.fill("#email", u.email);
  await page.fill("#password", u.password);
  await page.click("button:has-text('Crear cuenta')");
  await page.waitForURL(`${BASE}/app`, { timeout: 30_000 });
  // Next 16 mantiene la ruta anterior oculta (Activity); cargamos un documento limpio.
  await page.goto(`${BASE}/app`);
  return page;
}

try {
  console.log(`E2E contra ${BASE}`);

  // 1. Rutas protegidas sin sesión
  const anon = await browser.newContext();
  const pAnon = await anon.newPage();
  await pAnon.goto(`${BASE}/`);
  await shot(pAnon, "01-portada");
  await pAnon.goto(`${BASE}/app`);
  assert.match(pAnon.url(), /\/auth\/sign-in/);
  await shot(pAnon, "02-login");
  ok("Sin sesión, /app redirige a /auth/sign-in");

  // 2. Registro y ganadería en manzanas
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await registrar(ctxA, A);
  ok(`Neon Auth: registro de ${A.email}`);
  await page.getByLabel("Nombre").fill(`Lechería E2E ${stamp}`);
  await page.getByLabel("Tipo de producción").selectOption("leche");
  await page.getByLabel("Unidad de área").selectOption("mz");
  await page.click("button:has-text('Crear ganadería')");
  await page.waitForURL(/\/app\/lecheria-e2e-/, { timeout: 30_000 });
  const slug = new URL(page.url()).pathname.split("/")[2];
  const ir = (ruta) => page.goto(`${BASE}/app/${slug}${ruta}`);
  await page.getByText("Bienvenido a Repastos").waitFor();
  await shot(page, "03-bienvenida");
  ok(`Ganadería creada (${slug}) en manzanas, con onboarding`);

  // 3. Finca
  await ir("/ajustes");
  await page.getByLabel("Nombre de la finca").fill("Finca Monteverde");
  await page.getByLabel("Provincia").selectOption("Alajuela");
  await page.getByLabel("Cantón").fill("San Carlos");
  await page.click("button:has-text('Agregar finca')");
  await guardado(page, "Finca \"Finca Monteverde\" creada");
  ok("Finca creada con provincia y cantón");

  // 4. Mapa: dibujar un potrero sobre el satélite
  await ir("/mapa");
  const dibujar = page.getByRole("button", { name: "Dibujar", exact: true });
  await dibujar.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Dibujar" && !b.disabled), null, { timeout: 30_000 });
  const mapa = await page.getByRole("region", { name: "Mapa satelital de potreros" }).boundingBox();
  const cx = mapa.x + mapa.width / 2;
  const cy = mapa.y + mapa.height / 2;
  const pts = [[-90, -60], [90, -60], [90, 60], [-90, 60]];
  const trazar = async () => {
    await dibujar.click();
    for (const [dx, dy] of pts) {
      await page.mouse.click(cx + dx, cy + dy);
      await page.waitForTimeout(250);
    }
    await page.mouse.click(cx + pts[0][0], cy + pts[0][1]); // cerrar en el primer punto
  };

  // 4a. Con el mapa alejado (todo Costa Rica) el polígono es enorme: aviso en pantalla y rechazo en el servidor
  await trazar();
  await page.getByText("Área demasiado grande").waitFor({ timeout: 10_000 });
  await page.getByLabel("Nombre").fill("Gigante");
  await page.click("button:has-text('Guardar potrero')");
  await page.getByRole("alert").filter({ hasText: "no puede medir más de" }).waitFor();
  assert.equal(await page.getByLabel("Nombre").inputValue(), "Gigante", "un error del servidor no debe borrar lo escrito");
  await page.getByRole("button", { name: "Cancelar dibujo" }).click();
  ok("Mapa: un polígono trazado con el mapa alejado se advierte y el servidor lo rechaza (sin borrar lo escrito)");

  // 4b. Acercar a escala de finca y dibujar
  for (let i = 0; i < 9; i++) {
    await page.mouse.dblclick(cx, cy);
    await page.waitForTimeout(450);
  }
  await trazar();
  await page.getByText("Área calculada:").waitFor({ timeout: 10_000 });
  const areaTxt = await page.getByText("Área calculada:").innerText();
  const mz = Number(areaTxt.match(/([\d\s.,]+)\s*mz/)[1].replace(/\s/g, "").replace(",", "."));
  assert.ok(mz > 1 && mz < 100, `área inesperada: ${areaTxt}`);
  await page.getByLabel("Nombre").fill("Potrero 1");
  await page.getByLabel("Tipo de pasto").fill("Kikuyo");
  await page.click("button:has-text('Guardar potrero')");
  await page.getByRole("button", { name: /Potrero 1/ }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500); // teselas satelitales
  await shot(page, "04-mapa");
  ok(`Mapa: potrero dibujado sobre el satélite (${areaTxt.trim()}) y guardado`);

  // 5. Potrero sin mapa (2 mz)
  await ir("/potreros");
  const formSinMapa = page.locator("section", { hasText: "Agregar sin mapa" });
  await formSinMapa.getByLabel("Nombre").fill("Potrero 2");
  await formSinMapa.getByLabel("Área (mz)").fill("2");
  await page.click("button:has-text('Agregar potrero')");
  await guardado(page, "Potrero \"Potrero 2\" creado");
  await page.getByRole("link", { name: "Potrero 2" }).waitFor();
  await page.getByText("2 mz").first().waitFor();
  ok("Potrero creado sin mapa con área en manzanas");

  // 6. Insumo con tiempo de espera
  await ir("/insumos");
  const formProd = page.locator("section", { hasText: "Agregar producto" });
  await formProd.getByLabel("Nombre comercial").fill("Herbicida E2E");
  await formProd.locator("select[name=tipo]").selectOption("herbicida");
  await formProd.getByLabel("Unidad", { exact: true }).selectOption("L");
  await formProd.getByLabel("Período de reingreso (días)").fill("15");
  await formProd.getByLabel("Retiro leche (d)").fill("3");
  await formProd.getByLabel("Precio por unidad (₡)").fill("8000");
  await formProd.getByRole("button", { name: "Agregar producto" }).click();
  await guardado(page, "Producto \"Herbicida E2E\" agregado");
  await page.getByRole("cell", { name: "Urea 46%" }).waitFor();
  await shot(page, "05-insumos");
  ok("Insumos: catálogo base precargado y herbicida con reingreso de 15 d");

  // 7. Lote y rotación
  await ir("/rotacion");
  await page.getByLabel("Nombre").fill("Vacas ordeño A");
  await page.getByLabel("Cabezas").fill("40");
  await page.getByLabel("Peso prom. (kg)").fill("480");
  await page.click("button:has-text('Crear lote')");
  await guardado(page, "Lote \"Vacas ordeño A\" creado");
  await elegir(page.getByLabel("Potrero destino"), "Potrero 1");
  await page.locator("section", { hasText: "Mover lote" }).getByRole("button", { name: "Mover", exact: true }).click();
  await guardado(page, "Vacas ordeño A movido");
  await page.getByText("día 1 / 1").waitFor();
  ok("Rotación: lote creado y movido a Potrero 1");

  // 8. Aplicación con tiempo de espera, costo y cálculo por manzana
  await ir("/aplicaciones");
  await page.getByLabel("Producto").selectOption({ label: "Herbicida E2E" });
  await page.getByRole("checkbox", { name: /Potrero 2/ }).check();
  await page.getByLabel("Dosis (L/mz)").fill("2");
  await page.getByText("Sin pastoreo hasta el").waitFor();
  await page.getByText("₡32").first().waitFor();
  await page.getByLabel("Responsable").fill("Juan");
  await page.click("button:has-text('Registrar aplicación')");
  await guardado(page, "Potreros en espera hasta");
  await page.locator("section", { hasText: "Potreros en tiempo de espera" }).getByText("Potrero 2").waitFor();
  await shot(page, "06-aplicaciones");
  ok("Aplicación: 2 L/mz × 2 mz = 4 L, costo ₡32 000, Potrero 2 en espera 15 días");

  // 9. Bloqueo en el servidor: forzar el envío aunque la opción esté deshabilitada
  await ir("/rotacion");
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.text.includes("Potrero 2")));
    const opt = [...sel.options].find((o) => o.text.includes("Potrero 2"));
    opt.disabled = false;
    sel.value = opt.value;
  });
  await page.locator("section", { hasText: "Mover lote" }).getByRole("button", { name: "Mover", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Potrero en espera por Herbicida E2E" }).waitFor();
  ok("Tiempo de espera: el servidor rechaza mover ganado a un potrero bloqueado");

  // 10. Aforo y lluvia
  await ir("/campo");
  await page.getByLabel("Milímetros").fill("12.5");
  await page.click("button:has-text('Guardar'):near(:text('Milímetros'))");
  await guardado(page, "12.5 mm registrados");
  await page.getByLabel("Potrero", { exact: true }).selectOption({ label: "Potrero 1" });
  await page.getByLabel("kg MS/ha").fill("2500");
  await page.click("button:has-text('Guardar aforo')");
  await guardado(page, "Aforo registrado");
  await page.getByRole("cell", { name: /^2.500$/ }).waitFor();
  await shot(page, "07-campo");
  ok("Campo: lluvia y aforo registrados");

  // 11. Inicio: KPIs (Neon Function) y estados
  await ir("");
  const kpis = page.getByTestId("kpis");
  await kpis.waitFor();
  const t = (await kpis.innerText()).replace(/\s+/g, " ");
  assert.match(t, /En espera por aplicación 1/);
  assert.match(t, /Lluvia, últimos 30 días 13 mm/);
  assert.match(t, /Insumos aplicados: ₡32/);
  await page.getByText("Vacas ordeño A (40 cab.) · día 1 de 1").waitFor();
  await shot(page, "08-inicio");
  ok(`Inicio: KPIs → "${t.slice(0, 150)}…"`);

  // 12. Detalle del potrero + Object Storage
  await ir("/potreros");
  await page.getByRole("link", { name: "Potrero 2" }).click();
  await page.getByText("Herbicida E2E").first().waitFor();
  const contenido = `Foto potrero ${stamp}`;
  await page.setInputFiles("input[name=archivo]", { name: "foto.txt", mimeType: "text/plain", buffer: Buffer.from(contenido) });
  await page.click("button:has-text('Subir')");
  const link = page.getByRole("link", { name: "foto.txt" });
  await link.waitFor();
  const href = await link.getAttribute("href");
  const redir = await ctxA.request.get(`${BASE}${href}`, { maxRedirects: 0 });
  assert.equal(redir.status(), 302);
  assert.equal(await (await fetch(redir.headers()["location"])).text(), contenido);
  await shot(page, "09-potrero");
  ok("Potrero: historial con aplicación; archivo subido y descargado de Object Storage");

  // 12b. Importar mapas: KML (Google Earth), KMZ, GeoJSON en CRTM05, Shapefile .zip
  await ir("/mapa");
  const importarBtn = page.getByRole("button", { name: "Importar archivo" });
  await importarBtn.waitFor();
  await page.waitForFunction((t) => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes(t) && !b.disabled), "Importar archivo", { timeout: 30_000 });
  const archivo = page.getByTestId("archivo-mapa");
  const filasImp = page.getByTestId("fila-import");
  const panelImp = page.locator(".card", { hasText: "Importar mapa" });

  // Archivo no soportado
  await archivo.setInputFiles({ name: "mapa.txt", mimeType: "text/plain", buffer: Buffer.from("hola") });
  await page.getByRole("alert").filter({ hasText: "Formato no soportado" }).waitFor();

  // KML: "Potrero 2" se empareja con el existente (actualiza su límite); el punto "Casa" se ignora
  await archivo.setInputFiles({
    name: "finca-google-earth.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(kml([["Potrero 2", cuadro(0)], ["Apartado Norte", cuadro(1)], ["Apartado Sur", cuadro(2)]])),
  });
  await panelImp.waitFor();
  assert.equal(await filasImp.count(), 3);
  assert.equal(await page.getByLabel("Destino del polígono 1").locator("option:checked").innerText(), "Actualizar: Potrero 2");
  await page.getByLabel("Nombre del polígono 2").fill("Apartado N");
  await page.getByLabel("Incluir polígono 3").uncheck();
  await page.waitForTimeout(2500);
  await shot(page, "12-importar-kml");
  await panelImp.getByRole("button", { name: /Importar 2/ }).click();
  await guardado(page, "1 potrero creado y 1 límite actualizado");
  await page.getByRole("button", { name: /Apartado N/ }).waitFor();
  assert.equal(await page.getByRole("button", { name: /Apartado Sur/ }).count(), 0);
  ok("Importar KML: crea los nuevos, actualiza el límite de «Potrero 2» por nombre y respeta los desmarcados");

  // KMZ
  await archivo.setInputFiles({ name: "lotes.kmz", mimeType: "application/vnd.google-earth.kmz", buffer: kmz([["Lote KMZ", cuadro(0, 1)]]) });
  await panelImp.waitFor();
  await panelImp.getByRole("button", { name: "Crear 1 potrero" }).click();
  await guardado(page, "1 potrero creado");
  await page.getByRole("button", { name: /Lote KMZ/ }).waitFor();

  // GeoJSON en CRTM05 (QGIS): se reproyecta y se avisa
  await archivo.setInputFiles({ name: "qgis-crtm05.geojson", mimeType: "application/geo+json", buffer: Buffer.from(geojsonCRTM05([["Q-1", cuadro(1, 1)], ["Q-2", cuadro(2, 1)]])) });
  await panelImp.getByText("se interpretaron como CRTM05").waitFor();
  assert.equal(await filasImp.count(), 2);
  const areaQ = await filasImp.first().innerText();
  const mzQ = Number(areaQ.match(/([\d,]+)\s*mz/)[1].replace(",", "."));
  assert.ok(mzQ > 1.3 && mzQ < 1.5, `área CRTM05 inesperada: ${areaQ}`);
  await panelImp.getByRole("button", { name: "Crear 2 potreros" }).click();
  await guardado(page, "2 potreros creados");

  // Shapefile .zip (nombre desde el atributo NOMBRE del .dbf)
  await archivo.setInputFiles({ name: "potreros-shp.zip", mimeType: "application/zip", buffer: shapefileZip([["Shape Uno", cuadro(0, 2)], ["Shape Dos", cuadro(1, 2)]]) });
  await panelImp.waitFor();
  assert.equal(await page.getByLabel("Nombre del polígono 1").inputValue(), "Shape Uno");
  await panelImp.getByRole("button", { name: "Crear 2 potreros" }).click();
  await guardado(page, "2 potreros creados");
  await page.getByRole("button", { name: /Shape Dos/ }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "12b-mapa-importado");
  // Potrero 2 ahora tiene el límite del KML (~1,4 mz en vez de los 2 mz digitados)
  await ir("/potreros");
  const filaP2 = page.getByRole("row", { name: /Potrero 2/ });
  assert.match(await filaP2.innerText(), /1,4\d? mz/);
  ok("Importar KMZ, GeoJSON en CRTM05 (reproyectado) y Shapefile .zip con nombres del .dbf");

  // 12d. Área aprovechable: bosque importado que cubre la mitad de «Lote KMZ» (y se sale de él)
  await ir("/mapa");
  await importarBtn.waitFor();
  await page.waitForFunction((t) => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes(t) && !b.disabled), "Importar archivo", { timeout: 30_000 });
  const c = cuadro(0, 1);
  const [x0, y0] = c[0];
  const y1 = c[1][1];
  const bosque = [[x0 - 0.0003, y0], [x0 - 0.0003, y1], [x0 + 0.00045, y1], [x0 + 0.00045, y0], [x0 - 0.0003, y0]];
  await archivo.setInputFiles({ name: "capas-finca.kml", mimeType: "application/vnd.google-earth.kml+xml", buffer: Buffer.from(kml([["Bosque del río", bosque]])) });
  await panelImp.waitFor();
  assert.equal(await page.getByLabel("Destino del polígono 1").locator("option:checked").innerText(), "No pastoreable: Bosque");
  await panelImp.getByRole("button", { name: /Importar 1 \(1 no pastoreable\)/ }).click();
  await guardado(page, "1 área no pastoreable");
  const listaZonas = page.getByRole("list", { name: "Áreas no pastoreables" });
  await listaZonas.getByRole("button", { name: /Bosque del río/ }).waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "12d-mapa-bosque");

  await ir("/potreros");
  const filaKmz = page.getByRole("row", { name: /Lote KMZ/ });
  const txtKmz = await filaKmz.innerText();
  const [util, total] = [...txtKmz.matchAll(/([\d,]+) mz/g)].map((m) => Number(m[1].replace(",", ".")));
  assert.ok(total > 1.3 && total < 1.5 && Math.abs(util - total / 2) < 0.05, `área aprovechable inesperada: ${txtKmz}`);
  const uso = page.getByTestId("uso-suelo");
  await uso.getByText("Bosque").waitFor();
  await uso.getByText("Pastoreable").waitFor();
  await shot(page, "12d-uso-suelo");
  ok(`Área aprovechable: el bosque importado se reconoce por nombre y se descuenta de «Lote KMZ» (${util} de ${total} mz)`);

  // Descuento manual (árboles dispersos) en Potrero 2, con tope en el área disponible
  await page.getByRole("link", { name: "Potrero 2", exact: true }).click();
  const descuento = page.getByLabel("Descuento no pastoreable (mz)");
  await descuento.fill("5");
  await page.click("button:has-text('Guardar cambios')");
  await page.getByRole("alert").filter({ hasText: "El descuento no puede ser mayor" }).waitFor();
  await descuento.fill("0.4");
  await page.click("button:has-text('Guardar cambios')");
  await guardado(page, "Potrero actualizado");
  await page.getByText(/aprovechables de 1,4\d? mz/).waitFor();
  assert.equal(await descuento.inputValue(), "0.4");
  ok("Descuento manual en el potrero: se rechaza si supera el área y se resta del área aprovechable");

  // Dibujar un área no pastoreable, editarla y eliminarla desde el mapa
  await ir("/mapa");
  await dibujar.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Dibujar" && !b.disabled), null, { timeout: 30_000 });
  await page.getByRole("button", { name: /Lote KMZ/ }).click(); // acerca el mapa a escala de finca
  await page.waitForTimeout(1200);
  await trazar();
  await page.getByRole("radio", { name: "No pastoreable" }).click();
  await page.locator("select[name=tipo]").selectOption("camino");
  await page.getByLabel("Nombre").fill("Callejón central");
  await page.click("button:has-text('Guardar área no pastoreable')");
  await page.waitForTimeout(3000);
  await shot(page, "12d-zona-dibujada");
  await listaZonas.getByRole("button", { name: /Callejón central/ }).click();
  const detZona = page.getByTestId("detalle-zona");
  await detZona.locator(".chip", { hasText: "Camino o callejón" }).waitFor();
  await detZona.locator("select[name=tipo]").selectOption("instalaciones");
  await detZona.getByRole("button", { name: "Guardar" }).click();
  await guardado(page, "Área actualizada");
  assert.equal(await detZona.locator("select[name=tipo]").inputValue(), "instalaciones");
  page.once("dialog", (d) => d.accept());
  await detZona.getByRole("button", { name: "Eliminar" }).click();
  await listaZonas.getByRole("button", { name: /Callejón central/ }).waitFor({ state: "detached", timeout: 20_000 });
  ok("Mapa: área no pastoreable dibujada, reclasificada y eliminada");

  // 12e. Caminos como líneas: una línea abierta se vuelve franja con ancho; un recorrido GPS que vuelve al inicio, potrero
  await ir("/mapa");
  await page.waitForFunction((t) => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes(t) && !b.disabled), "Importar archivo", { timeout: 30_000 });
  const yM = y0 + 0.00045;
  const camino = [[x0 - 0.0002, yM], [x0 + 0.0005, yM + 0.00001], [x0 + 0.0011, yM]];
  const rc = cuadro(2, 2);
  const recorrido = [...rc.slice(0, 4), [rc[0][0] + 0.00003, rc[0][1]]]; // no cierra exacto, como un GPS
  await archivo.setInputFiles({ name: "caminos-qgis.kml", mimeType: "application/vnd.google-earth.kml+xml", buffer: Buffer.from(kml([["Camino interno", camino, "linea"], ["Recorrido GPS", recorrido, "linea"]])) });
  await panelImp.getByText("1 línea abierta se convirtió en franja").waitFor();
  assert.equal(await page.getByLabel("Destino del polígono 1").locator("option:checked").innerText(), "Franja: Camino o callejón");
  assert.equal(await page.getByLabel("Destino del polígono 2").locator("option:checked").innerText(), "Nuevo potrero");
  assert.equal(await page.getByLabel("Ancho de la franja 1 (m)").inputValue(), "4");
  await page.getByLabel("Ancho de la franja 1 (m)").fill("10");
  const txtCamino = await filasImp.first().innerText();
  const mzCamino = Number(txtCamino.match(/([\d,]+)\s*mz/)[1].replace(",", "."));
  assert.ok(mzCamino > 0.19 && mzCamino < 0.24, `franja de 10 m inesperada: ${txtCamino}`);
  await page.getByLabel("Incluir polígono 2").uncheck();
  await page.waitForTimeout(1500);
  await shot(page, "12e-importar-lineas");
  await panelImp.getByRole("button", { name: /Importar 1 \(1 no pastoreable\)/ }).click();
  await guardado(page, "1 área no pastoreable");
  await listaZonas.getByRole("button", { name: /Camino interno/ }).click();
  await detZona.getByText("Franja de 10 m de ancho").waitFor();
  await detZona.locator("input[name=anchoM]").fill("4");
  await detZona.getByRole("button", { name: "Guardar" }).click();
  await guardado(page, "Área actualizada");
  await detZona.getByText("Franja de 4 m de ancho").waitFor();
  await ir("/potreros");
  const txtKmz2 = await page.getByRole("row", { name: /Lote KMZ/ }).innerText();
  const util2 = Number(txtKmz2.match(/([\d,]+) mz/)[1].replace(",", "."));
  // 4 m × ~49 m del camino fuera del bosque ≈ 0,028 mz (lo que pisa el bosque no se descuenta dos veces)
  assert.ok(Math.abs(util - util2 - 0.028) < 0.012, `descuento del camino inesperado: ${util} → ${util2}`);
  ok(`Línea abierta importada como franja: ancho ajustable (10 → 4 m) y descontada de «Lote KMZ» sin duplicar el bosque (${util} → ${util2} mz)`);

  // Dibujar una línea en el mapa: protección de quebrada (30 m)
  await ir("/mapa");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Dibujar" && !b.disabled), null, { timeout: 30_000 });
  await page.getByRole("button", { name: /Lote KMZ/ }).click();
  await page.waitForTimeout(1200);
  await dibujar.click();
  await page.getByRole("radio", { name: "Línea", exact: true }).click();
  for (const [dx, dy] of [[-110, 20], [0, -20], [110, 10]]) {
    await page.mouse.click(cx + dx, cy + dy);
    await page.waitForTimeout(250);
  }
  await page.mouse.click(cx + 110, cy + 10); // tocar el último punto termina la línea
  const anchoNuevo = page.locator("input[name=anchoM]");
  await anchoNuevo.waitFor();
  assert.equal(await anchoNuevo.inputValue(), "4");
  await page.locator("select[name=tipo]").selectOption("proteccion");
  assert.equal(await anchoNuevo.inputValue(), "30", "al elegir protección se propone 30 m");
  await page.getByLabel("Nombre").fill("Quebrada dibujada");
  await page.waitForTimeout(800);
  await shot(page, "12e-linea-dibujada");
  await page.click("button:has-text('Guardar área no pastoreable')");
  await listaZonas.getByRole("button", { name: /Quebrada dibujada/ }).click();
  await detZona.getByText("Franja de 30 m de ancho").waitFor();
  page.once("dialog", (d) => d.accept());
  await detZona.getByRole("button", { name: "Eliminar" }).click();
  await listaZonas.getByRole("button", { name: /Quebrada dibujada/ }).waitFor({ state: "detached", timeout: 20_000 });
  ok("Mapa: línea dibujada → franja de protección (30 m por defecto), guardada y eliminada");

  // 12c. Módulos por hato
  await ir("/potreros");
  await page.getByRole("button", { name: /Crear Ordeño AM, Ordeño PM/ }).click();
  const listaMod = page.getByRole("list", { name: "Módulos" });
  await listaMod.getByText("Ordeño AM").waitFor();
  assert.equal(await listaMod.locator("> li").count(), 6);
  // Módulo propio + nombre repetido rechazado
  await page.getByText("Nuevo módulo").click();
  const formMod = page.locator("form", { hasText: "Nombre del módulo" });
  await formMod.getByLabel("Nombre del módulo").fill("Enfermería");
  await formMod.getByTitle("Morado").click();
  assert.ok(await formMod.getByRole("radio", { name: "Morado" }).isChecked());
  await formMod.getByRole("button", { name: "Crear módulo" }).click();
  await guardado(page, "Módulo \"Enfermería\" creado");
  await formMod.getByLabel("Nombre del módulo").fill("Secas");
  await formMod.getByRole("button", { name: "Crear módulo" }).click();
  await page.getByRole("alert").filter({ hasText: "Ya existe el módulo \"Secas\"" }).waitFor();
  // Asignación masiva: todos los sin módulo menos Potrero 2 → Ordeño AM
  await page.goto(page.url());
  await page.getByLabel("Marcar todos los potreros de sin módulo").check();
  await page.getByLabel("Marcar Potrero 2", { exact: true }).uncheck();
  await page.getByLabel("Asignar los potreros marcados a").selectOption({ label: "Ordeño AM" });
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await guardado(page, "7 potreros asignados a Ordeño AM");
  const grupoAM = page.getByTestId("grupo-Ordeño AM");
  await grupoAM.getByText("Shape Dos").waitFor();
  assert.match(await grupoAM.innerText(), /7 potreros/);
  assert.match(await grupoAM.innerText(), /cada uno descansa 6 d \(objetivo 30\)/);
  assert.match(await page.getByTestId("grupo-sin-modulo").innerText(), /Potrero 2/);
  await shot(page, "13-potreros-modulos");
  ok("Módulos: sugeridos por tipo de ganadería, propio con color, nombre repetido rechazado y asignación masiva");

  // Hato en su módulo: sugerencia dentro del módulo y movimiento de un toque
  await ir("/rotacion");
  const loteA = page.getByTestId("lote").filter({ hasText: "Vacas ordeño A" });
  await loteA.getByText("Editar lote").click();
  await loteA.getByLabel("Módulo").selectOption({ label: "Ordeño AM" });
  await loteA.getByRole("button", { name: "Guardar lote" }).click();
  await guardado(page, "Lote actualizado");
  await loteA.getByText("Siguiente sugerido en Ordeño AM").waitFor();
  // Tras guardar, el formulario debe mostrar el valor guardado (no volver al anterior)
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll("[data-testid=lote] select")].find((x) => [...x.options].some((o) => o.text === "Ordeño AM"));
    return s && s.options[s.selectedIndex].text === "Ordeño AM";
  }, null, { timeout: 10_000 });
  const moverSug = loteA.getByRole("button", { name: /^Mover a / });
  const destinoSug = (await moverSug.innerText()).replace(/^\s*Mover a\s*/, "").trim();
  assert.ok(destinoSug && destinoSug !== "Potrero 2" && destinoSug !== "Potrero 1", `sugerencia fuera del módulo: ${destinoSug}`);
  await moverSug.click();
  await guardado(page, `Vacas ordeño A movido a ${destinoSug}`);
  assert.ok(!(await page.getByRole("status").filter({ hasText: "movido a" }).first().innerText()).includes("fuera de su módulo"));
  await shot(page, "14-rotacion-modulo");
  ok(`Rotación: el hato de Ordeño AM recibe la sugerencia «${destinoSug}» dentro de su módulo y se mueve de un toque`);

  // Inicio y mapa por módulo
  await ir("");
  const tarjetas = page.getByTestId("modulos");
  await tarjetas.getByText("Vacas ordeño A (40 cab.)").waitFor();
  assert.match(await tarjetas.innerText(), /Faltan potreros: la rotación da 6 d de descanso y el objetivo es 30 d/);
  await page.getByTestId("sugeridos").getByText("Vacas ordeño A →").waitFor();
  await ir("/mapa");
  await page.getByRole("radio", { name: "Módulo" }).click();
  await page.getByTestId("leyenda").getByText("Ordeño AM").waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "15-mapa-modulos");
  ok("Inicio resume cada módulo (hato, carga, descanso que permite) y el mapa colorea por módulo");

  // 12f. Forraje: clima de la finca, cuña forrajera, prioridad en el mapa
  await ir("/ajustes");
  const formFinca = page.locator("details", { hasText: "Editar finca y clima" }).first();
  await formFinca.locator("summary").click();
  await formFinca.getByLabel("Altitud (msnm)").fill("1200");
  await formFinca.getByLabel("Régimen de lluvias").selectOption("caribe");
  await formFinca.getByRole("button", { name: "Guardar finca" }).click();
  await guardado(page, "Finca actualizada");
  await page.getByText("1200 msnm").first().waitFor();
  await ir("/forraje");
  await page.getByRole("heading", { name: "Cuña forrajera" }).waitFor();
  await page.getByRole("img", { name: /Cuña forrajera de \d+ potreros/ }).waitFor();
  const filaP1 = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Potrero 1", exact: true }) });
  assert.match(await filaP1.innerText(), /Aforo/);
  assert.match(await page.locator("body").innerText(), /1\s?200 msnm.*caribe/i);
  await shot(page, "16-forraje");
  await ir("/mapa?color=prioridad");
  await page.getByRole("radio", { name: "Prioridad" }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "Prioridad" }).getAttribute("aria-checked"), "true");
  ok("Forraje: altitud y régimen por finca, cuña forrajera con la cobertura estimada y el mapa por prioridad");

  // 12g. Labores: chapia con costo y tarea pendiente que se completa; días desde en el potrero
  await ir("/labores");
  await page.getByLabel("Labor", { exact: true }).selectOption("chapia");
  await page.getByLabel("Costo total (₡)").fill("20000");
  await page.getByRole("checkbox", { name: "Potrero 1", exact: true }).check();
  await page.getByRole("button", { name: "Guardar labor" }).click();
  await guardado(page, "Labor registrada");
  await page.getByLabel("Labor", { exact: true }).selectOption("tarea");
  await page.getByLabel("Detalle").fill("Reparar bebedero");
  await page.getByLabel(/Es una tarea pendiente/).check();
  await page.getByRole("checkbox", { name: "Potrero 1", exact: true }).check();
  await page.getByRole("button", { name: "Guardar labor" }).click();
  await guardado(page, "Tarea pendiente agregada");
  const pendiente = page.locator("section", { hasText: "Tareas pendientes" });
  await pendiente.getByText("Reparar bebedero").waitFor();
  await pendiente.getByRole("button", { name: "Hecha" }).click();
  await pendiente.getByText("No hay tareas pendientes.").waitFor();
  await page.getByRole("cell", { name: "₡20 000" }).first().waitFor();
  await page.getByRole("link", { name: "Potreros" }).first().click();
  await page.getByRole("link", { name: "Potrero 1", exact: true }).first().click();
  const diasDesde = page.locator("section", { hasText: "Días desde" });
  await diasDesde.waitFor();
  assert.match((await diasDesde.innerText()).replace(/\s+/g, " "), /Chapia 0 d/);
  ok("Labores: chapia con costo, tarea pendiente completada y «días desde» en el potrero");

  // 12h. Planificador, herramientas y reportes
  await ir("/planificador");
  await page.getByRole("button", { name: /Generar plan|Rehacer plan/ }).click();
  await guardado(page, "Plan de");
  await page.getByRole("heading", { name: /^Plan de / }).waitFor();
  const filasPlan = page.locator("section", { hasText: "Oferta vs demanda" }).locator("tbody tr");
  const nPlan = await filasPlan.count();
  assert.ok(nPlan >= 1, "plan vacío");
  await shot(page, "17-planificador");
  await ir("/herramientas");
  await page.getByText("Correr la cerca", { exact: true }).waitFor();
  await page.getByText("Costo del kg MS extra", { exact: true }).waitFor();
  await ir("/reportes");
  await page.getByRole("cell", { name: "Vacas ordeño A" }).first().waitFor();
  assert.match(await page.getByRole("link", { name: "WhatsApp" }).getAttribute("href"), /^https:\/\/wa\.me\/\?text=/);
  await shot(page, "18-reportes");
  ok(`Planificador con ${nPlan} potreros; calculadoras y reporte de rotación con enlace a WhatsApp`);

  // 13. Móvil: navegación inferior
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctxA.storageState(), isMobile: true, hasTouch: true });
  const pm = await movil.newPage();
  await pm.goto(`${BASE}/app/${slug}`);
  const nav = pm.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("link", { name: "Más" }).waitFor();
  await pm.getByTestId("kpis").waitFor();
  await shot(pm, "10-movil-inicio", false);
  const anchoInicio = await pm.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(anchoInicio <= 390, `scroll horizontal en Inicio móvil (${anchoInicio}px)`);
  await nav.getByRole("link", { name: "Aplicaciones" }).click();
  await pm.waitForURL(/aplicaciones/);
  await pm.getByRole("heading", { name: "Aplicaciones", level: 1 }).waitFor();
  await shot(pm, "11-movil-aplicaciones", false);
  const anchoScroll = await pm.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(anchoScroll <= 390, `scroll horizontal en móvil (${anchoScroll}px)`);
  ok("Móvil: barra inferior funciona y sin scroll horizontal");

  // 14. Sesión
  await ir("/mas");
  await page.click("button:has-text('Cerrar sesión') >> nth=-1");
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/auth/sign-in`);
  await page.fill("#email", A.email);
  await page.fill("#password", A.password);
  await page.click("button:has-text('Entrar')");
  await page.waitForURL(`${BASE}/app`);
  await page.reload();
  await page.getByText(`Lechería E2E ${stamp}`).waitFor();
  ok("Neon Auth: cerrar sesión, entrar y sesión restaurada tras recargar");

  // 15. Aislamiento entre clientes
  const ctxB = await browser.newContext();
  await registrar(ctxB, B);
  const pB = await ctxB.newPage();
  await pB.goto(`${BASE}/app/${slug}/aplicaciones`);
  await pB.getByText("This page could not be found").waitFor();
  const htmlB = await pB.content();
  assert.ok(!htmlB.includes("Herbicida E2E") && !htmlB.includes(`Lechería E2E ${stamp}`), "fuga de datos de A");
  const fB = await ctxB.request.get(`${BASE}${href}`, { maxRedirects: 0 });
  assert.equal(fB.status(), 404);
  ok("Multi-tenant: otro usuario no ve la ganadería ni el archivo de A");

  console.log(`\nE2E OK — slug=${slug}`);
} catch (e) {
  console.error("\nE2E FALLÓ:", e);
  process.exitCode = 1;
  if (SHOTS) {
    const pages = browser.contexts().flatMap((c) => c.pages());
    await pages.at(-1)?.screenshot({ path: `${SHOTS}/fallo.png`, fullPage: true }).catch(() => {});
  }
} finally {
  await browser.close();
}
