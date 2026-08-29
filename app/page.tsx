import { cookies } from "next/headers";
import { decidirInicio } from "@/lib/inicio";
import { leerLlegada, leerOrigen } from "@/lib/llegada";
import { marcasDe, type Entrada } from "@/lib/lista";
import { NOMBRE_COOKIE, leerDispositivo } from "@/lib/sesion";
import { Pantalla } from "@/components/Pantalla";

/**
 * La página de aterrizaje. Con tráfico pagado, los primeros dos segundos
 * deciden si el clic valió o se tiró.
 *
 * Quién ve qué lo decide `lib/inicio.ts`; aquí solo se lee de dónde llegó.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const unico = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const llegada = leerLlegada(unico(params.q));
  const origen = leerOrigen(unico(params.utm_source), unico(params.utm_campaign));

  // Un componente de servidor no puede PONER la cookie, así que en la primera
  // visita no hay dispositivo todavía. Se crea en la primera llamada a
  // /api/llegada, que el navegador dispara al montar.
  const galleta = (await cookies()).get(NOMBRE_COOKIE)?.value;
  const dispositivoId = leerDispositivo(galleta);

  // Lo ya marcado en visitas anteriores. Que una tarjeta se vea marcada al
  // volver es lo que hace VISIBLE la memoria del gusto; sin eso la memoria
  // existe y nadie lo nota — y es la razón de ser del producto.
  let marcas: Record<number, Entrada> = {};
  if (dispositivoId) {
    // Que no se pueda leer la lista degrada la pantalla; no la tumba.
    marcas = await marcasDe(dispositivoId).catch(() => ({}));
  }

  const inicio = await decidirInicio({
    dispositivoId,
    // Llegó de un anuncio: no trae la confianza prestada de un amigo.
    fria: Boolean(origen) || Boolean(llegada.consulta),
    vaAPreguntar: llegada.vale,
  });

  return (
    <Pantalla
      inicio={inicio}
      marcasIniciales={marcas}
      llegada={{
        consulta: llegada.consulta,
        // Solo las búsquedas específicas gastan una conversación. Las
        // genéricas ("qué anime ver") ya están contestadas por lo que se
        // acaba de renderizar, gratis.
        preguntar: llegada.vale,
        origen: unico(params.utm_source) ?? null,
        campana: unico(params.utm_campaign) ?? null,
      }}
    />
  );
}
