import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { esMarca, marcar, marcasDe } from "../lib/lista.ts";

/**
 * Los tres botones de la tarjeta escriben aquí, y lo que se escribe aquí es
 * la memoria del gusto que lee la AI. Si esto falla, la app "recuerda" nada
 * por más que la persona marque cosas — y la memoria es la razón de ser del
 * producto frente a ChatGPT.
 *
 * Estas pruebas tocan la base de verdad, con un dispositivo desechable que se
 * borra al final.
 */

const DISPOSITIVO = `prueba-${randomUUID()}`;
const DEATH_NOTE = 1535;
const FRIEREN = 52991;

after(async () => {
  await sql`delete from perfiles where dispositivo_id = ${DISPOSITIVO}`;
  await sql.end();
});

describe("marcar", () => {
  it("guarda una marca y la devuelve", async () => {
    const quedo = await marcar(DISPOSITIVO, DEATH_NOTE, "visto");
    assert.equal(quedo, "visto");
    const marcas = await marcasDe(DISPOSITIVO);
    assert.equal(marcas[DEATH_NOTE], "visto");
  });

  it("tocar la MISMA marca la quita — un toque de más no es permanente", async () => {
    await marcar(DISPOSITIVO, FRIEREN, "quiero_ver");
    const quedo = await marcar(DISPOSITIVO, FRIEREN, "quiero_ver");
    assert.equal(quedo, null);
    const marcas = await marcasDe(DISPOSITIVO);
    assert.equal(marcas[FRIEREN], undefined);
  });

  it("cambiar de marca reemplaza, no duplica", async () => {
    await marcar(DISPOSITIVO, FRIEREN, "quiero_ver");
    const quedo = await marcar(DISPOSITIVO, FRIEREN, "visto");
    assert.equal(quedo, "visto");
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from listas l
        join perfiles p on p.id = l.perfil_id
       where p.dispositivo_id = ${DISPOSITIVO} and l.anime_id = ${FRIEREN}
    `;
    assert.equal(n, 1);
  });

  it("acepta descartado — el tercer botón escribe de verdad", async () => {
    const quedo = await marcar(DISPOSITIVO, DEATH_NOTE, "descartado");
    assert.equal(quedo, "descartado");
  });
});

describe("esMarca", () => {
  it("acepta las tres marcas reales", () => {
    assert.ok(esMarca("visto"));
    assert.ok(esMarca("quiero_ver"));
    assert.ok(esMarca("descartado"));
  });

  it("rechaza cualquier otra cosa — la ruta recibe lo que mande el navegador", () => {
    assert.ok(!esMarca("borrar_todo"));
    assert.ok(!esMarca(""));
    assert.ok(!esMarca(null));
    assert.ok(!esMarca(42));
  });
});
