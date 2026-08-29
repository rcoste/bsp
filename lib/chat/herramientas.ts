import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { buscarPorTitulo, type Anime } from "../anime/catalogo.ts";
import { sugerencias } from "../anime/buscar.ts";
import {
  esCalificacion,
  esMarca,
  marcar,
  type Entrada,
  type Marca,
} from "../lista.ts";

/** Tope de caracteres del porqué. Ver docs/designs/experiencia-y-estados.md §4. */
export const MAX_RAZON = 90;

/** Tope de tarjetas por respuesta. Ver docs/plans/arquitectura.md §2. */
export const MAX_TARJETAS = 5;

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_anime",
    description:
      "Manda un anime a la vitrina. Comprueba contra el catálogo que el anime " +
      "existe de verdad: si existe, su portada aparece en la pantalla del " +
      "usuario de inmediato; si no existe, se descarta en silencio. Llámala una " +
      "vez por cada anime que quieras recomendar, máximo tres por respuesta. " +
      "Úsala solo cuando la persona quiere algo que ver, nunca para charla.",
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description:
            "El título del anime tal como se conoce. Puede ser el japonés " +
            "romanizado o el inglés — se busca por ambos.",
        },
        razon: {
          type: "string",
          description:
            "La frase que explica por qué ESTE anime es para ESTA persona, " +
            `máximo ${MAX_RAZON} caracteres. Siempre conectada con algo que la ` +
            'persona dijo o marcó ("Porque viste Death Note", "12 episodios, se ' +
            'acaba en un finde"). Si no puedes conectarla con nada concreto, ' +
            'manda una cadena vacía. Nunca escribas razones genéricas como "es ' +
            'muy popular" o "es un clásico".',
        },
      },
      required: ["titulo", "razon"],
    },
  },
  {
    name: "actualizar_lista",
    description:
      "Escribe en la biblioteca del usuario lo que ÉL MISMO acaba de contarte " +
      "sobre una serie: que la está viendo (y en qué episodio va), que la " +
      "terminó, que la dejó, que quiere verla, que no se la recomienden más, " +
      "o qué le pareció. Llámala una vez por serie mencionada; si el mensaje " +
      "trae varias ('acabé Frieren y voy en el 3 de Dandadan'), llámala una " +
      "vez por cada una. SOLO registra hechos que la persona afirmó de sí " +
      "misma — nunca deducciones tuyas, nunca hipótesis, nunca series que " +
      "solo se mencionaron de pasada.",
    input_schema: {
      type: "object",
      properties: {
        titulo: {
          type: "string",
          description:
            "El título de la serie tal como se conoce. Se verifica contra el " +
            "catálogo igual que en buscar_anime.",
        },
        estado: {
          type: "string",
          enum: ["quiero_ver", "viendo", "visto", "abandonada", "descartado"],
          description:
            "Dónde está la persona con la serie. 'viendo' = la está viendo " +
            "ahora; 'visto' = la terminó; 'abandonada' = la empezó y la dejó; " +
            "'quiero_ver' = la apunta para después; 'descartado' = pidió que " +
            "no se la recomienden más.",
        },
        episodio: {
          type: "integer",
          description:
            "En qué episodio va (o en cuál la dejó). Solo con 'viendo' o " +
            "'abandonada', y solo si la persona dio el número.",
        },
        calificacion: {
          type: "string",
          enum: ["no_fue_lo_mio", "estuvo_bien", "me_encanto"],
          description:
            "Qué le pareció, SOLO si lo dijo: 'me encantó' → me_encanto, " +
            "'estuvo bien / pasable' → estuvo_bien, 'no me gustó / floja' → " +
            "no_fue_lo_mio. Solo acompaña a 'visto' o 'abandonada'.",
        },
      },
      required: ["titulo", "estado"],
    },
  },
  {
    name: "proponer_chips",
    description:
      "Propone los tres botones de atajo que aparecen encima del campo de " +
      "texto, referidos a lo que acabas de recomendar. No consulta nada; solo " +
      "recoge lo que propones. Llámala únicamente cuando hayas recomendado algo.",
    input_schema: {
      type: "object",
      properties: {
        chips: {
          type: "array",
          items: { type: "string" },
          description:
            "Tres frases de máximo cuatro palabras cada una, en español, que " +
            'la persona podría querer decir después ("más acción", "algo más ' +
            'corto", "menos conocido").',
        },
      },
      required: ["chips"],
    },
  },
];

