// Exporta el catálogo de anime de la base de Pablo (solo lectura) hacia
// nuestro catalogo_cache + titulos_indice.
//
// Qué entra: los ~25 mil animes reales — series, películas, OVAs, ONAs y
// especiales. Qué NO entra: videos musicales, comerciales y tráilers (basura
// para un recomendador), mangas, y cualquier dato de usuarios (reseñas,
// conversaciones, memorias — eso es de SU producto, no se toca).
//
// Los datos de origen vienen de JikanAPI (la misma fuente pública que usamos
// nosotros), así que cada anime trae su mal_id y el resultado es
// indistinguible de lo que guardaría lib/anime/catalogo.ts.
//
// Uso: node scripts/exportar-catalogo-pablo.mjs
// Necesita en .env.local: DATABASE_URL (nuestra base) y PABLO_DATABASE_URL.
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!env.PABLO_DATABASE_URL) {
  console.error('Falta PABLO_DATABASE_URL en .env.local');
  process.exit(1);
}

const origen = postgres(env.PABLO_DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 20 });
const destino = postgres(env.DATABASE_URL, { ssl: 'require', max: 1, connect_timeout: 20 });

// Copia de normalizar() de lib/anime/titulos.ts — el script es .mjs y no
// puede importar TypeScript con node pelón. Si aquella cambia, cambia esta.
function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// La base de Pablo guarda el estado en su propio vocabulario; Jikan (y por lo
// tanto nuestro caché) usa estas frases. Se mapea para que el registro sea
// idéntico al que escribiría guardarEnCache().
const ESTADOS = {
  completed: 'Finished Airing',
  airing: 'Currently Airing',
  upcoming: 'Not yet aired',
};

const DIA = 24 * 60 * 60 * 1000;
const LOTE = 500;

let ultimoId = 0;
let exportados = 0;
let titulosEscritos = 0;
let sinMalId = 0;

for (;;) {
  const filas = await origen`
    select a.id, a.year, a.season, a.status, a.airing, a.episodes_count,
           a.score, a.members_count, a.media_type, a.synopsis,
      (select er.identifier_value from external_resources er
        where er.resource_type = 'Anime' and er.resource_id = a.id
          and er.identifier = 'mal_id' limit 1) as mal_id,
      (select t.title from resource_titles t
        where t.resource_type = 'Anime' and t.resource_id = a.id
          and t.title_type = 'default' limit 1) as titulo,
      (select t.title from resource_titles t
        where t.resource_type = 'Anime' and t.resource_id = a.id
          and t.locale = 'en' and t.title_type = 'translation' limit 1) as titulo_en,
      (select t.title from resource_titles t
        where t.resource_type = 'Anime' and t.resource_id = a.id
          and t.locale = 'es' limit 1) as titulo_es,
      (select coalesce(array_agg(t.title), '{}') from resource_titles t
        where t.resource_type = 'Anime' and t.resource_id = a.id
          and t.title_type = 'synonym') as sinonimos,
      coalesce(
        (select i.source_url from images i where i.id = a.default_image_id),
        (select i.source_url from images i
          where i.imageable_type = 'Anime' and i.imageable_id = a.id limit 1)
      ) as portada,
      (select coalesce(array_agg(g.name), '{}') from resource_genres rg
        join genres g on g.id = rg.genre_id
        where rg.resource_type = 'Anime' and rg.resource_id = a.id) as generos
    from animes a
    where a.id > ${ultimoId}
      and a.media_type is not null
      and a.media_type not in ('music', 'cm', 'pv')
    order by a.id
    limit ${LOTE}`;

  if (!filas.length) break;
  ultimoId = Number(filas[filas.length - 1].id);

  const cacheRows = [];
  const tituloRows = [];
  const malIdsDelLote = new Set(); // dos filas con el mismo mal_id en un lote romperían el insert

  for (const f of filas) {
    const malId = Number(f.mal_id);
    if (!malId) { sinMalId++; continue; }
    if (malIdsDelLote.has(malId)) continue;
    malIdsDelLote.add(malId);

    const sinonimos = [...(f.sinonimos ?? [])];
    // El título en español (cuando existe: "Ataque a los Titanes") entra como
    // sinónimo — así la verificación y el autocompletado lo encuentran sin
    // cambiar el tipo Anime.
    if (f.titulo_es) sinonimos.push(f.titulo_es);

    const datos = {
      id: malId,
      titulo: f.titulo ?? `Anime ${malId}`,
      tituloEn: f.titulo_en ?? null,
      anio: f.year ?? null,
      estado: ESTADOS[f.status] ?? null,
      portada: f.portada ?? null,
      sinonimos,
      sinopsis: f.synopsis ?? null,
      // Extras que la tarjeta v1 va a necesitar (episodios, tipo, score);
      // soloSeisCampos() los recorta antes de mandarlos al navegador.
      generos: f.generos ?? [],
      episodios: f.episodes_count ?? null,
      tipo: f.media_type ?? null,
      score: f.score ?? null,
      miembros: f.members_count ?? 0,
    };

    // Lo terminado no cambia: expira en un año. Lo que está al aire o por
    // salir cambia seguido (episodios, estado): dos semanas y se refresca
    // solo vía Jikan por id.
    const dias = f.status === 'completed' ? 365 : 14;
    cacheRows.push({
      anime_id: malId,
      // sql.json evita el doble encodeo: un string aquí se guardaría como
      // texto envuelto en JSON y datos.titulo saldría undefined.
      datos: destino.json(datos),
      expira_en: new Date(Date.now() + dias * DIA),
    });

    const vistos = new Set();
    for (const t of [f.titulo, f.titulo_en, f.titulo_es, ...(f.sinonimos ?? [])]) {
      if (!t) continue;
      const norm = normalizar(t);
      if (!norm || vistos.has(norm)) continue;
      vistos.add(norm);
      tituloRows.push({
        anime_id: malId,
        titulo: t,
        titulo_normalizado: norm,
        miembros: f.members_count ?? 0,
      });
    }
  }

  if (cacheRows.length) {
    await destino`
      insert into catalogo_cache ${destino(cacheRows, 'anime_id', 'datos', 'expira_en')}
      on conflict (anime_id) do update
        set datos = excluded.datos, expira_en = excluded.expira_en`;
    exportados += cacheRows.length;
  }
  if (tituloRows.length) {
    await destino`
      insert into titulos_indice ${destino(tituloRows, 'anime_id', 'titulo', 'titulo_normalizado', 'miembros')}
      on conflict (anime_id, titulo_normalizado) do update
        set miembros = excluded.miembros`;
    titulosEscritos += tituloRows.length;
  }

  process.stdout.write(`\r  ${exportados} animes, ${titulosEscritos} títulos...`);
}

console.log(`\n\nEXPORTADOS=${exportados}`);
console.log(`TITULOS=${titulosEscritos}`);
if (sinMalId) console.log(`sin mal_id (saltados): ${sinMalId}`);

await origen.end();
await destino.end();
