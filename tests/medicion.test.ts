import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.ts";
import { marcar } from "../lib/lista.ts";
import { idDePerfil } from "../lib/perfil.ts";
import { conversionesRecientes, detectarConversiones, registrarClic } from "../lib/medicion.ts";

/**
 * Las conversiones que BSP le reporta a Google Ads. Si esto cuenta de más,
 * el laboratorio de campañas declara ganador a BSP con datos inflados; si
 * cuenta de menos, Google deja de pujar por la gente buena.
 *
 * Tocan la base de verdad, con dispositivos desechables que se borran al final.
 */

const PREFIJO = `prueba-medicion-${randomUUID()}`;
let siguiente = 0;

/** Una persona que llegó hace `haceHoras`, por un anuncio salvo que se diga. */
async function persona(haceHoras: number, opciones: { clicMinutosDespues?: number; sinClic?: boolean } = {}) {
  const n = siguiente++;
  const conClic = !opciones.sinClic;
  const [p] = await sql<{ id: string }[]>`
    insert into perfiles (dispositivo_id, creado_en, gclid, clic_en)
    values (
      ${`${PREFIJO}-${n}`},
      now() - make_interval(hours => ${haceHoras}),
      ${conClic ? `boleto-de-prueba-${n}` : null},
      case when ${conClic}::boolean
        then now() - make_interval(hours => ${haceHoras}) + make_interval(mins => ${opciones.clicMinutosDespues ?? 0})
      end
    )
    returning id
  `;
  // El primer clic también entra al historial, como hace /api/llegada.
  if (conClic) await clicA(p.id, (opciones.clicMinutosDespues ?? 0) / 60, `boleto-de-prueba-${n}`);
  return p.id;
}

/** Un clic de anuncio a `horas` de su llegada (negativo = antes de llegar). */
async function clicA(perfilId: string, horas: number, boleto: string) {
  await sql`
    insert into clics_ads (perfil_id, gclid, ocurrio_en)
    select id, ${boleto}, creado_en + make_interval(secs => ${horas * 3600})
      from perfiles where id = ${perfilId}
  `;
}

/** Qué boleto viaja a Google con cada conversión de esta persona. */
async function boletosQueSeSuben(perfilId: string): Promise<Record<string, string | null>> {
  const mios = await sql<{ gclid: string }[]>`select gclid from clics_ads where perfil_id = ${perfilId}`;
  const boletos = new Set(mios.map((m) => m.gclid));
  const resultado: Record<string, string | null> = {};
  for (const c of await conversionesRecientes()) {
    if (c.gclid && boletos.has(c.gclid)) resultado[c.conversion] = c.gclid;
  }
  return resultado;
}

/** Marca `cuantas` series, un segundo entre cada una, a `horas` de su llegada. */
async function marcarSeries(perfilId: string, cuantas: number, horas: number, estado = "visto", primerAnime = 1) {
  await sql`
    insert into listas (perfil_id, anime_id, estado, creado_en)
    select ${perfilId}, ${primerAnime} + g, ${estado},
           p.creado_en + make_interval(hours => ${horas}) + make_interval(secs => g)
      from generate_series(0, ${cuantas - 1}) g
      join perfiles p on p.id = ${perfilId}
  `;
}

/** Un uso de la app a `horas` de su llegada. */
async function usoA(perfilId: string, horas: number) {
  await sql`
    insert into actividad_dias (perfil_id, dia, primera, ultima)
    select id, (creado_en + make_interval(hours => ${horas}))::date,
           creado_en + make_interval(hours => ${horas}),
           creado_en + make_interval(hours => ${horas})
      from perfiles where id = ${perfilId}
    on conflict (perfil_id, dia) do update set ultima = excluded.ultima
  `;
}

async function de(perfilId: string) {
  return sql<{ accion: string; ocurrio_en: Date }[]>`
    select accion, ocurrio_en from conversiones_ads where perfil_id = ${perfilId} order by accion
  `;
}

async function llegadaDe(perfilId: string): Promise<Date> {
  const [p] = await sql<{ creado_en: Date }[]>`select creado_en from perfiles where id = ${perfilId}`;
  return p.creado_en;
}

const horas = (h: number) => h * 60 * 60 * 1000;

after(async () => {
  await sql`delete from perfiles where dispositivo_id like ${PREFIJO + "%"}`;
  await sql.end();
});

describe("20 animes", () => {
  it("cuenta en sus primeras 24 h, a la hora de la serie número 20", async () => {
    const id = await persona(30);
    await marcarSeries(id, 20, 1);
    await detectarConversiones();
    const [c] = await de(id);
    assert.equal(c?.accion, "veinte");
    const esperada = (await llegadaDe(id)).getTime() + horas(1) + 19_000;
    assert.equal(c.ocurrio_en.getTime(), esperada);
  });

  it("19 series y un descartado no son 20", async () => {
    const id = await persona(30);
    await marcarSeries(id, 19, 1);
    await marcarSeries(id, 1, 1, "descartado", 500);
    await detectarConversiones();
    assert.equal((await de(id)).length, 0);
  });

  it("lo marcado después de las primeras 24 h no cuenta", async () => {
    const id = await persona(40);
    await marcarSeries(id, 10, 1);
    await marcarSeries(id, 10, 25, "visto", 500);
    await detectarConversiones();
    assert.equal((await de(id)).length, 0);
  });

  it("quien ya usaba BSP y luego picó un anuncio no lo trajo el anuncio", async () => {
    const id = await persona(30, { clicMinutosDespues: 600 });
    await marcarSeries(id, 20, 11);
    await detectarConversiones();
    assert.equal((await de(id)).length, 0);
  });

  it("sin clic de Google no hay nada que reportar", async () => {
    const id = await persona(30, { sinClic: true });
    await marcarSeries(id, 20, 1);
    await usoA(id, 30);
    await detectarConversiones();
    assert.equal((await de(id)).length, 0);
  });
});

