import "server-only";
import { sql } from "../db.ts";
import { elegirMejor, normalizar } from "./titulos.ts";

/**
 * La única puerta a los datos de anime.
 *
 * Ninguna otra parte del código sabe de dónde salen. Hoy es Jikan (la API no
 * oficial de MyAnimeList); si mañana cambiamos a la API oficial, se reescribe
 * este archivo y nada más.
 *
 * Por qué NO usamos AniList, que sería la opción obvia: sus términos de uso
 * prohíben textualmente el uso de su API en "anime and manga list or tracker
 * services", y esta app tiene lista personal. Ver docs/plans/arquitectura.md §1.
 */

const JIKAN = "https://api.jikan.moe/v4";
const DIAS_7 = 7 * 24 * 60 * 60 * 1000;
const HORAS_24 = 24 * 60 * 60 * 1000;
const ESPERA_MAX_FICHA_MS = 6000;

/** Dónde se puede ver. La url es null cuando solo se conoce la plataforma. */
export type Donde = { nombre: string; url: string | null };

/**
 * Lo que la app conoce de un anime: exactamente lo que la TARJETA necesita
 * para decidir sin abrir nada, y nada más. Nunca el JSON crudo.
 *
 * Episodios, estado y dónde verlo no son adorno de ficha: son justo los tres
 * datos que un modelo de lenguaje inventa con total seguridad, y la razón por
 * la que esta app le gana a un chat de puro texto.
 * Ver docs/designs/alcance-v1-para-diseno.md §3.
 */
export type Anime = {
  id: number;
  titulo: string;
  tituloEn: string | null;
  anio: number | null;
  estado: string | null;
  portada: string | null;
  episodios: number | null;
  /** "tv", "movie", "ova"… Solo para decir "Película" en vez de "1 episodio". */
  tipo: string | null;
  donde: Donde[];
};

type JikanAnime = {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_synonyms: string[];
  year: number | null;
  status: string | null;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  synopsis?: string | null;
  members?: number | null;
  episodes?: number | null;
  type?: string | null;
};

/**
 * Recorta un registro del caché a lo que va al navegador. La fila guarda más
 * de lo que promete el tipo (sinopsis, géneros, score); sin este recorte la
 * sinopsis entera viaja al celular en cada tarjeta, y son ~1.5 KB por anime.
 */
export function datosDeTarjeta(datos: Anime): Anime {
  return {
    id: datos.id,
    titulo: datos.titulo,
    tituloEn: datos.tituloEn,
    anio: datos.anio,
    estado: datos.estado,
    portada: datos.portada,
    episodios: datos.episodios ?? null,
    tipo: datos.tipo ?? null,
    donde: datos.donde ?? [],
  };
}

function aAnime(j: JikanAnime): Anime {
  return {
    id: j.mal_id,
    titulo: j.title,
    tituloEn: j.title_english ?? null,
    anio: j.year ?? null,
    estado: j.status ?? null,
    portada: j.images?.jpg?.large_image_url ?? j.images?.jpg?.image_url ?? null,
    episodios: j.episodes ?? null,
    tipo: j.type?.toLowerCase() ?? null,
    // Jikan no da streaming en /anime/{id}; lo que llega por aquí se queda sin
    // "dónde verlo" hasta que el catálogo exportado lo cubra. Un dato ausente
    // es honesto; uno inventado no.
    donde: [],
  };
}

/**
 * Espera su turno para llamar a Jikan. El freno vive en la base de datos
 * porque Vercel corre varias copias de la app a la vez y una fila en memoria
 * daría un freno por copia — o sea, ningún freno.
 */
