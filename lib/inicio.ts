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

const SALUDO_ARRANQUE = "Dime qué acabas de ver y te digo qué sigue, nakama.";

/** El del que llega de un anuncio: explica el trato antes de pedir nada. */
const SALUDO_FRIO =
  "Mira la vitrina — ahí va lo que la gente no suelta. Marca las que ya viste y te afino el gusto.";

export async function decidirInicio(opciones: {
  dispositivoId: string | null;
  /** Llegó de una campaña o con búsqueda: no trae confianza prestada. */
  fria: boolean;
  /** Si ya se le va a disparar una conversación, la vitrina se llena con eso
   *  y aquí no hace falta poblarla. */
  vaAPreguntar: boolean;
}): Promise<Inicio> {
  const animes = await paraArranque(24);

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

  const saludo =
    ultimo.estado === "viendo"
      ? `Ibas en el episodio ${ultimo.episodio ?? "?"} de ${ultimo.titulo}. ¿Seguimos por ahí?`
      : ultimo.estado === "visto"
        ? `La última vez acabaste ${ultimo.titulo}. ¿Le entraste a alguno de los que te dejé?`
        : ultimo.estado === "abandonada"
          ? `Dejaste ${ultimo.titulo} a medias. ¿Te busco algo que sí te agarre?`
          : `Tenías ${ultimo.titulo} apuntado. ¿Le entramos?`;

  // Si su lista está vacía (solo tiene vistos), la vitrina no puede quedarse
  // en blanco: se cae a populares, pero el saludo SÍ demuestra memoria.
  if (!lista.length) {
    const populares = await paraArranque(6);
    return {
      modo: "reposo",
      tarjetas: populares.map((anime) => ({ anime, razon: "" })),
      ancla: "Para ti",
      saludo,
    };
  }

  return {
    modo: "reposo",
    tarjetas: lista.map((g) => ({ anime: datosDeTarjeta(g.anime), razon: "" })),
    ancla: "Seguías con esto",
    saludo,
  };
}
