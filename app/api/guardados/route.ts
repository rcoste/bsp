import { registrarError } from "@/lib/db";
import { guardados } from "@/lib/lista";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * El chip "Mis guardados": llena la vitrina con la lista de la persona.
 *
 * NO llama a la AI ni gasta mensaje — lee la biblioteca y ya. La lista vive
 * en la conversación, no en una pantalla aparte: cambiar de pantalla rompe la
 * conversación, que es la ventaja contra ChatGPT.
 * Ver docs/designs/alcance-v1-para-diseno.md, módulo 5.
 */

export async function GET(request: Request) {
  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);
  try {
    const lista = await guardados(dispositivoId);
    const respuesta = Response.json({ guardados: lista });
    if (cookie) respuesta.headers.set("Set-Cookie", cookie);
    return respuesta;
  } catch (error) {
    await registrarError("/api/guardados", error);
    return Response.json({ error: "servidor" }, { status: 500 });
  }
}
