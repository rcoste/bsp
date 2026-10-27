import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { decidirInicio, esPuerta } from "../lib/inicio.ts";
import { marcar } from "../lib/lista.ts";

/**
 * Qué ve la vitrina al abrir. Tres puertas distintas, y confundirlas cuesta:
 * enseñarle la parrilla a quien llegó de un anuncio pagado es pedirle trabajo
 * antes de darle nada; y saludar sin memoria concreta a quien vuelve tira
 * justo lo que hace especial al producto.
 *
 * Regla dura del alcance §3b: LA VITRINA NUNCA ESTÁ VACÍA.
 */

const NUEVO = `prueba-${randomUUID()}`;
const CONOCIDO = `prueba-${randomUUID()}`;
const DANDADAN = 57334;

after(async () => {
  await sql`delete from perfiles where dispositivo_id in (${NUEVO}, ${CONOCIDO})`;
  await sql.end();
});

describe("decidirInicio", () => {
  it("primera visita directa: la parrilla, como manda el alcance", async () => {
    const i = await decidirInicio({
      dispositivoId: null,
      fria: false,
      vaAPreguntar: false,
    });
    assert.equal(i.modo, "arranque");
    assert.ok(i.animes.length > 0, "la vitrina nunca está vacía");
  });

  it("llegada de campaña: contenido ANTES de pedir nada", async () => {
    const i = await decidirInicio({
      dispositivoId: null,
      fria: true,
      vaAPreguntar: false,
    });
    assert.equal(i.modo, "reposo");
    if (i.modo !== "reposo") return;
    assert.ok(i.tarjetas.length > 0, "aterriza con tarjetas, no con una pregunta");
    // Sin porqué: nadie se lo recomendó todavía. Inventar una razón aquí sería
    // la vaguedad que nos iguala con cualquier lista genérica.
    assert.equal(i.tarjetas[0].razon, "");
  });

  it("si la conversación va a arrancar sola, no se puebla la vitrina", async () => {
    // Si no, parpadearía contenido que se reemplaza en 5 segundos.
    const i = await decidirInicio({
      dispositivoId: null,
      fria: true,
      vaAPreguntar: true,
    });
    assert.equal(i.modo, "arranque");
  });

  it("quien vuelve ve su lista y un saludo con memoria CONCRETA", async () => {
    await marcar(CONOCIDO, DANDADAN, "viendo", { episodio: 3 });
    const i = await decidirInicio({
      dispositivoId: CONOCIDO,
      fria: false,
      vaAPreguntar: false,
    });
    assert.equal(i.modo, "reposo");
    if (i.modo !== "reposo") return;
    assert.equal(i.ancla, "Seguías con esto");
    // El saludo tiene que nombrar algo suyo. "Te recuerdo" a secas no
    // demuestra nada.
    assert.match(i.saludo, /episodio 3/);
    assert.ok(
      i.tarjetas.some((t) => t.anime.id === DANDADAN),
      "lo que está viendo aparece en la vitrina",
    );
  });

  it("un dispositivo sin nada marcado se trata como primera visita", async () => {
    // Y SIN mencionar que hubo algo antes: disculparse por olvidar es peor
    // que nunca haber prometido recordar (alcance §3b).
    const i = await decidirInicio({
      dispositivoId: NUEVO,
      fria: false,
      vaAPreguntar: false,
    });
    assert.equal(i.modo, "arranque");
    assert.doesNotMatch(i.saludo, /recuerdo|antes|última vez/i);
  });
});

describe("las puertas (?v=)", () => {
  it("?v=parrilla enseña la parrilla aunque llegue de un anuncio", async () => {
    const i = await decidirInicio({ dispositivoId: null, fria: true, vaAPreguntar: false, puerta: "parrilla" });
    assert.equal(i.modo, "arranque");
    assert.equal(i.animes.length, 24);
  });

  it("?v=parrilla12 es la misma parrilla, más corta", async () => {
    const i = await decidirInicio({ dispositivoId: null, fria: true, vaAPreguntar: false, puerta: "parrilla12" });
    assert.equal(i.modo, "arranque");
    assert.equal(i.animes.length, 12);
  });

  it("?v=tarjetas da contenido aunque NO venga de campaña (un link por WhatsApp)", async () => {
    const i = await decidirInicio({ dispositivoId: null, fria: false, vaAPreguntar: false, puerta: "tarjetas" });
    assert.equal(i.modo, "reposo");
    if (i.modo !== "reposo") return;
    assert.equal(i.tarjetas.length, 6);
  });

  it("una puerta desconocida se ignora: nadie ve una pantalla rara", async () => {
    const i = await decidirInicio({ dispositivoId: null, fria: false, vaAPreguntar: false, puerta: "inventada" });
    assert.equal(i.modo, "arranque");
    assert.equal(esPuerta("inventada"), false);
  });
});

describe("la primera pantalla no apuesta la primera impresión", () => {
  it("ni la parrilla ni las tarjetas de llegada traen r_x ni r_plus", async () => {
    for (const puerta of ["parrilla", "tarjetas"]) {
      const i = await decidirInicio({ dispositivoId: null, fria: true, vaAPreguntar: false, puerta });
      const animes = i.modo === "reposo" ? [...i.tarjetas.map((t) => t.anime), ...i.animes] : i.animes;
      for (const a of animes) {
        assert.ok(a.clasificacion !== "r_x" && a.clasificacion !== "r_plus", `${a.titulo} (${a.clasificacion}) en ${puerta}`);
      }
    }
  });
});
