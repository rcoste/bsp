import "server-only";
import { sql } from "./db.ts";

/**
 * La bitácora de uso: qué hizo cada persona entre llegar y quedarse (o irse).
 *
 * Existe para el reporte de puertas (scripts/reporte-puertas.mjs): sin esto la
 * base sabe quién llegó y quién marcó, pero no en qué paso se cayó quien no
 * marcó nada — y eso es justo lo que hay que afinar.
 *
 * Es telemetría: NUNCA puede estorbarle a quien vino a usar la app. Todo
 * aquí se traga sus propios errores.
 */

/** Los nombres válidos. Cerrados a propósito: un nombre libre acaba en diez
 *  variantes del mismo evento y un reporte que no suma nada. */
export const NOMBRES_EVENTO = [
  /** Un mensaje al chat. datos.via: texto | chip | llegada | arranque */
  "mensaje",
  /** Una marca en la biblioteca. datos: animeId, marca, desde (parrilla | tarjeta | chat), quedo */
  "marca",
  /** Deshizo un descarte accidental. */
  "deshacer",
  /** Tocó una sugerencia del autocompletado. datos.animeId */
  "sugerencia",
  /** Abrió "mis guardados". */
  "guardados",
  /** Volvió a la parrilla a seguir marcando. */
  "volver_parrilla",
  /** Abrió la hoja de detalle de un anime. datos.animeId */
  "detalle",
] as const;

export type NombreEvento = (typeof NOMBRES_EVENTO)[number];

export function esNombreEvento(valor: unknown): valor is NombreEvento {
  return typeof valor === "string" && (NOMBRES_EVENTO as readonly string[]).includes(valor);
}

/** Un dato suelto no puede pesar más que esto; nadie necesita más para un reporte. */
const MAX_DATOS = 500;

/** Deja solo datos chicos y planos: nada de objetos anidados ni textos largos. */
export function limpiarDatos(datos: unknown): Record<string, string | number | boolean> {
  if (typeof datos !== "object" || datos === null) return {};
  const limpio: Record<string, string | number | boolean> = {};
  for (const [clave, valor] of Object.entries(datos as Record<string, unknown>)) {
    if (!/^[a-zA-Z_]{1,32}$/.test(clave)) continue;
    if (typeof valor === "string") limpio[clave] = valor.slice(0, 80);
    else if (typeof valor === "number" && Number.isFinite(valor)) limpio[clave] = valor;
    else if (typeof valor === "boolean") limpio[clave] = valor;
  }
  return JSON.stringify(limpio).length > MAX_DATOS ? {} : limpio;
}

/**
 * Anota un evento del dispositivo. El tiempo desde la llegada se calcula aquí,
 * contra perfiles.creado_en. Si el perfil no existe todavía (telemetría que
 * llegó antes que /api/llegada), no se anota: un evento sin persona no sirve.
 */
export async function registrarEvento(
  dispositivoId: string,
  nombre: NombreEvento,
  datos: unknown = {},
): Promise<void> {
  try {
    await sql`
      insert into eventos (perfil_id, nombre, datos, ms_desde_llegada)
      select id, ${nombre}, ${sql.json(limpiarDatos(datos))},
             floor(extract(epoch from (now() - creado_en)) * 1000)
        from perfiles where dispositivo_id = ${dispositivoId}
    `;
  } catch {
    // A propósito en silencio: perder un renglón de bitácora es molesto;
    // romperle la app a alguien por anotarlo, absurdo.
  }
}
