import "server-only";
import { sql } from "./db.ts";
import { idDePerfil } from "./perfil.ts";

/**
 * La lista personal: lo que alguien marcó desde las tarjetas.
 *
 * Es lo que llena el perfil que lee la AI (lib/perfil.ts). Sin esto la memoria
 * del gusto —la razón de ser del producto frente a ChatGPT— está vacía.
 */

/** Lo que se puede marcar. "descartado" es el tercer botón: rechazar enseña. */
export const MARCAS = ["visto", "quiero_ver", "descartado"] as const;
export type Marca = (typeof MARCAS)[number];

export function esMarca(valor: unknown): valor is Marca {
  return typeof valor === "string" && (MARCAS as readonly string[]).includes(valor);
}

/**
 * Marca un anime. Volver a tocar la misma marca la quita (es un interruptor:
 * marcar sin poder desmarcar convierte un toque de más en un error permanente).
 * Devuelve la marca que quedó, o null si se quitó.
 */
export async function marcar(
  dispositivoId: string,
  animeId: number,
  marca: Marca,
): Promise<Marca | null> {
  const perfilId = await idDePerfil(dispositivoId);

  const [actual] = await sql<{ estado: Marca }[]>`
    select estado from listas where perfil_id = ${perfilId} and anime_id = ${animeId}
  `;

  if (actual?.estado === marca) {
    await sql`delete from listas where perfil_id = ${perfilId} and anime_id = ${animeId}`;
    return null;
  }

  await sql`
    insert into listas (perfil_id, anime_id, estado)
    values (${perfilId}, ${animeId}, ${marca})
    on conflict (perfil_id, anime_id) do update set estado = excluded.estado
  `;
  return marca;
}

/** Lo ya marcado por este dispositivo: {id del anime → marca}. */
export async function marcasDe(
  dispositivoId: string,
): Promise<Record<number, Marca>> {
  const perfilId = await idDePerfil(dispositivoId);
  const filas = await sql<{ anime_id: number; estado: Marca }[]>`
    select anime_id, estado from listas where perfil_id = ${perfilId}
  `;
  return Object.fromEntries(filas.map((f) => [f.anime_id, f.estado]));
}
