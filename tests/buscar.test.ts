import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esSecuelaDe } from "../lib/anime/buscar.ts";
import { normalizar } from "../lib/anime/titulos.ts";

/**
 * El colapso de secuelas del autocompletado.
 *
 * Sin él, buscar "yaiba" devolvía SEIS entradas de Kimetsu no Yaiba y ninguna
 * otra obra: la lista entera gastada en una franquicia. Con él, hay que
 * cuidar lo contrario — esconder una obra distinta que solo comparte el
 * principio del nombre sería peor que la lista repetida.
 */

const secuela = (base: string, cand: string) =>
  esSecuelaDe(normalizar(base), normalizar(cand));

describe("esSecuelaDe", () => {
  it("colapsa temporadas", () => {
    assert.ok(secuela("Shingeki no Kyojin", "Shingeki no Kyojin Season 2"));
    assert.ok(secuela("Sousou no Frieren", "Sousou no Frieren 2nd Season"));
    assert.ok(
      secuela("Shingeki no Kyojin", "Shingeki no Kyojin Season 3 Part 2"),
    );
  });

  it("colapsa películas y arcos", () => {
    assert.ok(secuela("One Piece", "One Piece Film: Z"));
    assert.ok(
      secuela("Kimetsu no Yaiba", "Kimetsu no Yaiba: Yuukaku-hen"),
    );
    assert.ok(
      secuela(
        "Kimetsu no Yaiba",
        "Kimetsu no Yaiba Movie: Mugen Ressha-hen",
      ),
    );
  });

  it("NO esconde obras distintas que comparten el principio", () => {
    // El caso que rompería la búsqueda: son series diferentes.
    assert.ok(!secuela("Monster", "Monster Musume no Iru Nichijou"));
    assert.ok(!secuela("Death Note", "Death Parade"));
    assert.ok(!secuela("Steins;Gate", "Steins;Gate 0"));
  });

  it("no colapsa nada que no empiece con el título completo", () => {
    assert.ok(!secuela("Kimetsu no Yaiba", "Shin Samurai-den Yaiba"));
    assert.ok(!secuela("One Piece", "Toriko"));
    // Ni el título consigo mismo: si no, la primera se descartaría sola.
    assert.ok(!secuela("Monster", "Monster"));
  });
});
