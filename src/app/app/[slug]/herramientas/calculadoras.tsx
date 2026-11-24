"use client";
import { useState } from "react";
import { Calculator, Fence, Leaf, Scissors, Sprout, Timer } from "lucide-react";
import { HA_POR_MZ, fechaCortaCR, formatColones, formatNum, sumarDias, type UnidadArea } from "@/lib/dominio";
import { PASTOS, PASTO_GENERICO, descansoPorHojas, diasPorHoja, parametrosPasto, temperaturaPorAltitud } from "@/lib/forraje";

type Defaults = {
  unidad: UnidadArea;
  hoy: string;
  altitud: number;
  pasto: string;
  cobertura: number;
  areaHa: number;
  cabezas: number;
  consumoAnimal: number;
  precioUreaSaco: number | null;
};

/** Valor inicial de un input numérico (punto decimal, sin separador de miles) */
const fijo = (x: number, n: number) => String(Number(x.toFixed(n)));
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x) && x >= 0);

function Entrada({ label, value, onChange, sufijo, hint, step = "any" }: { label: string; value: string; onChange: (v: string) => void; sufijo?: string; hint?: string; step?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <input className={`input ${sufijo ? "pr-16" : ""}`} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        {sufijo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{sufijo}</span>}
      </span>
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

function Resultado({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-primary-soft/50 p-3" aria-live="polite">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="num font-display text-lg font-bold leading-tight">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tarjeta({ titulo, icono: Icono, descripcion, children }: { titulo: string; icono: typeof Leaf; descripcion: string; children: React.ReactNode }) {
  return (
    <section className="card card-pad">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Icono className="size-[18px] text-primary" aria-hidden />
        {titulo}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted">{descripcion}</p>
      {children}
    </section>
  );
}

/** Etapa de hoja: hojas por rebrote según pasto, altitud y días de descanso. */
function EtapaHoja({ d }: { d: Defaults }) {
  const [pasto, setPasto] = useState(parametrosPasto(d.pasto).clave);
  const [altitud, setAltitud] = useState(String(d.altitud));
  const [dias, setDias] = useState("21");
  const p = [...PASTOS, PASTO_GENERICO].find((x) => x.clave === pasto)!;
  const alt = num(altitud);
  const di = num(dias);
  const valido = ok(alt, di);
  const dph = valido ? diasPorHoja(p, alt) : NaN;
  const hojas = valido ? di / dph : NaN;
  const faltan = valido ? Math.max(0, Math.ceil(p.hojasObjetivo * dph - di)) : NaN;
  return (
    <Tarjeta titulo="Etapa de hoja" icono={Leaf} descripcion="Cuántas hojas lleva el rebrote y cuándo estará en su punto. Pastorear por hojas evita entrar tierno o pasado.">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="label">Pasto</span>
          <select className="input" value={pasto} onChange={(e) => setPasto(e.target.value)}>
            {[...PASTOS, PASTO_GENERICO].map((x) => <option key={x.clave} value={x.clave}>{x.label}</option>)}
          </select>
        </label>
        <Entrada label="Altitud" value={altitud} onChange={setAltitud} sufijo="msnm" step="50" />
        <Entrada label="Días desde el último pastoreo" value={dias} onChange={setDias} sufijo="días" step="1" />
      </div>
      {valido && Number.isFinite(dph) ? (
        <Resultado
          items={[
            ["Hojas por rebrote", `${formatNum(hojas, 1)} de ${p.hojasObjetivo}`],
            ["Días por hoja", formatNum(dph, 1)],
            ["Descanso ideal", `${descansoPorHojas(p, alt)} días`],
            [faltan > 0 ? "Pastorear en" : "Estado", faltan > 0 ? `${faltan} d (${fechaCortaCR(sumarDias(d.hoy, faltan))})` : hojas > p.hojasObjetivo * 1.35 ? "Pasado" : "En su punto"],
          ]}
        />
      ) : (
        <p className="mt-4 text-sm text-warning">A esa altitud este pasto casi no crece (temperatura ~{formatNum(temperaturaPorAltitud(alt), 0)} °C).</p>
      )}
      <p className="hint mt-2">Temperatura estimada por altitud: {formatNum(temperaturaPorAltitud(alt || 0), 1)} °C. Referencias para CR; el rebrote real cambia con la fertilidad y el agua.</p>
    </Tarjeta>
  );
}

/** Respuesta al nitrógeno: kg MS extra por kg N y costo frente al concentrado. */
function RespuestaN({ d }: { d: Defaults }) {
  const u = d.unidad;
  const [dosis, setDosis] = useState(u === "mz" ? "70" : "100");
  const [pctN, setPctN] = useState("46");
  const [saco, setSaco] = useState(d.precioUreaSaco ? String(Math.round(d.precioUreaSaco)) : "24000");
  const [epoca, setEpoca] = useState<"lluvias" | "transicion" | "seca">("lluvias");
  const [concentrado, setConcentrado] = useState("15000");
  const respuesta = { lluvias: 20, transicion: 12, seca: 5 }[epoca];
  const dosisHa = u === "mz" ? num(dosis) / HA_POR_MZ : num(dosis);
  const kgN = (dosisHa * num(pctN)) / 100;
  const extra = kgN * respuesta;
  const costoHa = (dosisHa / 45) * num(saco);
  const costoKgMs = extra > 0 ? costoHa / extra : NaN;
  const costoConc = num(concentrado) / (46 * 0.88);
  const valido = ok(dosisHa, num(pctN), num(saco), num(concentrado));
  return (
    <Tarjeta titulo="Respuesta al nitrógeno" icono={Sprout} descripcion="Cuánto pasto extra produce el abono nitrogenado y si sale más barato que el concentrado.">
      <div className="grid grid-cols-2 gap-3">
        <Entrada label={`Dosis de abono por ${u}`} value={dosis} onChange={setDosis} sufijo="kg" />
        <Entrada label="Nitrógeno del abono" value={pctN} onChange={setPctN} sufijo="% N" hint="Urea 46, nitrato 33,5, sulfato 21" />
        <Entrada label="Precio del saco de 45 kg" value={saco} onChange={setSaco} sufijo="₡" step="100" />
        <label className="block">
          <span className="label">Época</span>
          <select className="input" value={epoca} onChange={(e) => setEpoca(e.target.value as typeof epoca)}>
            <option value="lluvias">Lluvias (20 kg MS/kg N)</option>
            <option value="transicion">Transición (12 kg MS/kg N)</option>
            <option value="seca">Verano sin riego (5 kg MS/kg N)</option>
          </select>
        </label>
        <Entrada label="Saco de concentrado (46 kg)" value={concentrado} onChange={setConcentrado} sufijo="₡" step="100" hint="Para comparar el costo por kg MS" />
      </div>
      {valido && (
        <Resultado
          items={[
            [`N aplicado por ${u}`, `${formatNum(u === "mz" ? kgN * HA_POR_MZ : kgN, 0)} kg`],
            [`Pasto extra por ${u}`, `${formatNum(u === "mz" ? extra * HA_POR_MZ : extra, 0)} kg MS`],
            ["Costo del kg MS extra", formatColones(costoKgMs)],
            ["Concentrado por kg MS", formatColones(costoConc)],
          ]}
        />
      )}
      {valido && Number.isFinite(costoKgMs) && (
        <p className={`mt-2 text-sm font-medium ${costoKgMs < costoConc ? "text-primary" : "text-warning"}`}>
          {costoKgMs < costoConc
            ? `El pasto abonado sale ${formatNum(costoConc / costoKgMs, 1)} veces más barato que el concentrado. La respuesta se ve en 3 a 4 semanas.`
            : "En esta época el abono no compite con el concentrado: espera las lluvias o riega."}
        </p>
      )}
    </Tarjeta>
  );
}

/** Franjas diarias con cerca eléctrica dentro de un potrero. */
function Franjas({ d }: { d: Defaults }) {
  const u = d.unidad;
  const [cabezas, setCabezas] = useState(String(d.cabezas || 40));
  const [consumo, setConsumo] = useState(fijo(d.consumoAnimal || 13, 1));
  const [cobertura, setCobertura] = useState(String(Math.round(d.cobertura || 2800)));
  const [residuo, setResiduo] = useState("1500");
  const [area, setArea] = useState(fijo(u === "mz" ? (d.areaHa || 1) / HA_POR_MZ : d.areaHa || 1, 2));
  const [ancho, setAncho] = useState("100");
  const [franjasDia, setFranjasDia] = useState("2");
  const areaHa = u === "mz" ? num(area) * HA_POR_MZ : num(area);
  const demanda = num(cabezas) * num(consumo);
  const cosechable = (num(cobertura) - num(residuo)) * 0.85;
  const valido = ok(areaHa, demanda, num(ancho), num(franjasDia)) && cosechable > 0 && num(franjasDia) >= 1;
  const m2Dia = valido ? (demanda / cosechable) * 10_000 : NaN;
  const m2Franja = m2Dia / num(franjasDia);
  const avance = m2Franja / num(ancho);
  const dias = (areaHa * 10_000) / m2Dia;
  return (
    <Tarjeta titulo="Franjas con cerca eléctrica" icono={Fence} descripcion="Área que necesita el lote cada día y cuánto correr la cerca en cada cambio (franjas en la mañana y la tarde).">
      <div className="grid grid-cols-2 gap-3">
        <Entrada label="Animales" value={cabezas} onChange={setCabezas} step="1" />
        <Entrada label="Pasto por animal" value={consumo} onChange={setConsumo} sufijo="kg MS/d" hint="Lo que come de pasto, ya descontado lo que reemplaza el suplemento" />
        <Entrada label="Cobertura de entrada" value={cobertura} onChange={setCobertura} sufijo="kg MS/ha" step="50" />
        <Entrada label="Residuo objetivo" value={residuo} onChange={setResiduo} sufijo="kg MS/ha" step="50" />
        <Entrada label="Área del potrero" value={area} onChange={setArea} sufijo={u} />
        <Entrada label="Ancho del potrero" value={ancho} onChange={setAncho} sufijo="m" step="1" />
        <Entrada label="Cambios de franja por día" value={franjasDia} onChange={setFranjasDia} step="1" hint="2 = después de cada ordeño" />
      </div>
      {valido ? (
        <Resultado
          items={[
            ["Área por día", `${formatNum(m2Dia, 0)} m²`],
            ["Área por franja", `${formatNum(m2Franja, 0)} m²`],
            ["Correr la cerca", `${formatNum(avance, 1)} m por franja`],
            ["Días en el potrero", formatNum(dias, 1)],
          ]}
        />
      ) : (
        <p className="mt-4 text-sm text-muted">La cobertura de entrada debe ser mayor que el residuo.</p>
      )}
    </Tarjeta>
  );
}

const CULTIVOS = [
  { label: "King grass / Camerún (corta)", tMsHa: 7, ms: 18, rebrote: 60 },
  { label: "Maralfalfa", tMsHa: 7.5, ms: 17, rebrote: 55 },
  { label: "Caña de azúcar", tMsHa: 25, ms: 28, rebrote: 365 },
  { label: "Maíz para ensilaje", tMsHa: 14, ms: 32, rebrote: 0 },
  { label: "Sorgo forrajero", tMsHa: 10, ms: 28, rebrote: 70 },
  { label: "Botón de oro / morera (arbustivas)", tMsHa: 3, ms: 22, rebrote: 70 },
];

/** Banco forrajero o cultivo de corta: área a cortar por día y si alcanza para la rotación. */
function BancoForrajero({ d }: { d: Defaults }) {
  const u = d.unidad;
  const [cultivo, setCultivo] = useState(0);
  const c = CULTIVOS[cultivo];
  const [rend, setRend] = useState(String(c.tMsHa));
  const [ms, setMs] = useState(String(c.ms));
  const [rebrote, setRebrote] = useState(String(c.rebrote));
  const [cabezas, setCabezas] = useState(String(d.cabezas || 40));
  const [kgAnimal, setKgAnimal] = useState("3");
  const [area, setArea] = useState("1");
  const elegir = (i: number) => {
    setCultivo(i);
    setRend(String(CULTIVOS[i].tMsHa));
    setMs(String(CULTIVOS[i].ms));
    setRebrote(String(CULTIVOS[i].rebrote));
  };
  const areaHa = u === "mz" ? num(area) * HA_POR_MZ : num(area);
  const kgMsDia = num(cabezas) * num(kgAnimal);
  const kgVerdeDia = kgMsDia / (num(ms) / 100);
  const m2Dia = (kgMsDia / (num(rend) * 1000)) * 10_000;
  const diasArea = (areaHa * 10_000) / m2Dia;
  const valido = ok(areaHa, kgMsDia, num(ms), num(rend), num(rebrote)) && num(rend) > 0 && num(ms) > 0 && kgMsDia > 0;
  const necesaria = num(rebrote) > 0 ? (m2Dia * num(rebrote)) / 10_000 : null;
  return (
    <Tarjeta titulo="Banco forrajero y cultivos de corta" icono={Scissors} descripcion="Cuánto cortar por día del banco forrajero, cuánto dura y si el área alcanza para cortar en rotación continua.">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="label">Cultivo</span>
          <select className="input" value={cultivo} onChange={(e) => elegir(Number(e.target.value))}>
            {CULTIVOS.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}
          </select>
        </label>
        <Entrada label="Rendimiento por corte" value={rend} onChange={setRend} sufijo="t MS/ha" />
        <Entrada label="Materia seca" value={ms} onChange={setMs} sufijo="%" />
        <Entrada label="Días de rebrote" value={rebrote} onChange={setRebrote} sufijo="días" step="1" hint="0 si es una sola cosecha" />
        <Entrada label={`Área sembrada`} value={area} onChange={setArea} sufijo={u} />
        <Entrada label="Animales" value={cabezas} onChange={setCabezas} step="1" />
        <Entrada label="Por animal y día" value={kgAnimal} onChange={setKgAnimal} sufijo="kg MS" />
      </div>
      {valido && (
        <Resultado
          items={[
            ["Material verde por día", `${formatNum(kgVerdeDia, 0)} kg`],
            ["Cortar por día", `${formatNum(m2Dia, 0)} m²`],
            ["El área alcanza para", `${formatNum(diasArea, 0)} días`],
            [necesaria != null ? `Área para corte continuo` : "Ensilaje total", necesaria != null ? `${formatNum(u === "mz" ? necesaria / HA_POR_MZ : necesaria, 2)} ${u}` : `${formatNum((areaHa * num(rend)) / (num(ms) / 100), 0)} t verdes`],
          ]}
        />
      )}
      {valido && necesaria != null && (
        <p className={`mt-2 text-sm font-medium ${necesaria <= areaHa ? "text-primary" : "text-warning"}`}>
          {necesaria <= areaHa ? "El área alcanza: cuando termines de cortar, el primer sector ya rebrotó." : "El área no alcanza para cortar en rotación: siembra más o baja la ración."}
        </p>
      )}
    </Tarjeta>
  );
}

/** Días de pastoreo que quedan con el forraje en pie. */
function DiasDisponibles({ d }: { d: Defaults }) {
  const u = d.unidad;
  const [area, setArea] = useState(fijo(u === "mz" ? d.areaHa / HA_POR_MZ : d.areaHa, 1));
  const [cobertura, setCobertura] = useState(String(Math.round(d.cobertura || 2200)));
  const [residuo, setResiduo] = useState("1500");
  const [cabezas, setCabezas] = useState(String(d.cabezas || 40));
  const [consumo, setConsumo] = useState(fijo(d.consumoAnimal || 12, 1));
  const areaHa = u === "mz" ? num(area) * HA_POR_MZ : num(area);
  const stock = Math.max(0, num(cobertura) - num(residuo)) * 0.85 * areaHa;
  const demanda = num(cabezas) * num(consumo);
  const valido = ok(areaHa, stock, demanda) && demanda > 0;
  return (
    <Tarjeta titulo="Días de pastoreo disponibles" icono={Timer} descripcion="Con el forraje que hay hoy sobre el residuo, cuántos días aguanta el hato sin contar el rebrote.">
      <div className="grid grid-cols-2 gap-3">
        <Entrada label="Área de pastoreo" value={area} onChange={setArea} sufijo={u} />
        <Entrada label="Cobertura promedio" value={cobertura} onChange={setCobertura} sufijo="kg MS/ha" step="50" />
        <Entrada label="Residuo" value={residuo} onChange={setResiduo} sufijo="kg MS/ha" step="50" />
        <Entrada label="Animales" value={cabezas} onChange={setCabezas} step="1" />
        <Entrada label="Pasto por animal" value={consumo} onChange={setConsumo} sufijo="kg MS/d" />
      </div>
      {valido && (
        <Resultado
          items={[
            ["Forraje cosechable", `${formatNum(stock / 1000, 1)} t MS`],
            ["Demanda diaria", `${formatNum(demanda, 0)} kg MS`],
            ["Días disponibles", formatNum(stock / demanda, 0)],
            ["Carga posible 30 d", `${formatNum(stock / 30 / num(consumo), 0)} animales`],
          ]}
        />
      )}
    </Tarjeta>
  );
}

export function Calculadoras({ defaults }: { defaults: Defaults }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <EtapaHoja d={defaults} />
      <Franjas d={defaults} />
      <RespuestaN d={defaults} />
      <BancoForrajero d={defaults} />
      <DiasDisponibles d={defaults} />
      <section className="card card-pad flex flex-col justify-center text-sm text-muted">
        <Calculator className="mb-2 size-6 text-primary" aria-hidden />
        Los valores iniciales salen de tu ganadería: cobertura promedio estimada, área pastoreable, animales y consumo de tus lotes. Cámbialos para probar otros escenarios; nada se guarda.
      </section>
    </div>
  );
}
