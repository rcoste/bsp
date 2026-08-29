import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { esCalificacion, esMarca, marcar, marcasDe } from "../lib/lista.ts";

/**
 * La biblioteca: estados, progreso y calificación. Si esto falla, la app
 * "recuerda" nada por más que la persona marque cosas — y la biblioteca es
 * el factor de retención número uno según producción.
 *
 * Estas pruebas tocan la base de verdad, con un dispositivo desechable que se
 * borra al final.
 */

const DISPOSITIVO = `prueba-${randomUUID()}`;
const DEATH_NOTE = 1535;
const FRIEREN = 52991;
const BEBOP = 1;

after(async () => {
  await sql`delete from perfiles where dispositivo_id = ${DISPOSITIVO}`;
  await sql.end();
});

describe("marcar", () => {
  it("guarda una marca y la devuelve", async () => {
    const quedo = await marcar(DISPOSITIVO, DEATH_NOTE, "visto");
    assert.equal(quedo?.marca, "visto");
    const marcas = await marcasDe(DISPOSITIVO);
    assert.equal(marcas[DEATH_NOTE].marca, "visto");
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
    assert.equal(quedo?.marca, "visto");
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from listas l
        join perfiles p on p.id = l.perfil_id
       where p.dispositivo_id = ${DISPOSITIVO} and l.anime_id = ${FRIEREN}
    `;
    assert.equal(n, 1);
  });

  it("viendo lleva el episodio, y actualizarlo NO des-toca la marca", async () => {
    const v8 = await marcar(DISPOSITIVO, BEBOP, "viendo", { episodio: 8 });
    assert.equal(v8?.episodio, 8);
    // "voy en el 9" sobre la misma marca es actualización, no interruptor.
    const v9 = await marcar(DISPOSITIVO, BEBOP, "viendo", { episodio: 9 });
    assert.equal(v9?.marca, "viendo");
    assert.equal(v9?.episodio, 9);
  });

  it("abandonarla conserva el episodio donde iba — ese es el dato bueno", async () => {
    await marcar(DISPOSITIVO, BEBOP, "viendo", { episodio: 12 });
    const dejo = await marcar(DISPOSITIVO, BEBOP, "abandonada");
    assert.equal(dejo?.marca, "abandonada");
    assert.equal(dejo?.episodio, 12);
  });

  it("la calificación acompaña a visto, no a quiero_ver", async () => {
    const visto = await marcar(DISPOSITIVO, FRIEREN, "visto", {
      calificacion: "me_encanto",
    });
    assert.equal(visto?.calificacion, "me_encanto");
    // En quiero_ver la calificación se ignora: aún no la ha visto.
    const pendiente = await marcar(DISPOSITIVO, DEATH_NOTE, "quiero_ver", {
      calificacion: "me_encanto",
    });
    assert.equal(pendiente?.calificacion, null);
  });
});

describe("esMarca / esCalificacion", () => {
  it("aceptan los vocabularios completos", () => {
    for (const m of ["quiero_ver", "viendo", "visto", "abandonada", "descartado"]) {
      assert.ok(esMarca(m), m);
    }
    for (const c of ["no_fue_lo_mio", "estuvo_bien", "me_encanto"]) {
      assert.ok(esCalificacion(c), c);
    }
  });

  it("rechazan cualquier otra cosa — la ruta recibe lo que mande el navegador", () => {
    assert.ok(!esMarca("borrar_todo"));
    assert.ok(!esMarca(""));
    assert.ok(!esMarca(null));
    assert.ok(!esCalificacion("5_estrellas"));
    assert.ok(!esCalificacion(10));
  });
});
