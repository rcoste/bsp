import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nombreOriginal, nombreVisible } from "../lib/anime/nombre.ts";
import { generoEnEspanol } from "../lib/anime/generos.ts";

describe("el nombre que se enseña", () => {
  it("primero el oficial en Latinoamérica, luego inglés, luego romaji", () => {
    assert.equal(
      nombreVisible({ titulo: "Sen to Chihiro no Kamikakushi", tituloEn: "Spirited Away", tituloEs: "El viaje de Chihiro" }),
      "El viaje de Chihiro",
    );
    assert.equal(nombreVisible({ titulo: "Kiseijuu: Sei no Kakuritsu", tituloEn: "Parasyte: The Maxim", tituloEs: null }), "Parasyte: The Maxim");
    assert.equal(nombreVisible({ titulo: "Vinland Saga", tituloEn: null }), "Vinland Saga");
  });

  it("quita el romaji entre paréntesis que traen algunos títulos en español", () => {
    assert.equal(
      nombreVisible({
        titulo: "Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai",
        tituloEn: null,
        tituloEs: "Rascal does not Dream of Bunny Girl Senpai (Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai)",
      }),
      "Rascal does not Dream of Bunny Girl Senpai",
    );
  });

  it("el romaji va debajo solo si es distinto de lo que se enseña", () => {
    assert.equal(nombreOriginal({ titulo: "Death Note", tituloEn: "Death Note", tituloEs: null }), null);
    assert.equal(nombreOriginal({ titulo: "Shingeki no Kyojin", tituloEn: "Attack on Titan", tituloEs: "Ataque a los Titanes" }), "Shingeki no Kyojin");
  });

  it("los géneros salen en español, y uno desconocido sale como viene", () => {
    assert.equal(generoEnEspanol("Award Winning"), "Premiado");
    assert.equal(generoEnEspanol("Shounen"), "Shounen");
    assert.equal(generoEnEspanol("Algo Nuevo"), "Algo Nuevo");
  });
});
