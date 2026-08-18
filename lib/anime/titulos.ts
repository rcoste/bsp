/**
 * Comparación de títulos de anime.
 *
 * Este archivo es el candado contra el riesgo técnico #1: que la AI nombre un
 * anime que no existe, o con un título que no coincide con el catálogo.
 *
 * La regla que lo gobierna: ante la duda, DESCARTAR. Mostrar el anime
 * equivocado es peor que mostrar uno menos — el usuario perdona una lista
 * corta, no perdona que le recomienden algo que no pidió.
 */

/** Quita acentos, signos y mayúsculas para poder comparar peras con peras. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos: "Pokémon" → "Pokemon"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // signos: "Re:Zero" → "re zero"
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de edición: cuántos cambios separan dos textos. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        anterior[j] + 1,
        actual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = actual;
  }
  return anterior[b.length];
}

/** Qué tan parecidos son dos títulos, de 0 (nada) a 1 (idénticos). */
export function similitud(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // NOTA: aquí había una regla de "si uno contiene al otro, es match".
  // Se quitó porque las pruebas demostraron que confunde animes distintos:
  // "Monster" está contenido en "Monster Musume", y "Steins;Gate" en
  // "Steins;Gate 0" — obras diferentes en ambos casos. La contención es una
  // señal ambigua y aquí el costo de equivocarse es recomendar algo que el
  // usuario no pidió. Los títulos cortos ("AoT", "Re:Zero") se resuelven por
  // los sinónimos que el catálogo ya trae, no por adivinanza.

  // Palabras en común. Esto es lo que separa "Death Note" de "Death Parade":
  // comparten una palabra de dos, no dos de dos.
  const pa = new Set(na.split(" "));
  const pb = new Set(nb.split(" "));
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  const jaccard = comunes / new Set([...pa, ...pb]).size;

  // Parecido letra por letra, para atrapar erratas.
  const edicion = 1 - distancia(na, nb) / Math.max(na.length, nb.length);

  return Math.max(jaccard * 0.85, edicion);
}

/**
 * Umbral de aceptación. Calibrado con los casos de prueba: deja pasar
 * variantes reales del mismo título y rechaza títulos vecinos que solo
 * comparten una palabra.
 */
export const UMBRAL = 0.72;

export type CandidatoTitulo = {
  id: number;
  titulos: string[]; // el principal, el inglés, y los sinónimos
};

/**
 * Elige el mejor candidato para un título dicho por la AI, o null si ninguno
 * es lo bastante parecido. Devolver null NO es un fallo: es el candado
 * funcionando.
 */
export function elegirMejor(
  loQueDijoLaAI: string,
  candidatos: CandidatoTitulo[],
): { id: number; confianza: number } | null {
  let mejor: { id: number; confianza: number } | null = null;

  for (const c of candidatos) {
    for (const t of c.titulos) {
      if (!t) continue;
      const s = similitud(loQueDijoLaAI, t);
      if (!mejor || s > mejor.confianza) mejor = { id: c.id, confianza: s };
    }
  }

  return mejor && mejor.confianza >= UMBRAL ? mejor : null;
}
