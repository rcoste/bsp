import { paraArranque } from "@/lib/anime/destacados";
import { Pantalla } from "@/components/Pantalla";

export default async function Home() {
  const animes = await paraArranque(12);
  return <Pantalla animes={animes} />;
}
