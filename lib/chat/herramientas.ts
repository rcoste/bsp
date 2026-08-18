import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { buscarPorTitulo, type Anime } from "../anime/catalogo.ts";

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
