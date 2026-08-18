"use client";

import { useEffect, useRef, useState } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import { VitrinaSeleccion } from "./Vitrina";
import { Conversacion } from "./Conversacion";

type Mensaje = { de: "ai" | "tu"; texto: string };

const CHIPS_INICIALES = ["Acabé una serie", "Algo corto para el finde", "Sorpréndeme"];

export function Pantalla({ animes }: { animes: Anime[] }) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { de: "ai", texto: "Dime qué acabas de ver y te digo qué sigue." },
  ]);

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
  // La meta: que en 20 segundos, sin teclear nada, la app ya sepa algo de ti.
  const yaArranco = useRef(false);
  useEffect(() => {
    if (marcados.size >= 3 && !yaArranco.current) {
      yaArranco.current = true;
      setMensajes((m) => [
        ...m,
        {
          de: "ai",
          texto:
            "Ya con eso me hago una idea. Todavía no tengo conectado mi cerebro — falta la llave de Claude — pero en cuanto la conectes te empiezo a recomendar.",
        },
      ]);
    }
  }, [marcados]);

  function enviar(texto: string) {
    setMensajes((m) => [
      ...m,
      { de: "tu", texto },
      {
        de: "ai",
        texto:
          "Te leí, pero todavía no puedo pensar: falta conectar la llave de Claude. Mientras tanto, marca arriba lo que ya viste.",
      },
    ]);
  }

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
        <VitrinaSeleccion animes={animes} marcados={marcados} onMarcar={alternar} />
      </section>

      {/* CONVERSACIÓN — abajo, donde llega el pulgar */}
      <section aria-label="Conversación" className="min-h-0 flex-1">
        <Conversacion
          mensajes={mensajes}
          chips={CHIPS_INICIALES}
          onEnviar={enviar}
          onChip={enviar}
        />
      </section>
    </main>
  );
}
