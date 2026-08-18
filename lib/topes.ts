import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "./db.ts";

/**
 * Los candados de gasto. Ver docs/plans/arquitectura.md §6.
 *
 * El de 20 mensajes es el que el usuario ve; se evade en incógnito. El de la
 * dirección de internet es el que de verdad protege el presupuesto.
 */

export const TOPE_DISPOSITIVO = 20;
const TOPE_IP = 300;

export type Veredicto =
  | { permitido: true; usados: number }
  | { permitido: false; motivo: "dispositivo" | "ip" };

/** El inicio de la ventana de 24 horas. Una "visita" no existe del lado del
 *  servidor; una ventana de tiempo sí. */
function ventana(horas: number): Date {
  const ms = horas * 60 * 60 * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms);
}

/**
 * La huella de la dirección de internet.
 *
 * HMAC y no un hash simple: el espacio de direcciones es tan chico que un hash
 * sin secreto se revierte por fuerza bruta en minutos.
 */
function huella(ip: string): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) throw new Error("Falta SESSION_SECRET");
  return createHmac("sha256", secreto).update(ip).digest("base64url").slice(0, 32);
}

/**
 * Lee la dirección de una cabecera que el visitante NO puede falsificar.
 *
 * `x-forwarded-for` es la común y la equivocada: cualquiera antepone una
 * dirección inventada en cada petición y el candado deja de existir.
 * `x-vercel-forwarded-for` la pone Vercel.
 */
export function direccionReal(cabeceras: Headers): string | null {
  const v = cabeceras.get("x-vercel-forwarded-for");
  return v ? v.split(",")[0].trim() : null;
}

/**
 * Suma uno a los contadores y dice si se puede seguir.
 *
 * Los incrementos son atómicos (una sola operación que suma y devuelve): dos
 * peticiones simultáneas con el patrón ingenuo de leer-y-luego-escribir pierden
 * cuentas, que es justo el caso que el candado quiere frenar.
 */
export async function cobrarMensaje(
  dispositivoId: string,
  ip: string | null,
): Promise<Veredicto> {
  const [{ incrementar_uso: usados }] = await sql<{ incrementar_uso: number }[]>`
    select incrementar_uso(${dispositivoId}, 'dispositivo', ${ventana(24)})
  `;
  if (usados > TOPE_DISPOSITIVO) return { permitido: false, motivo: "dispositivo" };

  if (ip) {
    const [{ incrementar_uso: porIp }] = await sql<{ incrementar_uso: number }[]>`
      select incrementar_uso(${huella(ip)}, 'ip', ${ventana(1)})
    `;
    if (porIp > TOPE_IP) return { permitido: false, motivo: "ip" };
  }

  return { permitido: true, usados };
}
