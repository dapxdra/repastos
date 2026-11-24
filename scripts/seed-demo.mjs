// Datos de ejemplo: lechería en Aguas Zarcas, San Carlos (Zona Norte), con ~95 días de historia.
// Crea (o recrea) la organización «Lechería La Esperanza (demo)» y la asigna como propietario al usuario indicado.
//
//   node --env-file=.env.local scripts/seed-demo.mjs tu@correo.com
//
// Es idempotente: si la organización demo ya existe la borra y la vuelve a generar con fechas relativas a hoy.
import pg from "pg";
import area from "@turf/area";

const SLUG = "demo-la-esperanza";
const DIAS_HISTORIA = 95;

const email = process.argv[2];
if (!email) {
  console.error("Uso: node --env-file=.env.local scripts/seed-demo.mjs <email del usuario>");
  process.exit(1);
}

// ───────── utilidades ─────────
let semilla = 20260611;
/** PRNG determinista (mulberry32): mismos datos en cada corrida */
function azar() {
  semilla |= 0;
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (a, b) => a + (b - a) * azar();
const ruido = (v, pct) => v * (1 + entre(-pct, pct));
const r0 = (v) => Math.round(v);

const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
/** Fecha 'YYYY-MM-DD' a d días de hoy (d negativo = pasado) */
function fecha(d) {
  const t = new Date(`${hoy}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
/** Instante en hora de Costa Rica (UTC−6) */
const ts = (d, hora) => `${fecha(d)}T${hora}:00-06:00`;

const rect = (x, y, w, h) => ({
  type: "Polygon",
  coordinates: [[[x, y], [x, y + h], [x + w, y + h], [x + w, y], [x, y]]],
});
const ha = (g) => area({ type: "Feature", properties: {}, geometry: g }) / 10000;

// ───────── diseño de la finca ─────────
const X0 = -84.3485;
const Y0 = 10.3962;
const ALTO = 0.0007; // ≈ 77 m
const CALLE = 0.00006; // callejón ≈ 7 m

const potreros = []; // { clave, nombre, modulo, pasto, descanso, ocupacion, geom, notas }

// Módulo Ordeño: 26 apartos de ~0,6 ha a ambos lados del callejón
let x = X0;
for (let i = 0; i < 13; i++) {
  const w = entre(0.00064, 0.00074);
  for (let fila = 0; fila < 2; fila++) {
    const n = fila * 13 + i + 1;
    const y = fila === 0 ? Y0 : Y0 + ALTO + CALLE;
    potreros.push({
      clave: `O${n}`,
      nombre: `Aparto ${n}`,
      modulo: "ordeno",
      pasto: n === 25 ? "Brachiaria híbrido Cayman" : "Estrella africana",
      descanso: n === 25 ? 35 : 24,
      ocupacion: 1,
      geom: rect(x, y, w, ALTO),
    });
  }
  x += w + 0.00002;
}
const XFIN_ORDENO = x;

// Módulo Secas: 6 apartos de ~0,7 ha al norte
for (let i = 0; i < 6; i++) {
  potreros.push({
    clave: `S${i + 1}`,
    nombre: `Secas ${i + 1}`,
    modulo: "secas",
    pasto: i < 3 ? "Estrella africana" : "Transvala",
    descanso: 20,
    ocupacion: 4,
    geom: rect(X0 + i * 0.00082, Y0 + 2 * ALTO + CALLE + 0.00008, 0.00078, 0.00083),
  });
}

// Módulo Novillas: 8 apartos de ~1 ha al este (Brachiarias)
for (let i = 0; i < 8; i++) {
  const col = i % 4;
  const fila = Math.floor(i / 4);
  potreros.push({
    clave: `N${i + 1}`,
    nombre: `Novillas ${i + 1}`,
    modulo: "novillas",
    pasto: i < 4 ? "Brachiaria Marandú" : "Mulato II",
    descanso: 21,
    ocupacion: 3,
    geom: rect(XFIN_ORDENO + 0.0004 + col * 0.00094, Y0 + fila * 0.00094, 0.0009, 0.0009),
  });
}

const zonas = [
  { nombre: "Lechería y corrales", tipo: "instalaciones", geom: rect(X0 - 0.00055, Y0 + 0.0004, 0.0005, 0.0007) },
  { nombre: "Callejón principal", tipo: "camino", geom: rect(X0, Y0 + ALTO, XFIN_ORDENO - X0, CALLE) },
  { nombre: "Protección quebrada Gata", tipo: "proteccion", geom: rect(X0 - 0.00055, Y0 - 0.0006, XFIN_ORDENO - X0 + 0.0045, 0.00055) },
  { nombre: "Banco forrajero (Camerún de corta)", tipo: "corte", geom: rect(X0 - 0.00055, Y0 + 0.00115, 0.0005, 0.0006) },
];

const lotesDef = [
  { clave: "ordeno", nombre: "Vacas en ordeño", categoria: "vacas_produccion", cabezas: 65, peso: 480, suple: 5.5, modulo: "ordeno" },
  { clave: "secas", nombre: "Vacas secas", categoria: "vacas_secas", cabezas: 14, peso: 520, suple: 0, modulo: "secas" },
  { clave: "novillas", nombre: "Novillas de reemplazo", categoria: "novillas", cabezas: 32, peso: 320, suple: 1, modulo: "novillas" },
];

// Rotación: [claves en orden, días por aparto]
const ROTACION_ORDENO = Array.from({ length: 24 }, (_, i) => `O${i + 1}`); // O25 (resiembra) y O26 (bebedero dañado) fuera
const ROTACIONES = {
  ordeno: { orden: ROTACION_ORDENO, dias: 1 },
  secas: { orden: ["S1", "S2", "S3", "S4", "S5", "S6"], dias: 4 },
  novillas: { orden: ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"], dias: 3 },
};

/** Estancias [{potrero, desde, hasta|null}] (días relativos a hoy); la última sigue abierta */
function estancias({ orden, dias }) {
  const out = [];
  let d = -DIAS_HISTORIA;
  let i = 0;
  while (d <= 0) {
    const hasta = d + dias;
    out.push({ potrero: orden[i % orden.length], desde: d, hasta: hasta > 0 ? null : hasta });
    d = hasta;
    i++;
  }
  return out;
}

// ───────── inserción ─────────
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (sql, params) => c.query(sql, params).then((r) => r.rows);
const uno = async (sql, params) => (await q(sql, params))[0];

try {
  const usuario = await uno(`select id, email from neon_auth."user" where lower(email) = lower($1)`, [email]);
  if (!usuario) throw new Error(`No hay usuario con el correo ${email}. Inicie sesión en la app al menos una vez.`);
  const uid = usuario.id;

  await c.query("begin");

  const vieja = await uno(`select id from organizaciones where slug = $1`, [SLUG]);
  if (vieja) {
    // aplicaciones → productos es RESTRICT: se borran primero
    await q(`delete from aplicaciones where org_id = $1`, [vieja.id]);
    await q(`delete from organizaciones where id = $1`, [vieja.id]);
  }

  const org = await uno(
    `insert into organizaciones (nombre, slug, tipo_produccion, unidad_area) values ($1, $2, 'leche', 'mz') returning id`,
    ["Lechería La Esperanza (demo)", SLUG],
  );
  const O = org.id;
  await q(`insert into membresias (org_id, user_id, email, rol) values ($1, $2, $3, 'propietario')`, [O, uid, usuario.email]);

  const areaPotreros = potreros.reduce((s, p) => s + ha(p.geom), 0);
  const finca = await uno(
    `insert into fincas (org_id, nombre, ubicacion, provincia, canton, area_ha, altitud_msnm, regimen_lluvia, centro)
     values ($1, 'Finca La Esperanza', 'Aguas Zarcas, 2 km al norte de la plaza', 'Alajuela', 'San Carlos', $2, 480, 'caribe', $3) returning id`,
    [O, (areaPotreros + 3.2).toFixed(2), JSON.stringify([X0 + 0.0025, Y0 + 0.0009])],
  );
  const F = finca.id;

  const modulos = {};
  for (const [i, [clave, nombre, color]] of [
    ["ordeno", "Ordeño", "#2f7fd0"],
    ["secas", "Secas", "#c2410c"],
    ["novillas", "Novillas", "#7c3aed"],
  ].entries()) {
    modulos[clave] = (await uno(`insert into modulos (org_id, nombre, color, orden) values ($1,$2,$3,$4) returning id`, [O, nombre, color, i])).id;
  }

  const P = {}; // clave → { id, ha }
  for (const p of potreros) {
    const h = ha(p.geom);
    const notas =
      p.clave === "O25" ? "Resembrado con Cayman; en establecimiento, primer pastoreo liviano." : p.clave === "O26" ? "Fuera de rotación hasta reparar el bebedero." : null;
    const r = await uno(
      `insert into potreros (org_id, finca_id, nombre, modulo_id, area_ha, tipo_pasto, dias_descanso_objetivo, dias_ocupacion_objetivo, geometria, notas)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [O, F, p.nombre, modulos[p.modulo], h.toFixed(6), p.pasto, p.descanso, p.ocupacion, JSON.stringify(p.geom), notas],
    );
    P[p.clave] = { id: r.id, ha: h, ...p };
  }

  for (const z of zonas) {
    await q(`insert into zonas (org_id, finca_id, nombre, tipo, geometria, area_ha) values ($1,$2,$3,$4,$5,$6)`, [
      O,
      F,
      z.nombre,
      z.tipo,
      JSON.stringify(z.geom),
      ha(z.geom).toFixed(6),
    ]);
  }

  const L = {};
  for (const l of lotesDef) {
    L[l.clave] = (
      await uno(
        `insert into lotes (org_id, finca_id, nombre, modulo_id, categoria, cabezas, peso_promedio_kg, suplemento_kg_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [O, F, l.nombre, modulos[l.modulo], l.categoria, l.cabezas, l.peso, l.suple],
      )
    ).id;
  }

  // Pastoreos
  const salidas = {}; // clave potrero → [día de salida]
  let nPast = 0;
  const pastoreo = (lote, cab, clave, desde, hasta, notas = null) => {
    if (hasta != null) (salidas[clave] ??= []).push(hasta);
    nPast++;
    return q(
      `insert into pastoreos (org_id, potrero_id, lote_id, cabezas, fecha_entrada, fecha_salida, notas) values ($1,$2,$3,$4,$5,$6,$7)`,
      [O, P[clave].id, L[lote], cab, ts(desde, "06:30"), hasta == null ? null : ts(hasta, "06:00"), notas],
    );
  };
  const entradas = {}; // clave → [día de entrada] (para aforos de pre-pastoreo)
  for (const l of lotesDef) {
    for (const e of estancias(ROTACIONES[l.clave])) {
      await pastoreo(l.clave, l.cabezas, e.potrero, e.desde, e.hasta);
      (entradas[e.potrero] ??= []).push(e.desde);
    }
  }
  // Apartos fuera de rotación: O25 antes de la resiembra y O26 hace 38 días
  await pastoreo("ordeno", 65, "O25", -70, -69);
  await pastoreo("ordeno", 65, "O26", -39, -38, "Último pastoreo antes de dañarse el bebedero");

  const ultimaSalida = (clave, antesDe) =>
    Math.max(-Infinity, ...(salidas[clave] ?? []).filter((d) => d <= antesDe));

  // Lluvia (Zona Norte: lluvioso casi todo el año, más en oct-dic)
  for (let d = -DIAS_HISTORIA; d <= 0; d++) {
    const llueve = azar() < 0.72;
    const mm = llueve ? Math.round(entre(0.5, 1) ** 2 * entre(2, 48) * 10) / 10 : 0;
    await q(`insert into lluvias (org_id, finca_id, fecha, mm) values ($1,$2,$3,$4)`, [O, F, fecha(d), mm]);
  }

  // Aforos
  let nAforos = 0;
  const aforo = (clave, d, metodo, kg, hojas) => {
    nAforos++;
    return q(`insert into aforos (org_id, potrero_id, fecha, metodo, kg_ms_ha, altura_cm, hojas) values ($1,$2,$3,$4,$5,$6,$7)`, [
      O,
      P[clave].id,
      fecha(d),
      metodo,
      r0(kg),
      Math.round((kg / 95) * 10) / 10,
      hojas == null ? null : Math.round(hojas * 2) / 2,
    ]);
  };
  const TASA = { "Estrella africana": 52, Transvala: 48, "Brachiaria Marandú": 60, "Mulato II": 66, "Brachiaria híbrido Cayman": 64 };
  const RESIDUO = { "Estrella africana": 1500, Transvala: 1400, "Brachiaria Marandú": 1600, "Mulato II": 1700, "Brachiaria híbrido Cayman": 1700 };
  const cobertura = (clave, d) => {
    const p = P[clave];
    const desde = ultimaSalida(clave, d);
    const dias = Number.isFinite(desde) ? d - desde : 40;
    return { kg: Math.min(RESIDUO[p.pasto] + TASA[p.pasto] * dias, RESIDUO[p.pasto] * 2.4), dias };
  };

  // Pre-pastoreo del ordeño (últimos 45 días) con plato; secas a ojo
  for (const [clave, dias] of Object.entries(entradas)) {
    for (const d of dias.filter((d) => d >= -45)) {
      const { kg, dias: desc } = cobertura(clave, d);
      if (clave.startsWith("O")) await aforo(clave, d, "plato", ruido(kg, 0.07), (desc / 24) * 4 + entre(-0.4, 0.4));
      else if (clave.startsWith("S") && azar() < 0.6) await aforo(clave, d, "visual", ruido(kg, 0.12), null);
    }
  }
  // Recorridas semanales con regla (hace 11 y 4 días): dan la tasa medida de la finca
  for (const d of [-11, -4]) {
    for (const clave of Object.keys(P).filter((k) => k.startsWith("O") || k.startsWith("N"))) {
      const ocupado = (salidas[clave] ?? []).some((s) => s > d - 1 && s <= d + 1);
      if (ocupado || azar() < 0.2) continue;
      const { kg, dias } = cobertura(clave, d);
      await aforo(clave, d, "regla_altura", ruido(kg, 0.06), (dias / 24) * 4 + entre(-0.3, 0.3));
    }
  }
  // O25 (Cayman en establecimiento) y O26 (pasándose)
  await aforo("O25", -5, "cuadro_corte", 3150, 5);
  await aforo("O26", -4, "regla_altura", 3450, 6);

  // Catálogo de insumos (precios en colones de referencia, nov. 2026)
  const PRODUCTOS = [
    ["Urea 46%", "fertilizante", null, "kg", 46, 0, 0, 0, null, null, 490],
    ["Nitrato de amonio 33,5%", "fertilizante", null, "kg", 33.5, 0, 0, 0, null, null, 540],
    ["Sulfato de amonio 21%", "fertilizante", null, "kg", 21, 0, 0, 0, null, null, 340],
    ["Fosfato diamónico (DAP) 18-46-0", "fertilizante", null, "kg", 18, 46, 0, 0, null, null, 620],
    ["Cloruro de potasio (KCl) 0-0-60", "fertilizante", null, "kg", 0, 0, 60, 0, null, null, 520],
    ["Carbonato de calcio (cal agrícola)", "enmienda", null, "kg", null, null, null, 0, null, null, 95],
    ["Cal dolomita", "enmienda", null, "kg", null, null, null, 0, null, null, 110],
    ["Herbicida picloram + 2,4-D", "herbicida", "Picloram + 2,4-D amina", "L", null, null, null, 14, 7, 30, 9800],
    ["Foliar completo con micronutrientes", "foliar", null, "L", 10, 8, 6, 3, null, null, 4800],
    ["Metarhizium anisopliae (control de salivazo)", "organico", "Metarhizium anisopliae", "kg", null, null, null, 0, null, null, 12000],
  ];
  const PR = {};
  for (const [nombre, tipo, ia, unidad, n, p, k, reingreso, leche, carne, precio] of PRODUCTOS) {
    PR[nombre] = {
      reingreso,
      precio,
      id: (
        await uno(
          `insert into productos (org_id, nombre, tipo, ingrediente_activo, unidad, n, p, k, periodo_reingreso_dias, retiro_leche_dias, retiro_carne_dias, precio_unidad, notas)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
          [O, nombre, tipo, ia, unidad, n, p, k, reingreso, leche, carne, precio, tipo === "herbicida" ? "Confirmar reingreso y retiro en la etiqueta del producto." : null],
        )
      ).id,
    };
  }

  let nApl = 0;
  const aplicar = async (producto, claves, d, dosis, metodo, responsable, notas = null) => {
    const pr = PR[producto];
    const grupo = crypto.randomUUID();
    for (const clave of claves) {
      const cant = dosis * P[clave].ha;
      nApl++;
      await q(
        `insert into aplicaciones (org_id, grupo_id, potrero_id, producto_id, fecha, dosis_por_ha, cantidad_total, metodo, costo_total, reingreso_dias, fecha_liberacion, responsable, notas, creado_por)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [O, grupo, P[clave].id, pr.id, fecha(d), dosis, cant.toFixed(3), metodo, (cant * pr.precio).toFixed(2), pr.reingreso, fecha(d + pr.reingreso), responsable, notas, uid],
      );
    }
  };

  // Urea al salir el ordeño (cada ciclo, últimos 60 días), 2 días después de la salida
  const porDia = {};
  for (const [clave, ds] of Object.entries(salidas)) {
    if (!clave.startsWith("O")) continue;
    for (const s of ds) if (s >= -60 && s + 2 <= 0) (porDia[s + 2] ??= []).push(clave);
  }
  for (const [d, claves] of Object.entries(porDia)) await aplicar("Urea 46%", claves, Number(d), 50, "voleo", "Don Marvin");

  await aplicar("Cal dolomita", ["S1", "S2", "S3", "S4", "S5", "S6"], -82, 1000, "voleo", "Don Marvin", "Según análisis de suelo (pH 5,1)");
  await aplicar("Fosfato diamónico (DAP) 18-46-0", ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"], -68, 100, "voleo", "Don Marvin");
  await aplicar("Cloruro de potasio (KCl) 0-0-60", ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"], -68, 75, "voleo", "Don Marvin");
  await aplicar("Herbicida picloram + 2,4-D", ["N3"], -22, 1.5, "bomba_espalda", "Jeffry", "Control de chirrite y dormilona");
  // Aparto que le toca al ordeño en 3 días: queda bloqueado por el tiempo de espera
  const bloqueado = ROTACION_ORDENO[(DIAS_HISTORIA + 3) % ROTACION_ORDENO.length];
  await aplicar("Herbicida picloram + 2,4-D", [bloqueado], -4, 1.5, "bomba_espalda", "Jeffry", "Parcheo de charral en la orilla");
  await aplicar("Foliar completo con micronutrientes", ["O14", "O15", "O16"], -10, 2, "aguilon", "Jeffry");
  await aplicar("Metarhizium anisopliae (control de salivazo)", ["N5", "N6", "N7", "N8"], -16, 1, "aguilon", "Jeffry", "Ninfas de salivazo en Mulato II");

  // Labores
  let nEv = 0;
  const evento = async (tipo, claves, d, datos = {}) => {
    const grupo = crypto.randomUUID();
    for (const clave of claves) {
      nEv++;
      await q(
        `insert into eventos (org_id, grupo_id, potrero_id, tipo, fecha, titulo, cantidad, unidad, costo, hecha, responsable, notas, creado_por)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [O, grupo, P[clave].id, tipo, fecha(d), datos.titulo ?? null, datos.cantidad ?? null, datos.unidad ?? null, datos.costo ?? null, datos.hecha ?? true, datos.responsable ?? null, datos.notas ?? null, uid],
      );
    }
  };
  await evento("siembra", ["O25"], -60, { titulo: "Resiembra con Cayman", cantidad: 5, unidad: "kg de semilla", costo: 185000, responsable: "Don Marvin" });
  await evento("chapia", ["O4", "O5", "O6"], -30, { titulo: "Chapia de repasto y charral", costo: 15000, responsable: "Jeffry" });
  await evento("chapia", ["N1", "N2"], -12, { titulo: "Chapia con motoguadaña", costo: 22000, responsable: "Jeffry" });
  await evento("cosecha", ["N7", "N8"], -40, { titulo: "Pacas del excedente de lluvias", cantidad: 85, unidad: "pacas", costo: 60000, notas: "Pacas de ~20 kg para el verano" });
  await evento("cercas", ["O11", "O12"], -18, { titulo: "Cambio de postes vivos (poró)", costo: 35000, responsable: "Don Marvin" });
  await evento("nota", ["N6"], -16, { titulo: "Salivazo", notas: "Ninfas en la base de las macollas; se aplicó Metarhizium." });
  await evento("tarea", ["O26"], 2, { titulo: "Reparar bebedero (flotador quebrado)", hecha: false, responsable: "Don Marvin" });
  await evento("tarea", ["O19", "O20"], 5, { titulo: "Chapia de bordes de cerca", hecha: false, responsable: "Jeffry" });
  await evento("tarea", ["N4"], 7, { titulo: "Revisar cerca eléctrica (pierde voltaje)", hecha: false });

  // Plan de pastoreo del ordeño: próximos 8 apartos de la rotación
  for (let i = 1; i <= 8; i++) {
    const clave = ROTACION_ORDENO[(DIAS_HISTORIA + i) % ROTACION_ORDENO.length];
    await q(`insert into plan_pastoreo (org_id, lote_id, potrero_id, orden, dias) values ($1,$2,$3,$4,1)`, [O, L.ordeno, P[clave].id, i]);
  }

  await c.query("commit");
  console.log(`Organización demo lista: /app/${SLUG}`);
  console.log(
    `  ${potreros.length} potreros (${areaPotreros.toFixed(1)} ha), ${zonas.length} zonas, ${lotesDef.length} lotes, ${nPast} pastoreos, ${nAforos} aforos, ${DIAS_HISTORIA + 1} días de lluvia, ${nApl} aplicaciones, ${nEv} labores`,
  );
  console.log(`  Aparto bloqueado por herbicida: ${P[bloqueado].nombre} (le toca al ordeño en 3 días)`);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await c.end();
}
