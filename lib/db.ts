import "server-only";
import postgres from "postgres";

/**
 * Conexión a la base de datos. SOLO desde el servidor.
 *
 * El import de "server-only" hace que el build FALLE si alguien intenta usar
 * este archivo desde un componente de navegador. Es un candado real, no un
 * comentario: la cadena de conexión abre toda la base.
 *
 * Por qué no hay un cliente de Supabase para el navegador: las reglas de
 * seguridad por fila de Supabase distinguen usuarios por su sesión de login,
 * y aquí la mayoría de los perfiles son anónimos (sin cuenta). Una regla que
 * los dejara leer tendría que dejarlos leer todos. Así que la base está
 * cerrada y todo pasa por el servidor.
 * Ver docs/plans/arquitectura.md §5.
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Falta DATABASE_URL en .env.local — copia .env.example y llénalo.",
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
}

// En desarrollo Next recarga los módulos en cada cambio; sin esto se abriría
// una conexión nueva cada vez hasta agotar el límite de Supabase.
export const sql =
  global.__sql ??
  postgres(process.env.DATABASE_URL, {
    ssl: "require",
    max: 5,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") global.__sql = sql;

/** Registra un error para poder diagnosticar producción sin adivinar. */
export async function registrarError(
  ruta: string,
  error: unknown,
  contexto?: Record<string, unknown>,
) {
  const mensaje = error instanceof Error ? error.message : String(error);
  try {
    await sql`
      insert into errores (ruta, mensaje, contexto)
      values (${ruta}, ${mensaje}, ${sql.json(JSON.parse(JSON.stringify(contexto ?? {})))})
    `;
  } catch {
    // Si ni siquiera se puede registrar el error, no hay nada más que hacer:
    // fallar aquí escondería el error original.
    console.error(`[${ruta}]`, mensaje);
  }
}
