"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import { leerEventos, type Turno } from "@/lib/chat/eventos";
import type { Inicio } from "@/lib/inicio";
import type { Calificacion, Entrada, Marca } from "@/lib/lista";
import { Obertura } from "./Obertura";
import { VitrinaSeleccion } from "./Vitrina";
import { VitrinaRecomendacion, type Tarjeta } from "./VitrinaRecomendacion";
import { Dock } from "./Dock";
import type { NombreEvento } from "@/lib/eventos-uso";
import type { ViaMensaje } from "@/lib/chat/eventos";
import { etiquetarEnClarity, identificarEnClarity } from "@/lib/clarity";

/** Lo mismo que cuenta la conversión "20 animes" (lib/medicion.ts). */
const META_VEINTE = 20;

/** Relojes de red lenta (§3.3). Se miden hasta la PRIMERA SEÑAL —la primera
 *  portada o la primera palabra—, nunca hasta el final: una respuesta larga que
 *  lleva 25 s escribiéndose bien está funcionando y no se toca. */
const SIN_SENAL_AVISO_MS = 12_000;
const SIN_SENAL_CORTE_MS = 30_000;
/** Si el texto empezó y pasan estos ms sin una palabra nueva, se da por muerto. */
const ESTANCADO_MS = 10_000;
/** Con estos mensajes por delante se avisa que se acerca el tope (§3.8). */
const AVISO_QUEDAN = 3;

/** El historial que viaja a la AI: sin las notas de la app (fallos, topes). */
const historialParaLaAI = (m: Turno[]) => m.filter((t) => !t.nota);

const CHIPS_INICIALES = [
  "Acabé una serie…", // con "…": prellena el campo en vez de mandar (ver Dock)
  "Algo corto para el finde",
  "Sorpréndeme",
];

/** Lo que dura la animación de descarte, en ms. Espejo de --dur-descarte. */
const MS_DESCARTE = 280;

/** La meta del arranque de gusto. Producción del producto original: ~20
 *  títulos el día uno → 46% de regreso; 1-2 títulos → 6%. */
const META_ARRANQUE = 20;

/** Lo que vive en pantalla el mensajito de deshacer. DESIGN.md: 7 segundos. */
const MS_DESHACER = 7000;

/** Con qué búsqueda y de qué campaña llegó esta visita. */
export type Llegada = {
  consulta: string;
  /** true = la búsqueda es específica y vale gastar una conversación. */
  preguntar: boolean;
  origen: string | null;
  campana: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  /** La puerta (?v=) por la que entró; la guarda /api/llegada. */
  puerta: string | null;
};

