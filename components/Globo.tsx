"use client";

import type { Turno } from "@/lib/chat/eventos";

/**
 * El globo de diálogo.
 *
 * La cola es un cuadrado de 10px girado 45° con borde arriba e izquierda (o
 * derecha, si es del usuario): así el pico queda hueco y se ve como viñeta de
 * manga, no como burbuja de app de mensajería. Ver DESIGN.md → Componentes.
 */
export function Globo({ turno, conEtiqueta = true }: { turno: Turno; conEtiqueta?: boolean }) {
  const esBot = turno.de === "ai";

  return (
    <div className={`anim-msg flex flex-col ${esBot ? "items-start" : "items-end"}`}>
      {conEtiqueta && (
        <span
          className="kicker mb-[5px]"
          style={{ color: esBot ? "var(--c-accent-400)" : "var(--c-on-ink-border)" }}
        >
          {esBot ? "Sen Pai" : "Tú"}
        </span>
      )}

      <div
        // Lo que escribe la persona no sale en las grabaciones de Clarity.
        data-clarity-mask={esBot ? undefined : "True"}
        className="relative max-w-[85%] px-[14px] py-[10px] text-[14px] leading-normal"
        style={{
          background: esBot ? "var(--c-surface)" : "var(--c-accent)",
          color: esBot ? "var(--c-ink)" : "var(--c-paper)",
          border: "var(--borde-koma)",
          fontWeight: esBot ? 400 : 600,
          width: "fit-content",
        }}
      >
        <span
          aria-hidden
          className="absolute block h-[10px] w-[10px]"
          style={{
            top: -7,
            [esBot ? "left" : "right"]: 16,
            background: esBot ? "var(--c-surface)" : "var(--c-accent)",
            borderLeft: "2px solid var(--c-ink)",
            borderTop: "2px solid var(--c-ink)",
            transform: "rotate(45deg)",
          }}
        />
        {turno.texto}
      </div>
    </div>
  );
}

/**
 * Los tres cuadros que parpadean mientras Sen Pai piensa. Con red lenta
 * (§3.3) la burbuja dice que está tardando y ofrece Esperar / Cancelar; si la
 * persona ya tocó Esperar, solo queda Cancelar a su disposición.
 */
export function Escribiendo({
  espera = null,
  onEsperar,
  onCancelar,
}: {
  espera?: null | "tardando" | "esperando";
  onEsperar?: () => void;
  onCancelar?: () => void;
}) {
  return (
    <div className="flex flex-col items-start">
      <span className="kicker mb-[5px]" style={{ color: "var(--c-accent-400)" }}>
        Sen Pai
      </span>
      {espera && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--c-on-ink)" }}>
          <span>{espera === "tardando" ? "Está tardando más de lo normal." : "Sigo esperando."}</span>
          {espera === "tardando" && (
            <button type="button" onClick={onEsperar} className="chip-tinta min-h-[44px]">
              Esperar
            </button>
          )}
          <button type="button" onClick={onCancelar} className="chip-tinta min-h-[44px]">
            Cancelar
          </button>
        </div>
      )}
      <p className="flex items-center gap-[5px] py-1" role="status">
        <span className="sr-only">Pensando</span>
        {[0, 0.15, 0.3].map((retraso) => (
          <span
            key={retraso}
            aria-hidden
            className="block h-[6px] w-[6px]"
            style={{
              background: "var(--c-accent)",
              animation: `blink 1s ${retraso}s infinite`,
            }}
          />
        ))}
      </p>
    </div>
  );
}
