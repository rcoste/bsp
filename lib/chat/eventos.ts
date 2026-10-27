import type { Anime } from "../anime/catalogo";
import type { Entrada } from "../lista";

/**
 * Los eventos que viajan por el canal de /api/chat.
 *
 * Vive aparte del bucle a propósito: el navegador necesita estos tipos, y el
 * bucle importa cosas que solo existen en el servidor.
 */
export type Evento =
  | { tipo: "tarjeta"; anime: Anime; razon: string }
  | { tipo: "texto"; texto: string }
  | { tipo: "chips"; chips: string[] }
  // La AI escribió en la biblioteca ("voy en el 8 de Frieren"): la pantalla
  // debe reflejarlo sin recargar, o la memoria existe y nadie la nota.
  | { tipo: "marca"; animeId: number; entrada: Entrada | null }
  | { tipo: "fin" }
  | { tipo: "error"; mensaje: string };

/** `nota`: un aviso de la app en el hilo (un fallo, un tope) que se ve como
 *  globo de Sen Pai pero NO viaja a la AI como historial. */
export type Turno = { de: "ai" | "tu"; texto: string; nota?: boolean };

/**
 * Lee el flujo de eventos con nombre que manda el servidor.
 *
 * No se usa EventSource del navegador: solo sabe hacer peticiones GET, y aquí
 * el mensaje viaja en el cuerpo de un POST.
 */
export async function* leerEventos(cuerpo: ReadableStream<Uint8Array>) {
  const lector = cuerpo.getReader();
  // Se decodifica a mano y no con TextDecoderStream: un carácter con acento
  // puede quedar partido entre dos trozos, y `stream: true` lo cose.
  const decodificador = new TextDecoder();
  let pendiente = "";

  while (true) {
    const { done, value } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });

    // Los eventos van separados por una línea en blanco.
    let corte: number;
    while ((corte = pendiente.indexOf("\n\n")) !== -1) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);

      const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
      if (!linea) continue;
      try {
        yield JSON.parse(linea.slice(6)) as Evento;
      } catch {
        // Un evento partido a la mitad no vale la pena romper todo el flujo.
      }
    }
  }
}

/** Por dónde entró un mensaje al chat: tecleado, un chip, la búsqueda con la
 *  que aterrizó, o el arranque de gusto (al tercer toque en la parrilla). */
export type ViaMensaje = "texto" | "chip" | "llegada" | "arranque";
export const VIAS_MENSAJE: readonly ViaMensaje[] = ["texto", "chip", "llegada", "arranque"];