export function Pantalla({
  inicio,
  marcasIniciales,
  llegada,
  forzarIntro,
}: {
  inicio: Inicio;
  marcasIniciales: Record<number, Entrada>;
  llegada?: Llegada;
  forzarIntro?: boolean;
}) {
  const animes = inicio.animes;
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
    { de: "ai", texto: inicio.saludo },
  ]);
  // La vitrina NUNCA está vacía: nace con lo que decidió lib/inicio.ts.
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>(
    inicio.modo === "reposo" ? inicio.tarjetas : [],
  );
  const [ancla, setAncla] = useState(
    inicio.modo === "reposo" ? inicio.ancla : "",
  );
  // El encabezado del reposo ("Seguías con esto") no es "Para: X"; se apaga
  // en cuanto la persona pide algo.
  const [anclaLibre, setAnclaLibre] = useState(inicio.modo === "reposo");
  const [chips, setChips] = useState(CHIPS_INICIALES);
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);
  const [demo, setDemo] = useState(false);
  // --- Los estados feos (docs/designs/experiencia-y-estados.md §3.3–3.9) ---
  // Red lenta: la burbuja de espera cambia a los 12 s sin señal y ofrece
  // Esperar / Cancelar; a los 30 s se corta sola salvo que hayan tocado Esperar.
  const [espera, setEspera] = useState<null | "tardando" | "esperando">(null);
  // La AI falló: Reintentar, y el texto de la persona vuelve al campo.
  const [fallo, setFallo] = useState<{ texto: string; via: ViaMensaje } | null>(null);
  // El texto empezó y se quedó a medias: lo parcial se queda, con Reintentar.
  const [estancado, setEstancado] = useState<{ texto: string; via: ViaMensaje; historial: Turno[] } | null>(null);
  // Lo que hay que devolverle al campo (tras cancelar o fallar).
  const [prellenar, setPrellenar] = useState<{ texto: string; clave: number } | null>(null);
  // Sin internet: aviso fijo, el chat se apaga, la vitrina sigue; al volver,
  // la persona decide si manda — nunca se manda solo.
  const [conexion, setConexion] = useState<"ok" | "sin" | "volvio">("ok");
  const controlador = useRef<AbortController | null>(null);
  const esperarMas = useRef(false);
  const motivoCorte = useRef<"cancelar" | "tiempo" | "estancado" | null>(null);
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

  // --- Sin internet (§3.7) ------------------------------------------------
  useEffect(() => {
    const sin = () => setConexion("sin");
    const volvio = () => setConexion((c) => (c === "sin" ? "volvio" : c));
    if (!navigator.onLine) sin();
    window.addEventListener("offline", sin);
    window.addEventListener("online", volvio);
    return () => {
      window.removeEventListener("offline", sin);
      window.removeEventListener("online", volvio);
    };
  }, []);
  useEffect(() => {
    if (conexion !== "volvio") return;
    const t = window.setTimeout(() => setConexion("ok"), 6000);
    return () => window.clearTimeout(t);
  }, [conexion]);

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

  // --- La bitácora de uso -------------------------------------------------
  // Solo lo que el servidor no ve por sí mismo (un chip, un deshacer, volver
  // a la parrilla). Telemetría: si falla, nadie se entera y nada se rompe.
  const anotar = useCallback((nombre: NombreEvento, datos: Record<string, string | number | boolean> = {}) => {
    void fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventos: [{ nombre, datos }] }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // --- La conversación ----------------------------------------------------
  const cola = useRef<{ texto: string; via: ViaMensaje }[]>([]);
  const ocupado = useRef(false);

  /** Quita la burbuja de la persona si es la última: su texto vuelve al campo. */
  const quitarUltimoTuyo = useCallback(() => {
    setMensajes((m) => {
      const i = m.length - 1;
      return i >= 0 && m[i].de === "tu" ? m.slice(0, i) : m;
    });
  }, []);

  const hablar = useCallback(
    async (texto: string, historial: Turno[], via: ViaMensaje = "texto") => {
      ocupado.current = true;
      setPensando(true);
      setEspera(null);
      setFallo(null);
      setEstancado(null);
      esperarMas.current = false;
      motivoCorte.current = null;
      setAncla(texto);
      setAnclaLibre(false); // ya no es el reposo: es lo que pidió
      setAviso(null);
      // Un turno nuevo devuelve la vitrina al modo recomendación.
      setMarcandoMas(false);
      setViendoLista(false);

      let primeraTarjeta = true;
      let abrioBurbuja = false;
      let hubeSenal = false;

      const control = new AbortController();
      controlador.current = control;
      const cortar = (motivo: "cancelar" | "tiempo" | "estancado") => {
        if (control.signal.aborted) return;
        motivoCorte.current = motivo;
        control.abort();
      };

      // Los relojes de §3.3.
      const avisoTardando = window.setTimeout(() => {
        if (!hubeSenal) setEspera("tardando");
      }, SIN_SENAL_AVISO_MS);
      const corteSinSenal = window.setTimeout(() => {
        // Si tocó "Esperar" ya decidió: el corte automático se desactiva.
        if (!hubeSenal && !esperarMas.current) cortar("tiempo");
      }, SIN_SENAL_CORTE_MS);
      let relojEstancado: number | null = null;
      const latir = () => {
        if (relojEstancado !== null) window.clearTimeout(relojEstancado);
        relojEstancado = window.setTimeout(() => cortar("estancado"), ESTANCADO_MS);
      };
      const senal = () => {
        if (!hubeSenal) {
          hubeSenal = true;
          setEspera(null);
        }
        latir();
      };
      const pararRelojes = () => {
        window.clearTimeout(avisoTardando);
        window.clearTimeout(corteSinSenal);
        if (relojEstancado !== null) window.clearTimeout(relojEstancado);
      };

      try {
        const respuesta = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje: texto, historial, via }),
          signal: control.signal,
        });

        // El servidor avisa si contestó de mentira. Se dice en pantalla: si no,
        // se juzgaría la calidad de unas recomendaciones inventadas.
        if (respuesta.headers.get("X-BSP-Demo") === "1") setDemo(true);
        const quedan = Number(respuesta.headers.get("X-BSP-Quedan") ?? NaN);

        if (!respuesta.ok || !respuesta.body) {
          const datos = await respuesta.json().catch(() => null);
          if (datos?.error === "falta_llave") {
            setAviso("Todavía no tengo el cerebro conectado. Falta la llave de Claude.");
            setMudo(true);
            return;
          }
          if (respuesta.status === 429) {
            // §3.8 / §3.9: se acaba la conversación, no el producto. La vitrina
            // y la lista siguen; el campo y los chips se apagan juntos.
            setMensajes((m) => [
              ...m,
              {
                de: "ai",
                nota: true,
                texto:
                  datos?.error === "tope_mensajes"
                    ? "Llegaste a los 20 mensajes de hoy. Mañana se reinician; tu lista y la vitrina siguen aquí."
                    : "Estamos recibiendo muchísima gente hoy. Vuelve mañana: tu lista y la vitrina siguen aquí.",
              },
            ]);
            setMudo(true);
            return;
          }
          throw new Error(datos?.mensaje ?? "falló");
        }

        for await (const evento of leerEventos(respuesta.body)) {
          if (evento.tipo === "tarjeta") {
            senal();
            // Las viejas solo se van cuando llega la primera nueva: vaciar la
            // vitrina antes castigaría al usuario si esta vuelta no trae nada.
            setTarjetas((previas) =>
              primeraTarjeta
                ? [{ anime: evento.anime, razon: evento.razon }]
                : [...previas, { anime: evento.anime, razon: evento.razon }],
            );
            primeraTarjeta = false;
          } else if (evento.tipo === "texto") {
            senal();
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
            throw new Error(evento.mensaje);
          } else if (evento.tipo === "fin") {
            if (relojEstancado !== null) window.clearTimeout(relojEstancado);
          }
        }

        // §3.8: el aviso ANTES del tope, con voz suave y en el hilo.
        if (quedan === AVISO_QUEDAN) {
          setMensajes((m) => [
            ...m,
            { de: "ai", nota: true, texto: `Te quedan ${AVISO_QUEDAN} mensajes por hoy; mañana se reinician.` },
          ]);
        }
      } catch {
        const motivo = motivoCorte.current;
        if (motivo === "cancelar") {
          // La persona decidió; no falló nada. Sin disculpa: su texto vuelve al
          // campo, su burbuja se va, la vitrina queda como estaba.
          quitarUltimoTuyo();
          setPrellenar({ texto, clave: Date.now() });
        } else if (motivo === "estancado" || abrioBurbuja || !primeraTarjeta) {
          // Empezó y se murió a medias. Lo parcial SE QUEDA (borrarlo se
          // sentiría como que la app se comió lo que ya dijo) y abajo va
          // "Se cortó a media respuesta · Reintentar".
          setEstancado({ texto, via, historial });
        } else {
          // §3.4: falló o se cortó a los 30 s. Voz humana, Reintentar, y el
          // texto de la persona de vuelta al campo listo para reenviar.
          quitarUltimoTuyo();
          setPrellenar({ texto, clave: Date.now() });
          setFallo({ texto, via });
          setMensajes((m) => [
            ...m,
            { de: "ai", nota: true, texto: "Se me trabó el cerebro tantito. ¿Lo intentamos otra vez?" },
          ]);
        }
      } finally {
        pararRelojes();
        controlador.current = null;
        setEspera(null);
        setPensando(false);
        ocupado.current = false;
        const siguiente = cola.current.shift();
        if (siguiente) void hablar(siguiente.texto, historialParaLaAI(hilo.current), siguiente.via);
      }
    },
    [revelar, quitarUltimoTuyo],
  );

  /** "Esperar" en la burbuja de red lenta: el corte automático se desactiva. */
  const esperar = useCallback(() => {
    esperarMas.current = true;
    setEspera("esperando");
  }, []);

  /** "Cancelar": corta sin tratarlo como error. */
  const cancelar = useCallback(() => {
    motivoCorte.current = "cancelar";
    controlador.current?.abort();
  }, []);

  /** "Reintentar", tanto tras un fallo como tras quedarse a medias. */
  const reintentar = useCallback(() => {
    if (fallo) {
      const { texto, via } = fallo;
      setFallo(null);
      setPrellenar({ texto: "", clave: Date.now() });
      // Se va la nota del fallo y la persona vuelve a mandar su mensaje.
      setMensajes((m) => (m[m.length - 1]?.nota ? m.slice(0, -1) : m));
      const visibles = hilo.current.filter((t) => !t.nota);
      const conElTuyo: Turno[] = [...visibles, { de: "tu", texto }];
      hilo.current = conElTuyo;
      setMensajes(conElTuyo);
      void hablar(texto, historialParaLaAI(visibles), via);
      return;
    }
    if (estancado) {
      const { texto, via, historial } = estancado;
      setEstancado(null);
      // La respuesta parcial se sustituye por una completa.
      setMensajes((m) => (m[m.length - 1]?.de === "ai" ? m.slice(0, -1) : m));
      void hablar(texto, historial, via);
    }
  }, [fallo, estancado, hablar]);

  const enviar = useCallback(
    (texto: string, via: ViaMensaje = "texto") => {
      if (mudo) return;
      const previos = hilo.current;
      const conElTuyo: Turno[] = [...previos, { de: "tu", texto }];
      hilo.current = conElTuyo;
      setMensajes(conElTuyo);

      // El campo no se bloquea: si mandas un segundo mensaje se encola y sale
      // al terminar el turno. Encolar, no interrumpir — es lo que la gente ya
      // espera de WhatsApp.
      if (ocupado.current) cola.current.push({ texto, via });
      else void hablar(texto, historialParaLaAI(previos), via);
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
        setAnclaLibre(false);
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
    (animeId: number, marca: Marca, extras?: { calificacion?: Calificacion; desde?: "parrilla" | "tarjeta" }) => {
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
      persistir(anime.id, marca, { desde: "tarjeta" });
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
    persistir(deshacer.tarjeta.anime.id, "descartado", { desde: "tarjeta" });
    anotar("deshacer", { animeId: deshacer.tarjeta.anime.id });
    setDeshacer(null);
    if (relojDeshacer.current) window.clearTimeout(relojDeshacer.current);
  }, [deshacer, persistir, anotar]);

  const calificarAnime = useCallback(
    (anime: Anime, calificacion: Calificacion) => {
      // La calificación no cambia el estado: acompaña al que ya tiene
      // (visto o abandonada).
      const estado = marcas[anime.id]?.marca === "abandonada" ? "abandonada" : "visto";
      setMarcas((prev) => ({
        ...prev,
        [anime.id]: { ...(prev[anime.id] ?? { marca: estado, episodio: null }), marca: estado, calificacion },
      }));
      persistir(anime.id, estado, { calificacion, desde: "tarjeta" });
    },
    [marcas, persistir],
  );

  // --- La llegada ---------------------------------------------------------
  // Se registra desde el NAVEGADOR y no en el servidor a propósito: los
  // rastreadores y los bots que no ejecutan JavaScript no crean perfiles
  // fantasma ni disparan conversaciones que se cobran.
  const yaLlego = useRef(false);
  useEffect(() => {
    if (!llegada || yaLlego.current) return;
    yaLlego.current = true;

    void fetch("/api/llegada", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: llegada.consulta,
        utm_source: llegada.origen,
        utm_campaign: llegada.campana,
        gclid: llegada.gclid,
        gbraid: llegada.gbraid,
        wbraid: llegada.wbraid,
        v: llegada.puerta,
      }),
    })
      .then((r) => r.json() as Promise<{ perfil?: string | null }>)
      .then(({ perfil }) => {
        // Para cruzar la grabación de Clarity con la base, y filtrar por
        // campaña igual que en Binge Senpai.
        if (perfil) identificarEnClarity(perfil);
        etiquetarEnClarity("campana", llegada.campana ?? "sin campaña");
        etiquetarEnClarity("puerta", llegada.puerta ?? "sin puerta");
        if (llegada.gclid || llegada.gbraid || llegada.wbraid) {
          etiquetarEnClarity("anuncio_google", "si");
        }
      })
      .catch(() => {
        // Telemetría: que falle no le estorba a quien vino a usar la app.
      });

    // La búsqueda con la que llegó ES su primer mensaje. Quien buscó
    // "parecido a Death Note" y aterriza en una parrilla genérica vio cómo
    // tiramos lo único que sabíamos de él — y lo que se pagó por saber.
    if (llegada.preguntar && llegada.consulta) {
      yaArranco.current = true; // el arranque de gusto ya no dispara solo
      enviar(llegada.consulta, "llegada");
    }
    // Solo al montar: la llegada ocurre una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    persistir(id, "visto", { desde: "parrilla" });
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
    enviar(`Ya vi ${titulos}. ¿Qué me recomiendas?`, "arranque");
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

  // En Clarity se marca la grabación en la que la persona cruza los 20
  // títulos: es la conversión de "20 animes" y la que más importa ver.
  const llegoA20 = useRef(totalMarcados >= META_VEINTE);
  useEffect(() => {
    if (llegoA20.current || totalMarcados < META_VEINTE) return;
    llegoA20.current = true;
    etiquetarEnClarity("llego_a_20", "si");
  }, [totalMarcados]);

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
          anotar("volver_parrilla");
        },
      }}
      esLista={viendoLista}
      anclaLibre={anclaLibre}
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
  // La obertura solo para el que llega EN FRÍO de verdad: primera visita, sin
  // campaña y sin búsqueda. A quien vuelve no se le vuelve a presentar nada, y
  // a quien llegó con una búsqueda ya le está contestando la vitrina — taparla
  // tres segundos sería retrasar justo lo que vino a buscar.
  const conObertura =
    forzarIntro ||
    (inicio.modo === "arranque" &&
      Object.keys(marcasIniciales).length === 0 &&
      !llegada?.consulta &&
      !llegada?.origen &&
      !llegada?.campana);

  // Aviso fijo arriba. Lo que ya viste sigue aquí; solo el chat se apaga.
  const avisoRed = conexion !== "ok" && (
    <p
      role="status"
      className="kicker fixed left-0 right-0 z-50 px-4 py-[8px] text-center"
      style={{
        top: 0,
        background: conexion === "sin" ? "var(--c-accent)" : "var(--c-ink)",
        color: "var(--c-paper)",
      }}
    >
      {conexion === "sin" ? "Sin conexión. Lo que ya viste sigue aquí." : "Volvió la conexión."}
    </p>
  );

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
      // Los chips comparten estado con el campo: sin internet, tope de
      // mensajes o tope de gasto, se apagan todos juntos.
      deshabilitado={mudo || conexion === "sin"}
      aviso={aviso ?? undefined}
      espera={espera}
      onEsperar={esperar}
      onCancelar={cancelar}
      reintentar={fallo || estancado ? reintentar : undefined}
      estancado={estancado !== null}
      prellenar={prellenar}
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
        {conObertura && <Obertura />}
        {avisoRed}
        {avisoRed}
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
      {conObertura && <Obertura />}
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
          Qué anime ver, y dónde verlo
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
