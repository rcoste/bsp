import "server-only";
import { sql } from "./db.ts";
import { idDePerfil } from "./perfil.ts";

/**
 * La biblioteca personal: estados, progreso y calificación.
 *
 * Es lo que llena el perfil que lee la AI (lib/perfil.ts), y en producción
 * del producto original resultó ser EL factor de retención: quien arma ~20
 * títulos el día uno vuelve 46%; quien arma 1-2, vuelve 6%.
 *
 * Estado y calificación son EJES DISTINTOS, no una sola lista de opciones:
 * "¿en qué punto estás?" (quiero_ver / viendo / visto / abandonada /
 * descartado) y "¿qué te pareció?" (no_fue_lo_mio / estuvo_bien /
 * me_encanto). Fusionarlos impediría expresar "la vi Y me encantó".
 */

export const MARCAS = [
  "quiero_ver",
  "viendo",
  "visto",
  "abandonada",
  "descartado", // el botón "No, otra cosa": ni me la ofrezcas
] as const;
export type Marca = (typeof MARCAS)[number];

export const CALIFICACIONES = [
  "no_fue_lo_mio",
  "estuvo_bien",
  "me_encanto",
] as const;
export type Calificacion = (typeof CALIFICACIONES)[number];

export function esMarca(valor: unknown): valor is Marca {
  return typeof valor === "string" && (MARCAS as readonly string[]).includes(valor);
}

export function esCalificacion(valor: unknown): valor is Calificacion {
  return (
    typeof valor === "string" &&
    (CALIFICACIONES as readonly string[]).includes(valor)
  );
}

/** Lo que la pantalla necesita saber de cada anime marcado. */
export type Entrada = {
  marca: Marca;
  episodio: number | null;
  calificacion: Calificacion | null;
};

/**
 * Marca un anime. Volver a tocar la misma marca la quita (es un interruptor:
 * marcar sin poder desmarcar convierte un toque de más en un error
 * permanente). Devuelve la entrada que quedó, o null si se quitó.
 *
 * `episodio` solo acompaña a viendo/abandonada; `calificacion` solo a
 * visto/abandonada. Fuera de ahí se ignoran en silencio — la base no debe
 * acabar diciendo "quiero verla, voy en el 8".
 */
export async function marcar(
  dispositivoId: string,
  animeId: number,
  marca: Marca,
  extras?: { episodio?: number | null; calificacion?: Calificacion | null },
): Promise<Entrada | null> {
  const perfilId = await idDePerfil(dispositivoId);

  const episodio =
    (marca === "viendo" || marca === "abandonada") &&
    typeof extras?.episodio === "number" &&
    extras.episodio >= 0
      ? Math.floor(extras.episodio)
      : null;
  const calificacion =
    (marca === "visto" || marca === "abandonada") && extras?.calificacion
      ? extras.calificacion
      : null;

  const [actual] = await sql<{ estado: Marca }[]>`
    select estado from listas where perfil_id = ${perfilId} and anime_id = ${animeId}
  `;

  // El interruptor solo aplica al toque PELÓN sobre la misma marca. Si viene
  // con datos nuevos (otro episodio, una calificación) es una actualización,
  // no un des-toque: "voy en el 9" después de "voy en el 8" no borra la fila.
  if (actual?.estado === marca && episodio === null && calificacion === null) {
    await sql`delete from listas where perfil_id = ${perfilId} and anime_id = ${animeId}`;
    return null;
  }

  const [fila] = await sql<
    { estado: Marca; episodio: number | null; calificacion: Calificacion | null }[]
  >`
    insert into listas (perfil_id, anime_id, estado, episodio, calificacion)
    values (${perfilId}, ${animeId}, ${marca}, ${episodio}, ${calificacion})
    on conflict (perfil_id, anime_id) do update set
      estado = excluded.estado,
      -- Cambiar de estado sin decir episodio no debe borrar el avance: si
      -- pasas de "viendo (ep 8)" a "abandonada", el 8 es justo el dato bueno.
      episodio = coalesce(excluded.episodio, listas.episodio),
      calificacion = coalesce(excluded.calificacion, listas.calificacion),
      actualizado_en = now()
    returning estado, episodio, calificacion
  `;
  return { marca: fila.estado, episodio: fila.episodio, calificacion: fila.calificacion };
}

/** Califica un anime ya visto/abandonado sin tocar su estado. */
export async function calificar(
  dispositivoId: string,
  animeId: number,
  calificacion: Calificacion,
): Promise<void> {
  const perfilId = await idDePerfil(dispositivoId);
  await sql`
    update listas set calificacion = ${calificacion}, actualizado_en = now()
     where perfil_id = ${perfilId} and anime_id = ${animeId}
       and estado in ('visto', 'abandonada')
  `;
}

/** Lo ya marcado por este dispositivo: {id del anime → entrada}. */
export async function marcasDe(
  dispositivoId: string,
): Promise<Record<number, Entrada>> {
  const perfilId = await idDePerfil(dispositivoId);
  const filas = await sql<
    { anime_id: number; estado: Marca; episodio: number | null; calificacion: Calificacion | null }[]
  >`
    select anime_id, estado, episodio, calificacion
      from listas where perfil_id = ${perfilId}
  `;
  return Object.fromEntries(
    filas.map((f) => [
      f.anime_id,
      { marca: f.estado, episodio: f.episodio, calificacion: f.calificacion },
    ]),
  );
}
