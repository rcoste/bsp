"use client";

import { Bookmark, Check, Eye, X } from "lucide-react";
import type { Anime } from "@/lib/anime/catalogo";
import type { Calificacion, Entrada, Marca } from "@/lib/lista";
import { Portada } from "./Vitrina";

/**
 * La tarjeta de anime. AQUÍ SE GANA O SE PIERDE EL PRODUCTO.
 *
 * Todo lo que alguien necesita para decidir si ve algo cabe aquí, sin abrir
 * nada: portada, título, cuántos episodios, si ya terminó, dónde verlo, y el
 * porqué. Los tres datos duros no son adorno de ficha — son exactamente lo
 * que ChatGPT inventa con total seguridad, y por eso van con peso visual.
 *
 * Los tres botones pesan lo mismo a propósito. En la versión anterior de este
 * producto el de rechazo vivía enterrado en un menú de tres puntitos y lo
 * usaron 5 personas en total; rechazar es lo que más rápido le enseña el gusto
 * a la máquina. Ver docs/designs/alcance-v1-para-diseno.md §3.
 */

const ESTADOS: Record<string, string> = {
  "Finished Airing": "Terminado",
  "Currently Airing": "En emisión",
  "Not yet aired": "Aún no sale",
};

/**
 * Cuánto dura. El filtro real de un fan no es el género, es la duración: 12
 * episodios y 300 son decisiones distintas. Una película dice "Película", no
 * "1 episodio" — es correcto pero se lee como un dato roto.
 */
function duracion(anime: Anime): string | null {
  if (anime.tipo === "movie") return "Película";
  if (!anime.episodios) return null;
  return `${anime.episodios} ${anime.episodios === 1 ? "episodio" : "episodios"}`;
}

type Props = {
  anime: Anime;
  razon: string;
  entrada: Entrada | null;
  saliendo: boolean;
  onMarcar: (marca: Marca) => void;
  onCalificar: (calificacion: Calificacion) => void;
  onAbrir?: () => void;
};

const ETIQUETA_CALIF: Record<Calificacion, string> = {
  no_fue_lo_mio: "No fue lo mío",
  estuvo_bien: "Estuvo bien",
  me_encanto: "Me encantó",
};

/** Un botón del pie. Los tres son idénticos salvo el ícono y la etiqueta. */
function BotonMarca({
  activo,
  etiqueta,
  Icono,
  onClick,
}: {
  activo: boolean;
  etiqueta: string;
  Icono: typeof Eye;
  onClick: () => void;
}) {
  // El estado nunca se marca solo con color: cuando está activo el ícono
  // cambia a palomita además de invertirse el fondo.
  const Mostrado = activo ? Check : Icono;
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className="font-display flex min-h-[44px] w-full items-center gap-[6px] px-3 py-2 text-left text-[11px] leading-tight tracking-[0.08em] uppercase"
      style={{
        background: activo ? "var(--c-accent)" : "var(--c-surface)",
        color: activo ? "var(--c-paper)" : "var(--c-ink)",
      }}
    >
      <Mostrado size={16} strokeWidth={2.2} className="shrink-0" aria-hidden />
      <span className="min-w-0">{etiqueta}</span>
    </button>
  );
}

