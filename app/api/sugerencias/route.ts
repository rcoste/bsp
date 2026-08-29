import { sugerencias, tarjetaDeSugerencia } from "@/lib/anime/buscar";
import { registrarError } from "@/lib/db";

/**
 * El autocompletado del campo del chat.
 *
 * NO cobra mensaje ni pasa por los topes: no llama a la AI, solo lee el
 * catálogo que ya tenemos. Ese es justo el punto del módulo — quien ya sabe
 * qué quiere no debería gastar uno de sus 20 mensajes del día en pedirlo.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);

  // ?id=123 → la tarjeta completa de la sugerencia que se tocó.
  const id = url.searchParams.get("id");
  if (id !== null) {
    const numero = Number(id);
    if (!Number.isInteger(numero) || numero <= 0) {
      return Response.json({ error: "id inválido" }, { status: 400 });
    }
    try {
      const anime = await tarjetaDeSugerencia(numero);
      if (!anime) return Response.json({ error: "no existe" }, { status: 404 });
      return Response.json({ anime });
    } catch (error) {
      await registrarError("/api/sugerencias:id", error, { id: numero });
      return Response.json({ error: "servidor" }, { status: 500 });
    }
  }

  // ?q=texto → la lista de sugerencias.
  const q = url.searchParams.get("q") ?? "";
  // Nadie teclea 200 caracteres buscando un título; sin tope, cualquiera manda
  // una consulta enorme al índice de trigramas en cada tecla.
  if (q.length > 100) return Response.json({ sugerencias: [] });

  try {
    return Response.json({ sugerencias: await sugerencias(q) });
  } catch (error) {
    await registrarError("/api/sugerencias", error, { q });
    // Que falle la búsqueda no debe romper el campo de escribir: se devuelve
    // vacío y el chat sigue funcionando igual.
    return Response.json({ sugerencias: [] });
  }
}
