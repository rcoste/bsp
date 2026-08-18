"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import type { Anime } from "@/lib/anime/catalogo";

/**
 * La vitrina tiene DOS MODOS y confundirlos es el error más fácil de cometer:
 *
 * - selección: al llegar, cuadrícula de portadas para marcar lo que ya viste.
 * - recomendación: desde la primera respuesta, carrusel de tarjetas grandes.
 *
 * Ver docs/designs/experiencia-y-estados.md §1.
 */

type Props = {
  animes: Anime[];
  marcados: Set<number>;
  onMarcar: (id: number) => void;
};

export function VitrinaSeleccion({ animes, marcados, onMarcar }: Props) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain px-4 pb-2">
      <h2 className="font-display sticky top-0 z-10 bg-app pt-3 pb-2 text-[15px] text-default">
        ¿Cuál de estos has visto?
      </h2>

      <ul className="grid grid-cols-3 gap-3 pb-2" role="group">
        {animes.map((a) => {
          const activo = marcados.has(a.id);
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={activo}
                onClick={() => onMarcar(a.id)}
                className="group relative block w-full text-left"
              >
                {/* La caja se reserva desde el primer frame: sin esto la
                    pantalla brinca cuando cargan las portadas. */}
                <div
                  className="relative w-full overflow-hidden rounded-[var(--radius-md)] border transition-[border-color,box-shadow] duration-200"
                  style={{
                    aspectRatio: "2 / 3",
                    borderColor: activo ? "var(--c-accent)" : "var(--c-border)",
                    boxShadow: activo ? "0 0 0 2px var(--c-accent-ring)" : "none",
                    backgroundColor: "var(--c-border)",
                  }}
                >
                  {a.portada ? (
                    <Image
                      src={a.portada}
                      alt={a.titulo}
                      fill
                      sizes="(max-width: 768px) 33vw, 120px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-center text-[11px] text-muted">
                      {a.titulo}
                    </span>
                  )}

                  {activo && (
                    <span
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: "var(--c-accent)", color: "var(--c-on-accent)" }}
                    >
                      <Check size={14} strokeWidth={2.75} aria-hidden />
                    </span>
                  )}
                </div>

                <p
                  className="mt-1 line-clamp-2 text-[12px] leading-tight"
                  style={{ color: activo ? "var(--c-accent)" : "var(--c-text-muted)" }}
                >
                  {a.titulo}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
