import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerLlegada, leerOrigen } from "../lib/llegada.ts";

/**
 * La clasificación de la búsqueda de aterrizaje decide si se gasta una
 * conversación con la AI (~$0.01) o si contesta el catálogo (gratis). Con
 * tráfico pagado, equivocarse hacia "vale" quema presupuesto en rebotes;
 * equivocarse hacia "no vale" desperdicia justo lo que pagamos por saber.
 */

describe("leerLlegada", () => {
  it("las genéricas NO gastan AI — el catálogo ya las contesta", () => {
    for (const q of [
      "anime",
      "qué anime ver",
      "recomendaciones de anime",
      "MEJORES ANIMES",
      "top anime",
      "anime en español",
      "  animes  ",
    ]) {
      assert.equal(leerLlegada(q).vale, false, q);
    }
  });

  it("las específicas SÍ valen la conversación", () => {
    for (const q of [
      "anime parecido a Death Note",
      "algo corto de terror",
      "anime de romance que no sea cursi",
      "parecido a Frieren",
      "anime de los 90",
    ]) {
      assert.equal(leerLlegada(q).vale, true, q);
    }
  });

  it("vacío, basura y ausencia se tratan igual: sin gastar", () => {
    assert.equal(leerLlegada("").vale, false);
    assert.equal(leerLlegada("   ").vale, false);
    assert.equal(leerLlegada(null).vale, false);
    assert.equal(leerLlegada(undefined).vale, false);
    // Solo signos: normaliza a nada.
    assert.equal(leerLlegada("!!! ¿¿¿").vale, false);
  });

  it("recorta consultas absurdamente largas", () => {
    const larga = "a".repeat(500);
    assert.ok(leerLlegada(larga).consulta.length <= 120);
  });

  it("conserva la consulta original, no la normalizada", () => {
    // Lo que se le manda a la AI debe leerse como lo escribió la persona.
    assert.equal(
      leerLlegada("parecido a Death Note").consulta,
      "parecido a Death Note",
    );
  });
});

describe("leerOrigen", () => {
  it("junta fuente y campaña", () => {
    assert.equal(leerOrigen("google", "anime-similar"), "google / anime-similar");
  });

  it("aguanta que falte una de las dos, o las dos", () => {
    assert.equal(leerOrigen("google", null), "google");
    assert.equal(leerOrigen(null, "verano"), "verano");
    assert.equal(leerOrigen(null, null), null);
    assert.equal(leerOrigen("", "  "), null);
  });
});
