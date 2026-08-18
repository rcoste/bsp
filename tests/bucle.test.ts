import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { conversar } from "../lib/chat/bucle.ts";
import type { Evento } from "../lib/chat/eventos.ts";
import type { Anime } from "../lib/anime/catalogo.ts";

/**
 * El candado del riesgo técnico #1.
 *
 * La API emite el texto del modelo ANTES que la llamada a la herramienta. Si
 * ese texto llegara al navegador, la AI podría anunciar tres animes y verificar
 * después — y uno de ellos podría no existir. Estas pruebas comprueban que el
 * texto de una vuelta que pide herramienta NO sale, pase lo que pase.
 */

const FRIEREN: Anime = {
  id: 52991,
  titulo: "Frieren: Beyond Journey's End",
  tituloEn: "Frieren",
  anio: 2023,
  estado: "Finished Airing",
  portada: "https://ejemplo/frieren.jpg",
};

/** Un doble de la API que devuelve las respuestas que le pases, en orden. */
function apiFalsa(respuestas: unknown[]) {
  let vuelta = 0;
  const peticiones: unknown[] = [];
  return {
    peticiones,
    cliente: {
      messages: {
        stream(parametros: unknown) {
          peticiones.push(parametros);
          const respuesta = respuestas[vuelta++];
          return { finalMessage: async () => respuesta };
        },
      },
    } as never,
  };
}

const inventado = { type: "text", text: "Te recomiendo Sombras del Alba Eterna." };
const pideFrieren = {
  type: "tool_use",
  id: "tu_1",
  name: "buscar_anime",
  input: { titulo: "Frieren", razon: "Porque viste Vinland Saga" },
};

async function correr(respuestas: unknown[], verificar?: unknown) {
  const eventos: Evento[] = [];
  const { cliente, peticiones } = apiFalsa(respuestas);
  await conversar({
    historial: [],
    mensaje: "acabé Vinland Saga",
    perfil: "",
    emitir: (e) => eventos.push(e),
    señal: new AbortController().signal,
    postizos: {
      cliente,
      verificar: (verificar ?? (async () => ({
        verificado: { anime: FRIEREN, razon: "Porque viste Vinland Saga" },
        texto: "{}",
      }))) as never,
    },
  });
  return { eventos, peticiones };
}

describe("el texto de una vuelta que pide herramienta no sale al navegador", () => {
  test("el título inventado NUNCA llega como texto", async () => {
    const { eventos } = await correr([
      { content: [inventado, pideFrieren] },
      { content: [{ type: "text", text: "Mira la vitrina." }] },
    ]);

    const texto = eventos
      .filter((e) => e.tipo === "texto")
      .map((e) => e.texto)
      .join(" ");
    assert.ok(
      !texto.includes("Sombras del Alba Eterna"),
      `se filtró el título inventado: "${texto}"`,
    );
    assert.equal(texto.trim(), "Mira la vitrina.");
  });

  test("la tarjeta verificada sale ANTES que el texto", async () => {
    const { eventos } = await correr([
      { content: [inventado, pideFrieren] },
      { content: [{ type: "text", text: "Mira la vitrina." }] },
    ]);

    const orden = eventos.map((e) => e.tipo);
    assert.ok(
      orden.indexOf("tarjeta") < orden.indexOf("texto"),
      `la portada debe llegar primero, y llegó en este orden: ${orden.join(" → ")}`,
    );
  });

  test("un anime que no existe se descarta en silencio", async () => {
    const { eventos } = await correr(
      [
        { content: [pideFrieren] },
        { content: [{ type: "text", text: "No encontré nada." }] },
      ],
      async () => ({ verificado: null, texto: "No existe." }),
    );

    assert.equal(eventos.filter((e) => e.tipo === "tarjeta").length, 0);
    assert.equal(eventos.filter((e) => e.tipo === "error").length, 0);
  });
});

describe("el bucle no se cuelga", () => {
  test("con tres vueltas pidiendo herramienta, la última prohíbe herramientas", async () => {
    const { peticiones } = await correr([
      { content: [pideFrieren] },
      { content: [{ ...pideFrieren, id: "tu_2" }] },
      { content: [{ type: "text", text: "Ahí está." }] },
    ]);

    assert.equal(peticiones.length, 3);
    const ultima = peticiones[2] as { tool_choice?: { type: string } };
    assert.equal(ultima.tool_choice?.type, "none");
    const primera = peticiones[0] as { tool_choice?: unknown };
    assert.equal(primera.tool_choice, undefined);
  });

  test("el mensaje de la AI se reenvía SIN EDITAR (la firma se rompería)", async () => {
    const conRazonamiento = {
      content: [
        { type: "thinking", thinking: "...", signature: "firma-criptográfica" },
        pideFrieren,
      ],
    };
    const { peticiones } = await correr([
      conRazonamiento,
      { content: [{ type: "text", text: "Listo." }] },
    ]);

    const segunda = peticiones[1] as { messages: { role: string; content: unknown }[] };
    const delAsistente = segunda.messages.find((m) => m.role === "assistant");
    assert.deepEqual(delAsistente?.content, conRazonamiento.content);
  });
});

describe("los topes de contenido", () => {
  test("no se muestran más de cinco tarjetas", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      type: "tool_use",
      id: `tu_${i}`,
      name: "buscar_anime",
      input: { titulo: `Anime ${i}`, razon: "" },
    }));
    let n = 0;
    const { eventos } = await correr(
      [{ content: seis }, { content: [{ type: "text", text: "Ahí está." }] }],
      async () => ({
        verificado: { anime: { ...FRIEREN, id: 1000 + n++ }, razon: "" },
        texto: "{}",
      }),
    );

    assert.equal(eventos.filter((e) => e.tipo === "tarjeta").length, 5);
  });
});
