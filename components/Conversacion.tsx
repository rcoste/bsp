"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

type Mensaje = { de: "ai" | "tu"; texto: string };

type Props = {
  mensajes: Mensaje[];
  chips: string[];
  onEnviar: (texto: string) => void;
  onChip: (texto: string) => void;
  pensando?: boolean;
  deshabilitado?: boolean;
  avisoDeshabilitado?: string;
};

export function Conversacion({
  mensajes,
  chips,
  onEnviar,
  onChip,
  pensando,
  deshabilitado,
  avisoDeshabilitado,
}: Props) {
  const [texto, setTexto] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const hiloRef = useRef<HTMLDivElement>(null);

  // Solo baja solo si el usuario ya estaba abajo. Si está leyendo mensajes
  // viejos, no se le arrastra: es el error clásico de las apps de chat.
  useEffect(() => {
    const hilo = hiloRef.current;
    if (!hilo) return;
    const alFondo = hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 100;
    if (alFondo) finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pensando]);

  function enviar() {
    const limpio = texto.trim();
    if (!limpio || deshabilitado) return;
    onEnviar(limpio);
    setTexto("");
    setEscribiendo(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={hiloRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
        aria-live="polite"
        aria-atomic="false"
      >
        <ul className="flex flex-col gap-3">
          {mensajes.map((m, i) => (
            <li key={i} className={m.de === "tu" ? "self-end" : "self-start"}>
              <div
                className="max-w-[85vw] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-[15px] leading-relaxed"
                style={
                  m.de === "tu"
                    ? { backgroundColor: "var(--c-accent)", color: "var(--c-on-accent)" }
                    : {
                        backgroundColor: "var(--c-surface)",
                        color: "var(--c-text)",
                        border: "1px solid var(--c-border)",
                      }
                }
              >
                {m.texto}
              </div>
            </li>
          ))}
        </ul>

        {/* Que la AI está pensando: tres cuadros que parpadean. Sin esto, seis
            segundos de pantalla quieta se leen como app trabada (§3.2). */}
        {pensando && (
          <p className="mt-3 flex items-center gap-1.5" role="status">
            <span className="sr-only">Pensando</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{
                  backgroundColor: "var(--c-accent)",
                  animationDelay: `${i * 0.15}s`,
                }}
                aria-hidden
              />
            ))}
          </p>
        )}

        <div ref={finRef} />
      </div>

      {/* Los chips se ocultan mientras escribes: el alto es escaso y no
          pueden vivir ahí permanentemente. */}
      {chips.length > 0 && !escribiendo && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChip(c)}
              disabled={deshabilitado}
              className="shrink-0 rounded-full border px-3.5 py-2 text-[13px] transition-colors disabled:opacity-45"
              style={{
                borderColor: "var(--c-border)",
                backgroundColor: "var(--c-surface)",
                color: "var(--c-text)",
                minHeight: 44,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {avisoDeshabilitado && (
        <p className="px-4 pb-2 text-center text-[12px] text-muted">{avisoDeshabilitado}</p>
      )}

      <div
        className="flex items-end gap-2 border-t px-4 pt-2"
        style={{
          borderColor: "var(--c-border)",
          paddingBottom: "max(env(safe-area-inset-bottom), 8px)",
        }}
      >
        <label htmlFor="mensaje" className="sr-only">
          Escribe tu mensaje
        </label>
        <textarea
          id="mensaje"
          value={texto}
          rows={1}
          disabled={deshabilitado}
          placeholder="Acabé una serie, ¿qué sigo?"
          onFocus={() => setEscribiendo(true)}
          onBlur={() => setEscribiendo(false)}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          // 16px exactos: con menos, iOS hace zoom solo al enfocar y
          // descuadra toda la pantalla.
          className="max-h-28 flex-1 resize-none rounded-[var(--radius-lg)] border px-3.5 py-2.5 outline-none disabled:opacity-45"
          style={{
            fontSize: 16,
            borderColor: "var(--c-border)",
            backgroundColor: "var(--c-surface)",
            color: "var(--c-text)",
          }}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={deshabilitado || !texto.trim()}
          aria-label="Enviar mensaje"
          className="flex items-center justify-center rounded-full transition-opacity disabled:opacity-35"
          style={{
            backgroundColor: "var(--c-accent)",
            color: "var(--c-on-accent)",
            width: 44,
            height: 44,
          }}
        >
          <Send size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
