"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import { leerEventos, type Turno } from "@/lib/chat/eventos";
import { VitrinaSeleccion } from "./Vitrina";
import { VitrinaRecomendacion, type Tarjeta } from "./VitrinaRecomendacion";
import { Conversacion } from "./Conversacion";

const CHIPS_INICIALES = ["Acabé una serie", "Algo corto para el finde", "Sorpréndeme"];

const SALUDO = "Dime qué acabas de ver y te digo qué sigue.";

export function Pantalla({ animes }: { animes: Anime[] }) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [mensajes, setMensajes] = useState<Turno[]>([{ de: "ai", texto: SALUDO }]);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [ancla, setAncla] = useState("");
  const [chips, setChips] = useState(CHIPS_INICIALES);
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudo, setMudo] = useState(false);

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
  // Seis segundos de pantalla quieta se leen como app trabada. Ver §3.2.
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
            copia[copia.length - 1] = { de: "ai", texto: ultimo.texto + palabra };
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
        if (siguiente) {
          setMensajes((m) => {
            void hablar(siguiente, m);
            return m;
          });
        }
      }
    },
    [revelar],
  );

  const enviar = useCallback(
    (texto: string) => {
      if (mudo) return;
      // El campo no se bloquea: si mandas un segundo mensaje se encola y sale
      // al terminar el turno. Encolar, no interrumpir — es lo que la gente ya
      // espera de WhatsApp.
      setMensajes((previos) => {
        const conElTuyo: Turno[] = [...previos, { de: "tu", texto }];
        if (ocupado.current) cola.current.push(texto);
        else void hablar(texto, previos);
        return conElTuyo;
      });
    },
    [hablar, mudo],
  );

  // --- El arranque de gusto ----------------------------------------------
  function alternar(id: number) {
    // OJO: este updater tiene que ser PURO — solo calcular el nuevo estado.
    // Meter aquí un setMensajes hacía que React (que ejecuta los updaters dos
    // veces en desarrollo justo para cazar esto) aplicara el toggle dos veces
    // y el marcado no se quedara, además de duplicar el mensaje.
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

  const enRecomendacion = tarjetas.length > 0 || (pensando && yaArranco.current);

  return (
    <main
      className="flex flex-col bg-app"
      style={{ height: alto ? `${alto}px` : "100svh" }}
    >
      {/* VITRINA — arriba, para que el teclado no la tape */}
      <section
        aria-label="Anime"
        className="shrink-0 border-b"
        style={{ height: "min(46%, 320px)", borderColor: "var(--c-border)" }}
      >
        {enRecomendacion ? (
          <VitrinaRecomendacion tarjetas={tarjetas} ancla={ancla} cargando={pensando} />
        ) : (
          <VitrinaSeleccion animes={animes} marcados={marcados} onMarcar={alternar} />
        )}
      </section>

      {/* CONVERSACIÓN — abajo, donde llega el pulgar */}
      <section aria-label="Conversación" className="min-h-0 flex-1">
        <Conversacion
          mensajes={mensajes}
          chips={chips}
          onEnviar={enviar}
          onChip={enviar}
          pensando={pensando}
          deshabilitado={mudo}
          avisoDeshabilitado={aviso ?? undefined}
        />
      </section>
    </main>
  );
}
