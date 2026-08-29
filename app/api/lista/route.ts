import { registrarError } from "@/lib/db";
import { esMarca, marcar } from "@/lib/lista";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * Los tres botones de la tarjeta escriben aquí.
 *
 * Es lo que llena la lista, y la lista es lo que la AI lee como memoria del
 * gusto. Hasta ahora ese perfil salía siempre vacío porque nada lo alimentaba.
 */

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as {
    animeId?: unknown;
    marca?: unknown;
  } | null;

  const animeId = Number(cuerpo?.animeId);
  if (!Number.isInteger(animeId) || animeId <= 0 || !esMarca(cuerpo?.marca)) {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }

  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);

  try {
    const quedo = await marcar(dispositivoId, animeId, cuerpo.marca);
    const respuesta = Response.json({ marca: quedo });
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/lista", error, { animeId, marca: cuerpo.marca });
    return Response.json({ error: "servidor" }, { status: 500 });
  }
}
