import type { Anime, Donde } from "./catalogo.ts";
import { nombreVisible } from "./nombre.ts";

/**
 * Dónde buscar cuando no tenemos el link directo a la serie. Quien lo enseñe
 * lo dice sin prometer de más: "Buscar en", no "Ver en" (el link es de
 * búsqueda, no de disponibilidad garantizada).
 */
const BUSCADORES: Record<string, (titulo: string) => string> = {
  Crunchyroll: (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}`,
  Netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  "Amazon Prime Video": (t) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(t)}`,
  "Disney Plus": (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`,
  HIDIVE: (t) => `https://www.hidive.com/search?q=${encodeURIComponent(t)}`,
  Hulu: (t) => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`,
};

/** El link de una plataforma: directo a la serie si lo hay, si no a su
 *  buscador. null si no sabemos ni buscar ahí. */
export function enlaceDonde(d: Donde, anime: Anime): { href: string; directo: boolean } | null {
  if (d.url) return { href: d.url, directo: true };
  const buscador = BUSCADORES[d.nombre];
  return buscador ? { href: buscador(nombreVisible(anime)), directo: false } : null;
}