export function TarjetaAnime({
  anime,
  razon,
  entrada,
  saliendo,
  onMarcar,
  onCalificar,
  onAbrir,
}: Props) {
  const marca = entrada?.marca ?? null;
  const estado = anime.estado ? ESTADOS[anime.estado] : null;
  // El romaji solo si aporta: repetir el mismo título dos veces es ruido.
  const romaji =
    anime.tituloEn && anime.tituloEn !== anime.titulo ? anime.tituloEn : null;

  return (
    <article className={saliendo ? "anim-descarte" : undefined}>
      <div className="p-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAbrir}
            aria-label={`Ver detalle de ${anime.titulo}`}
            className="shrink-0"
          >
            <Portada anime={anime} ancho={92} />
          </button>

          <div className="min-w-0 flex-1">
            {razon && (
              <p className="kicker mb-1" style={{ color: "var(--c-accent-700)" }}>
                {razon}
              </p>
            )}

            <h3 className="font-display line-clamp-2 text-[16px] leading-tight">
              {anime.titulo}
            </h3>
            {romaji && (
              <p
                className="line-clamp-1 text-[11px]"
                style={{ color: "var(--c-muted)" }}
              >
                {romaji}
              </p>
            )}

            {/* Los datos duros. Peso visual de verdad — no letra chica. */}
            <p className="font-display mt-2 text-[13px] leading-tight">
              {[duracion(anime), estado].filter(Boolean).join(" · ")}
            </p>

            {/* La memoria, visible. Que la tarjeta diga "vas en el 8" la
                próxima vez que aparezca ES lo que hace notar que la app te
                conoce — sin esto la memoria existe y nadie lo nota. */}
            {(marca === "viendo" || marca === "abandonada") && (
              <p className="kicker mt-1" style={{ color: "var(--c-accent-700)" }}>
                {marca === "viendo" ? "La estás viendo" : "La dejaste"}
                {entrada?.episodio ? ` · ep. ${entrada.episodio}` : ""}
              </p>
            )}
            {anime.anio && (
              <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>
                {anime.anio}
              </p>
            )}

            {/* Dónde verlo. Si no lo sabemos no se dice nada: inventar una
                plataforma es peor que callarse. */}
            {anime.donde.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1">
                {anime.donde.map((d) => (
                  <li key={d.nombre}>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kicker inline-block px-[6px] py-[3px]"
                        style={{
                          border: "1px solid var(--c-ink)",
                          color: "var(--c-ink)",
                        }}
                      >
                        {d.nombre}
                      </a>
                    ) : (
                      <span
                        className="kicker inline-block px-[6px] py-[3px]"
                        style={{
                          border: "1px solid var(--c-neutral-300)",
                          color: "var(--c-muted)",
                        }}
                      >
                        {d.nombre}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Los tres botones, en tercios exactos. El gap de 2px sobre fondo tinta
          es el mismo patrón koma del resto de la app. */}
      <div
        className="grid grid-cols-3"
        style={{ gap: "var(--gap-koma)", background: "var(--c-ink)", borderTop: "var(--borde-koma)" }}
      >
        <BotonMarca
          activo={marca === "visto"}
          etiqueta="Ya lo vi"
          Icono={Eye}
          onClick={() => onMarcar("visto")}
        />
        <BotonMarca
          activo={marca === "quiero_ver"}
          etiqueta="Quiero verlo"
          Icono={Bookmark}
          onClick={() => onMarcar("quiero_ver")}
        />
        <BotonMarca
          activo={false}
          etiqueta="No, otra cosa"
          Icono={X}
          onClick={() => onMarcar("descartado")}
        />
      </div>

      {/* La calificación de 3 estados (DESIGN.md: NUNCA estrellas ni escalas
          numéricas). Aparece solo cuando ya la vio o la dejó — antes no hay
          nada que calificar. */}
      {(marca === "visto" || marca === "abandonada") && (
        <div
          className="grid grid-cols-3"
          style={{
            gap: "var(--gap-koma)",
            background: "var(--c-ink)",
            borderTop: "var(--borde-koma)",
          }}
        >
          {(Object.keys(ETIQUETA_CALIF) as Calificacion[]).map((c) => {
            const activa = entrada?.calificacion === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={activa}
                onClick={() => onCalificar(c)}
                className="flex min-h-[40px] w-full items-center justify-center gap-[5px] px-2 py-2 text-center text-[11px] leading-tight"
                style={{
                  background: activa ? "var(--c-accent)" : "var(--c-surface)",
                  color: activa ? "var(--c-paper)" : "var(--c-muted)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 700,
                }}
              >
                {/* El estado nunca se marca solo con color. */}
                {activa && <Check size={13} strokeWidth={2.4} aria-hidden />}
                {ETIQUETA_CALIF[c]}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
