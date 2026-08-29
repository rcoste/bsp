import { registrarError, sql } from "@/lib/db";
import { leerLlegada, leerOrigen } from "@/lib/llegada";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * Registra de dónde llegó alguien. Se llama UNA vez, al abrir la app.
 *
 * Existe para poder contestar la única pregunta que importa con tráfico
 * pagado: no "cuánto cuesta un clic" sino "cuánto cuesta un usuario que
 * construyó biblioteca". Sin esto solo se ven las personas que hicieron algo,
 * y los rebotes —que también se pagan— quedan invisibles.
 *
 * Por eso crea el perfil aunque la visita no haga nada más.
 */

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as {
    q?: unknown;
    utm_source?: unknown;
    utm_campaign?: unknown;
  } | null;

  const { consulta } = leerLlegada(
    typeof cuerpo?.q === "string" ? cuerpo.q : null,
  );
  const origen = leerOrigen(
    typeof cuerpo?.utm_source === "string" ? cuerpo.utm_source : null,
    typeof cuerpo?.utm_campaign === "string" ? cuerpo.utm_campaign : null,
  );

  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);

  try {
    // El origen se escribe solo la PRIMERA vez: si alguien vuelve por otra
    // campaña, la que pagó por traerlo sigue siendo la primera. Sobrescribir
    // le regalaría el mérito a la última.
    await sql`
      insert into perfiles (dispositivo_id, origen, consulta_llegada)
      values (${dispositivoId}, ${origen}, ${consulta || null})
      on conflict (dispositivo_id) do update set
        origen = coalesce(perfiles.origen, excluded.origen),
        consulta_llegada = coalesce(perfiles.consulta_llegada, excluded.consulta_llegada)
    `;
    const respuesta = Response.json({ ok: true });
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/llegada", error, { origen });
    // Que falle la telemetría no puede estorbarle a nadie que viene a usar
    // la app: se contesta ok y ya.
    return Response.json({ ok: false });
  }
}
