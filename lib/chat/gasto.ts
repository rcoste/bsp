import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "../db.ts";

/**
 * Cuánto cuesta cada conversación, medido y no estimado.
 *
 * Los precios se guardan aquí, en un solo lugar, con su fecha de corte. Si
 * quedaran repartidos en scripts, el día que cambie la tarifa los reportes
 * seguirían dando el número viejo sin avisar.
 */

/** Dólares por millón de tokens. Fuente: tabla de precios de Anthropic. */
type Tarifa = {
  entrada: number;
  salida: number;
  /** Escribir en el caché cuesta ~1.25x la entrada; leer, ~0.1x. */
  cacheEscrito: number;
  cacheLeido: number;
};

/**
 * ⚠️ Sonnet 5 está en tarifa INTRODUCTORIA ($2/$10) hasta el 2026-08-31.
 * Desde el 2026-09-01 sube a $3/$15 — un 50% más por conversación. La fecha
 * se comprueba en cada cálculo para que el reporte no siga cobrando de menos
 * después del corte.
 */
const FIN_INTRO = Date.parse("2026-09-01T00:00:00Z");

function tarifaDe(modelo: string, cuando: number): Tarifa {
  if (modelo.startsWith("claude-sonnet-5")) {
    return cuando < FIN_INTRO
      ? { entrada: 2, salida: 10, cacheEscrito: 2.5, cacheLeido: 0.2 }
      : { entrada: 3, salida: 15, cacheEscrito: 3.75, cacheLeido: 0.3 };
  }
  if (modelo.startsWith("claude-opus-5")) {
    return { entrada: 5, salida: 25, cacheEscrito: 6.25, cacheLeido: 0.5 };
  }
  if (modelo.startsWith("claude-haiku-4-5")) {
    return { entrada: 1, salida: 5, cacheEscrito: 1.25, cacheLeido: 0.1 };
  }
  // Modelo desconocido: se cobra como el más caro que usamos, para que un
  // cambio de modelo nunca haga que el gasto parezca MENOR de lo que es.
  return { entrada: 5, salida: 25, cacheEscrito: 6.25, cacheLeido: 0.5 };
}

/** Lo que se acumula a lo largo de las vueltas de un turno. */
export type Consumo = {
  vueltas: number;
  entrada: number;
  salida: number;
  cacheEscrito: number;
  cacheLeido: number;
};

export function consumoVacio(): Consumo {
  return { vueltas: 0, entrada: 0, salida: 0, cacheEscrito: 0, cacheLeido: 0 };
}

/**
 * Suma lo que costó una vuelta. Se llama una vez por respuesta del modelo.
 *
 * Tolera que no venga el bloque de uso. Esto NO es paranoia de más: la
 * telemetría no puede tumbar una conversación. Perder el dato de gasto de un
 * turno es molesto; dejar a alguien sin su respuesta porque no pudimos contar
 * los tokens sería absurdo.
 */
export function sumarVuelta(c: Consumo, uso: Anthropic.Usage | undefined): void {
  c.vueltas++;
  if (!uso) return;
  c.entrada += uso.input_tokens ?? 0;
  c.salida += uso.output_tokens ?? 0;
  c.cacheEscrito += uso.cache_creation_input_tokens ?? 0;
  c.cacheLeido += uso.cache_read_input_tokens ?? 0;
}

export function costoDe(c: Consumo, modelo: string, cuando = Date.now()): number {
  const t = tarifaDe(modelo, cuando);
  return (
    (c.entrada * t.entrada +
      c.salida * t.salida +
      c.cacheEscrito * t.cacheEscrito +
      c.cacheLeido * t.cacheLeido) /
    1e6
  );
}

/**
 * Guarda lo que costó un turno. Nunca tumba la conversación: si el registro
 * falla, la persona ya recibió su respuesta y perder una fila de telemetría
 * es mucho menos grave que romperle la app.
 */
export async function registrarGasto(datos: {
  perfilId: string | null;
  modelo: string;
  consumo: Consumo;
  tarjetas: number;
  msPrimeraTarjeta: number | null;
  msTotal: number;
}): Promise<void> {
  const { perfilId, modelo, consumo, tarjetas, msPrimeraTarjeta, msTotal } = datos;
  try {
    await sql`
      insert into gasto_ia (
        perfil_id, modelo, vueltas, tokens_entrada, tokens_salida,
        cache_escrito, cache_leido, costo_usd, tarjetas,
        ms_primera_tarjeta, ms_total
      ) values (
        ${perfilId}, ${modelo}, ${consumo.vueltas}, ${consumo.entrada},
        ${consumo.salida}, ${consumo.cacheEscrito}, ${consumo.cacheLeido},
        ${costoDe(consumo, modelo)}, ${tarjetas},
        ${msPrimeraTarjeta}, ${msTotal}
      )
    `;
  } catch {
    // A propósito en silencio. Ver el comentario de arriba.
  }
}
