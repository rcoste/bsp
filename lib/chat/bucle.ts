import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { INSTRUCCIONES } from "./instrucciones.ts";
import type { Evento, Turno } from "./eventos.ts";
import {
  HERRAMIENTAS,
  MAX_TARJETAS,
  limpiarChips,
  verificar as verificarReal,
} from "./herramientas.ts";
import { consumoVacio, sumarVuelta, type Consumo } from "./gasto.ts";

/**
 * El bucle con memoria intermedia: verificar primero, escribir después.
 *
 * Por qué no se puede hacer de la forma obvia: la API emite el texto del modelo
 * ANTES que la llamada a la herramienta, en el mismo turno. Si ese texto se
 * transmite palabra por palabra, la AI puede escribir "te recomiendo Monster,
 * Psycho-Pass y Ergo Proxy" y verificar después. Una instrucción de "no
 * menciones títulos sin verificar" es una sugerencia, no un candado — el texto
 * ya salió. Ver docs/plans/arquitectura.md §2.
 */

const MODELO = "claude-sonnet-5";
const MAX_VUELTAS = 3;

export type { Evento, Turno };

/** Lo que costó y tardó un turno. Lo registra quien llama, no el bucle: aquí
 *  no sabemos de qué perfil es. */
export type Medicion = {
  modelo: string;
  consumo: Consumo;
  tarjetas: number;
  msPrimeraTarjeta: number | null;
  msTotal: number;
};

type Opciones = {
  historial: Turno[];
  mensaje: string;
  /** Lo que ya sabemos del gusto de esta persona. Viaja como mensaje, nunca
   *  en las instrucciones del sistema: ahí rompería el caché para todos. */
  perfil: string;
  emitir: (evento: Evento) => void;
  señal: AbortSignal;
  /** Solo para las pruebas: deja sustituir la API y el catálogo. En producción
   *  se omite y se usan los de verdad. */
  postizos?: {
    cliente?: Pick<Anthropic, "messages">;
    verificar?: typeof verificarReal;
  };
};

/** Sin llave no hay cerebro. Se comprueba antes de gastar nada. */
export function hayLlave(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function bloquesDeTexto(texto: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: texto }];
}

