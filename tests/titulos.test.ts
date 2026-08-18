import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizar, similitud, elegirMejor, UMBRAL } from "../lib/anime/titulos.ts";

describe("normalizar", () => {
  test("quita acentos", () => {
    assert.equal(normalizar("Pokémon"), "pokemon");
  });
  test("quita signos y colapsa espacios", () => {
    assert.equal(normalizar("Re:ZERO  -Starting Life-"), "re zero starting life");
  });
  test("ignora mayúsculas", () => {
    assert.equal(normalizar("DEATH NOTE"), normalizar("death note"));
  });
});

describe("similitud — variantes del MISMO anime (deben pasar)", () => {
  const debenPasar: [string, string][] = [
    ["death note", "Death Note"],
    ["Fullmetal Alchemist Brotherhood", "Fullmetal Alchemist: Brotherhood"],
    ["Pokemon", "Pokémon"],
    ["Attack on Titan", "Attack on Titan"],
    ["Shingeki no Kyojin", "Shingeki no Kyojin"],
    ["Jujutsu Kaisen", "JUJUTSU KAISEN"],
  ];
  for (const [a, b] of debenPasar) {
    test(`"${a}" ≈ "${b}"`, () => {
      const s = similitud(a, b);
      assert.ok(s >= UMBRAL, `similitud ${s.toFixed(2)} quedó bajo el umbral ${UMBRAL}`);
    });
  }
});

describe("similitud — animes DISTINTOS que se parecen (deben fallar)", () => {
  // Este es el bloque que importa. Si estos pasan, la app le recomienda
  // a alguien un anime que no pidió.
  const debenFallar: [string, string][] = [
    ["Death Note", "Death Parade"],
    ["One Piece", "One Punch Man"],
    ["Monster", "Monster Musume"],
    ["Naruto", "Boruto"],
    ["Bleach", "Beelzebub"],
  ];
  for (const [a, b] of debenFallar) {
    test(`"${a}" ≠ "${b}"`, () => {
      const s = similitud(a, b);
      assert.ok(s < UMBRAL, `similitud ${s.toFixed(2)} pasó el umbral: los confundiría`);
    });
  }
});

describe("títulos cortos: se resuelven por sinónimos, no adivinando", () => {
  // "Re Zero" NO se parece por texto a su título largo. Y está bien: el
  // catálogo trae sinónimos, y por ahí entra. Adivinar por contención fue
  // justo lo que confundía "Monster" con "Monster Musume".
  test("el título corto entra por el sinónimo", () => {
    const r = elegirMejor("Re Zero", [
      {
        id: 31240,
        titulos: [
          "Re:ZERO -Starting Life in Another World-",
          "Re:Zero kara Hajimeru Isekai Seikatsu",
          "Re:Zero",
        ],
      },
    ]);
    assert.equal(r?.id, 31240);
  });
});

describe("secuelas: gana la coincidencia exacta", () => {
  // "Steins;Gate" y "Steins;Gate 0" son obras distintas y se parecen mucho.
  // Lo que evita el error no es el umbral, es que el exacto siempre gana.
  const catalogo = [
    { id: 30484, titulos: ["Steins;Gate 0", "Steins;Gate 0"] },
    { id: 9253, titulos: ["Steins;Gate", "Steins;Gate"] },
  ];
  test("pide el original, recibe el original", () => {
    assert.equal(elegirMejor("Steins;Gate", catalogo)?.id, 9253);
  });
  test("pide la secuela, recibe la secuela", () => {
    assert.equal(elegirMejor("Steins;Gate 0", catalogo)?.id, 30484);
  });
});

describe("elegirMejor", () => {
  const catalogo = [
    { id: 1535, titulos: ["Death Note", "Death Note", "DEATH NOTE"] },
    { id: 16498, titulos: ["Shingeki no Kyojin", "Attack on Titan", "AoT"] },
    { id: 28223, titulos: ["Death Parade", "Death Parade", ""] },
  ];

  test("encuentra el correcto entre parecidos", () => {
    const r = elegirMejor("Death Note", catalogo);
    assert.equal(r?.id, 1535);
  });

  test("encuentra por el título en inglés", () => {
    const r = elegirMejor("Attack on Titan", catalogo);
    assert.equal(r?.id, 16498);
  });

  test("encuentra por sinónimo corto", () => {
    const r = elegirMejor("AoT", catalogo);
    assert.equal(r?.id, 16498);
  });

  test("DEVUELVE NULL si nada se parece — el candado funcionando", () => {
    const r = elegirMejor("Un anime que la AI se inventó", catalogo);
    assert.equal(r, null);
  });

  test("no truena con catálogo vacío", () => {
    assert.equal(elegirMejor("lo que sea", []), null);
  });

  test("ignora títulos vacíos sin confundirse", () => {
    const r = elegirMejor("Death Parade", catalogo);
    assert.equal(r?.id, 28223);
  });
});
