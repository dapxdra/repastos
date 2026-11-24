"use client";
import { useEffect } from "react";

/** Registra /sw.js (solo en producción: en desarrollo la caché estorbaría los cambios). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** Borra lo guardado en el teléfono (páginas en caché y registros de campo) al cerrar sesión. */
export async function limpiarDatosLocales() {
  try {
    navigator.serviceWorker?.controller?.postMessage("limpiar");
    if ("caches" in window) for (const k of await caches.keys()) await caches.delete(k);
    for (const k of Object.keys(localStorage)) if (k.startsWith("repastos:recorrido:")) localStorage.removeItem(k);
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar
  }
}
