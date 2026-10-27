import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { paraArranque } from "../lib/anime/destacados.ts";
import { decidirInicio, esPuerta } from "../lib/inicio.ts";
import { marcar } from "../lib/lista.ts";
import { recordarRecomendaciones } from "../lib/perfil.ts";

/**
 * Qué ve la vitrina al abrir. Tres puertas distintas, y confundirlas cuesta:
 * enseñarle la parrilla a quien llegó de un anuncio pagado es pedirle trabajo
 * antes de darle nada; y saludar sin memoria concreta a quien vuelve tira
 * justo lo que hace especial al producto.
 *
 * Regla dura del alcance §3b: LA VITRINA NUNCA ESTÁ VACÍA.
 */

const NUEVO = `prueba-${randomUUID()}`;
const VUELVE = `prueba-${randomUUID()}`;
const CONOCIDO = `prueba-${randomUUID()}`;
const DANDADAN = 57334;

after(async () => {
  await sql`delete from perfiles where dispositivo_id in (${NUEVO}, ${CONOCIDO}, ${VUELVE})`;
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

  it("tampoco las obras PG-13 cuyo gancho es el fanservice (Kiss x Sis, Keijo…)", async () => {
    // Se pide la parrilla muchas veces: sale al azar de 400 y un título
    // vetado tendría que asomarse en alguna.
    const vetados = new Set([7593, 32686, 34403, 32901, 37210, 41899, 5958]);
    for (let i = 0; i < 20; i++) {
      for (const a of await paraArranque(24)) {
        assert.ok(!vetados.has(a.id), `${a.titulo} salió en la parrilla`);
      }
    }
  });
});

describe("al volver, la vitrina enseña lo que se le dejó", () => {
  const FRIEREN = 52991;
  const DEATH_NOTE = 1535;
  const MONSTER = 19;

  it("sin guardados pero con recomendaciones previas: 'Te dejé esto', con su porqué", async () => {
    await marcar(VUELVE, FRIEREN, "visto");
    await recordarRecomendaciones(VUELVE, [
      { id: DEATH_NOTE, razon: "Porque acabaste Frieren" },
      { id: MONSTER, razon: "Otro duelo mental" },
    ]);
    const i = await decidirInicio({ dispositivoId: VUELVE, fria: false, vaAPreguntar: false });
    assert.equal(i.modo, "reposo");
    if (i.modo !== "reposo") return;
    assert.equal(i.ancla, "Te dejé esto");
    assert.deepEqual(i.tarjetas.map((t) => t.anime.id).sort(), [MONSTER, DEATH_NOTE].sort());
    assert.ok(i.tarjetas.some((t) => t.razon === "Porque acabaste Frieren"));
    assert.match(i.saludo, /los que te dejé/);
  });

  it("lo que ya marcó deja de ser 'lo que te dejé'; si no queda nada, no lo promete", async () => {
    await marcar(VUELVE, DEATH_NOTE, "visto");
    await marcar(VUELVE, MONSTER, "descartado");
    const i = await decidirInicio({ dispositivoId: VUELVE, fria: false, vaAPreguntar: false });
    assert.equal(i.modo, "reposo");
    if (i.modo !== "reposo") return;
    assert.equal(i.ancla, "Populares");
    assert.doesNotMatch(i.saludo, /te dejé/, "no pregunta por algo que no está en pantalla");
  });

  it("los populares de quien vuelve no traen lo que ya marcó", async () => {
    // Death Note está entre los 40 más vistos: si el filtro fallara, tendría
    // que asomarse en alguna de estas vueltas.
    for (let n = 0; n < 15; n++) {
      const i = await decidirInicio({ dispositivoId: VUELVE, fria: false, vaAPreguntar: false });
      if (i.modo !== "reposo") return assert.fail("esperaba reposo");
      const ids = i.tarjetas.map((t) => t.anime.id);
      assert.ok(!ids.includes(DEATH_NOTE) && !ids.includes(FRIEREN), `ya marcados en populares: ${ids}`);
    }
  });
});
