import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fragmentoClarity, idClarity } from "../lib/clarity.ts";

/**
 * El id de Clarity viaja dentro de un <script>: si no se valida, una variable
 * mal pegada metería código propio en cada página.
 */

describe("idClarity", () => {
  const antes = process.env.NEXT_PUBLIC_CLARITY_ID;
  afterEach(() => {
    if (antes === undefined) delete process.env.NEXT_PUBLIC_CLARITY_ID;
    else process.env.NEXT_PUBLIC_CLARITY_ID = antes;
  });

  it("sin variable no hay Clarity", () => {
    delete process.env.NEXT_PUBLIC_CLARITY_ID;
    assert.equal(idClarity(), null);
  });

  it("acepta un id de proyecto normal, sin espacios", () => {
    process.env.NEXT_PUBLIC_CLARITY_ID = " z0xb0fy2o5\n";
    assert.equal(idClarity(), "z0xb0fy2o5");
  });

  it("rechaza lo que no parece id", () => {
    for (const malo of ['abc"); alert(1); ("', "https://clarity.ms/x", "ab"]) {
      process.env.NEXT_PUBLIC_CLARITY_ID = malo;
      assert.equal(idClarity(), null, malo);
    }
  });

  it("el fragmento carga la etiqueta de ese proyecto", () => {
    assert.match(fragmentoClarity("z0xb0fy2o5"), /"clarity","script","z0xb0fy2o5"\);$/);
  });
});
