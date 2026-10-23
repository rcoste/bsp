import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { costoDe, consumoVacio, sumarVuelta } from "../lib/chat/gasto.ts";

/**
 * Las tarifas. Un error aquí no rompe nada visible: solo hace que el reporte
 * de gasto mienta — y ya pasó (cobró un 50% de más durante dos meses por una
 * subida de precio que se canceló).
 */

const unMillonLeidos = () => ({ ...consumoVacio(), cacheLeido: 1_000_000 });
const unMillonEntrada = () => ({ ...consumoVacio(), entrada: 1_000_000 });

describe("tarifas", () => {
  it("Sonnet 5.5 lee del caché a la mitad de lo que leía Sonnet 5", () => {
    assert.equal(costoDe(unMillonLeidos(), "claude-sonnet-5-5"), 0.1);
    assert.equal(costoDe(unMillonLeidos(), "claude-sonnet-5"), 0.2);
  });

  it("'claude-sonnet-5-5' no se confunde con 'claude-sonnet-5' (el prefijo coincide)", () => {
    assert.equal(costoDe(unMillonEntrada(), "claude-sonnet-5-5"), 2);
    assert.equal(costoDe(unMillonEntrada(), "claude-sonnet-5"), 2);
  });

  it("Sonnet 5 ya no sube de precio en septiembre", () => {
    assert.equal(costoDe({ ...consumoVacio(), salida: 1_000_000 }, "claude-sonnet-5"), 10);
  });

  it("un modelo desconocido se cobra como el más caro, nunca de menos", () => {
    const raro = costoDe(unMillonEntrada(), "claude-algo-nuevo");
    assert.ok(raro >= costoDe(unMillonEntrada(), "claude-opus-5-5"));
  });

  it("sumarVuelta tolera que no venga el bloque de uso", () => {
    const c = consumoVacio();
    sumarVuelta(c, undefined);
    assert.equal(c.vueltas, 1);
    assert.equal(c.entrada, 0);
  });
});
