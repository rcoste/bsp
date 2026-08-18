"use client";

import type { Anime } from "@/lib/anime/catalogo";
import { Portada } from "./Vitrina";

export type Tarjeta = { anime: Anime; razon: string };

/**
 * El modo recomendación: tarjetas horizontales en koma grid.
 *
 * El porqué va como kicker rojo ARRIBA del título, no como pie de foto: es lo
 * primero que se lee, porque es lo que ninguna lista genérica puede darte.
 * Ver DESIGN.md → "El porqué".
 */

type Props = {
  tarjetas: Tarjeta[];
  ancla: string;
  cargando: boolean;
  onAbrir?: (anime: Anime) => void;
};

/** Las siluetas, del tamaño exacto de las reales para que nada brinque. */
function Siluetas() {
  return (
    <ul className="koma grid-cols-1 md:max-w-[860px] md:grid-cols-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="koma-celda flex items-center gap-3 p-3">
          <div
            className="animate-pulse"
            style={{ width: 84, aspectRatio: "2 / 3", background: "var(--c-neutral-300)" }}
          />
          <div className="flex-1 space-y-2">
            <div
              className="h-[10px] w-2/5 animate-pulse"
              style={{ background: "var(--c-neutral-300)" }}
            />
            <div
              className="h-[14px] w-4/5 animate-pulse"
              style={{ background: "var(--c-neutral-300)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function VitrinaRecomendacion({ tarjetas, ancla, cargando, onAbrir }: Props) {
  return (
    <div className="anim-view h-full overflow-y-auto overscroll-contain px-4 pb-4 md:px-6">
      {/* El encabezado ancla. Sin él, quien sube en la conversación ve un
          mensaje viejo junto a una vitrina nueva, y la app le está mintiendo. */}
      <p
        className="kicker sticky top-0 z-10 pt-4 pb-2"
        style={{ background: "var(--c-paper)", color: "var(--c-accent-700)" }}
      >
        Para: {ancla || "tus gustos"}
      </p>

      {cargando && tarjetas.length === 0 ? (
        <Siluetas />
      ) : (
        <ul className="koma grid-cols-1 md:max-w-[860px] md:grid-cols-2">
          {tarjetas.map(({ anime, razon }, i) => (
            <li
              key={anime.id}
              // Con un número impar de tarjetas la última ocupa las dos
              // columnas: si no, la celda que sobra deja un bloque de tinta
              // vacío que se lee como un error de carga.
              className={`koma-celda ${
                tarjetas.length % 2 === 1 && i === tarjetas.length - 1
                  ? "md:col-span-2"
                  : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onAbrir?.(anime)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <Portada anime={anime} ancho={84} />
                <span className="min-w-0 flex-1">
                  {razon && (
                    <span
                      className="kicker mb-1 block"
                      style={{ color: "var(--c-accent-700)" }}
                    >
                      {razon}
                    </span>
                  )}
                  <span className="font-display line-clamp-2 block text-[15px] leading-tight">
                    {anime.titulo}
                  </span>
                  <span
                    className="mt-1 block text-[11px]"
                    style={{ color: "var(--c-muted)" }}
                  >
                    {[
                      anime.anio,
                      anime.estado === "Currently Airing" ? "En emisión" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
