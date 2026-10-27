import "server-only";
import { paraArranque } from "./anime/destacados.ts";
import { datosDeTarjeta, type Anime } from "./anime/catalogo.ts";
import { sql } from "./db.ts";
import { guardados } from "./lista.ts";
import { idDePerfil } from "./perfil.ts";

/**
 * Qué ve la vitrina al abrir la app, antes de que la persona haga nada.
 *
 * Regla del alcance (§3b): LA VITRINA NUNCA ESTÁ VACÍA. Su reposo siempre es
 * contenido —portadas—, nunca botones ni un logo de bienvenida. Lo que cambia
 * es quién llegó.
 *
 * Nada de esto llama a la AI: todo sale del catálogo y de la biblioteca. Es
 * la primera pantalla y no puede depender de que un servicio externo conteste
 * — ni costar dinero en cada visita.
 */

export type Inicio =
  | {
      /** La parrilla de "¿cuál de estos has visto?". */
      modo: "arranque";
      animes: Anime[];
      saludo: string;
    }
  | {
      /** La vitrina ya poblada, con su encabezado. */
      modo: "reposo";
      tarjetas: { anime: Anime; razon: string }[];
      ancla: string;
      saludo: string;
      animes: Anime[]; // la parrilla, para cuando quiera marcar
    };

/** Va junto a la parrilla, así que apunta a ella: antes decía "Dime qué
 *  acabas de ver" mientras la vitrina preguntaba "¿Cuál de estos has visto?",
 *  y no quedaba claro si había que escribir o tocar. */
const SALUDO_ARRANQUE =
  "Toca las que ya viste — o escríbeme cuál acabas de terminar y te digo qué sigue.";

/** El de la parrilla para quien llega de un anuncio: pide, pero explica. */
const SALUDO_FRIO_PARRILLA =
  "Toca las que ya viste — con tres me basta para decirte qué sigue.";

/** El del que llega de un anuncio: explica el trato antes de pedir nada. */
const SALUDO_FRIO =
  "Mira la vitrina — ahí va lo que la gente no suelta. Marca las que ya viste y te afino el gusto.";

/**
 * Las puertas: lo que ve quien llega con `?v=…`. Cada anuncio apunta a una, y
 * `scripts/reporte-puertas.mjs` las compara de punta a punta (completan el
 * flujo → regresan → a qué costo). Agregar una puerta es agregar una línea;
 * una puerta desconocida se registra en el perfil pero se trata como si no
 * viniera, para que el reporte la enseñe y nadie vea una pantalla rara.
 *
 * Solo aplican a la primera visita: quien vuelve con memoria ve su memoria.
 */
export const PUERTAS = {
  /** La parrilla de "¿cuál de estos has visto?", 24 portadas. */
  parrilla: { modo: "arranque", portadas: 24 },
  /** La misma parrilla, más corta: ¿abruman 24 o ayudan? */
  parrilla12: { modo: "arranque", portadas: 12 },
  /** Seis tarjetas listas ("Para empezar") antes de pedir nada. */
  tarjetas: { modo: "reposo", tarjetas: 6 },
} as const satisfies Record<string, { modo: "arranque"; portadas: number } | { modo: "reposo"; tarjetas: number }>;

export type Puerta = keyof typeof PUERTAS;

export function esPuerta(valor: unknown): valor is Puerta {
  return typeof valor === "string" && valor in PUERTAS;
}

export async function decidirInicio(opciones: {
  dispositivoId: string | null;
  /** Llegó de una campaña o con búsqueda: no trae confianza prestada. */
  fria: boolean;
  /** Si ya se le va a disparar una conversación, la vitrina se llena con eso
   *  y aquí no hace falta poblarla. */
  vaAPreguntar: boolean;
  /** La puerta pedida en la URL (`?v=`), ya validada en forma. */
  puerta?: string | null;
}): Promise<Inicio> {
  const puerta = esPuerta(opciones.puerta) ? PUERTAS[opciones.puerta] : null;
  const animes = await paraArranque(puerta?.modo === "arranque" ? puerta.portadas : 24);

  // Si la conversación arranca sola, sus tarjetas mandan: poblar la vitrina
  // ahora solo haría que parpadeara contenido que se va a reemplazar.
  if (opciones.vaAPreguntar) {
    return { modo: "arranque", animes, saludo: SALUDO_ARRANQUE };
  }

  // ─── ¿Regresa, y nos acordamos de él? ─────────────────────────────────────
  if (opciones.dispositivoId) {
    const memoria = await recordar(opciones.dispositivoId).catch(() => null);
    if (memoria) return { ...memoria, animes };
  }

  // ─── La puerta pedida manda sobre la regla implícita de abajo ─────────────
  if (puerta?.modo === "reposo") {
    return {
      modo: "reposo",
      tarjetas: animes.slice(0, puerta.tarjetas).map((anime) => ({ anime, razon: "" })),
      ancla: "Para empezar",
      saludo: SALUDO_FRIO,
      animes,
    };
  }
  if (puerta?.modo === "arranque") {
    return { modo: "arranque", animes, saludo: opciones.fria ? SALUDO_FRIO_PARRILLA : SALUDO_ARRANQUE };
  }

  // ─── ¿Llegó de un anuncio? Se le da antes de pedirle ──────────────────────
  // El alcance dice que la primera visita ve la parrilla, y para quien llega
  // por WhatsApp está bien: un amigo ya lo avaló. Quien llega de un anuncio
  // no trae nada, y pedirle trabajo antes de darle algo es la forma más cara
  // de perder un clic que ya se pagó.
  if (opciones.fria) {
    return {
      modo: "reposo",
      tarjetas: animes.slice(0, 6).map((anime) => ({ anime, razon: "" })),
      ancla: "Para empezar",
      saludo: SALUDO_FRIO,
      animes,
    };
  }

  // ─── Primera visita normal: la parrilla, como manda el alcance ────────────
  return { modo: "arranque", animes, saludo: SALUDO_ARRANQUE };
}

