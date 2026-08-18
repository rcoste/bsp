import type { Anime } from "../anime/catalogo";

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
  | { tipo: "fin" }
  | { tipo: "error"; mensaje: string };

export type Turno = { de: "ai" | "tu"; texto: string };

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
