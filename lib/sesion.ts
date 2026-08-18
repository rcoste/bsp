import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * El identificador del dispositivo: una cookie firmada por el servidor.
 *
 * NO se guarda en el almacenamiento del navegador. Ahí lo puede leer cualquier
 * script, y quien consiga el identificador de otra persona puede leer su lista.
 * Firmada + inaccesible para scripts es lo que decidió arquitectura.md §5.
 */

const NOMBRE = "bsp_id";
const UN_ANIO = 60 * 60 * 24 * 365;

function firmar(valor: string): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error("Falta SESSION_SECRET");
  return createHmac("sha256", secreto).update(valor).digest("base64url");
}

/** Compara sin filtrar información por el tiempo que tarda. */
function iguales(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Devuelve el id si la cookie viene firmada por nosotros, o null. */
export function leerDispositivo(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const corte = cookie.lastIndexOf(".");
  if (corte < 1) return null;
  const id = cookie.slice(0, corte);
  const firma = cookie.slice(corte + 1);
  try {
    return iguales(firma, firmar(id)) ? id : null;
  } catch {
    return null;
  }
}

/** Crea un identificador nuevo y la cabecera que lo deja puesto. */
export function nuevoDispositivo(): { id: string; cookie: string } {
  const id = randomUUID();
  const valor = `${id}.${firmar(id)}`;
  const seguro = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    id,
    // SameSite=Lax y no Strict: la app se comparte por WhatsApp, y con Strict
    // la cookie no viaja en la primera visita que llega desde ese enlace.
    cookie: `${NOMBRE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${UN_ANIO}${seguro}`,
  };
}

export const NOMBRE_COOKIE = NOMBRE;
