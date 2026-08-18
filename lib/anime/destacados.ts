import "server-only";
import { sql } from "../db.ts";
import type { Anime } from "./catalogo.ts";

/**
 * Los animes del arranque de gusto: portadas muy conocidas que el usuario
 * toca para decir qué ya vio, sin escribir una palabra.
 *
 * Vienen del catálogo local (precargado), no de una llamada en vivo: esta es
 * la primera pantalla que alguien ve y no puede depender de que un servicio
 * externo responda. Ver docs/plans/arquitectura.md §7.
 */
export async function paraArranque(limite = 12): Promise<Anime[]> {
  const filas = await sql<{ datos: Anime }[]>`
    select datos from catalogo_cache
     where expira_en > now()
       and datos->>'portada' is not null
     order by anime_id
     limit ${limite}
  `;
  return filas.map((f) => ({
    id: f.datos.id,
    titulo: f.datos.titulo,
    tituloEn: f.datos.tituloEn,
    anio: f.datos.anio,
    estado: f.datos.estado,
    portada: f.datos.portada,
  }));
}
