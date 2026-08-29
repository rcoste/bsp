import { registrarError } from "@/lib/db";
import { esCalificacion, esMarca, marcar } from "@/lib/lista";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * Los botones de la tarjeta (y el arranque de gusto) escriben aquí.
 *
 * Es lo que llena la biblioteca, y la biblioteca es lo que la AI lee como
 * memoria del gusto — y el factor de retención número uno según producción.
 */

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as {
    animeId?: unknown;
    marca?: unknown;
    episodio?: unknown;
    calificacion?: unknown;
  } | null;

  const animeId = Number(cuerpo?.animeId);
  if (!Number.isInteger(animeId) || animeId <= 0 || !esMarca(cuerpo?.marca)) {
    return Response.json({ error: "Petición inválida." }, { status: 400 });
  }
  const episodio = Number.isInteger(Number(cuerpo?.episodio))
    ? Number(cuerpo?.episodio)
    : null;
  const calificacion = esCalificacion(cuerpo?.calificacion)
    ? cuerpo.calificacion
    : null;

  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);

  try {
    const quedo = await marcar(dispositivoId, animeId, cuerpo.marca, {
      episodio,
      calificacion,
    });
    const respuesta = Response.json({ entrada: quedo });
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/lista", error, { animeId, marca: cuerpo.marca });
    return Response.json({ error: "servidor" }, { status: 500 });
  }
}
