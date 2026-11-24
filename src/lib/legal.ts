/**
 * Datos del responsable del servicio que aparecen en los Términos y la Política de Privacidad.
 *
 * ⚠ Completa los valores entre corchetes antes de cobrar membresías y haz revisar ambos textos por un
 * abogado en Costa Rica. Al cambiar el contenido de los documentos, sube VERSION_LEGAL: las ganaderías
 * guardan la versión que aceptaron (organizaciones.terminos_version).
 */
export const VERSION_LEGAL = "2026-11-24";
export const FECHA_VIGENCIA = "24 de noviembre de 2026";

export const RESPONSABLE = {
  /** Persona física o jurídica que presta el servicio y cobra las membresías. */
  razonSocial: "[Razón social o nombre del titular]",
  cedula: "[Cédula física o jurídica]",
  domicilio: "[Dirección], Costa Rica",
  correoContacto: "[correo de contacto]",
  correoPrivacidad: "[correo para asuntos de privacidad]",
} as const;