export type Verificado = { anime: Anime; razon: string };

/**
 * Ejecuta buscar_anime. Devolver "no existe" NO es un fallo: es el candado
 * del riesgo técnico #1 funcionando.
 */
export async function verificar(
  entrada: unknown,
): Promise<{ verificado: Verificado | null; texto: string }> {
  const { titulo, razon } = (entrada ?? {}) as { titulo?: string; razon?: string };
  if (typeof titulo !== "string" || !titulo.trim()) {
    return { verificado: null, texto: "Falta el título." };
  }

  const anime = await buscarPorTitulo(titulo);
  if (!anime) {
    return {
      verificado: null,
      texto:
        `No hay ningún anime que se llame "${titulo}" en el catálogo. No se ` +
        `mostró nada al usuario. No lo menciones en tu respuesta.`,
    };
  }

  return {
    verificado: { anime, razon: (razon ?? "").slice(0, MAX_RAZON) },
    // Los seis campos acordados, nunca el JSON crudo de Jikan (que trae 2-5 KB
    // por anime y se acumularía en cada vuelta del bucle).
    texto: JSON.stringify({
      id: anime.id,
      titulo: anime.titulo,
      titulo_en: anime.tituloEn,
      anio: anime.anio,
      estado: anime.estado,
      portada: anime.portada,
    }),
  };
}

export type MarcaHecha = { animeId: number; entrada: Entrada | null };

/**
 * Ejecuta actualizar_lista: verifica el título contra el catálogo (el mismo
 * candado que buscar_anime — la AI no escribe en tu biblioteca un anime que
 * no existe) y guarda la marca.
 */
export async function actualizarLista(
  entrada: unknown,
  dispositivoId: string,
): Promise<{ hecho: MarcaHecha | null; texto: string }> {
  const { titulo, estado, episodio, calificacion } = (entrada ?? {}) as {
    titulo?: string;
    estado?: string;
    episodio?: number;
    calificacion?: string;
  };
  if (typeof titulo !== "string" || !titulo.trim() || !esMarca(estado)) {
    return { hecho: null, texto: "Falta el título o el estado no es válido." };
  }

  const anime = await buscarPorTitulo(titulo);
  if (!anime) {
    // El candado rechaza apodos cortos ("Frieren" vs "Sousou no Frieren").
    // Antes de rendirse, se le da a la AI el pariente más cercano del
    // catálogo: si ella sabe que es la misma obra, reintenta con el título
    // exacto y la persona ni se entera de la fricción.
    const parecidos = await sugerencias(titulo).catch(() => []);
    const pista = parecidos[0]
      ? ` El más parecido del catálogo es "${parecidos[0].titulo}". Si estás ` +
        `seguro de que la persona se refiere a ese, vuelve a llamar la ` +
        `herramienta con ese título exacto; si dudas, pregúntale.`
      : ` Pídele a la persona el título exacto.`;
    return {
      hecho: null,
      texto:
        `No hay ningún anime que se llame "${titulo}" en el catálogo. No se ` +
        `guardó nada.${pista}`,
    };
  }

  const quedo = await marcar(dispositivoId, anime.id, estado as Marca, {
    episodio: typeof episodio === "number" ? episodio : null,
    calificacion: esCalificacion(calificacion) ? calificacion : null,
  });

  return {
    hecho: { animeId: anime.id, entrada: quedo },
    texto: quedo
      ? `Guardado: ${anime.titulo} → ${quedo.marca}` +
        (quedo.episodio ? `, episodio ${quedo.episodio}` : "") +
        (quedo.calificacion ? `, ${quedo.calificacion}` : "") +
        ". Confírmaselo en una frase corta, sin ceremonia."
      : `${anime.titulo} quedó fuera de su lista.`,
  };
}

/** Limpia lo que la AI propuso como chips: tres, cortos, sin vacíos. */
export function limpiarChips(entrada: unknown): string[] {
  const { chips } = (entrada ?? {}) as { chips?: unknown };
  if (!Array.isArray(chips)) return [];
  return chips
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 3);
}
