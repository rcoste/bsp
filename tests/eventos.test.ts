import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { esNombreEvento, limpiarDatos, registrarEvento } from "../lib/eventos-uso.ts";
import { idDePerfil } from "../lib/perfil.ts";

/**
 * La bitácora de uso. Si cuenta mal, el reporte de puertas mueve presupuesto
 * de anuncios hacia la puerta equivocada. Si tumba algo, peor: es telemetría
 * y no puede estorbarle a nadie.
 */

const DISPOSITIVO = `prueba-eventos-${randomUUID()}`;

after(async () => {
  await sql`delete from perfiles where dispositivo_id = ${DISPOSITIVO}`;
  await sql.end();
});

describe("registrarEvento", () => {
  it("anota el evento con el tiempo desde la llegada, calculado en el servidor", async () => {
    const perfilId = await idDePerfil(DISPOSITIVO);
    // La llegada fue hace 90 segundos.
    await sql`update perfiles set creado_en = now() - interval '90 seconds' where id = ${perfilId}`;
    await registrarEvento(DISPOSITIVO, "marca", { animeId: 1535, marca: "visto", desde: "parrilla", quedo: true });
    const [fila] = await sql<{ nombre: string; datos: Record<string, unknown>; ms: number }[]>`
      select nombre, datos, ms_desde_llegada::int as ms from eventos where perfil_id = ${perfilId}
    `;
    assert.equal(fila.nombre, "marca");
    assert.equal(fila.datos.desde, "parrilla");
    assert.ok(fila.ms >= 89_000 && fila.ms < 120_000, `ms_desde_llegada fuera de rango: ${fila.ms}`);
  });

  it("sin perfil no anota nada — y no truena", async () => {
    await registrarEvento(`no-existe-${randomUUID()}`, "guardados");
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from eventos e join perfiles p on p.id = e.perfil_id
       where p.dispositivo_id like 'no-existe-%'
    `;
    assert.equal(n, 0);
  });
});

describe("lo que entra a la bitácora", () => {
  it("solo nombres de la lista cerrada", () => {
    assert.equal(esNombreEvento("mensaje"), true);
    assert.equal(esNombreEvento("click_boton_azul"), false);
    assert.equal(esNombreEvento(42), false);
  });

  it("los datos se quedan chicos y planos", () => {
    const limpio = limpiarDatos({
      animeId: 1,
      via: "chip",
      quedo: true,
      anidado: { no: "pasa" },
      "Clave Rara!": 1,
      largo: "x".repeat(500),
    });
    assert.deepEqual(Object.keys(limpio).sort(), ["animeId", "largo", "quedo", "via"]);
    assert.equal((limpio.largo as string).length, 80);
    assert.deepEqual(limpiarDatos("no es objeto"), {});
  });
});
