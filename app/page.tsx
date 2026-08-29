import { cookies } from "next/headers";
import { paraArranque } from "@/lib/anime/destacados";
import { marcasDe, type Entrada } from "@/lib/lista";
import { NOMBRE_COOKIE, leerDispositivo } from "@/lib/sesion";
import { Pantalla } from "@/components/Pantalla";

export default async function Home() {
  // 24 y no 12: la parrilla ahora empuja hacia ~20 marcados (el factor de
  // retención), y con 12 portadas la meta sería inalcanzable sin escribir.
  const animes = await paraArranque(24);

  // Lo ya marcado en visitas anteriores. Que una tarjeta se vea marcada al
  // volver es lo que hace VISIBLE la memoria del gusto; sin eso la memoria
  // existe y nadie lo nota — y es la razón de ser del producto.
  //
  // Un componente de servidor no puede PONER la cookie, así que en la primera
  // visita no hay dispositivo todavía y la lista sale vacía. Se crea sola en
  // la primera llamada a /api/chat o /api/lista.
  const galleta = (await cookies()).get(NOMBRE_COOKIE)?.value;
  const dispositivoId = leerDispositivo(galleta);
  let marcas: Record<number, Entrada> = {};
  if (dispositivoId) {
    // Que no se pueda leer la lista degrada la pantalla; no la tumba.
    marcas = await marcasDe(dispositivoId).catch(() => ({}));
  }

  return <Pantalla animes={animes} marcasIniciales={marcas} />;
}
