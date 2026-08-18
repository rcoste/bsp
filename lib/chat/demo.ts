import "server-only";
import { sql } from "../db.ts";
import { soloSeisCampos, type Anime } from "../anime/catalogo.ts";
import type { Evento, Turno } from "./eventos.ts";

/**
 * El chat de mentira.
 *
 * Existe para poder juzgar la INTERFAZ — las transiciones, el orden en que
 * llegan las cosas, cómo se siente la espera — sin gastar una llamada de la
 * API ni depender de que exista la llave.
 *
 * Emite exactamente los mismos eventos que el bucle de verdad y con tiempos
 * parecidos a los medidos: primero un silencio de "está pensando", luego las
 * portadas de una en una, y solo al final el texto. Si el orden se ve bien
 * aquí, se verá bien con el chat real.
 *
 * DOS COSAS QUE NO SE PUEDEN JUZGAR CON ESTO: si las recomendaciones son
 * buenas (los títulos salen de una regla tonta, no de un modelo) y cuánto
 * tarda de verdad (aquí los tiempos están escritos a mano).
 *
 * Se apaga solo: solo corre cuando NO hay llave y fuera de producción.
 */

const PENSANDO_MS = 1500;
const ENTRE_PORTADAS_MS = 650;
const ANTES_DEL_TEXTO_MS = 450;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Trae animes reales del catálogo semilla: portadas y títulos de verdad. */
async function delCatalogo(limite: number): Promise<Anime[]> {
  const filas = await sql<{ datos: Anime }[]>`
    select datos from catalogo_cache
     where expira_en > now() and datos->>'portada' is not null
     order by random()
     limit ${limite}
  `;
  return filas.map((f) => soloSeisCampos(f.datos));
}

type Guion = {
  razones: (a: Anime, eco: string, i: number) => string;
  texto: string;
  chips: string[];
};

function guionPara(mensaje: string, eco: string): Guion {
  const m = mensaje.toLowerCase();

  if (/sorpr[eé]nd|sorpresa|lo que sea/.test(m)) {
    return {
      razones: (a) =>
        `Nadie lo pide y todos lo terminan${a.anio ? ` · ${a.anio}` : ""}`,
      texto:
        "Te tiré el dado. Este no lo habrías buscado tú solo, y justamente por eso te lo pongo. Dale una oportunidad de tres episodios.",
      chips: ["Otro distinto", "Algo más corto", "Más acción"],
    };
  }

  if (/corto|finde|fin de semana|r[aá]pid|pocos cap/.test(m)) {
    return {
      razones: (a, _e, i) =>
        [
          a.estado?.toLowerCase().includes("finished")
            ? "Terminada, no te deja a medias"
            : "Se ve de corrido en dos tardes",
          "Una sola temporada y cierra bien",
          "Empieza fuerte, no hay que aguantarle nada",
        ][i] ?? "",
      texto:
        "Series que sí terminan, para que no te agarre el lunes a medio arco. Están en la vitrina.",
      chips: ["Aún más corto", "Más acción", "Menos conocido"],
    };
  }

  if (/acci[oó]n|pelea|shonen|batalla/.test(m)) {
    return {
      razones: (a, e, i) =>
        [
          e
            ? `Misma energía que ${e}`
            : "Puñetazos con coreografía, no relleno",
          "Las peleas se sienten, no solo se ven",
          "Sube de intensidad y no baja",
        ][i] ?? "",
      texto: "Modo pelea. Mira la vitrina, ahí tienes con qué.",
      chips: ["Algo más tranquilo", "Algo más corto", "Menos conocido"],
    };
  }

  if (/menos conocid|raro|joya|nadie/.test(m)) {
    return {
      razones: () => "Joya que casi nadie menciona en las listas",
      texto:
        "De las que no salen en los top 10 de YouTube. Si te gusta alguna, dime cuál y te sigo por ahí.",
      chips: ["Más acción", "Algo más corto", "Sorpréndeme"],
    };
  }

  if (/hola|buenas|qu[eé] tal|gracias|ok$/.test(m.trim())) {
    return {
      razones: () => "",
      texto:
        "Aquí ando. Dime qué acabaste de ver, o marca arriba un par de portadas y yo saco lo demás.",
      chips: ["Acabé una serie", "Algo corto para el finde", "Sorpréndeme"],
    };
  }

  return {
    razones: (a, e, i) =>
      [
        e ? `Porque viste ${e}` : "Va con lo que me acabas de decir",
        e
          ? `Mismo tono que ${e}, sin repetirlo`
          : "El siguiente escalón natural",
        "La que casi nadie te va a nombrar",
      ][i] ?? "",
    texto: eco
      ? `Si te enganchó ${eco}, esto es lo que sigue. Está en la vitrina.`
      : "Con eso ya me hago una idea. Mira la vitrina.",
    chips: ["Más acción", "Algo más corto", "Menos conocido"],
  };
}

