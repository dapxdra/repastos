/**
 * Membresías (suscripciones) por ganadería.
 *
 * Quien contrata y paga es la organización (ganadería), no cada usuario: el propietario la suscribe
 * y su equipo usa la cuenta. Aquí están los planes, sus límites y la regla de acceso según el estado.
 *
 * El cobro todavía no está conectado. Mientras `SUSCRIPCIONES_ACTIVAS` no sea "1" en el entorno,
 * no se aplica ningún bloqueo ni límite (todas las ganaderías funcionan como hoy). Al conectar la
 * pasarela (Tilopay, ONVO Pay, Stripe…), su webhook solo debe actualizar `plan`, `estado_suscripcion`,
 * `suscripcion_vence` y los ids del proveedor en `organizaciones`.
 */

export const PLANES = {
  prueba: { nombre: "Prueba gratuita", limites: { potreros: 300, fincas: 3, miembros: 5 } },
  basico: { nombre: "Básico", limites: { potreros: 60, fincas: 1, miembros: 3 } },
  profesional: { nombre: "Profesional", limites: { potreros: 300, fincas: 5, miembros: 10 } },
  empresa: { nombre: "Empresa", limites: { potreros: null, fincas: null, miembros: null } },
} as const satisfies Record<string, { nombre: string; limites: Record<Recurso, number | null> }>;

export type Plan = keyof typeof PLANES;
export const PLANES_IDS = Object.keys(PLANES) as [Plan, ...Plan[]];
export type Recurso = "potreros" | "fincas" | "miembros";

export const ESTADOS_SUSCRIPCION = {
  prueba: "En período de prueba",
  activa: "Activa",
  morosa: "Pago pendiente (período de gracia)",
  vencida: "Vencida",
  cancelada: "Cancelada",
} as const;
export type EstadoSuscripcion = keyof typeof ESTADOS_SUSCRIPCION;
export const ESTADOS_IDS = Object.keys(ESTADOS_SUSCRIPCION) as [EstadoSuscripcion, ...EstadoSuscripcion[]];

/** Días de prueba gratuita de una ganadería nueva. */
export const DIAS_PRUEBA = 30;
/** Cuántas ganaderías puede crear (como propietario) un mismo usuario: evita encadenar pruebas gratuitas. */
export const MAX_GANADERIAS_PROPIAS = 3;

export const suscripcionesActivas = () => process.env.SUSCRIPCIONES_ACTIVAS === "1";

type OrgSuscripcion = { plan: Plan; estadoSuscripcion: EstadoSuscripcion; pruebaHasta: string | null };

/** Estado efectivo: una prueba cuya fecha ya pasó cuenta como vencida. */
export function estadoEfectivo(org: OrgSuscripcion, hoy: string): EstadoSuscripcion {
  if (org.estadoSuscripcion === "prueba" && org.pruebaHasta && org.pruebaHasta < hoy) return "vencida";
  return org.estadoSuscripcion;
}

/**
 * ¿Puede la ganadería registrar cambios? Con la suscripción vencida o cancelada queda en solo lectura:
 * el equipo sigue viendo y exportando sus datos, pero no puede modificarlos.
 */
export function puedeEscribir(org: OrgSuscripcion, hoy: string) {
  if (!suscripcionesActivas()) return true;
  const e = estadoEfectivo(org, hoy);
  return e === "prueba" || e === "activa" || e === "morosa";
}

export function limite(plan: Plan, recurso: Recurso): number | null {
  if (!suscripcionesActivas()) return null;
  return PLANES[plan].limites[recurso];
}
