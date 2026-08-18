import { buscarPorTitulo } from "@/lib/anime/catalogo";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const t0 = Date.now();
  const r = await buscarPorTitulo(q);
  return Response.json({ consulta: q, ms: Date.now() - t0, resultado: r });
}
