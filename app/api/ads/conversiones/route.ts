import { timingSafeEqual } from "node:crypto";
import { registrarError } from "@/lib/db";
import { conversionesRecientes, detectarConversiones } from "@/lib/medicion";

/**
 * Lo pide cada mañana el script de Google Ads del laboratorio de campañas
 * (repo campanas-binge-senpai, docs/google-ads-script.js), que vive en la
 * cuenta concentradora Kublau Iniciativas: detecta las conversiones nuevas y
 * devuelve las de los últimos 30 días para que el script las suba a la cuenta
 * de BSP. Reenviar lo mismo no duplica: Google descarta el reenvío idéntico.
 *
 * Solo con la contraseña compartida en la cabecera: la respuesta trae los
 * boletos de clic de la gente.
 */

export const maxDuration = 30;

function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const esperado = process.env.ADS_SECRETO;
  if (!esperado) {
    return Response.json({ error: "Falta ADS_SECRETO en el servidor" }, { status: 503 });
  }
  if (!secretoValido(request.headers.get("x-laboratorio-secreto"), esperado)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const nuevas = await detectarConversiones();
    const conversiones = await conversionesRecientes();
    return Response.json({ nuevas, conversiones });
  } catch (error) {
    await registrarError("/api/ads/conversiones", error);
    return Response.json({ error: "No se pudieron leer las conversiones" }, { status: 500 });
  }
}
