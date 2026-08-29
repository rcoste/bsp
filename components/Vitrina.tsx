"use client";

import Image from "next/image";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Anime } from "@/lib/anime/catalogo";

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

  const iniciales = anime.titulo
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
          alt={anime.titulo}
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

type Props = {
  animes: Anime[];
  marcados: Set<number>;
  onMarcar: (id: number) => void;
  onSaltar: () => void;
};

export function VitrinaSeleccion({ animes, marcados, onMarcar, onSaltar }: Props) {
  return (
    <div className="anim-view h-full overflow-y-auto overscroll-contain px-4 pb-4 md:px-6">
      <p className="kicker sticky top-0 z-10 pt-4 pb-2" style={{ background: "var(--c-paper)", color: "var(--c-accent-700)" }}>
        Vitrina · modo selección
      </p>
      <h1 className="titulo-seccion mb-1">¿Cuál de estos has visto?</h1>
      <p className="mb-3 text-[13px]" style={{ color: "var(--c-muted)" }}>
        Al tercer toque te empiezo a recomendar — y entre más marques, mejor te
        leo.{" "}
        <button
          type="button"
          onClick={onSaltar}
          className="underline"
          style={{ color: "var(--c-accent-700)" }}
        >
          Saltar
        </button>
      </p>

      {/* Koma grid: el fondo de tinta se ve por el gap de 2px, y ESO es el
          borde de cada viñeta. */}
      {/* En escritorio caben cinco por fila, con el bloque acotado a 760px
          para que las portadas no se vuelvan carteles. */}
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
                  {/* El estado nunca se marca solo con color: palomita además
                      del contorno rojo. */}
                  {activo && (
                    <>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ outline: "2px solid var(--c-accent)", outlineOffset: -2 }}
                      />
                      <span
                        aria-hidden
                        className="absolute right-0 top-0 flex h-[22px] w-[22px] items-center justify-center"
                        style={{ background: "var(--c-accent)", color: "var(--c-paper)" }}
                      >
                        <Check size={14} strokeWidth={2.4} />
                      </span>
                    </>
                  )}
                </div>
                <p
                  className="font-display line-clamp-2 p-2 text-[11px] leading-tight"
                  style={{ color: activo ? "var(--c-accent-700)" : "var(--c-ink)" }}
                >
                  {a.titulo}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {/* El medidor. En producción del producto original, quien arma ~20
          títulos el día uno vuelve 46%; quien arma 1-2, vuelve 6%. La meta
          visible existe para empujar hacia ese número, no de adorno. */}
      <p className="mt-3 text-[11px]" style={{ color: "var(--c-muted)" }}>
        {marcados.size < 20 ? (
          <>
            Llevas <strong style={{ color: "var(--c-ink)" }}>{marcados.size}</strong>
            {" "}· con ~20 te leo completo
          </>
        ) : (
          <>Llevas {marcados.size} — con esto ya te leo clarito.</>
        )}
      </p>
    </div>
  );
}
