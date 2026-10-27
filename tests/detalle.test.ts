import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../lib/db.ts";
import { detalleDe } from "../lib/anime/detalle.ts";

/**
 * La hoja de detalle. Lo que no puede fallar: la sinopsis se escribe UNA vez
 * y se guarda (cada redacción cuesta dinero), el "no dio para nada" también
 * se guarda, y los relacionados son la misma obra sin adultos.
 *
 * Usa filas desechables con ids imposibles en MyAnimeList (negativos).
 */

const OBRA = -990_001; // la "serie" de mentira
const A = -9001;
const B = -9002;
const RX = -9003;

const fila = (id: number, titulo: string, anio: number, extras: Record<string, unknown> = {}) => ({
  id,
  titulo,
  tituloEn: null,
  anio,
  estado: "Finished Airing",
  portada: null,
  episodios: 12,
  tipo: "tv",
  clasificacion: "pg_13",
  donde: [],
  sinonimos: [],
  miembros: 1000,
  serie: OBRA,
  generos: ["Drama"],
  ...extras,
});

before(async () => {
  for (const [id, datos] of [
    [A, fila(A, "Obra de prueba", 2020, { sinopsis: "A boy finds a notebook. In the end he dies." })],
    [B, fila(B, "Obra de prueba 2", 2022, { sinopsis: "Season two." })],
    [RX, fila(RX, "Obra de prueba XXX", 2023, { clasificacion: "r_x" })],
  ] as const) {
    await sql`
      insert into catalogo_cache (anime_id, datos, expira_en)
      values (${id}, ${sql.json(datos)}, now() + interval '1 hour')
      on conflict (anime_id) do update set datos = excluded.datos, sinopsis_es = null
    `;
  }
});

after(async () => {
  await sql`delete from catalogo_cache where anime_id in (${A}, ${B}, ${RX})`;
  await sql.end();
});

describe("detalleDe", () => {
  it("redacta la sinopsis una vez, la guarda, y la segunda vez no vuelve a pedirla", async () => {
    let llamadas = 0;
    const redactor = async () => {
      llamadas++;
      return "Un chico encuentra un cuaderno.";
    };
    const primero = await detalleDe(A, { redactor });
    assert.equal(primero?.sinopsis, "Un chico encuentra un cuaderno.");
    assert.equal(llamadas, 1);

    const segundo = await detalleDe(A, {
      redactor: async () => {
        throw new Error("no debería pedirse otra vez");
      },
    });
    assert.equal(segundo?.sinopsis, "Un chico encuentra un cuaderno.");
    assert.equal(llamadas, 1);
  });

  it("los relacionados son la misma obra, por año, sin la propia ni adultos", async () => {
    const d = await detalleDe(A, { redactor: async () => null });
    assert.deepEqual(
      d?.relacionados.map((r) => r.id),
      [B],
      "solo la temporada 2; ni la propia ni la r_x",
    );
    assert.deepEqual(d?.generos, ["Drama"]);
  });

  it("cuando el texto no da para sinopsis, se guarda el 'nada' y no se vuelve a pagar", async () => {
    let llamadas = 0;
    const redactor = async () => {
      llamadas++;
      return null;
    };
    const primero = await detalleDe(B, { redactor });
    assert.equal(primero?.sinopsis, null);
    await detalleDe(B, { redactor });
    assert.equal(llamadas, 1);
  });

  it("un id que no existe devuelve null", async () => {
    assert.equal(await detalleDe(-1, { redactor: async () => null }), null);
  });
});