describe("regreso", () => {
  it("cuenta el primer uso entre las 24 h y los 7 días", async () => {
    const id = await persona(100);
    await usoA(id, 2);
    await usoA(id, 50);
    await usoA(id, 75);
    await detectarConversiones();
    const [c] = await de(id);
    assert.equal(c?.accion, "regreso");
    assert.equal(c.ocurrio_en.getTime(), (await llegadaDe(id)).getTime() + horas(50));
  });

  it("volver antes de 24 h o después de 7 días no es regreso", async () => {
    const id = await persona(200);
    await usoA(id, 12);
    await usoA(id, 180);
    await detectarConversiones();
    assert.equal((await de(id)).length, 0);
  });
});

describe("detectar otra vez", () => {
  it("no duplica ni mueve la hora aunque cambie la biblioteca", async () => {
    const id = await persona(30);
    await marcarSeries(id, 20, 1);
    await detectarConversiones();
    const [antes] = await de(id);

    // Desmarcar y volver a marcar mueve la serie número 20 de lugar.
    await sql`delete from listas where perfil_id = ${id} and anime_id = 1`;
    await marcarSeries(id, 1, 5, "visto", 900);
    await detectarConversiones();

    const despues = await de(id);
    assert.equal(despues.length, 1);
    assert.equal(despues[0].ocurrio_en.getTime(), antes.ocurrio_en.getTime());
  });
});

describe("lo que se manda a Google", () => {
  it("lleva el boleto, el nombre exacto, el valor y la hora", async () => {
    const id = await persona(100);
    await marcarSeries(id, 20, 1);
    await usoA(id, 30);
    await detectarConversiones();
    const [{ gclid }] = await sql<{ gclid: string }[]>`select gclid from perfiles where id = ${id}`;
    const mias = (await conversionesRecientes()).filter((c) => c.gclid === gclid);
    assert.deepEqual(
      mias.map((c) => [c.conversion, c.valor, c.moneda]),
      [
        ["Shelf 20 shows (day 0)", 2, "MXN"],
        ["Engaged return (7d)", 13, "MXN"],
      ],
    );
    assert.match(mias[0].hora, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("días de uso", () => {
  const diasDe = (id: string) =>
    sql<{ primera: Date; ultima: Date }[]>`select primera, ultima from actividad_dias where perfil_id = ${id}`;

  it("abrir la app sin hacer nada no cuenta, como en Binge Senpai", async () => {
    const id = await idDePerfil(`${PREFIJO}-solo-abre`);
    assert.equal((await diasDe(id)).length, 0);
  });

  it("marcar anota el día, una vez por día", async () => {
    const dispositivo = `${PREFIJO}-marca`;
    await marcar(dispositivo, 1535, "visto");
    await marcar(dispositivo, 52991, "quiero_ver");
    const filas = await diasDe(await idDePerfil(dispositivo));
    assert.equal(filas.length, 1);
    assert.ok(filas[0].ultima.getTime() >= filas[0].primera.getTime());
  });
});

describe("qué clic se le sube a Google", () => {
  const VEINTE = "Shelf 20 shows (day 0)";
  const REGRESO = "Engaged return (7d)";
  const boletoDe = async (id: string) =>
    (await sql<{ gclid: string }[]>`select gclid from perfiles where id = ${id}`)[0].gclid;

  it("un solo clic: la conversión viaja con ese clic", async () => {
    const id = await persona(30);
    await marcarSeries(id, 20, 1);
    await detectarConversiones();
    assert.deepEqual(await boletosQueSeSuben(id), { [VEINTE]: await boletoDe(id) });
  });

  it("un clic nuevo ANTES de la conversión: se sube el nuevo", async () => {
    const id = await persona(30);
    await clicA(id, 0.5, `${PREFIJO}-nuevo-antes`);
    await marcarSeries(id, 20, 1);
    await detectarConversiones();
    assert.deepEqual(await boletosQueSeSuben(id), { [VEINTE]: `${PREFIJO}-nuevo-antes` });
  });

  it("un clic nuevo DESPUÉS de la conversión: esa se sube con el anterior; la siguiente, con el nuevo", async () => {
    // Llega a 20 el día 0; el día 3 vuelve por otro anuncio y usa la app.
    const id = await persona(100);
    await marcarSeries(id, 20, 1);
    await clicA(id, 72, `${PREFIJO}-nuevo-despues`);
    await usoA(id, 80);
    await detectarConversiones();
    assert.deepEqual(await boletosQueSeSuben(id), {
      [VEINTE]: await boletoDe(id),
      [REGRESO]: `${PREFIJO}-nuevo-despues`,
    });
  });

  it("un clic de más de 90 días no se sube (Google lo rechazaría)", async () => {
    // Lo que le pasó a Binge Senpai: el único clic tiene 95 días.
    const id = await persona(95 * 24);
    await sql`
      insert into conversiones_ads (perfil_id, accion, ocurrio_en)
      values (${id}, 'regreso', now() - interval '6 days')
    `;
    assert.deepEqual(await boletosQueSeSuben(id), {});
  });

  it("una visita sin clic no cambia nada; el mismo boleto dos veces tampoco", async () => {
    const id = await persona(30);
    const antes = await sql`select gclid, ocurrio_en from clics_ads where perfil_id = ${id}`;
    await registrarClic(id, null);
    await registrarClic(id, { gclid: await boletoDe(id), gbraid: null, wbraid: null });
    const despues = await sql`select gclid, ocurrio_en from clics_ads where perfil_id = ${id}`;
    assert.deepEqual(despues, antes);
  });
});
