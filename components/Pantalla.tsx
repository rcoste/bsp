"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import { leerEventos, type Turno } from "@/lib/chat/eventos";
import type { Marca } from "@/lib/lista";
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

export function Pantalla({
  animes,
  marcasIniciales,
}: {
  animes: Anime[];
  marcasIniciales: Record<number, Marca>;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  // Lo marcado desde las tarjetas. Arranca con lo de visitas anteriores para
  // que la memoria del gusto se VEA.
  const [marcas, setMarcas] = useState<Record<number, Marca>>(marcasIniciales);
  const [saliendo, setSaliendo] = useState<Set<number>>(new Set());
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

  // --- Los tres botones de la tarjeta -------------------------------------
  // Lo que se marca aquí es lo que alimenta la memoria del gusto que lee la
  // AI. Sin esto el perfil sale vacío por más que la persona use la app.
  const marcarAnime = useCallback((anime: Anime, marca: Marca) => {
    // OJO: la llamada al servidor va FUERA de cualquier updater de useState.
    // React ejecuta los updaters dos veces en desarrollo; meter el fetch
    // adentro manda la petición dos veces (ya nos pasó con las portadas).
    if (marca === "descartado") {
      // Se va con la animación y luego se quita de la lista. Desaparecer de
      // golpe no se lee como "te hice caso", se lee como un error.
      setSaliendo((s) => new Set(s).add(anime.id));
      const sinMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(
        () => {
          setTarjetas((t) => t.filter((x) => x.anime.id !== anime.id));
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
      // Tocar la marca que ya está puesta la quita — marcar sin poder
      // desmarcar convierte un toque de más en un error permanente.
      setMarcas((prev) => {
        const n = { ...prev };
        if (n[anime.id] === marca) delete n[anime.id];
        else n[anime.id] = marca;
        return n;
      });
    }

    void fetch("/api/lista", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ animeId: anime.id, marca }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("no se guardó");
        // El servidor manda la marca que quedó de verdad: se adopta esa, no
        // la que adivinamos, por si las dos versiones se separaron.
        const { marca: quedo } = (await r.json()) as { marca: Marca | null };
        setMarcas((prev) => {
          const n = { ...prev };
          if (quedo) n[anime.id] = quedo;
          else delete n[anime.id];
          return n;
        });
      })
      .catch(() => {
        setAviso("No pude guardar eso. Tu lista quedó como estaba.");
      });
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

  // El cambio de selección a recomendación ocurre UNA vez y no se revierte.
  const enRecomendacion =
    tarjetas.length > 0 || saltado || (pensando && yaArranco.current);

  const vitrina = enRecomendacion ? (
    <VitrinaRecomendacion
      tarjetas={tarjetas}
      ancla={ancla}
      cargando={pensando}
      marcas={marcas}
      saliendo={saliendo}
      onMarcar={marcarAnime}
    />
  ) : (
    <VitrinaSeleccion
      animes={animes}
      marcados={marcados}
      onMarcar={alternar}
      onSaltar={() => setSaltado(true)}
    />
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
