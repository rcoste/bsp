import type { Anime } from "./catalogo.ts";

/**
 * Qué título se le enseña a una persona. El principal del catálogo es el
 * romaji ("Kiseijuu: Sei no Kakuritsu"), que casi nadie reconoce; en una
 * parrilla de "¿cuál has visto?" un título que no se reconoce es una portada
 * que no se marca. Orden: el oficial en Latinoamérica, luego el inglés, luego
 * el romaji. El romaji sigue siendo la llave interna (AI, búsqueda, candado).
 */
export function nombreVisible(anime: Pick<Anime, "titulo" | "tituloEn" | "tituloEs">): string {
  // Algunos traen el romaji entre paréntesis al final ("Rascal does not Dream
  // of Bunny Girl Senpai (Seishun Buta Yarou wa…)"): sobra.
  const es = anime.tituloEs?.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return es || anime.tituloEn?.trim() || anime.titulo;
}

/** El romaji, debajo y chiquito, solo si es distinto de lo que se muestra. */
export function nombreOriginal(anime: Pick<Anime, "titulo" | "tituloEn" | "tituloEs">): string | null {
  const visible = nombreVisible(anime);
  return visible.toLowerCase() === anime.titulo.toLowerCase() ? null : anime.titulo;
}
