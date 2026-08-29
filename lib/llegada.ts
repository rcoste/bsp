/**
 * De qué sirve la búsqueda con la que alguien aterrizó.
 *
 * Con tráfico pagado cada visita cuesta, y disparar una conversación con la
 * AI en cada aterrizaje son ~$0.01 por clic — incluidos los clics accidentales
 * y los rebotes. Pero tampoco se puede ignorar la búsqueda: es lo único que
 * sabemos de esa persona, y es justo lo que pagamos por saber.
 *
 * El reparto: las búsquedas GENÉRICAS ("qué anime ver") las contesta el
 * catálogo sin gastar un centavo — populares y ya. Las ESPECÍFICAS ("parecido
 * a Death Note", "algo corto de terror") sí valen la conversación, porque ahí
 * la respuesta es insustituible.
 *
 * Sin "server-only": el navegador también lo usa para decidir si dispara.
 */

/** Nadie escribe 200 caracteres en Google. Más que esto no es una búsqueda. */
const MAX_CONSULTA = 120;

/**
 * Frases que no dicen NADA de la persona más allá de "quiero anime". Si la
 * consulta se reduce a esto, el catálogo ya la contesta.
 *
 * Se normalizan al cargar (ver VACIAS abajo): escritas con acento pero
 * comparadas contra texto sin acentos, "anime en español" nunca coincidiría
 * y esa campaña gastaría AI en cada clic. Lo cazó tests/llegada.test.ts.
 */
const VACIAS_CRUDAS = [
  "anime",
  "animes",
  "que anime ver",
  "que anime veo",
  "que ver",
  "ver anime",
  "anime recomendaciones",
  "recomendaciones de anime",
  "recomendaciones anime",
  "recomendame un anime",
  "recomendaciones",
  "mejores animes",
  "mejor anime",
  "top anime",
  "top animes",
  "animes buenos",
  "buenos animes",
  "anime bueno",
  "series de anime",
  "anime en español",
  "anime online",
];

/** Quita acentos, signos y mayúsculas. Copia local para no arrastrar el
 *  módulo de títulos, que es solo del servidor. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VACIAS = new Set(VACIAS_CRUDAS.map(normalizar));

export type Llegada = {
  /** La consulta limpia, o "" si no traía o no sirve. */
  consulta: string;
  /** true = vale gastar una conversación con la AI. */
  vale: boolean;
};

export function leerLlegada(crudo: string | undefined | null): Llegada {
  if (typeof crudo !== "string") return { consulta: "", vale: false };
  const consulta = crudo.slice(0, MAX_CONSULTA).trim();
  if (!consulta) return { consulta: "", vale: false };

  const n = normalizar(consulta);
  if (!n) return { consulta: "", vale: false };

  // Genérica exacta: el catálogo la contesta gratis.
  if (VACIAS.has(n)) return { consulta, vale: false };

  // Una o dos palabras que solo son "anime" + relleno tampoco dicen nada.
  const palabras = n.split(" ").filter((p) => p !== "anime" && p !== "animes");
  if (palabras.length === 0) return { consulta, vale: false };

  return { consulta, vale: true };
}

/** El origen de la campaña, para poder medir por grupo de anuncios. */
export function leerOrigen(
  utmSource: string | undefined | null,
  utmCampaign: string | undefined | null,
): string | null {
  const partes = [utmSource, utmCampaign]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.slice(0, 60).trim());
  return partes.length ? partes.join(" / ") : null;
}
