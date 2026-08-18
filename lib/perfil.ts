import "server-only";
import { sql } from "./db.ts";

/**
 * El gusto de una persona, en el texto que lee la AI.
 *
 * Viaja como mensaje, después del punto de caché — nunca dentro de las
 * instrucciones del sistema. Ver docs/plans/arquitectura.md §2.
 */

const CALIFICACIONES: Record<string, string> = {
  me_encanto: "le encantó",
  estuvo_bien: "estuvo bien",
  no_fue_lo_mio: "no fue lo suyo",
};

/** Devuelve el perfil, creándolo si es la primera visita de este dispositivo. */
export async function perfilDe(dispositivoId: string): Promise<string> {
  const [perfil] = await sql<{ id: string }[]>`
    insert into perfiles (dispositivo_id) values (${dispositivoId})
    on conflict (dispositivo_id) do update set actualizado_en = now()
    returning id
  `;

  const filas = await sql<
    { titulo: string; estado: string; calificacion: string | null }[]
  >`
    select c.datos->>'titulo' as titulo, l.estado, l.calificacion
      from listas l
      join catalogo_cache c on c.anime_id = l.anime_id
     where l.perfil_id = ${perfil.id}
     order by l.creado_en desc
     limit 20
  `;

  if (!filas.length) return "";

  const vistos = filas
    .filter((f) => f.estado === "visto")
    .map((f) =>
      f.calificacion
        ? `${f.titulo} (${CALIFICACIONES[f.calificacion] ?? f.calificacion})`
        : f.titulo,
    );
  const quiereVer = filas.filter((f) => f.estado === "quiero_ver").map((f) => f.titulo);

  const partes: string[] = [];
  if (vistos.length) partes.push(`Ya vio: ${vistos.join(", ")}.`);
  if (quiereVer.length) partes.push(`En su lista para después: ${quiereVer.join(", ")}.`);
  partes.push("No le repitas nada de esta lista.");
  return partes.join("\n");
}

/** El id interno del perfil, para escribir en su lista. */
export async function idDePerfil(dispositivoId: string): Promise<string> {
  const [perfil] = await sql<{ id: string }[]>`
    insert into perfiles (dispositivo_id) values (${dispositivoId})
    on conflict (dispositivo_id) do update set actualizado_en = now()
    returning id
  `;
  return perfil.id;
}
