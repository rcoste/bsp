import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db.ts";
import { consumoVacio, registrarGasto, sumarVuelta } from "../chat/gasto.ts";
import { idDePerfil } from "../perfil.ts";
import { ADULTOS, datosDeTarjeta, type Anime } from "./catalogo.ts";

/**
 * La hoja de detalle (alcance v1, módulo 4): sinopsis SIN SPOILERS en
 * español, dónde verlo y las otras entradas de la misma obra. Nada más: ni
 * personajes, ni reseñas, ni episodios uno por uno — eso es el producto viejo.
 *
 * Las 25 mil sinopsis del catálogo están en inglés y muchas cuentan el final.
 * No se traducen por adelantado: la de cada serie se escribe la PRIMERA vez
 * que alguien abre su hoja y se guarda en catalogo_cache.sinopsis_es. Cuesta
 * ~$0.002 una sola vez por título, y nunca se paga por títulos que nadie abre.
 */

export type Detalle = {
  anime: Anime;
  /** La sinopsis sin spoilers, en español. null = no hay de dónde sacarla
   *  (y entonces la hoja omite la sección en vez de dejar un hueco). */
  sinopsis: string | null;
  generos: string[];
  /** Temporadas, películas y OVAs de la misma obra, por año. */
  relacionados: Anime[];
};

/** Quien escribe la sinopsis. Intercambiable para las pruebas. */
export type Redactor = (titulo: string, sinopsisEn: string) => Promise<string | null>;

const MODELO = "claude-sonnet-5-5";
/** Marca de "ya lo intentamos y no dio para sinopsis": no se vuelve a pagar. */
const SIN_SINOPSIS = "";
/** Cuántas hojas con sinopsis NUEVA puede abrir un dispositivo al día. Las
 *  ya escritas no cuentan. Es el candado contra un rastreador que abra 25 mil. */
const TOPE_REDACCIONES_DIA = 60;

type Fila = {
  datos: Anime & { sinopsis?: string | null; generos?: string[]; serie?: number | null };
  sinopsis_es: string | null;
};

/**
 * Redacta con Claude. "Sin spoilers" es la regla, no un adorno: los fans de
 * anime son alérgicos, y una sinopsis de temporada 2 arruina la temporada 1.
 */
async function redactarConClaude(
  titulo: string,
  sinopsisEn: string,
  perfilId: string | null,
): Promise<string | null> {
  const cliente = new Anthropic();
  const consumo = consumoVacio();
  const arranque = Date.now();
  const respuesta = await cliente.messages.create({
    model: MODELO,
    max_tokens: 600,
    output_config: { effort: "low" },
    system:
      "Escribes sinopsis de anime en español latinoamericano neutro para gente " +
      "que todavía NO ha visto la serie. Reglas: un solo párrafo de máximo 70 " +
      "palabras; presenta la premisa y el tono, nunca giros, muertes, " +
      "revelaciones ni finales — si el texto original los cuenta, omítelos; " +
      "sin encabezados, comillas ni emoji; no inventes datos que el texto no " +
      "dé. Si el texto no alcanza para una sinopsis, responde exactamente: NADA.",
    messages: [
      {
        role: "user",
        content: `Título: ${titulo}\n\nSinopsis original (inglés):\n${sinopsisEn.slice(0, 2500)}`,
      },
    ],
  });
  sumarVuelta(consumo, respuesta.usage);
  void registrarGasto({
    perfilId,
    modelo: MODELO,
    consumo,
    tarjetas: 0,
    msPrimeraTarjeta: null,
    msTotal: Date.now() - arranque,
  });
  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return !texto || texto.toUpperCase() === "NADA" ? null : texto;
}

/** ¿Este dispositivo todavía puede pedir sinopsis nuevas hoy? */
async function puedeRedactar(dispositivoId: string): Promise<boolean> {
  const ventana = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000);
  const [{ incrementar_uso: usadas }] = await sql<{ incrementar_uso: number }[]>`
    select incrementar_uso(${dispositivoId}, 'detalle', ${ventana})
  `;
  return usadas <= TOPE_REDACCIONES_DIA;
}

export async function detalleDe(
  id: number,
  opciones: { dispositivoId?: string; redactor?: Redactor } = {},
): Promise<Detalle | null> {
  const [fila] = await sql<Fila[]>`
    select datos, sinopsis_es from catalogo_cache
     where anime_id = ${id} and expira_en > now()
  `;
  if (!fila) return null;
  const { datos } = fila;

  // Las otras entradas de la obra, sin adultos y sin la que ya se está viendo.
  const serie = datos.serie ?? null;
  const relacionados = serie
    ? (
        await sql<{ datos: Anime }[]>`
          select datos from catalogo_cache
           where datos->>'serie' = ${String(serie)}
             and anime_id <> ${id}
             and expira_en > now()
             and coalesce(datos->>'clasificacion', '') <> ${ADULTOS}
           order by (datos->>'anio')::int nulls last, (datos->>'miembros')::bigint desc
           limit 8
        `
      ).map((r) => datosDeTarjeta(r.datos))
    : [];

  // La sinopsis: primero la guardada; si no hay, se redacta UNA vez.
  let sinopsis: string | null = fila.sinopsis_es;
  if (sinopsis === null && datos.sinopsis) {
    const permitido = opciones.dispositivoId ? await puedeRedactar(opciones.dispositivoId) : true;
    if (permitido) {
      const perfilId = opciones.dispositivoId ? await idDePerfil(opciones.dispositivoId).catch(() => null) : null;
      const redactar = opciones.redactor ?? ((t, s) => redactarConClaude(t, s, perfilId));
      try {
        const escrita = await redactar(datos.titulo, datos.sinopsis);
        // Se guarda también el "no dio para nada": así no se vuelve a pagar.
        await sql`
          update catalogo_cache set sinopsis_es = ${escrita ?? SIN_SINOPSIS}
           where anime_id = ${id} and sinopsis_es is null
        `;
        sinopsis = escrita ?? SIN_SINOPSIS;
      } catch {
        // Sin sinopsis esta vez; la hoja omite la sección. Se reintenta en la
        // siguiente apertura.
        sinopsis = null;
      }
    }
  }

  return {
    anime: datosDeTarjeta(datos),
    sinopsis: sinopsis ? sinopsis : null,
    generos: datos.generos ?? [],
    relacionados,
  };
}
