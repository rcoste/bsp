"use client";

import Image from "next/image";
import type { Anime } from "@/lib/anime/catalogo";

export type Tarjeta = { anime: Anime; razon: string };

/**
 * El modo recomendación de la vitrina: carrusel de una tarjeta grande con
 * media asomando a la derecha — el gesto que la gente ya hace en Netflix.
 *
 * Tres tarjetas en fila en 375px darían ~110px cada una: portada de estampilla
 * y título cortado. Ver docs/designs/experiencia-y-estados.md §1 (decisión D3).
 */

type Props = {
  tarjetas: Tarjeta[];
  ancla: string;
  cargando: boolean;
  onAbrir?: (anime: Anime) => void;
};

/** Las siluetas: del tamaño exacto de las reales, para que la pantalla no
 *  brinque cuando llegan. Ver §3.2. */
function Siluetas() {
  return (
    <ul className="flex gap-3 px-4 pb-3" aria-hidden>
      {[0, 1].map((i) => (
        <li key={i} className="shrink-0" style={{ width: i === 0 ? "72%" : "22%" }}>
          <div
            className="w-full animate-pulse rounded-[var(--radius-md)]"
            style={{ aspectRatio: "2 / 3", backgroundColor: "var(--c-border)" }}
          />
        </li>
      ))}
    </ul>
  );
}

export function VitrinaRecomendacion({ tarjetas, ancla, cargando, onAbrir }: Props) {
  const soloUna = tarjetas.length === 1;

  return (
    <div className="flex h-full flex-col">
      {/* El encabezado ancla. Sin él, quien sube en la conversación ve un
          mensaje viejo junto a una vitrina nueva, y la app le está mintiendo. */}
      {ancla && (
        <p className="shrink-0 truncate px-4 pt-3 pb-2 text-[13px] text-muted">
          Para: <span className="text-default">{ancla}</span>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cargando && tarjetas.length === 0 ? (
          <Siluetas />
        ) : (
          <ul className="flex h-full snap-x snap-mandatory gap-3 px-4 pb-3">
            {tarjetas.map(({ anime, razon }) => (
              <li
                key={anime.id}
                className="h-full shrink-0 snap-start"
                // Con un solo resultado la tarjeta ocupa el ancho completo y
                // desaparece el asomo: si no, se ve rota.
                style={{ width: soloUna ? "100%" : "72%" }}
              >
                <button
                  type="button"
                  onClick={() => onAbrir?.(anime)}
                  className="flex h-full w-full gap-3 text-left"
                >
                  <div
                    className="relative h-full shrink-0 overflow-hidden rounded-[var(--radius-md)] border"
                    style={{
                      aspectRatio: "2 / 3",
                      borderColor: "var(--c-border)",
                      backgroundColor: "var(--c-border)",
                    }}
                  >
                    {anime.portada ? (
                      <Image
                        src={anime.portada}
                        alt={anime.titulo}
                        fill
                        sizes="(max-width: 768px) 45vw, 200px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      // Bloque sólido con el título: se ve intencional, no
                      // averiado. Nunca un ícono roto.
                      <span className="flex h-full items-center justify-center p-2 text-center text-[12px] text-muted">
                        {anime.titulo}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col justify-center gap-1 pr-1">
                    <p className="font-display line-clamp-3 text-[14px] leading-tight text-default">
                      {anime.titulo}
                    </p>
                    {razon && (
                      <p className="line-clamp-3 text-[12px] leading-snug text-muted">
                        {razon}
                      </p>
                    )}
                    {anime.anio && (
                      <p className="text-[11px] text-muted">{anime.anio}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
