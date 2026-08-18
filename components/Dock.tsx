"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import type { Turno } from "@/lib/chat/eventos";
import { Escribiendo, Globo } from "./Globo";

/**
 * El dock móvil: la barra de tinta de abajo.
 *
 * En celular el hilo completo NO vive en pantalla — solo el último globo de
 * Sen Pai, recortado a dos líneas, más los chips y el campo. El hilo entero
 * sube como hoja al 78% cuando lo tocas. Así la vitrina se queda con casi
 * toda la pantalla, que es donde vive el producto. Ver DESIGN.md → Dock móvil.
 */

type Props = {
  /** En escritorio el hilo vive siempre visible en la columna izquierda; no
   *  hay dock ni hoja. Ver DESIGN.md → "el chat es tinta, la vitrina papel:
   *  ese contraste ES el layout". */
  escritorio?: boolean;
  mensajes: Turno[];
  chips: string[];
  pensando: boolean;
  onEnviar: (texto: string) => void;
  deshabilitado?: boolean;
  aviso?: string;
};

export function Dock({
  escritorio,
  mensajes,
  chips,
  pensando,
  onEnviar,
  deshabilitado,
  aviso,
}: Props) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const hiloRef = useRef<HTMLDivElement>(null);

  const ultimoBot = [...mensajes].reverse().find((m) => m.de === "ai");

  // Solo baja solo si ya estabas abajo. Si estás leyendo mensajes viejos no se
  // te arrastra: es el error clásico de las apps de chat.
  useEffect(() => {
    if (!abierto) return;
    const hilo = hiloRef.current;
    if (!hilo) return;
    const alFondo =
      hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 100;
    if (alFondo) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando, abierto]);

  // Escape cierra la hoja, como cualquier ventana.
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) =>
      e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [abierto]);

  // El compositor vive en un solo lugar y se monta donde haga falta: en el
  // dock cuando la hoja está cerrada, y DENTRO de la hoja cuando está abierta.
  // Si se quedara solo en el dock, con la hoja abierta se podría leer el hilo
  // pero no contestar.
  // OJO: es una función que devuelve JSX, NO un componente. Si se definiera
  // como componente aquí adentro, React lo trataría como un tipo nuevo en cada
  // render, desmontaría el campo en cada tecla y se perdería el foco.
  const compositor = () => (
    <>
      {/* Los chips comparten estado con el campo: si uno se deshabilita,
            todos. Fila con scroll horizontal sin barra — nunca dos filas. */}
      {chips.length > 0 && (
        <div className="fila-scroll gap-2 px-4 pb-2 [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onEnviar(c)}
              disabled={deshabilitado}
              className="chip-tinta disabled:opacity-45"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {aviso && (
        <p
          className="px-4 pb-2 text-[11px]"
          style={{ color: "var(--c-accent-400)" }}
        >
          {aviso}
        </p>
      )}

      <div className="flex items-end gap-2 px-4 pt-1">
        <label htmlFor="mensaje" className="sr-only">
          Escribe tu mensaje
        </label>
        <textarea
          id="mensaje"
          value={texto}
          rows={1}
          disabled={deshabilitado}
          placeholder="Acabé una serie, ¿qué sigo?"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          // 16px exactos: con menos, iOS hace zoom solo al enfocar y
          // descuadra toda la pantalla.
          className="max-h-24 min-h-[44px] flex-1 resize-none px-3 py-[11px] outline-none disabled:opacity-45"
          style={{
            fontSize: 16,
            fontFamily: "var(--font-body)",
            background: "var(--c-ink)",
            color: "var(--c-on-ink)",
            border: "1px solid var(--c-on-ink-border)",
          }}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={deshabilitado || !texto.trim()}
          aria-label="Enviar mensaje"
          className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-35"
          style={{
            background: "var(--c-accent)",
            color: "var(--c-paper)",
            border: "var(--borde-koma)",
          }}
        >
          <ArrowUp size={20} strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </>
  );

  function enviar() {
    const limpio = texto.trim();
    if (!limpio || deshabilitado) return;
    onEnviar(limpio);
    setTexto("");
  }

  const hiloCompleto = (conCerrar: boolean) => (
    <>
      <header
        className="flex shrink-0 items-center gap-[10px] px-4"
        style={{
          height: 64,
          borderBottom: "2px solid var(--c-on-ink-divider)",
        }}
      >
        <span
          aria-hidden
          className="h-[14px] w-[14px]"
          style={{ background: "var(--c-accent)" }}
        />
        {escritorio ? (
          <>
            <span className="font-display text-[22px] leading-none tracking-[-0.02em]">
              BSP
            </span>
            <span
              className="text-[11px]"
              style={{ color: "var(--c-on-ink-border)" }}
            >
              Tu universo otaku, en español
            </span>
            <span
              className="kicker ml-auto px-[6px] py-[3px]"
              style={{ border: "1px solid var(--c-on-ink-border)" }}
            >
              Beta
            </span>
          </>
        ) : (
          <span className="kicker">La conversación</span>
        )}
        {conCerrar && (
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="ml-auto flex h-11 w-11 items-center justify-center"
            style={{ color: "var(--c-on-ink)" }}
          >
            <X size={20} strokeWidth={2.2} aria-hidden />
          </button>
        )}
      </header>

      <div
        ref={hiloRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
      >
        <ul className="flex flex-col gap-4">
          {mensajes.map((m, i) => (
            <li key={i}>
              <Globo turno={m} />
            </li>
          ))}
          {pensando && (
            <li>
              <Escribiendo />
            </li>
          )}
        </ul>
        <div ref={finRef} />
      </div>

      <div style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
        {compositor()}
      </div>
    </>
  );

  // ESCRITORIO: columna de tinta fija a la izquierda, sin dock ni hoja.
  if (escritorio) {
    return (
      <aside
        aria-label="Conversación"
        className="flex w-[430px] shrink-0 flex-col"
        style={{
          background: "var(--c-ink)",
          color: "var(--c-on-ink)",
          borderRight: "var(--borde-koma)",
        }}
      >
        {hiloCompleto(false)}
      </aside>
    );
  }

  return (
    <>
      {/* LA HOJA con el hilo completo */}
      {abierto && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <button
            type="button"
            aria-label="Cerrar la conversación"
            onClick={() => setAbierto(false)}
            className="absolute inset-0"
            style={{
              background: "color-mix(in srgb, var(--c-ink) 55%, transparent)",
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Conversación completa"
            className="anim-view relative flex flex-col"
            style={{
              height: "78%",
              background: "var(--c-ink)",
              color: "var(--c-on-ink)",
              borderTop: "2px solid var(--c-accent)",
            }}
          >
            {hiloCompleto(true)}
          </section>
        </div>
      )}

      {/* EL DOCK */}
      <section
        aria-label="Conversación"
        className="relative z-30 shrink-0"
        style={{
          background: "var(--c-ink)",
          color: "var(--c-on-ink)",
          borderTop: "var(--borde-koma)",
          paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        {/* El último globo de Sen Pai, a dos líneas. Tocarlo abre el hilo. */}
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex w-full items-start gap-3 px-4 pt-3 pb-2 text-left"
          aria-label="Ver la conversación completa"
        >
          <span className="min-w-0 flex-1">
            <span
              className="kicker mb-1 block"
              style={{ color: "var(--c-accent-400)" }}
            >
              Sen Pai
            </span>
            {pensando && !ultimoBot ? (
              <Escribiendo />
            ) : (
              <span
                className="block text-[14px] leading-normal"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {ultimoBot?.texto ?? ""}
              </span>
            )}
          </span>
          {pensando && ultimoBot ? (
            <span
              className="mt-5 flex shrink-0 items-center gap-[5px]"
              aria-hidden
            >
              {[0, 0.15, 0.3].map((r) => (
                <span
                  key={r}
                  className="block h-[6px] w-[6px]"
                  style={{
                    background: "var(--c-accent)",
                    animation: `blink 1s ${r}s infinite`,
                  }}
                />
              ))}
            </span>
          ) : (
            <span
              aria-hidden
              className="kicker mt-5 shrink-0"
              style={{ color: "var(--c-on-ink-border)" }}
            >
              Ver todo
            </span>
          )}
        </button>

        {!abierto && compositor()}
      </section>
    </>
  );
}
