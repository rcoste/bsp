import "server-only";
import { sql } from "../db.ts";
import { datosDeTarjeta, type Anime } from "./catalogo.ts";

/**
 * Los animes del arranque de gusto: portadas que el usuario toca para decir
 * qué ya vio, sin escribir una palabra.
 *
 * Vienen del catálogo local (precargado), no de una llamada en vivo: esta es
 * la primera pantalla que alguien ve y no puede depender de que un servicio
 * externo responda. Ver docs/plans/arquitectura.md §7.
 *
 * LA MEZCLA ES EL PUNTO, no un detalle de presentación. La parrilla tiene que
 * calibrar si habla con un novato o con un veterano, y esa señal sale de
 * mezclar títulos obvios con títulos de nicho: si todas las portadas son de
 * las cinco series famosas, un otaku las toca todas y no aprendimos nada.
 * Ver docs/designs/alcance-v1-para-diseno.md §3, módulo 1.
 */

/** Series y películas nada más: nadie reconoce un OVA por su portada. */
const TIPOS = ["tv", "movie"];

export async function paraArranque(limite = 12): Promise<Anime[]> {
  const conocidos = Math.ceil(limite / 2);

  // Los muy conocidos salen de los 40 más vistos; los de nicho, de los
  // puestos 40 a 400 — populares de verdad, pero no de los que todo el mundo
  // ha visto. Se barajan en cada visita para que la parrilla no sea siempre
  // la misma.
  const filas = await sql<{ datos: Anime }[]>`
    (
      select datos from (
        select datos from catalogo_cache
         where expira_en > now()
           and datos->>'portada' is not null
           and datos->>'tipo' = any(${TIPOS})
         order by (datos->>'miembros')::bigint desc
         limit 40
      ) top order by random() limit ${conocidos}
    )
    union all
    (
      select datos from (
        select datos from catalogo_cache
         where expira_en > now()
           and datos->>'portada' is not null
           and datos->>'tipo' = any(${TIPOS})
         order by (datos->>'miembros')::bigint desc
         limit 400 offset 40
      ) medio order by random() limit ${limite - conocidos}
    )
  `;

  // Barajado final: si no, los conocidos salen todos arriba y la parrilla se
  // lee como "famosos primero, relleno después".
  const mezclados = filas.map((f) => datosDeTarjeta(f.datos));
  for (let i = mezclados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [mezclados[i], mezclados[j]] = [mezclados[j], mezclados[i]];
  }
  return mezclados;
}