export async function conversar({
  historial,
  mensaje,
  perfil,
  emitir,
  señal,
  postizos,
}: Opciones): Promise<Medicion> {
  const cliente = postizos?.cliente ?? new Anthropic();
  const verificar = postizos?.verificar ?? verificarReal;
  const arranque = Date.now();
  const consumo = consumoVacio();
  let msPrimeraTarjeta: number | null = null;

  const mensajes: Anthropic.MessageParam[] = [
    ...historial.map(
      (t): Anthropic.MessageParam => ({
        role: t.de === "tu" ? "user" : "assistant",
        content: bloquesDeTexto(t.texto),
      }),
    ),
    {
      role: "user",
      // El perfil va al principio del turno NUEVO, no en las instrucciones del
      // sistema. Los turnos viejos se reconstruyen como texto pelón, así que
      // todo lo anterior a este turno sigue acertando en el caché.
      content: [
        ...(perfil ? bloquesDeTexto(`<perfil>\n${perfil}\n</perfil>`) : []),
        { type: "text", text: mensaje },
      ],
    },
  ];

  const yaEnVitrina = new Set<number>();
  let chips: string[] = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    // En la última vuelta se prohíben las herramientas: así siempre hay una
    // respuesta escrita, con lo que se haya verificado hasta ahí.
    const ultima = vuelta === MAX_VUELTAS - 1;

    marcarPuntoDeCache(mensajes);

    const flujo = cliente.messages.stream(
      {
        model: MODELO,
        max_tokens: 8000,
        // Se deja el pensamiento activo con esfuerzo medio: apagarlo reduce la
        // latencia, pero la documentación advierte que sin pensamiento el
        // modelo usa MENOS herramientas — y toda la defensa contra animes
        // inventados depende de que llame a la herramienta.
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: "medium" },
        system: [
          {
            type: "text",
            text: INSTRUCCIONES,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: HERRAMIENTAS,
        ...(ultima ? { tool_choice: { type: "none" as const } } : {}),
        messages: mensajes,
      },
      { signal: señal },
    );

    const respuesta = await flujo.finalMessage();
    sumarVuelta(consumo, respuesta.usage);

    const usos = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (usos.length === 0) {
      for (const bloque of respuesta.content) {
        if (bloque.type === "text" && bloque.text) {
          emitir({ tipo: "texto", texto: bloque.text });
        }
      }
      if (chips.length) emitir({ tipo: "chips", chips });
      return medir();
    }

    // Pidió herramienta: el texto de esta vuelta se DESCARTA — no viaja al
    // navegador. "Descartar" significa no enviarlo, nunca borrarlo de la
    // conversación: el mensaje completo, incluidos sus bloques de razonamiento
    // (firmados criptográficamente), se reenvía tal cual, sin editar un solo
    // carácter. Editarlos invalida la firma y la API rechaza la petición.
    mensajes.push({ role: "assistant", content: respuesta.content });

    const resultados = await Promise.all(
      usos.map(async (uso): Promise<Anthropic.ToolResultBlockParam> => {
        if (uso.name === "proponer_chips") {
          const propuestos = limpiarChips(uso.input);
          if (propuestos.length) chips = propuestos;
          return { type: "tool_result", tool_use_id: uso.id, content: "Anotados." };
        }

        if (uso.name !== "buscar_anime") {
          return {
            type: "tool_result",
            tool_use_id: uso.id,
            content: `No existe una herramienta llamada ${uso.name}.`,
            is_error: true,
          };
        }

        const { verificado, texto } = await verificar(uso.input);

        // El tope se cuenta AQUÍ, después de verificar, no antes.
        // Las búsquedas van en paralelo: si se contara arriba, seis llamadas
        // pasarían las seis el control antes de que ninguna se hubiera
        // sumado, y saldrían seis tarjetas. Aquí no hay ningún `await` de por
        // medio entre el control y la suma, así que no se pueden colar.
        if (verificado && !yaEnVitrina.has(verificado.anime.id)) {
          if (yaEnVitrina.size >= MAX_TARJETAS) {
            return {
              type: "tool_result",
              tool_use_id: uso.id,
              content:
                `La vitrina ya tiene ${MAX_TARJETAS} animes, que es el máximo. ` +
                `Este no se mostró. Responde con lo que ya está.`,
            };
          }
          yaEnVitrina.add(verificado.anime.id);
          // El tiempo hasta la PRIMERA portada es la métrica del producto —
          // no el tiempo hasta la primera palabra. Se marca aquí, en el
          // momento exacto en que sale al navegador.
          if (msPrimeraTarjeta === null) msPrimeraTarjeta = Date.now() - arranque;
          emitir({
            tipo: "tarjeta",
            anime: verificado.anime,
            razon: verificado.razon,
          });
        }

        return { type: "tool_result", tool_use_id: uso.id, content: texto };
      }),
    );

    // Todos los resultados van en UN SOLO mensaje. Partirlos entre varios
    // enseña al modelo a dejar de pedir herramientas en paralelo.
    mensajes.push({ role: "user", content: resultados });
  }

  // Se agotaron las vueltas sin respuesta escrita. Igual se mide: los turnos
  // que se quedan sin texto son justo los que hay que poder encontrar después.
  return medir();

  function medir(): Medicion {
    return {
      modelo: MODELO,
      consumo,
      tarjetas: yaEnVitrina.size,
      msPrimeraTarjeta,
      msTotal: Date.now() - arranque,
    };
  }
}

/**
 * Deja el punto de caché en el último bloque del último mensaje.
 *
 * Solo uno a la vez: el marcador dice dónde ESCRIBIR, y las lecturas ocurren
 * solas en el trozo cacheado más largo que coincida. Marcar todos gastaría los
 * cuatro puntos que permite la API sin ganar nada.
 */
function marcarPuntoDeCache(mensajes: Anthropic.MessageParam[]): void {
  for (const m of mensajes) {
    if (typeof m.content === "string") continue;
    for (const bloque of m.content) {
      if ("cache_control" in bloque) delete bloque.cache_control;
    }
  }
  const ultimo = mensajes[mensajes.length - 1];
  if (!ultimo || typeof ultimo.content === "string") return;
  const bloque = ultimo.content[ultimo.content.length - 1];
  if (bloque) (bloque as { cache_control?: unknown }).cache_control = { type: "ephemeral" };
}
