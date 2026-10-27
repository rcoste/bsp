import { registrarError, sql } from "@/lib/db";
import { leerClic, leerLlegada, leerOrigen, leerPuerta } from "@/lib/llegada";
import { registrarClic } from "@/lib/medicion";
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
    gclid?: unknown;
    gbraid?: unknown;
    wbraid?: unknown;
    v?: unknown;
  } | null;

  const { consulta } = leerLlegada(
    typeof cuerpo?.q === "string" ? cuerpo.q : null,
  );
  const origen = leerOrigen(
    typeof cuerpo?.utm_source === "string" ? cuerpo.utm_source : null,
    typeof cuerpo?.utm_campaign === "string" ? cuerpo.utm_campaign : null,
  );
  const clic = leerClic(cuerpo ?? {});
  const puerta = leerPuerta(typeof cuerpo?.v === "string" ? cuerpo.v : null);

  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);

  try {
    // El origen, la puerta y el PRIMER clic se escriben solo la primera vez:
    // si alguien vuelve por otra campaña, la que pagó por traerlo sigue
    // siendo la primera en los reportes. Ese primer clic decide si al perfil
    // lo trajo un anuncio (lib/medicion.ts).
    //
    // Lo que se le SUBE a Google es otra cosa: el último clic anterior a cada
    // conversión, del historial clics_ads (registrarClic, abajo). Binge Senpai
    // subía el primero y Google le rechazó conversiones por clic caducado.
    //
    // Abrir la app NO cuenta como día de uso: en Binge Senpai tampoco, y el
    // regreso de las dos apuestas tiene que medirse igual (ver lib/perfil.ts,
    // anotarActividad).
    const [perfil] = await sql<{ id: string }[]>`
      insert into perfiles (dispositivo_id, origen, consulta_llegada, puerta, gclid, gbraid, wbraid, clic_en)
      values (
        ${dispositivoId}, ${origen}, ${consulta || null}, ${puerta},
        ${clic?.gclid ?? null}, ${clic?.gbraid ?? null}, ${clic?.wbraid ?? null},
        case when ${clic !== null}::boolean then now() end
      )
      on conflict (dispositivo_id) do update set
        origen = coalesce(perfiles.origen, excluded.origen),
        consulta_llegada = coalesce(perfiles.consulta_llegada, excluded.consulta_llegada),
        puerta = coalesce(perfiles.puerta, excluded.puerta),
        gclid = case when perfiles.clic_en is null then excluded.gclid else perfiles.gclid end,
        gbraid = case when perfiles.clic_en is null then excluded.gbraid else perfiles.gbraid end,
        wbraid = case when perfiles.clic_en is null then excluded.wbraid else perfiles.wbraid end,
        clic_en = coalesce(perfiles.clic_en, excluded.clic_en)
      returning id
    `;
    if (perfil) await registrarClic(perfil.id, clic);
    // El id del perfil (no el del dispositivo) es lo que liga la grabación de
    // Clarity con la base; ver lib/clarity.ts.
    const respuesta = Response.json({ ok: true, perfil: perfil?.id ?? null });
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/llegada", error, { origen });
    // Que falle la telemetría no puede estorbarle a nadie que viene a usar
    // la app: se contesta ok y ya.
    return Response.json({ ok: false });
  }
}
