import { randomUUID } from "node:crypto";
import { conversar } from "../lib/chat/bucle.ts";
import { costoDe } from "../lib/chat/gasto.ts";
import { marcar } from "../lib/lista.ts";
import { sql } from "../lib/db.ts";
import type { Evento } from "../lib/chat/eventos.ts";

/**
 * La medición que decide si un cambio de modelo o de esfuerzo se queda:
 * diez conversaciones reales contra la API, con el tiempo hasta la PRIMERA
 * PORTADA (no hasta la primera palabra) y el costo medido de cada una.
 *
 * Uso: node --experimental-strip-types --conditions=react-server --env-file=.env.local scripts/medir-chat.ts
 *      BSP_ESFUERZO=low node ... scripts/medir-chat.ts   (para comparar niveles)
 *
 * Gasta dinero de verdad (~$0.10 por corrida). No registra en gasto_ia: es
 * una prueba, no tráfico.
 */

const UMBRAL_MS = 8000;
const MENSAJES = [
  "acabé Frieren y me quedé vacío, ¿qué sigue?",
  "algo parecido a Death Note",
  "sorpréndeme",
  "quiero algo corto para un finde",
  "romance pero que no sea cursi",
  "terminé Vinland Saga, ¿qué me recomiendas?",
  "una película para hoy en la noche",
  "algo oscuro tipo Monster",
  "una comedia ligera para desconectar",
  "recomiéndame algo de deportes",
];

const dispositivoId = `medicion-${randomUUID()}`;
// Un perfil con algo marcado, para que el candado de "ya lo viste" y el
// perfil entren en juego como en una conversación real.
await marcar(dispositivoId, 52991, "visto"); // Frieren
await marcar(dispositivoId, 1535, "visto"); // Death Note

type Fila = { msPortada: number | null; msTotal: number; tarjetas: number; costo: number; error: string | null; vueltas: number };
const filas: Fila[] = [];

for (const mensaje of MENSAJES) {
  const eventos: Evento[] = [];
  let error: string | null = null;
  const inicio = Date.now();
  let m: Awaited<ReturnType<typeof conversar>> | null = null;
  try {
    m = await conversar({
      historial: [],
      mensaje,
      perfil: "Ya vio: Frieren: Beyond Journey's End, Death Note.",
      dispositivoId,
      emitir: (e) => {
        eventos.push(e);
        if (e.tipo === "error") error = e.mensaje;
      },
      señal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const fila: Fila = {
    msPortada: m?.msPrimeraTarjeta ?? null,
    msTotal: m?.msTotal ?? Date.now() - inicio,
    tarjetas: eventos.filter((e) => e.tipo === "tarjeta").length,
    costo: m ? costoDe(m.consumo, m.modelo) : 0,
    error,
    vueltas: m?.consumo.vueltas ?? 0,
  };
  filas.push(fila);
  console.log(
    `${fila.error ? "✗" : "✓"} ${mensaje.padEnd(48)} portada ${fila.msPortada === null ? "   —" : String(fila.msPortada).padStart(5)} ms · ` +
      `total ${String(fila.msTotal).padStart(5)} ms · ${fila.tarjetas} tarjetas · ${fila.vueltas} vueltas · $${fila.costo.toFixed(4)}` +
      (fila.error ? `\n   ERROR: ${fila.error.slice(0, 300)}` : ""),
  );
}

await sql`delete from perfiles where dispositivo_id = ${dispositivoId}`;
await sql.end();

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const conPortada = filas.filter((f) => f.msPortada !== null).map((f) => f.msPortada as number);
const modelo = process.env.BSP_MODELO_ETIQUETA ?? "";
console.log(`\n${modelo} esfuerzo=${process.env.BSP_ESFUERZO ?? "medium"}`);
console.log(`  con portada: ${conPortada.length}/${filas.length} · errores: ${filas.filter((f) => f.error).length}`);
console.log(`  primera portada: mediana ${mediana(conPortada).toFixed(0)} ms · mín ${Math.min(...conPortada)} · máx ${Math.max(...conPortada)} (umbral ${UMBRAL_MS})`);
console.log(`  turno completo: mediana ${mediana(filas.map((f) => f.msTotal)).toFixed(0)} ms`);
console.log(`  tarjetas por turno: ${(filas.reduce((a, f) => a + f.tarjetas, 0) / filas.length).toFixed(1)}`);
console.log(`  costo por conversación: $${(filas.reduce((a, f) => a + f.costo, 0) / filas.length).toFixed(4)}`);
console.log(`  VEREDICTO: ${conPortada.length === filas.length && mediana(conPortada) <= UMBRAL_MS && !filas.some((f) => f.error) ? "PASA" : "NO PASA"}`);
