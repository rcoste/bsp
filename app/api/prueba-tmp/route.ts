// RUTA TEMPORAL de diagnóstico. Se borra al terminar.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "naruto";
  const pasos: unknown[] = [];

  // Paso 1: ¿el fetch crudo funciona desde dentro de Next?
  const t0 = Date.now();
  try {
    const r = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=3&sfw=true`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    const cuerpo = r.ok ? await r.json() : await r.text();
    pasos.push({
      paso: "fetch crudo a Jikan",
      status: r.status,
      ms: Date.now() - t0,
      resultados: r.ok ? (cuerpo as { data?: unknown[] }).data?.length ?? 0 : undefined,
      primerTitulo: r.ok
        ? ((cuerpo as { data?: { title?: string }[] }).data?.[0]?.title ?? null)
        : undefined,
      error: r.ok ? undefined : String(cuerpo).slice(0, 200),
    });
  } catch (e) {
    pasos.push({
      paso: "fetch crudo a Jikan",
      ms: Date.now() - t0,
      excepcion: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  }

  return Response.json({ consulta: q, pasos });
}
