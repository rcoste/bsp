"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import { leerEventos, type Turno } from "@/lib/chat/eventos";
import type { Calificacion, Entrada, Marca } from "@/lib/lista";
import { VitrinaSeleccion } from "./Vitrina";
import { VitrinaRecomendacion, type Tarjeta } from "./VitrinaRecomendacion";
import { Dock } from "./Dock";

const CHIPS_INICIALES = [
  "Acabé una serie",
  "Algo corto para el finde",
  "Sorpréndeme",
];
const SALUDO = "Dime qué acabas de ver y te digo qué sigue, nakama.";

/** Lo que dura la animación de descarte, en ms. Espejo de --dur-descarte. */
const MS_DESCARTE = 280;

/** La meta del arranque de gusto. Producción del producto original: ~20
 *  títulos el día uno → 46% de regreso; 1-2 títulos → 6%. */
const META_ARRANQUE = 20;

/** Lo que vive en pantalla el mensajito de deshacer. DESIGN.md: 7 segundos. */
const MS_DESHACER = 7000;

export function Pantalla({
  animes,
  marcasIniciales,
}: {
  animes: Anime[];
  marcasIniciales: Record<number, Entrada>;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  // Lo marcado desde las tarjetas. Arranca con lo de visitas anteriores para
  // que la memoria del gusto se VEA.
  const [marcas, setMarcas] = useState<Record<number, Entrada>>(marcasIniciales);
  const [saliendo, setSaliendo] = useState<Set<number>>(new Set());
  // La tarjeta recién descartada, por si fue un toque accidental: descartar
  // pesa en TODAS las recomendaciones siguientes, y sin deshacer un error se
  // vuelve permanente.
  const [deshacer, setDeshacer] = useState<{ tarjeta: Tarjeta; indice: number } | null>(null);
  const relojDeshacer = useRef<number | null>(null);
  // Volver a la parrilla de marcado después de que ya hubo recomendaciones.
  const [marcandoMas, setMarcandoMas] = useState(false);
  // El set que se ve ahora es la lista de la persona, no una recomendación.
  const [viendoLista, setViendoLista] = useState(false);
  const [mensajes, setMensajes] = useState<Turno[]>([
    { de: "ai", texto: SALUDO },
  ]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [ancla, setAncla] = useState("");
  const [chips, setChips] = useState(CHIPS_INICIALES);
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const [demo, setDemo] = useState(false);
  const [saltado, setSaltado] = useState(false);

  // El celular es el caso principal; escritorio es la variante. Un solo punto
  // de quiebre, como manda el CLAUDE.md.
  const [escritorio, setEscritorio] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const medir = () => setEscritorio(mq.matches);
    medir();
    mq.addEventListener("change", medir);
    return () => mq.removeEventListener("change", medir);
  }, []);

  // El hilo al día, fuera del estado. Existe para NO tener que meter la
  // llamada al servidor dentro de un updater de useState: React ejecuta los
  // updaters dos veces en desarrollo, y eso disparaba DOS conversaciones a la
  // vez — dos burbujas, el texto partido entre ellas y el doble de gasto.
  const hilo = useRef<Turno[]>([]);
  hilo.current = mensajes;

  // El teclado del celular no cambia el alto de la ventana en iOS, así que
  // 100vh miente. visualViewport sí dice el alto REAL disponible: sin esto,
  // el campo de escribir queda debajo del teclado.
  const [alto, setAlto] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setAlto(vv.height);
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, []);

  // --- El texto aparece palabra por palabra -------------------------------
  const buffer = useRef("");
  const reloj = useRef<number | null>(null);

  const detenerRevelado = useCallback(() => {
    if (reloj.current !== null) {
      window.clearInterval(reloj.current);
      reloj.current = null;
    }
  }, []);

  const revelar = useCallback(
    (trozo: string) => {
      buffer.current += trozo;
      if (reloj.current !== null) return;
      reloj.current = window.setInterval(() => {
        const pendiente = buffer.current;
        if (!pendiente) {
          detenerRevelado();
          return;
        }
        const espacio = pendiente.indexOf(" ", 1);
        const corte = espacio === -1 ? pendiente.length : espacio + 1;
        buffer.current = pendiente.slice(corte);
        const palabra = pendiente.slice(0, corte);
        setMensajes((previos) => {
          const copia = [...previos];
          const ultimo = copia[copia.length - 1];
          if (ultimo?.de === "ai") {
            copia[copia.length - 1] = {
              de: "ai",
              texto: ultimo.texto + palabra,
            };
          } else {
            copia.push({ de: "ai", texto: palabra });
          }
          return copia;
        });
      }, 45);
    },
    [detenerRevelado],
  );

  useEffect(() => detenerRevelado, [detenerRevelado]);

  // --- La conversación ----------------------------------------------------
  const cola = useRef<string[]>([]);
  const ocupado = useRef(false);

  const hablar = useCallback(
    async (texto: string, historial: Turno[]) => {
      ocupado.current = true;
      setPensando(true);
      setAncla(texto);
      setAviso(null);
      // Un turno nuevo devuelve la vitrina al modo recomendación.
      setMarcandoMas(false);
      setViendoLista(false);

      let primeraTarjeta = true;
      let abrioBurbuja = false;

      try {
        const respuesta = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje: texto, historial }),
        });

        // El servidor avisa si contestó de mentira. Se dice en pantalla: si no,
        // se juzgaría la calidad de unas recomendaciones inventadas.
        if (respuesta.headers.get("X-BSP-Demo") === "1") setDemo(true);

        if (!respuesta.ok || !respuesta.body) {
          const datos = await respuesta.json().catch(() => null);
          if (datos?.error === "falta_llave") {
            setAviso(
              "Todavía no tengo el cerebro conectado. Falta la llave de Claude.",
            );
            setMudo(true);
          } else {
            setAviso(datos?.mensaje ?? "Se me trabó el cerebro tantito.");
            if (respuesta.status === 429) setMudo(true);
          }
          return;
        }

        for await (const evento of leerEventos(respuesta.body)) {
          if (evento.tipo === "tarjeta") {
            // Las viejas solo se van cuando llega la primera nueva: vaciar la
            // vitrina antes castigaría al usuario si esta vuelta no trae nada.
            setTarjetas((previas) =>
              primeraTarjeta
                ? [{ anime: evento.anime, razon: evento.razon }]
                : [...previas, { anime: evento.anime, razon: evento.razon }],
            );
            primeraTarjeta = false;
          } else if (evento.tipo === "texto") {
            if (!abrioBurbuja) {
              abrioBurbuja = true;
              setMensajes((m) => [...m, { de: "ai", texto: "" }]);
            }
            revelar(evento.texto);
          } else if (evento.tipo === "chips") {
            setChips(evento.chips);
          } else if (evento.tipo === "marca") {
            // La AI guardó algo que la persona le contó ("voy en el 8"):
            // la pantalla lo refleja al instante.
            setMarcas((prev) => {
              const n = { ...prev };
              if (evento.entrada) n[evento.animeId] = evento.entrada;
              else delete n[evento.animeId];
              return n;
            });
          } else if (evento.tipo === "error") {
            setAviso(evento.mensaje);
          }
        }
      } catch {
        setAviso("Se cortó la conexión. ¿Lo intentamos otra vez?");
      } finally {
        setPensando(false);
        ocupado.current = false;
        const siguiente = cola.current.shift();
        if (siguiente) void hablar(siguiente, hilo.current);
      }
    },
    [revelar],
  );

  const enviar = useCallback(
    (texto: string) => {
      if (mudo) return;
      const previos = hilo.current;
      const conElTuyo: Turno[] = [...previos, { de: "tu", texto }];
      hilo.current = conElTuyo;
      setMensajes(conElTuyo);

      // El campo no se bloquea: si mandas un segundo mensaje se encola y sale
      // al terminar el turno. Encolar, no interrumpir — es lo que la gente ya
      // espera de WhatsApp.
      if (ocupado.current) cola.current.push(texto);
      else void hablar(texto, previos);
    },
    [hablar, mudo],
  );

  // --- El atajo: buscar un anime por su nombre ----------------------------
  // Quien ya sabe qué quiere no debería gastar uno de sus 20 mensajes del día
  // en pedirlo. Esto NO llama a la AI ni pasa por los topes: lee el catálogo
  // que ya tenemos y pone la tarjeta en la vitrina.
  const verSugerencia = useCallback((id: number) => {
    void fetch(`/api/sugerencias?id=${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("no está");
        const { anime } = (await r.json()) as { anime: Anime };
        // Sin porqué: nadie te lo recomendó, tú lo pediste. Inventar una
        // razón aquí sería exactamente la vaguedad que nos iguala a ChatGPT.
        setTarjetas([{ anime, razon: "" }]);
        setAncla(anime.titulo);
        setAviso(null);
        setViendoLista(false);
      })
      .catch(() => setAviso("No pude abrir esa ficha. Intenta de nuevo."));
  }, []);

  // --- El chip "Mis guardados" --------------------------------------------
  // La lista vive en la conversación, no en una pantalla aparte: cambiar de
  // pantalla rompe el hilo, que es la ventaja contra ChatGPT. No llama a la
  // AI ni gasta mensaje.
  const verGuardados = useCallback(() => {
    setMarcandoMas(false);
    setViendoLista(true);
    setAviso(null);
    void fetch("/api/guardados")
      .then(async (r) => {
        if (!r.ok) throw new Error("no se pudo");
        const { guardados } = (await r.json()) as {
          guardados: { anime: Anime; entrada: Entrada }[];
        };
        // Sin porqué: nadie te las recomendó, tú las guardaste.
        setTarjetas(guardados.map((g) => ({ anime: g.anime, razon: "" })));
        // Se adopta el estado que dice el servidor, por si la pantalla y la
        // base se separaron (por ejemplo, marcaste algo hablando).
        setMarcas((prev) => {
          const n = { ...prev };
          for (const g of guardados) n[g.anime.id] = g.entrada;
          return n;
        });
      })
      .catch(() => setAviso("No pude abrir tu lista. Intenta de nuevo."));
  }, []);

  // --- Escribir en la biblioteca ------------------------------------------
  // Lo que se marca aquí es lo que alimenta la memoria del gusto que lee la
  // AI. Sin esto el perfil sale vacío por más que la persona use la app.

  /** Manda la marca al servidor y adopta la entrada que quedó de verdad. */
  const persistir = useCallback(
    (animeId: number, marca: Marca, extras?: { calificacion?: Calificacion }) => {
      void fetch("/api/lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animeId, marca, ...extras }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error("no se guardó");
          const { entrada } = (await r.json()) as { entrada: Entrada | null };
          setMarcas((prev) => {
            const n = { ...prev };
            if (entrada) n[animeId] = entrada;
            else delete n[animeId];
            return n;
          });
        })
        .catch(() => {
          setAviso("No pude guardar eso. Tu lista quedó como estaba.");
        });
    },
    [],
  );

  const marcarAnime = useCallback(
    (anime: Anime, marca: Marca) => {
      // OJO: la llamada al servidor va FUERA de cualquier updater de useState.
      // React ejecuta los updaters dos veces en desarrollo; meter el fetch
      // adentro manda la petición dos veces (ya nos pasó con las portadas).
      if (marca === "descartado") {
        // Se va con la animación — y deja un "Deshacer" de 7 segundos, porque
        // descartar pesa en todas las recomendaciones que siguen y un toque
        // accidental no debe envenenarlas para siempre.
        setSaliendo((s) => new Set(s).add(anime.id));
        const sinMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.setTimeout(
          () => {
            setTarjetas((previas) => {
              const indice = previas.findIndex((x) => x.anime.id === anime.id);
              if (indice !== -1) {
                setDeshacer({ tarjeta: previas[indice], indice });
                if (relojDeshacer.current) window.clearTimeout(relojDeshacer.current);
                relojDeshacer.current = window.setTimeout(
                  () => setDeshacer(null),
                  MS_DESHACER,
                );
              }
              return previas.filter((x) => x.anime.id !== anime.id);
            });
            setSaliendo((s) => {
              const n = new Set(s);
              n.delete(anime.id);
              return n;
            });
          },
          sinMotion ? 0 : MS_DESCARTE,
        );
      } else {
        // Optimista: el toque se ve al instante, el servidor confirma después.
        // Tocar la marca que ya está puesta la quita.
        setMarcas((prev) => {
          const n = { ...prev };
          if (n[anime.id]?.marca === marca) delete n[anime.id];
          else n[anime.id] = { marca, episodio: null, calificacion: null };
          return n;
        });
      }
      persistir(anime.id, marca);
    },
    [persistir],
  );

  /** El "Deshacer" del descarte: la tarjeta vuelve a su lugar y la marca se quita. */
  const deshacerDescarte = useCallback(() => {
    if (!deshacer) return;
    setTarjetas((t) => {
      const n = [...t];
      n.splice(Math.min(deshacer.indice, n.length), 0, deshacer.tarjeta);
      return n;
    });
    // Volver a mandar "descartado" sobre lo ya descartado lo QUITA (el
    // interruptor del servidor).
    persistir(deshacer.tarjeta.anime.id, "descartado");
    setDeshacer(null);
    if (relojDeshacer.current) window.clearTimeout(relojDeshacer.current);
  }, [deshacer, persistir]);

  const calificarAnime = useCallback(
    (anime: Anime, calificacion: Calificacion) => {
      // La calificación no cambia el estado: acompaña al que ya tiene
      // (visto o abandonada).
      const estado = marcas[anime.id]?.marca === "abandonada" ? "abandonada" : "visto";
      setMarcas((prev) => ({
        ...prev,
        [anime.id]: { ...(prev[anime.id] ?? { marca: estado, episodio: null }), marca: estado, calificacion },
      }));
      persistir(anime.id, estado, { calificacion });
    },
    [marcas, persistir],
  );

  // --- El arranque de gusto ----------------------------------------------
  function alternar(id: number) {
    // OJO: este updater tiene que ser PURO — solo calcular el nuevo estado.
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
    // Cada toque ESCRIBE en la biblioteca, no solo en la parrilla. Antes las
    // marcas del arranque solo viajaban como texto a la AI y la biblioteca
    // quedaba vacía — justo el factor de retención desperdiciado.
    // (El fetch va fuera del updater; ver la nota de arriba.)
    persistir(id, "visto");
  }

  // La reacción al tercer marcado vive aquí, fuera del updater.
  // La meta: que en 20 segundos, sin teclear, la app ya sepa algo de ti.
  const yaArranco = useRef(false);
  useEffect(() => {
    if (marcados.size < 3 || yaArranco.current) return;
    yaArranco.current = true;
    const titulos = animes
      .filter((a) => marcados.has(a.id))
      .map((a) => a.titulo)
      .join(", ");
    enviar(`Ya vi ${titulos}. ¿Qué me recomiendas?`);
  }, [marcados, animes, enviar]);

  // La recomendación manda, PERO se puede volver a la parrilla a seguir
  // marcando ("marcandoMas"): cortar el marcado en 3 toques era tirar el
  // constructor de biblioteca — y la biblioteca es el factor de retención.
  const enRecomendacion =
    !marcandoMas &&
    (viendoLista ||
      tarjetas.length > 0 ||
      saltado ||
      (pensando && yaArranco.current));

  // El total marcado de verdad (parrilla + tarjetas + chat), para el medidor.
  const totalMarcados = Object.values(marcas).filter(
    (e) => e.marca !== "descartado",
  ).length;

  // Lo que cuenta el chip: lo que está en la lista, no todo lo marcado.
  const cuantosGuardados = Object.values(marcas).filter(
    (e) => e.marca === "quiero_ver" || e.marca === "viendo",
  ).length;

  const vitrina = enRecomendacion ? (
    <VitrinaRecomendacion
      tarjetas={tarjetas}
      ancla={ancla}
      cargando={pensando}
      marcas={marcas}
      saliendo={saliendo}
      onMarcar={marcarAnime}
      onCalificar={calificarAnime}
      medidor={{
        marcados: totalMarcados,
        meta: META_ARRANQUE,
        onSeguir: () => {
          setViendoLista(false);
          setMarcandoMas(true);
        },
      }}
      esLista={viendoLista}
    />
  ) : (
    <VitrinaSeleccion
      animes={animes}
      marcados={marcados}
      onMarcar={alternar}
      onSaltar={() => {
        setSaltado(true);
        setMarcandoMas(false);
      }}
    />
  );

  // El mensajito de deshacer. 7 segundos, foco en la opción segura.
  const avisoDeshacer = deshacer && (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 px-4 py-[10px]"
      style={{
        top: escritorio ? 76 : 68,
        background: "var(--c-ink)",
        color: "var(--c-on-ink)",
        border: "2px solid var(--c-accent)",
      }}
      role="status"
    >
      <span className="max-w-[220px] truncate text-[13px]">
        Descartaste {deshacer.tarjeta.anime.titulo}
      </span>
      <button
        type="button"
        onClick={deshacerDescarte}
        className="kicker shrink-0 px-[8px] py-[5px]"
        style={{ background: "var(--c-accent)", color: "var(--c-paper)" }}
      >
        Deshacer
      </button>
    </div>
  );

  const avisoDemo = demo && (
    <p
      className="kicker shrink-0 px-4 py-[6px]"
      style={{ background: "var(--c-ink)", color: "var(--c-accent-400)" }}
      role="status"
    >
      Demo · respuestas de mentira, portadas reales
    </p>
  );

  const chat = (
    <Dock
      escritorio={escritorio}
      mensajes={mensajes}
      chips={chips}
      pensando={pensando}
      onEnviar={enviar}
      onSugerencia={verSugerencia}
      onGuardados={verGuardados}
      cuantosGuardados={cuantosGuardados}
      deshabilitado={mudo}
      aviso={aviso ?? undefined}
    />
  );

  // ESCRITORIO: dos columnas. El chat es tinta a la izquierda, la vitrina es
  // papel a la derecha; ese contraste ES el layout. Las dos cabeceras miden
  // exactamente 64px para que la regla de 2px corra continua entre paneles.
  if (escritorio) {
    return (
      <main
        className="flex h-screen overflow-hidden"
        style={{ background: "var(--c-paper)" }}
      >
        {avisoDeshacer}
        {chat}
        <div className="flex min-w-0 flex-1 flex-col">
          <header
            className="flex shrink-0 items-center gap-[10px] px-6"
            style={{ height: 64, borderBottom: "var(--borde-koma)" }}
          >
            <span
              aria-hidden
              className="h-[10px] w-[10px]"
              style={{ background: "var(--c-accent)" }}
            />
            <span className="kicker">La vitrina</span>
            {avisoDemo}
          </header>
          <section aria-label="Anime" className="min-h-0 flex-1">
            {vitrina}
          </section>
        </div>
      </main>
    );
  }

  // CELULAR: la vitrina se queda con casi toda la pantalla y el chat vive en
  // el dock de abajo, que se despliega en hoja cuando lo pides.
  return (
    <main
      className="flex flex-col"
      style={{
        height: alto ? `${alto}px` : "100svh",
        background: "var(--c-paper)",
      }}
    >
      {avisoDeshacer}
      <header
        className="flex shrink-0 items-center gap-[10px] px-4"
        style={{ height: 56, borderBottom: "var(--borde-koma)" }}
      >
        <span
          aria-hidden
          className="h-[14px] w-[14px]"
          style={{ background: "var(--c-accent)" }}
        />
        <span className="font-display text-[22px] leading-none tracking-[-0.02em]">
          BSP
        </span>
        <span className="text-[11px]" style={{ color: "var(--c-muted)" }}>
          Tu universo otaku, en español
        </span>
        <span
          className="kicker ml-auto px-[6px] py-[3px]"
          style={{ border: "1px solid var(--c-ink)" }}
        >
          Beta
        </span>
      </header>

      {avisoDemo}

      <section aria-label="Anime" className="min-h-0 flex-1">
        {vitrina}
      </section>

      {chat}
    </main>
  );
}
