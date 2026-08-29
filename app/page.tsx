import { cookies } from "next/headers";
import { paraArranque } from "@/lib/anime/destacados";
import { leerLlegada } from "@/lib/llegada";
import { marcasDe, type Entrada } from "@/lib/lista";
import { NOMBRE_COOKIE, leerDispositivo } from "@/lib/sesion";
import { Pantalla } from "@/components/Pantalla";

/**
 * La página de aterrizaje. Con tráfico pagado, los primeros dos segundos
 * deciden si el clic valió o se tiró.
 *
 * Todo el que llega ve la vitrina LLENA desde el primer frame — nunca una
 * pantalla que pide antes de dar. Si además trajo una búsqueda específica
 * ("parecido a Death Note"), el navegador dispara la conversación al montar
 * y esas tarjetas reemplazan a las de arranque.
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

  const animes = await paraArranque(24);

  // Lo ya marcado en visitas anteriores. Que una tarjeta se vea marcada al
  // volver es lo que hace VISIBLE la memoria del gusto; sin eso la memoria
  // existe y nadie lo nota — y es la razón de ser del producto.
  //
  // Un componente de servidor no puede PONER la cookie, así que en la primera
  // visita no hay dispositivo todavía y la lista sale vacía. Se crea sola en
  // la primera llamada a /api/llegada.
  const galleta = (await cookies()).get(NOMBRE_COOKIE)?.value;
  const dispositivoId = leerDispositivo(galleta);
  let marcas: Record<number, Entrada> = {};
  if (dispositivoId) {
    // Que no se pueda leer la lista degrada la pantalla; no la tumba.
    marcas = await marcasDe(dispositivoId).catch(() => ({}));
  }

  return (
    <Pantalla
      animes={animes}
      marcasIniciales={marcas}
      llegada={{
        consulta: llegada.consulta,
        // Solo las búsquedas específicas gastan una conversación. Las
        // genéricas ("qué anime ver") ya están contestadas por la parrilla
        // que se acaba de renderizar, gratis.
        preguntar: llegada.vale,
        origen: unico(params.utm_source) ?? null,
        campana: unico(params.utm_campaign) ?? null,
      }}
    />
  );
}
