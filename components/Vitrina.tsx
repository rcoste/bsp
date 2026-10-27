"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Anime } from "@/lib/anime/catalogo";
import { nombreVisible } from "@/lib/anime/nombre";

/**
 * La vitrina tiene DOS MODOS y confundirlos es el error más fácil de cometer:
 *
 * - selección: al llegar, cuadrícula de portadas para marcar lo que ya viste.
 * - recomendación: desde la primera respuesta, tarjetas con el porqué.
 *
 * Ver docs/designs/experiencia-y-estados.md §1 y DESIGN.md → Koma grid.
 */

/** La portada: caja reservada desde el primer frame + trama de medio tono. */
export function Portada({
  anime,
  ancho,
  proporcion = "2 / 3",
}: {
  anime: Anime;
  ancho?: number;
  proporcion?: string;
}) {
  // Una URL muerta degrada a iniciales, no a una caja gris vacía: "se ve
  // intencional, nunca un ícono roto" (DESIGN.md → Portada).
  const [fallo, setFallo] = useState(false);

  const iniciales = nombreVisible(anime)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="relative overflow-hidden"
      style={{
        aspectRatio: proporcion,
        width: ancho ? `${ancho}px` : "100%",
        flex: ancho ? "none" : undefined,
        background: "var(--c-neutral-300)",
      }}
    >
      {anime.portada && !fallo ? (
        <Image
          src={anime.portada}
          alt={nombreVisible(anime)}
          fill
          sizes="(max-width: 768px) 45vw, 200px"
          className="object-cover"
          onError={() => setFallo(true)}
          unoptimized
        />
      ) : (
        // Iniciales grandes: se ve intencional, nunca un ícono roto.
        <span
          className="font-display absolute inset-0 flex items-end p-2 text-[30px] leading-none"
          style={{ color: "var(--c-neutral-500)" }}
          aria-hidden
        >
          {iniciales}
        </span>
      )}
      <span className="halftone" aria-hidden />
    </div>
  );
}

/**
 * La cuadrícula de portadas para marcar lo que ya viste. Vive en dos lugares:
 * sola en la primera pantalla y, después del arranque, DEBAJO de las
 * recomendaciones, para seguir marcando sin perder lo recomendado.
 */
export function ParrillaPortadas({
  animes,
  marcados,
  onMarcar,
}: {
  animes: Anime[];
  marcados: Set<number>;
  onMarcar: (id: number) => void;
}) {
  return (
    // Koma grid: el fondo de tinta se ve por el gap de 2px, y ESO es el borde
    // de cada viñeta. En escritorio caben cinco por fila, acotado a 760px para
    // que las portadas no se vuelvan carteles.
    <ul className="koma grid-cols-3 md:max-w-[760px] md:grid-cols-5" role="group">
      {animes.map((a) => {
        const activo = marcados.has(a.id);
        return (
          <li key={a.id} className="koma-celda">
            <button
              type="button"
              aria-pressed={activo}
              onClick={() => onMarcar(a.id)}
              className="block w-full text-left"
            >
              <div className="relative">
                <Portada anime={a} />
                {/* Marcada se nota de lejos: velo de tinta sobre la portada y
                    palomita grande al centro. Con solo una palomita en la
                    esquina, a media parrilla no se sabía qué ya habías tocado.
                    Nunca solo color: la palomita va siempre. */}
                {activo && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{
                      background: "color-mix(in srgb, var(--c-ink) 55%, transparent)",
                      outline: "2px solid var(--c-accent)",
                      outlineOffset: -2,
                    }}
                  >
                    <span
                      className="flex h-[36px] w-[36px] items-center justify-center"
                      style={{ background: "var(--c-accent)", color: "var(--c-paper)" }}
                    >
                      <Check size={22} strokeWidth={2.6} />
                    </span>
                  </span>
                )}
              </div>
              {/* El corte va en un span SIN padding: con el padding en el
                  mismo elemento, el recorte de line-clamp dejaba asomar
                  medio tercer renglón ("Shijou Shugi no" a la mitad). */}
              <p
                className="font-display p-2 text-[11px] leading-tight"
                style={{ color: activo ? "var(--c-accent-700)" : "var(--c-ink)" }}
              >
                <span className="line-clamp-2">{nombreVisible(a)}</span>
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * El medidor hacia 20. En producción del producto original, quien arma ~20
 * títulos el día uno vuelve 46%; quien arma 1-2, vuelve 6%. Por eso va ARRIBA
 * y se mueve con cada toque: al pie de la parrilla nadie lo veía.
 */
export function Medidor({ total, meta }: { total: number; meta: number }) {
  return (
    <p className="kicker" style={{ color: "var(--c-accent-700)" }}>
      {total < meta ? `Llevas ${total} de ${meta}` : `Llevas ${total} · ya te leo completo`}
    </p>
  );
}

type Props = {
  animes: Anime[];
  marcados: Set<number>;
  /** Todo lo marcado (parrilla, tarjetas y chat), para el medidor. */
  total: number;
  meta: number;
  onMarcar: (id: number) => void;
  onSaltar: () => void;
};

export function VitrinaSeleccion({ animes, marcados, total, meta, onMarcar, onSaltar }: Props) {
  return (
    <div className="anim-view h-full overflow-y-auto overscroll-contain px-4 pb-4 md:px-6">
      <div className="sticky top-0 z-10 pt-4 pb-2" style={{ background: "var(--c-paper)" }}>
        <Medidor total={total} meta={meta} />
      </div>
      <h1 className="titulo-seccion mb-1">¿Cuál de estos has visto?</h1>
      <p className="mb-3 text-[13px]" style={{ color: "var(--c-muted)" }}>
        Toca las que ya viste. Con 3 te empiezo a recomendar, y con {meta} te
        leo completo.{" "}
        <button
          type="button"
          onClick={onSaltar}
          className="underline"
          style={{ color: "var(--c-accent-700)" }}
        >
          Saltar
        </button>
      </p>

      <ParrillaPortadas animes={animes} marcados={marcados} onMarcar={onMarcar} />

      <p className="mt-6 text-[11px]" style={{ color: "var(--c-muted)" }}>
        <Link href="/privacidad" className="underline">
          Aviso de privacidad
        </Link>
      </p>
    </div>
  );
}
