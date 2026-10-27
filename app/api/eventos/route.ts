import { esNombreEvento, registrarEvento } from "@/lib/eventos-uso";
import { dispositivoDePeticion } from "@/lib/sesion";

/**
 * La bitácora de uso, para lo que solo ve el navegador (un chip, un deshacer,
 * volver a la parrilla). Lo que el servidor ya ve —mensajes, marcas,
 * guardados— se anota en su propia ruta, que es más fiable que confiar en
 * que el navegador avise.
 *
 * Acepta varios eventos por petición y contesta ok pase lo que pase: es
 * telemetría y no puede estorbar.
 */

const MAX_POR_PETICION = 20;

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as { eventos?: unknown } | null;
  const lista = Array.isArray(cuerpo?.eventos) ? cuerpo.eventos.slice(0, MAX_POR_PETICION) : [];

  // Sin cookie no hay persona a quién anotarle nada; no se crea una por esto.
  const { id: dispositivoId, cookie } = dispositivoDePeticion(request.headers);
  if (cookie) return Response.json({ ok: true, anotados: 0 });

  let anotados = 0;
  for (const e of lista) {
    const { nombre, datos } = (e ?? {}) as { nombre?: unknown; datos?: unknown };
    if (!esNombreEvento(nombre)) continue;
    await registrarEvento(dispositivoId, nombre, datos);
    anotados++;
  }
  return Response.json({ ok: true, anotados });
}