/**
 * Lo que la app recuerda de alguien que vuelve.
 *
 * Devuelve null si no hay nada que recordar — y entonces se le trata como
 * primera visita SIN mencionar que hubo algo antes: disculparse por olvidar
 * es peor que nunca haber prometido recordar (alcance §3b).
 */
async function recordar(
  dispositivoId: string,
): Promise<Omit<Extract<Inicio, { modo: "reposo" }>, "animes"> | null> {
  const lista = await guardados(dispositivoId);

  // El último título que tocó, para que el saludo demuestre memoria CONCRETA.
  // "Te recuerdo" sin decir qué no demuestra nada.
  const perfilId = await idDePerfil(dispositivoId);
  const [ultimo] = await sql<{ titulo: string; estado: string; episodio: number | null }[]>`
    select c.datos->>'titulo' as titulo, l.estado, l.episodio
      from listas l
      join catalogo_cache c on c.anime_id = l.anime_id
     where l.perfil_id = ${perfilId} and l.estado <> 'descartado'
     order by l.actualizado_en desc
     limit 1
  `;
  if (!ultimo) return null;

  // Lo último que se le recomendó y que todavía no ha tocado (lo que ya
  // marcó, en cualquier estado, ya no es "lo que te dejé").
  const dejadas = await loQueSeLeDejo(perfilId);

  const saludo =
    ultimo.estado === "viendo"
      ? `Ibas en el episodio ${ultimo.episodio ?? "?"} de ${ultimo.titulo}. ¿Seguimos por ahí?`
      : ultimo.estado === "visto"
        ? dejadas.length && !lista.length
          ? `La última vez acabaste ${ultimo.titulo}. ¿Le entraste a alguno de los que te dejé?`
          : `La última vez acabaste ${ultimo.titulo}. ¿Te busco lo que sigue?`
        : ultimo.estado === "abandonada"
          ? `Dejaste ${ultimo.titulo} a medias. ¿Te busco algo que sí te agarre?`
          : `Tenías ${ultimo.titulo} apuntado. ¿Le entramos?`;

  // Lo que está en su lista manda: es lo más accionable.
  if (lista.length) {
    return {
      modo: "reposo",
      tarjetas: lista.map((g) => ({ anime: datosDeTarjeta(g.anime), razon: "" })),
      ancla: "Seguías con esto",
      saludo,
    };
  }

  // Si no guardó nada, lo que se le dejó la última vez, con su porqué: el
  // saludo pregunta por eso y la vitrina lo enseña. Antes la vitrina enseñaba
  // populares genéricos mientras Sen Pai preguntaba por "los que te dejé".
  if (dejadas.length) {
    return { modo: "reposo", tarjetas: dejadas, ancla: "Te dejé esto", saludo };
  }

  // Sin nada que recordar en la vitrina, populares que todavía no ha marcado;
  // el saludo SÍ demuestra memoria y no promete nada que no esté en pantalla.
  // El encabezado dice lo que son: "Para ti" prometía algo hecho a su medida
  // y era una muestra al azar.
  const populares = await paraArranque(6, { sinLoDe: perfilId });
  return {
    modo: "reposo",
    tarjetas: populares.map((anime) => ({ anime, razon: "" })),
    ancla: "Populares",
    saludo,
  };
}

/** Las últimas recomendaciones de este perfil que todavía no ha marcado. */
async function loQueSeLeDejo(perfilId: string): Promise<{ anime: Anime; razon: string }[]> {
  const filas = await sql<{ datos: Anime; razon: string }[]>`
    select c.datos, r.razon
      from perfiles p
      cross join lateral jsonb_to_recordset(p.ultimas_recomendaciones) as r(id int, razon text)
      join catalogo_cache c on c.anime_id = r.id and c.expira_en > now()
     where p.id = ${perfilId}
       and not exists (
         select 1 from listas l where l.perfil_id = p.id and l.anime_id = r.id
       )
  `;
  return filas.map((f) => ({ anime: datosDeTarjeta(f.datos), razon: f.razon ?? "" }));
}
