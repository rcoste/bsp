"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * La obertura: los tres segundos que le dan contexto al que llega en frío.
 *
 * Dos líneas sobre tinta ("¿Acabaste una serie...?" → "Cuéntamelo...") y la
 * pantalla SE PARTE EN DOS revelando la app: la mitad de arriba se vuelve la
 * vitrina, la de abajo el chat. El corte es la presentación del layout.
 *
 * Lo que la separa de una pantalla de bienvenida —que en producción del
 * producto original atoró a 230 personas—: no pide NADA. Cero botones que
 * elegir, cero formularios; se va sola en ~3 segundos y cualquier toque la
 * salta. Es un título de manga, no una puerta.
 *
 * Solo aparece en la primera visita de verdad (sin marcas, sin campaña, sin
 * búsqueda) y nunca más: se recuerda en localStorage. Con reduced-motion no
 * aparece — una "animación de entrada" sin animación es solo un estorbo.
 */

const CLAVE_VISTA = "bsp_obertura";
// Leer dos líneas en un celular toma más de lo que uno cree cuando las
// escribió: con 1.5s la primera se va antes de terminar de leerla.
const MS_LINEA_1 = 2200;
const MS_LINEA_2 = 2600;
/** Espejo de --dur-view: lo que tarda el corte en abrirse. */
const MS_CORTE = 450;

type Paso = "linea1" | "linea2" | "cortando" | "fuera";

export function Obertura() {
  // Empieza "fuera" y solo entra tras comprobar localStorage: si entrara por
  // defecto, quien ya la vio la vería parpadear en cada visita.
  const [paso, setPaso] = useState<Paso>("fuera");
  const relojes = useRef<number[]>([]);

  const cortar = useCallback(() => {
    try {
      localStorage.setItem(CLAVE_VISTA, "1");
    } catch {
      // Sin localStorage (modo privado estricto) la verá otra vez. No es grave.
    }
    for (const r of relojes.current) window.clearTimeout(r);
    setPaso((p) => (p === "fuera" ? p : "cortando"));
    relojes.current.push(window.setTimeout(() => setPaso("fuera"), MS_CORTE));
  }, []);

  useEffect(() => {
    // ?intro=1 la fuerza aunque ya se haya visto. Existe para poder enseñarla
    // y ajustarla sin borrar el almacenamiento del teléfono a mano — dura 3
    // segundos y se marca como vista para siempre, así que sin esto revisarla
    // es imposible en la práctica.
    const forzada = new URLSearchParams(window.location.search).get("intro") === "1";

    let vista = false;
    try {
      vista = localStorage.getItem(CLAVE_VISTA) === "1";
    } catch {
      vista = false;
    }
    const sinMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!forzada && (vista || sinMotion)) return;

    setPaso("linea1");
    relojes.current.push(window.setTimeout(() => setPaso("linea2"), MS_LINEA_1));
    relojes.current.push(window.setTimeout(cortar, MS_LINEA_1 + MS_LINEA_2));
    return () => {
      for (const r of relojes.current) window.clearTimeout(r);
    };
  }, [cortar]);

  if (paso === "fuera") return null;

  const cortando = paso === "cortando";
  const panel = {
    position: "absolute" as const,
    left: 0,
    right: 0,
    height: "50%",
    background: "var(--c-ink)",
    transition: `transform var(--dur-view) var(--ease-view)`,
  };

  return (
    // El toque en CUALQUIER lado salta. Una obertura que hay que buscar cómo
    // cerrar deja de ser obertura y se vuelve puerta.
    <div
      className="fixed inset-0 z-[60] cursor-pointer overflow-hidden"
      onClick={cortar}
      role="presentation"
    >
      {/* Las dos mitades. Al partirse, revelan la app que ya está debajo. */}
      <div
        style={{
          ...panel,
          top: 0,
          // El filo del corte solo aparece al cortar: durante las líneas de
          // texto cruzaría el título y se leería como un error de render.
          borderBottom: cortando ? "2px solid var(--c-accent)" : "none",
          transform: cortando ? "translateY(-100%)" : "none",
        }}
      />
      <div
        style={{
          ...panel,
          bottom: 0,
          transform: cortando ? "translateY(100%)" : "none",
        }}
      />

      {/* El texto, encima de las dos mitades. Se desvanece justo antes del corte. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
        style={{
          color: "var(--c-on-ink)",
          opacity: cortando ? 0 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <div className="anim-msg mb-5 flex items-center gap-[10px]">
          <span
            aria-hidden
            className="h-[14px] w-[14px]"
            style={{ background: "var(--c-accent)" }}
          />
          <span className="font-display text-[22px] leading-none tracking-[-0.02em]">
            BSP
          </span>
        </div>

        <p className="anim-msg titulo-seccion max-w-[22ch]">
          ¿Acabaste una serie y no sabes qué sigue?
        </p>

        {(paso === "linea2" || cortando) && (
          <p
            className="anim-msg mt-4 max-w-[30ch] text-[16px] leading-normal"
            style={{ color: "var(--c-accent-400)" }}
          >
            Cuéntamelo. Te digo cuál va — y dónde verla.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={cortar}
        className="kicker absolute top-4 right-4 px-[8px] py-[5px]"
        style={{
          color: "var(--c-on-ink)",
          border: "1px solid var(--c-on-ink-border)",
        }}
      >
        Saltar
      </button>
    </div>
  );
}
