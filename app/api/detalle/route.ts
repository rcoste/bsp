import { detalleDe } from "@/lib/anime/detalle";
import { registrarError } from "@/lib/db";
import { registrarEvento } from "@/lib/eventos-uso";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * La hoja de detalle de un anime: sinopsis sin spoilers (en español, escrita
 * la primera vez que alguien la pide), dónde verlo y la misma obra.
 *
 * No cobra mensaje ni pasa por el tope de 20: no es conversación. Sí tiene su
 * propio candado (lib/anime/detalle.ts) contra abrir miles de hojas nuevas.
 */

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id inválido" }, { status: 400 });
  }
  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);
  try {
    const detalle = await detalleDe(id, { dispositivoId });
    if (!detalle) return Response.json({ error: "no existe" }, { status: 404 });
    // Abrir una hoja es una señal de interés que vale para el reporte de
    // puertas. Sin cookie no hay a quién anotárselo y no se crea una.
    if (!cookie) void registrarEvento(dispositivoId, "detalle", { animeId: id });
    const respuesta = Response.json(detalle);
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/detalle", error, { id });
    return Response.json({ error: "servidor" }, { status: 500 });
  }
}
