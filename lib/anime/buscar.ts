import "server-only";
import { sql } from "../db.ts";
import { datosDeTarjeta, type Anime } from "./catalogo.ts";
import { normalizar } from "./titulos.ts";

/**
 * Búsqueda directa por autocompletado, para el MISMO campo del chat.
 *
 * Es el atajo para quien ya sabe qué quiere: teclea, toca la sugerencia y la
 * tarjeta aparece en la vitrina — sin llamada a la AI y sin gastar mensaje.
 * Ver docs/designs/alcance-v1-para-diseno.md, módulo nuevo.
 *
 * POR QUÉ NO HAY UNA BARRA DE BÚSQUEDA APARTE, ni un botón de modo: se probó
 * y no hace falta. Una frase de conversación ("algo corto para el finde")
 * devuelve CERO coincidencias, así que la lista de sugerencias sencillamente
 * no aparece y el campo se comporta como chat. La ambigüedad se resuelve sola.
 */

/** Debajo de esto cualquier cosa coincide con todo: "de" daba 393 resultados. */
const MIN_LETRAS = 3;

/** Seis caben en pantalla sin tapar la vitrina en un celular. */
const MAX_SUGERENCIAS = 6;

/** Se piden de más porque el colapso de secuelas descarta varias. */
const CANDIDATOS = 40;

/**
 * Lo que delata a una secuela cuando va después del título base.
 *
 * Sin esto, buscar "yaiba" devolvía SEIS entradas de Kimetsu no Yaiba (la
 * serie, la película y cuatro arcos) y ninguna otra obra: la lista completa
 * gastada en una sola franquicia.
 */
const EMPIEZA_SECUELA =
  /^(the\s+)?(season|temporada|part|parte|movie|film|pelicula|ova|oad|special|specials|final|2nd|3rd|4th|5th|ii|iii|iv|s2|s3)\b/;

/** "-hen" (編) y "arc" nombran un arco de la misma obra, vayan donde vayan. */
const NOMBRA_ARCO = /\b(hen|arc)\b/;

/**
 * ¿`candidato` es una secuela de `base`? Ambos normalizados.
 *
 * Es deliberadamente estricto: exige el título base COMPLETO al principio y
 * además una palabra que delate secuela. Con solo lo primero, "Monster
 * Musume" quedaría escondido bajo "Monster" — y son obras distintas. Probado
 * contra el catálogo: separa bien ese caso y el de "Death Note" / "Death
 * Parade", y sí colapsa las temporadas de Shingeki no Kyojin y de Fate.
 */
export function esSecuelaDe(base: string, candidato: string): boolean {
  if (!candidato.startsWith(base + " ")) return false;
  const resto = candidato.slice(base.length + 1);
  return EMPIEZA_SECUELA.test(resto) || NOMBRA_ARCO.test(resto);
}

export type Sugerencia = {
  id: number;
  titulo: string;
  anio: number | null;
  portada: string | null;
};

export async function sugerencias(consulta: string): Promise<Sugerencia[]> {
  const clave = normalizar(consulta);
  if (clave.length < MIN_LETRAS) return [];

  // Se busca DENTRO del título, no solo por el principio. Buscar por prefijo
  // parece lo obvio y no sirve: nadie teclea "Ataque a los Titanes" desde la
  // primera letra — teclea "titanes", y con prefijo eso no encuentra NADA.
  // El índice de trigramas de titulos_indice aguanta el "contiene" en ~75 ms.
  //
  // El título que se MUESTRA sale de catalogo_cache, no de la fila que
  // coincidió: los sinónimos incluyen apodos alternos ("Frieren at the
  // Funeral" es la misma serie que "Sousou no Frieren"), y enseñar el apodo
  // haría creer que es otra obra.
  const filas = await sql<
    { anime_id: number; datos: Anime; miembros: number }[]
  >`
    select t.anime_id, c.datos, max(t.miembros) as miembros
      from titulos_indice t
      join catalogo_cache c on c.anime_id = t.anime_id
     where t.titulo_normalizado like ${"%" + clave + "%"}
       and c.expira_en > now()
     group by t.anime_id, c.datos
     order by max(t.miembros) desc
     limit ${CANDIDATOS}
  `;

  // Se recorren de más popular a menos, y cada uno se descarta si es secuela
  // de alguno ya aceptado. Como la serie principal siempre tiene más gente
  // que sus temporadas, la que se queda es la que la persona busca.
  const elegidos: Sugerencia[] = [];
  const normalizados: string[] = [];

  for (const f of filas) {
    if (elegidos.length === MAX_SUGERENCIAS) break;
    const n = normalizar(f.datos.titulo);
    if (normalizados.some((base) => esSecuelaDe(base, n))) continue;
    normalizados.push(n);
    elegidos.push({
      id: f.datos.id,
      titulo: f.datos.titulo,
      anio: f.datos.anio ?? null,
      portada: f.datos.portada ?? null,
    });
  }

  return elegidos;
}

/** La tarjeta completa de una sugerencia tocada. */
export async function tarjetaDeSugerencia(id: number): Promise<Anime | null> {
  const filas = await sql<{ datos: Anime }[]>`
    select datos from catalogo_cache
     where anime_id = ${id} and expira_en > now()
  `;
  return filas.length ? datosDeTarjeta(filas[0].datos) : null;
}