/** Saca un título del mensaje para poder hacer eco, como hace el chat real. */
function ecoDe(mensaje: string): string {
  // Solo el mensaje de AHORA, nunca el historial: el saludo de la AI dice
  // "Dime qué acabas de ver" y el patrón lo mordía como si fuera un título.
  const m = mensaje.match(
    /(?:acab[ée]|acabo de ver|termin[ée]|ya vi|vi)\s+(?:de ver\s+)?([^.,?!\n]{3,40})/i,
  );
  const posible = m ? m[1].trim().replace(/\s+y\s+.*$/i, "") : "";
  // "Acabé una serie" no nombra nada: hacer eco de eso sonaría a robot.
  return /^(una|la|el|un|unas|unos|otra|algo|esa|este|ese)\b/i.test(posible) ? "" : posible;
}

/** Dijo que acabó algo pero no dijo qué. */
function preguntaCual(mensaje: string, eco: string): boolean {
  return !eco && /acab[ée]|termin[ée]|ya vi/i.test(mensaje);
}

export async function conversarDemo({
  mensaje,
  emitir,
  señal,
}: {
  mensaje: string;
  /** Se recibe por simetría con el bucle real, aunque el guion no lo use. */
  historial?: Turno[];
  emitir: (e: Evento) => void;
  señal: AbortSignal;
}): Promise<void> {
  const eco = ecoDe(mensaje);
  const guion = guionPara(mensaje, eco);
  const soloCharla = preguntaCual(mensaje, eco) || guion.razones({} as Anime, eco, 0) === "";

  // Preguntar de vuelta no es un error, es conversación: la vitrina se queda
  // como estaba en vez de castigar al usuario por no dar el nombre (§3.5).
  if (preguntaCual(mensaje, eco)) {
    await dormir(PENSANDO_MS);
    if (señal.aborted) return;
    emitir({ tipo: "texto", texto: "¿Cuál acabaste? Dime el nombre y te digo qué sigue." });
    return;
  }

  await dormir(PENSANDO_MS);
  if (señal.aborted) return;

  if (!soloCharla) {
    const cuantos = /sorpr[eé]nd/.test(mensaje.toLowerCase()) ? 1 : 3;
    const animes = await delCatalogo(cuantos);

    for (const [i, anime] of animes.entries()) {
      if (señal.aborted) return;
      emitir({
        tipo: "tarjeta",
        anime,
        razon: guion.razones(anime, eco, i).slice(0, 90),
      });
      await dormir(ENTRE_PORTADAS_MS);
    }
    await dormir(ANTES_DEL_TEXTO_MS);
  }

  if (señal.aborted) return;
  emitir({ tipo: "texto", texto: guion.texto });
  emitir({ tipo: "chips", chips: guion.chips });
}

/** El modo demo solo existe mientras no haya llave, y nunca en producción. */
export function enDemo(hayLlave: boolean): boolean {
  return !hayLlave && process.env.NODE_ENV !== "production";
}
