"use client";

import type { Anime } from "@/lib/anime/catalogo";
import type { Calificacion, Entrada, Marca } from "@/lib/lista";
import { TarjetaAnime } from "./TarjetaAnime";

export type Tarjeta = { anime: Anime; razon: string };

/**
 * El modo recomendación: las tarjetas en koma grid.
 *
 * El porqué va como kicker rojo ARRIBA del título, no como pie de foto: es lo
 * primero que se lee, porque es lo que ninguna lista genérica puede darte.
 * Ver DESIGN.md → "El porqué".
 */

type Props = {
  tarjetas: Tarjeta[];
  ancla: string;
  cargando: boolean;
  marcas: Record<number, Entrada>;
  saliendo: Set<number>;
  onMarcar: (anime: Anime, marca: Marca) => void;
  onCalificar: (anime: Anime, calificacion: Calificacion) => void;
  /** Volver a la parrilla de marcado. Visible mientras no llegue a la meta:
   *  la biblioteca del día uno es EL factor de retención (46% vs 6%). */
  medidor?: { marcados: number; meta: number; onSeguir: () => void };
  /** El set actual es la lista de la persona, no una recomendación. Cambia el
   *  encabezado y el estado vacío. */
  esLista?: boolean;
  onAbrir?: (anime: Anime) => void;
};

/** La lista vacía NO se esconde: explica dónde van a vivir las cosas.
 *  DESIGN.md → estados vacíos: título + una línea + acción. Nunca "no hay
 *  elementos". */
function ListaVacia({ onSeguir }: { onSeguir?: () => void }) {
  return (
    <div className="koma grid-cols-1 md:max-w-[860px]">
      <div className="koma-celda p-6">
        <h2 className="titulo-seccion mb-2">Todavía no guardas nada</h2>
        <p className="mb-4 max-w-[46ch] text-[14px]" style={{ color: "var(--c-muted)" }}>
          Aquí van a vivir las que marques con <strong>Quiero verlo</strong>, y
          las que estés viendo con el episodio en el que vas. También puedes
          decírmelo hablando: «apúntame Vinland Saga».
        </p>
        {onSeguir && (
          <button type="button" onClick={onSeguir} className="btn-primario">
            Marcar las que ya viste
          </button>
        )}
      </div>
    </div>
  );
}

/** Las siluetas, del tamaño de las tarjetas reales para que nada brinque. */
function Siluetas() {
  return (
    <ul className="koma grid-cols-1 md:max-w-[860px] md:grid-cols-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="koma-celda">
          <div className="speedlines flex items-start gap-3 p-3">
            <div
              className="animate-pulse"
              style={{ width: 92, aspectRatio: "2 / 3", background: "var(--c-neutral-300)" }}
            />
            <div className="flex-1 space-y-2 pt-1">
              <div
                className="h-[10px] w-2/5 animate-pulse"
                style={{ background: "var(--c-neutral-300)" }}
              />
              <div
                className="h-[16px] w-4/5 animate-pulse"
                style={{ background: "var(--c-neutral-300)" }}
              />
              <div
                className="h-[13px] w-3/5 animate-pulse"
                style={{ background: "var(--c-neutral-300)" }}
              />
            </div>
          </div>
          <div style={{ height: 44, borderTop: "var(--borde-koma)" }} />
        </li>
      ))}
    </ul>
  );
}

export function VitrinaRecomendacion({
  tarjetas,
  ancla,
  cargando,
  marcas,
  saliendo,
  onMarcar,
  onCalificar,
  medidor,
  esLista,
  onAbrir,
}: Props) {
  return (
    <div className="anim-view h-full overflow-y-auto overscroll-contain px-4 pb-4 md:px-6">
      {/* El encabezado ancla. Sin él, quien sube en la conversación ve un
          mensaje viejo junto a una vitrina nueva, y la app le está mintiendo. */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 pt-4 pb-2"
        style={{ background: "var(--c-paper)" }}
      >
        <p className="kicker min-w-0 flex-1" style={{ color: "var(--c-accent-700)" }}>
          {esLista ? "Tus guardados" : `Para: ${ancla || "tus gustos"}`}
        </p>
        {medidor && medidor.marcados < medidor.meta && (
          <button
            type="button"
            onClick={medidor.onSeguir}
            className="kicker shrink-0 px-[8px] py-[5px]"
            style={{ border: "1px solid var(--c-ink)" }}
          >
            Marcar vistos · {medidor.marcados}/{medidor.meta}
          </button>
        )}
      </div>

      {esLista && tarjetas.length === 0 ? (
        <ListaVacia onSeguir={medidor?.onSeguir} />
      ) : cargando && tarjetas.length === 0 ? (
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
              <TarjetaAnime
                anime={anime}
                razon={razon}
                entrada={marcas[anime.id] ?? null}
                saliendo={saliendo.has(anime.id)}
                onMarcar={(marca) => onMarcar(anime, marca)}
                onCalificar={(c) => onCalificar(anime, c)}
                onAbrir={onAbrir ? () => onAbrir(anime) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
