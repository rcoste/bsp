"use client";

import { useRef } from "react";
import type { Anime } from "@/lib/anime/catalogo";
import type { Calificacion, Entrada, Marca } from "@/lib/lista";
import { TarjetaAnime } from "./TarjetaAnime";
import { Medidor, ParrillaPortadas } from "./Vitrina";

export type Tarjeta = { anime: Anime; razon: string };

/**
 * El modo recomendación: las tarjetas en koma grid.
 *
 * El porqué va justo debajo del título, en rojo y en minúsculas normales: se
 * lee segundo, después del nombre. Ver DESIGN.md → "El porqué".
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
  /** El ancla ya es una frase completa ("Seguías con esto") y no lo que la
   *  persona pidió, así que no se le antepone "Para:". */
  anclaLibre?: boolean;
  onAbrir?: (anime: Anime) => void;
  /** La parrilla sigue DEBAJO de las recomendaciones después del arranque.
   *  Antes desaparecía al tercer toque y volver dependía de un botón chico,
   *  justo cuando la meta (20 marcados el día uno) es lo que más retiene. */
  seguirMarcando?: {
    animes: Anime[];
    marcados: Set<number>;
    onMarcar: (id: number) => void;
    total: number;
    meta: number;
    /** Marcadas desde la última recomendación: no se re-recomienda solo en
     *  cada toque (cuesta una conversación); la persona decide cuándo. */
    nuevas: number;
    onActualizar: () => void;
  };
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
    <ul className="medianil grid-cols-1 md:max-w-[860px] @2xl:grid-cols-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="medianil-caja">
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
  anclaLibre,
  onAbrir,
  seguirMarcando,
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const parrilla = useRef<HTMLElement>(null);
  return (
    <div ref={caja} className="anim-view @container h-full overflow-y-auto overscroll-contain px-4 pb-4 md:px-6">
      {/* El encabezado ancla. Sin él, quien sube en la conversación ve un
          mensaje viejo junto a una vitrina nueva, y la app le está mintiendo. */}
      <div
        className="sticky top-0 z-10 flex items-center gap-2 pt-4 pb-2"
        style={{ background: "var(--c-paper)" }}
      >
        <p className="kicker min-w-0 flex-1 truncate" style={{ color: "var(--c-accent-700)" }}>
          {esLista
            ? "Tus guardados"
            : anclaLibre
              ? ancla
              : `Para: ${ancla || "tus gustos"}`}
        </p>
        {medidor && medidor.marcados < medidor.meta && (
          <button
            type="button"
            onClick={
              // Si la parrilla ya está abajo, el botón lleva a ella en vez de
              // cambiar de vista.
              seguirMarcando && !esLista
                ? () => parrilla.current?.scrollIntoView({ behavior: "smooth" })
                : medidor.onSeguir
            }
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
        // Dos columnas según el ANCHO DE LA VITRINA, no de la pantalla: en una
        // laptop chica o tablet la vitrina mide ~460px y dos columnas partían
        // "No, otra cosa" en tres renglones.
        <ul className="medianil grid-cols-1 md:max-w-[860px] @2xl:grid-cols-2">
          {tarjetas.map(({ anime, razon }) => (
            <li key={anime.id} className="medianil-caja">
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

      {seguirMarcando && !esLista && (
        <section ref={parrilla} aria-label="Seguir marcando" className="mt-10 md:max-w-[760px]">
          <Medidor total={seguirMarcando.total} meta={seguirMarcando.meta} />
          <h2 className="titulo-seccion mt-1 mb-1">¿Cuáles más has visto?</h2>
          <p className="mb-3 text-[13px]" style={{ color: "var(--c-muted)" }}>
            Cada una que marques afina lo de arriba.
          </p>
          <ParrillaPortadas
            animes={seguirMarcando.animes}
            marcados={seguirMarcando.marcados}
            onMarcar={seguirMarcando.onMarcar}
          />
          {/* Pegado al pie mientras marcas: si viviera arriba de la parrilla,
              a media parrilla ya no se vería. */}
          {seguirMarcando.nuevas > 0 && (
            <div className="sticky bottom-0 pt-3 pb-1" style={{ background: "var(--c-paper)" }}>
              <button
                type="button"
                onClick={() => {
                  seguirMarcando.onActualizar();
                  caja.current?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="btn-primario w-full md:w-auto"
              >
                Recomiéndame con {seguirMarcando.nuevas === 1 ? "la nueva" : `las ${seguirMarcando.nuevas} nuevas`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