async function esperarTurno(): Promise<boolean> {
  const limite = Date.now() + ESPERA_MAX_FICHA_MS;
  while (Date.now() < limite) {
    const [{ ok }] = await sql<[{ ok: boolean }]>`select tomar_ficha_jikan() as ok`;
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false; // se acabó la paciencia: mejor una recomendación menos que una espera eterna
}

/** Llama a Jikan con reintentos. Degrada, nunca tumba la app. */
async function pedirAJikan(ruta: string): Promise<unknown | null> {
  const esperas = [1000, 3000, 9000];
  for (let intento = 0; intento <= esperas.length; intento++) {
    if (!(await esperarTurno())) return null;
    try {
      const r = await fetch(`${JIKAN}${ruta}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return await r.json();
      // 429 = nos frenaron; 5xx = Jikan o MyAnimeList con problemas.
      if (r.status !== 429 && r.status < 500) return null;
    } catch {
      // Timeout o red caída: cae al reintento.
    }
    if (intento < esperas.length) {
      await new Promise((r) => setTimeout(r, esperas[intento]));
    }
  }
  return null;
}

/** Guarda un anime en el caché de datos (7 días) y sus títulos en el índice. */
async function guardarEnCache(a: Anime, crudo: JikanAnime) {
  await sql`
    insert into catalogo_cache (anime_id, datos, expira_en)
    values (${a.id}, ${sql.json({ ...a, sinonimos: crudo.title_synonyms ?? [], sinopsis: crudo.synopsis ?? null })}, ${new Date(Date.now() + DIAS_7)})
    on conflict (anime_id) do update
      set datos = excluded.datos, expira_en = excluded.expira_en
  `;
  await indexarTitulos(
    a.id,
    [a.titulo, crudo.title_english, ...(crudo.title_synonyms ?? [])],
    crudo.members ?? 0,
  );
}

/**
 * Mete los títulos de un anime al índice de búsqueda. Así, lo que llega vía
 * Jikan queda buscable localmente igual que lo exportado por el script.
 */
async function indexarTitulos(
  id: number,
  titulos: (string | null | undefined)[],
  miembros: number,
) {
  const filas: {
    anime_id: number;
    titulo: string;
    titulo_normalizado: string;
    miembros: number;
  }[] = [];
  const vistos = new Set<string>();
  for (const t of titulos) {
    if (!t) continue;
    const n = normalizar(t);
    if (!n || vistos.has(n)) continue;
    vistos.add(n);
    filas.push({ anime_id: id, titulo: t, titulo_normalizado: n, miembros });
  }
  if (!filas.length) return;
  await sql`
    insert into titulos_indice ${sql(filas)}
    on conflict (anime_id, titulo_normalizado) do nothing
  `;
}

/** Lee un anime del caché si no ha expirado. */
export async function porId(id: number): Promise<Anime | null> {
  const filas = await sql<{ datos: Anime }[]>`
    select datos from catalogo_cache where anime_id = ${id} and expira_en > now()
  `;
  if (filas.length) return datosDeTarjeta(filas[0].datos);

  const json = (await pedirAJikan(`/anime/${id}`)) as { data?: JikanAnime } | null;
  if (!json?.data) return null;

  const anime = aAnime(json.data);
  await guardarEnCache(anime, json.data);
  return anime;
}

/**
 * Busca un anime por el título que dijo la AI y devuelve el que existe de
 * verdad — o null.
 *
 * Devolver null NO es un fallo: es el candado del riesgo técnico #1
 * funcionando. Mostrar el anime equivocado es peor que mostrar uno menos.
 */
export async function buscarPorTitulo(titulo: string): Promise<Anime | null> {
  const clave = normalizar(titulo);
  if (!clave) return null;

  // 1. ¿Ya buscamos esto antes? Los resultados VACÍOS también cuentan: los
  //    títulos que la AI inventa son justo los que nunca encuentran nada, y
  //    se repiten entre usuarios. Sin esto salen a internet para siempre.
  const cacheados = await sql<{ anime_ids: number[] }[]>`
    select anime_ids from busquedas_cache
     where consulta_normalizada = ${clave} and expira_en > now()
  `;
  if (cacheados.length) {
    const ids = cacheados[0].anime_ids;
    return ids.length ? await porId(ids[0]) : null;
  }

  // 2. ¿Ya lo tenemos guardado? Se busca en el catálogo local ANTES de salir
  //    a internet. Esto sirve siempre (menos peticiones, más rápido) y además
  //    mantiene la app en pie cuando la fuente externa se cae — que ya pasó
  //    dos veces durante la construcción.
  //    Con ~25 mil animes ya no se puede recorrer todo el catálogo: pg_trgm
  //    (el índice de titulos_indice) trae solo los ~40 títulos más parecidos
  //    y el veredicto final lo sigue dando elegirMejor() — el candado y su
  //    umbral no cambian, solo la preselección de candidatos.
  const parecidos = await sql<{ anime_id: number; titulo: string }[]>`
    select anime_id, titulo from titulos_indice
    where titulo_normalizado % ${clave}
    order by similarity(titulo_normalizado, ${clave}) desc, miembros desc
    limit 40
  `;
  const porAnime = new Map<number, string[]>();
  for (const p of parecidos) {
    porAnime.set(p.anime_id, [...(porAnime.get(p.anime_id) ?? []), p.titulo]);
  }
  const enCasa = elegirMejor(
    titulo,
    [...porAnime].map(([id, titulos]) => ({ id, titulos })),
  );
  if (enCasa) {
    // porId lee del caché y, si esa fila justo expiró, se refresca vía Jikan
    // por id (el endpoint que sí aguanta). Si devuelve null es que la fuente
    // falló: se sigue al paso 3 SIN cachear, para no confundir "no pude" con
    // "no existe".
    const local = await porId(enCasa.id);
    if (local) {
      await sql`
        insert into busquedas_cache (consulta_normalizada, anime_ids, expira_en)
        values (${clave}, ${sql.json([enCasa.id])}, ${new Date(Date.now() + HORAS_24)})
        on conflict (consulta_normalizada) do update
          set anime_ids = excluded.anime_ids, expira_en = excluded.expira_en
      `;
      return local;
    }
  }

  // 3. A internet.
  const json = (await pedirAJikan(
    `/anime?q=${encodeURIComponent(titulo)}&limit=8&sfw=true`,
  )) as { data?: JikanAnime[] } | null;

  // "No pude buscar" NO es lo mismo que "no existe". Si la fuente estaba
  // caída (pasa: en pruebas devolvió 504), guardar un resultado vacío
  // marcaría un anime real como inexistente durante 24 horas. Se sale sin
  // cachear nada para reintentar en la siguiente petición.
  if (json === null) return null;

  const resultados = json.data ?? [];

  // 3. ¿Alguno se parece lo suficiente? Se compara contra el título japonés,
  //    el inglés y los sinónimos.
  const elegido = elegirMejor(
    titulo,
    resultados.map((r) => ({
      id: r.mal_id,
      titulos: [r.title, r.title_english ?? "", ...(r.title_synonyms ?? [])],
    })),
  );

  // 4. Se guardan LOS DOS cachés desde esta única respuesta. La respuesta de
  //    búsqueda ya trae los datos completos; sin esto, un acierto en el caché
  //    de búsquedas necesitaría otra llamada.
  const expira = new Date(Date.now() + HORAS_24);
  await sql`
    insert into busquedas_cache (consulta_normalizada, anime_ids, expira_en)
    values (${clave}, ${sql.json(elegido ? [elegido.id] : [])}, ${expira})
    on conflict (consulta_normalizada) do update
      set anime_ids = excluded.anime_ids, expira_en = excluded.expira_en
  `;

  if (!elegido) return null;

  const crudo = resultados.find((r) => r.mal_id === elegido.id)!;
  const anime = aAnime(crudo);
  await guardarEnCache(anime, crudo);
  return anime;
}
