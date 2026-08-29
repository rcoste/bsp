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
    { titulo: string; estado: string; episodio: number | null; calificacion: string | null }[]
  >`
    select c.datos->>'titulo' as titulo, l.estado, l.episodio, l.calificacion
      from listas l
      join catalogo_cache c on c.anime_id = l.anime_id
     where l.perfil_id = ${perfil.id}
     order by l.actualizado_en desc
     limit 40
  `;

  if (!filas.length) return "";

  const conNota = (f: { titulo: string; calificacion: string | null }) =>
    f.calificacion
      ? `${f.titulo} (${CALIFICACIONES[f.calificacion] ?? f.calificacion})`
      : f.titulo;
  const conEpisodio = (f: { titulo: string; episodio: number | null }) =>
    f.episodio ? `${f.titulo} (va en el ep. ${f.episodio})` : f.titulo;

  const de = (estado: string) => filas.filter((f) => f.estado === estado);

  const partes: string[] = [];
  const viendo = de("viendo");
  if (viendo.length) partes.push(`Está viendo AHORA: ${viendo.map(conEpisodio).join(", ")}.`);
  const vistos = de("visto");
  if (vistos.length) partes.push(`Ya vio: ${vistos.map(conNota).join(", ")}.`);
  const quiereVer = de("quiero_ver");
  if (quiereVer.length) partes.push(`En su lista para después: ${quiereVer.map((f) => f.titulo).join(", ")}.`);
  // Abandonar es una señal riquísima: la empezó y no la sostuvo. Más útil que
  // un rechazo, porque aquí sí sabemos que le dio una oportunidad real.
  const dejadas = de("abandonada");
  if (dejadas.length) {
    partes.push(
      `Empezó y DEJÓ de ver: ${dejadas
        .map((f) => conNota({ titulo: conEpisodio(f), calificacion: f.calificacion }))
        .join(", ")}. Evita recomendarle cosas demasiado parecidas a estas.`,
    );
  }
  // El rechazo es la señal más rápida del gusto, pero también la más fácil de
  // malinterpretar: que no quiera VER algo no significa que odie el género.
  const descartados = de("descartado");
  if (descartados.length) {
    partes.push(
      `Le ofrecimos esto y dijo que no: ${descartados.map((f) => f.titulo).join(", ")}. ` +
        "No sabemos por qué; no supongas que rechaza el género entero.",
    );
  }
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
