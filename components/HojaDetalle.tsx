"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Anime } from "@/lib/anime/catalogo";
import { nombreOriginal, nombreVisible } from "@/lib/anime/nombre";
import { enlaceDonde } from "@/lib/anime/donde";
import { generoEnEspanol } from "@/lib/anime/generos";
import type { Detalle } from "@/lib/anime/detalle";
import { Portada } from "./Vitrina";

/**
 * La hoja de detalle (alcance v1, módulo 4). Se abre ENCIMA de todo, sin
 * sacar de la conversación: en celular sube desde abajo y deja ver lo de
 * atrás ("esto es temporal"); en escritorio es un panel a la derecha. Cierra
 * con ✕, tocando fuera o con Escape.
 *
 * Solo trae lo que la tarjeta no cabe: la sinopsis sin spoilers, dónde verlo
 * con más detalle, y las otras entradas de la obra. Marcar sigue viviendo en
 * la tarjeta. Ver docs/designs/experiencia-y-estados.md §5.
 */

const ESTADOS: Record<string, string> = {
  "Finished Airing": "Terminado",
  "Currently Airing": "En emisión",
  "Not yet aired": "Aún no sale",
};


function duracion(anime: Anime): string | null {
  if (anime.tipo === "movie") return "Película";
  if (!anime.episodios) return null;
  return `${anime.episodios} ${anime.episodios === 1 ? "episodio" : "episodios"}`;
}

type Props = {
  anime: Anime;
  escritorio: boolean;
  onCerrar: () => void;
  /** Tocar una entrada relacionada abre SU hoja en el mismo lugar. */
  onAbrir: (anime: Anime) => void;
};

export function HojaDetalle({ anime, escritorio, onCerrar, onAbrir }: Props) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);

  // La sinopsis puede estarse escribiendo al vuelo: silueta, no hueco.
  useEffect(() => {
    const corte = new AbortController();
    setDetalle(null);
    setCargando(true);
    fetch(`/api/detalle?id=${anime.id}`, { signal: corte.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Detalle>) : null))
      .then((d) => setDetalle(d))
      .catch(() => setDetalle(null))
      .finally(() => {
        if (!corte.signal.aborted) setCargando(false);
      });
    return () => corte.abort();
  }, [anime.id]);

  // Escape cierra, como cualquier ventana.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [onCerrar]);

  const estado = anime.estado ? ESTADOS[anime.estado] : null;
  const nombre = nombreVisible(anime);
  const romaji = nombreOriginal(anime);
  const datosDuros = [duracion(anime), estado, anime.anio].filter(Boolean).join(" · ");

  return (
    <div className={`fixed inset-0 z-50 flex ${escritorio ? "justify-end" : "flex-col justify-end"}`}>
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--c-ink) 55%, transparent)" }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${nombre}`}
        className="anim-view relative flex flex-col"
        style={{
          height: escritorio ? "100%" : "85%",
          width: escritorio ? "min(480px, 100%)" : "100%",
          background: "var(--c-paper)",
          color: "var(--c-ink)",
          borderTop: escritorio ? undefined : "2px solid var(--c-accent)",
          borderLeft: escritorio ? "2px solid var(--c-accent)" : undefined,
        }}
      >
        <header
          className="flex shrink-0 items-center gap-[10px] px-4"
          style={{ height: 56, borderBottom: "var(--borde-koma)" }}
        >
          {!escritorio && (
            <span
              aria-hidden
              className="absolute left-1/2 top-[6px] h-[4px] w-[40px] -translate-x-1/2"
              style={{ background: "var(--c-neutral-300)" }}
            />
          )}
          <span aria-hidden className="h-[10px] w-[10px]" style={{ background: "var(--c-accent)" }} />
          <span className="kicker">Detalle</span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="ml-auto flex h-11 w-11 items-center justify-center"
          >
            <X size={20} strokeWidth={2.2} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex gap-3">
            <div className="shrink-0">
              <Portada anime={anime} ancho={92} />
            </div>
            <div className="min-w-0 flex-1">
              {/* Hasta 3 líneas y corte: los títulos de anime son largos de verdad. */}
              <h2 className="font-display line-clamp-3 text-[20px] leading-tight">{nombre}</h2>
              {romaji && (
                <p className="line-clamp-1 text-[12px]" style={{ color: "var(--c-muted)" }}>
                  {romaji}
                </p>
              )}
              {datosDuros && <p className="font-display mt-2 text-[13px] leading-tight">{datosDuros}</p>}
              {detalle && detalle.generos.length > 0 && (
                <p className="mt-1 text-[12px]" style={{ color: "var(--c-muted)" }}>
                  {[...new Set(detalle.generos.map(generoEnEspanol))].join(" · ")}
                </p>
              )}
            </div>
          </div>

          {/* De qué va. Cargando: silueta. Sin sinopsis: se omite la sección. */}
          {(cargando || detalle?.sinopsis) && (
            <div className="mt-5">
              <p className="kicker mb-2" style={{ color: "var(--c-accent-700)" }}>
                De qué va · sin spoilers
              </p>
              {cargando ? (
                <div aria-busy="true" className="flex flex-col gap-2">
                  {[100, 92, 70].map((w) => (
                    <span
                      key={w}
                      className="block h-[14px]"
                      style={{ width: `${w}%`, background: "var(--c-neutral-300)" }}
                    />
                  ))}
                </div>
              ) : (
                <p className="max-w-[60ch] text-[15px] leading-relaxed">{detalle?.sinopsis}</p>
              )}
            </div>
          )}

          {/* Dónde verlo. Si no lo sabemos no se dice nada. */}
          {anime.donde.length > 0 && (
            <div className="mt-5">
              <p className="kicker mb-2" style={{ color: "var(--c-accent-700)" }}>
                Dónde verlo
              </p>
              <ul className="flex flex-col gap-2">
                {anime.donde.map((d) => {
                  const enlace = enlaceDonde(d, anime);
                  if (!enlace) return null;
                  return (
                    <li key={d.nombre}>
                      <a
                        href={enlace.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display flex min-h-[44px] items-center px-3 text-[12px] uppercase tracking-[0.08em]"
                        style={{ border: "var(--borde-koma)" }}
                      >
                        {enlace.directo ? "Ver en" : "Buscar en"} {d.nombre}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* La misma obra: temporadas, películas, OVAs. */}
          {detalle && detalle.relacionados.length > 0 && (
            <div className="mt-5">
              <p className="kicker mb-2" style={{ color: "var(--c-accent-700)" }}>
                De la misma obra
              </p>
              <ul className="flex flex-col">
                {detalle.relacionados.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onAbrir(r)}
                      className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left"
                      style={{ borderBottom: "1px solid var(--c-neutral-300)" }}
                    >
                      <Portada anime={r} ancho={36} />
                      <span className="min-w-0 flex-1">
                        <span className="font-display line-clamp-2 block text-[14px] leading-tight">
                          {nombreVisible(r)}
                        </span>
                        <span className="block text-[11px]" style={{ color: "var(--c-muted)" }}>
                          {[duracion(r), r.anio].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
