import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { clasificacionDeJikan } from "../lib/anime/catalogo.ts";
import { verificar, type Marcas } from "../lib/chat/herramientas.ts";
import { conversar } from "../lib/chat/bucle.ts";
import type { Evento } from "../lib/chat/eventos.ts";

/**
 * Los candados de buscar_anime que van MÁS ALLÁ de "existe o no existe":
 *
 * 1. Lo que la persona ya vio, dejó o rechazó no vuelve a la vitrina aunque
 *    la AI lo pida. En producción de Binge Senpai, 38 de cada 100
 *    recomendaciones a gente con 20+ títulos ya estaban en su estante — y
 *    aquí el perfil solo le enseña a la AI sus 40 marcas más recientes.
 * 2. El contenido para adultos (r_x) no se recomienda nunca.
 *
 * Tocan la base de verdad (el catálogo exportado) con filas desechables.
 */

const DEATH_NOTE = 1535;
const RX_ID = -777; // id imposible en MyAnimeList: no choca con nada real
const RX_TITULO = `Prueba Adultos ${randomUUID().slice(0, 8)}`;

after(async () => {
  await sql`delete from titulos_indice where anime_id = ${RX_ID}`;
  await sql`delete from catalogo_cache where anime_id = ${RX_ID}`;
  await sql`delete from busquedas_cache where consulta_normalizada like 'prueba adultos%'`;
  await sql.end();
});

const marca = (m: Marcas[number]["marca"]): Marcas[number] => ({
  marca: m,
  episodio: null,
  calificacion: null,
});

describe("el candado de 'ya lo viste'", () => {
  it("rechaza lo visto, lo que está viendo, lo abandonado y lo descartado", async () => {
    for (const m of ["visto", "viendo", "abandonada", "descartado"] as const) {
      const { verificado, texto } = await verificar(
        { titulo: "Death Note", razon: "x" },
        { [DEATH_NOTE]: marca(m) },
      );
      assert.equal(verificado, null, `con la marca ${m} no debería mostrarse`);
      assert.match(texto, /NO se mostró/);
      assert.match(texto, /Elige otro/);
    }
  });

  it("deja pasar lo apuntado para después, pero avisa que es un recordatorio", async () => {
    const { verificado, texto } = await verificar(
      { titulo: "Death Note", razon: "x" },
      { [DEATH_NOTE]: marca("quiero_ver") },
    );
    assert.equal(verificado?.anime.id, DEATH_NOTE);
    assert.match(texto, /apuntada para después/);
  });

  it("sin marcas, todo sigue igual que antes", async () => {
    const { verificado, texto } = await verificar({ titulo: "Death Note", razon: "x" });
    assert.equal(verificado?.anime.id, DEATH_NOTE);
    assert.doesNotMatch(texto, /nota/);
  });
});

describe("el candado de adultos", () => {
  it("reduce la frase de Jikan al código del catálogo", () => {
    assert.equal(clasificacionDeJikan("Rx - Hentai"), "r_x");
    assert.equal(clasificacionDeJikan("R+ - Mild Nudity"), "r_plus");
    assert.equal(clasificacionDeJikan("R - 17+ (violence & profanity)"), "r");
    assert.equal(clasificacionDeJikan("PG-13 - Teens 13 or older"), "pg_13");
    assert.equal(clasificacionDeJikan("PG - Children"), "pg");
    assert.equal(clasificacionDeJikan("G - All Ages"), "g");
    assert.equal(clasificacionDeJikan("None"), null);
    assert.equal(clasificacionDeJikan(null), null);
  });

  it("un título r_x existe en el catálogo pero no se recomienda", async () => {
    await sql`
      insert into catalogo_cache (anime_id, datos, expira_en)
      values (${RX_ID}, ${sql.json({
        id: RX_ID,
        titulo: RX_TITULO,
        tituloEn: null,
        anio: 2020,
        estado: "Finished Airing",
        portada: null,
        episodios: 1,
        tipo: "ova",
        clasificacion: "r_x",
        donde: [],
        sinonimos: [],
        miembros: 1,
      })}, now() + interval '1 hour')
    `;
    await sql`
      insert into titulos_indice (anime_id, titulo, titulo_normalizado, miembros)
      values (${RX_ID}, ${RX_TITULO}, ${RX_TITULO.toLowerCase()}, 1)
    `;
    const { verificado, texto } = await verificar({ titulo: RX_TITULO, razon: "x" });
    assert.equal(verificado, null);
    assert.match(texto, /adultos/);
  });
});

describe("el bucle le pasa las marcas a buscar_anime", () => {
  const pideDeathNote = {
    type: "tool_use",
    id: "tu_1",
    name: "buscar_anime",
    input: { titulo: "Death Note", razon: "x" },
  };
  const respuestas = [
    { content: [pideDeathNote], usage: {} },
    { content: [{ type: "text", text: "Listo." }], usage: {} },
  ];

  it("las marcas del dispositivo llegan a verificar, y una marca nueva del mismo turno también", async () => {
    const recibidas: Marcas[] = [];
    let vuelta = 0;
    const eventos: Evento[] = [];
    await conversar({
      historial: [],
      mensaje: "acabé Death Note",
      perfil: "",
      dispositivoId: "dispositivo-de-prueba",
      emitir: (e) => eventos.push(e),
      señal: new AbortController().signal,
      postizos: {
        cliente: {
          messages: {
            stream() {
              const r = [
                {
                  content: [
                    {
                      type: "tool_use",
                      id: "tu_0",
                      name: "actualizar_lista",
                      input: { titulo: "Death Note", estado: "visto" },
                    },
                  ],
                  usage: {},
                },
                ...respuestas,
              ][vuelta++];
              return { finalMessage: async () => r };
            },
          },
        } as never,
        marcasDe: async () => ({ 1: marca("viendo") }),
        actualizarLista: async () => ({
          hecho: { animeId: DEATH_NOTE, entrada: marca("visto") },
          texto: "Guardado.",
        }),
        verificar: async (_entrada, marcas) => {
          recibidas.push({ ...(marcas ?? {}) });
          return { verificado: null, texto: "NO se mostró." };
        },
      },
    });
    assert.equal(recibidas.length, 1);
    assert.equal(recibidas[0][1]?.marca, "viendo", "la marca que ya existía");
    assert.equal(recibidas[0][DEATH_NOTE]?.marca, "visto", "la marca recién escrita en este turno");
    assert.ok(!eventos.some((e) => e.tipo === "tarjeta"), "nada salió a la vitrina");
  });
});
