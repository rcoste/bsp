// Precarga animes reales en el caché usando el endpoint por id de Jikan,
// que sigue funcionando aunque el buscador esté caído.
// Uso: node scripts/semilla-catalogo.mjs
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local','utf8').split('\n')
    .filter(l=>l.includes('=')&&!l.startsWith('#'))
    .map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql = postgres(env.DATABASE_URL,{ssl:'require'});

// Ids de MyAnimeList de animes muy conocidos. Cubren los chips de arranque
// y dan material suficiente para probar recomendaciones de verdad.
const IDS = [
  1,     // Cowboy Bebop
  20,    // Naruto
  21,    // One Piece
  19,    // Monster
  199,   // Sen to Chihiro (El viaje de Chihiro)
  457,   // Mushishi
  1535,  // Death Note
  1575,  // Code Geass
  5114,  // Fullmetal Alchemist: Brotherhood
  9253,  // Steins;Gate
  11061, // Hunter x Hunter
  16498, // Shingeki no Kyojin
  28223, // Death Parade
  30276, // One Punch Man
  31964, // Boku no Hero Academia
  32281, // Kimi no Na wa
  28851, // Koe no Katachi
  38000, // Kimetsu no Yaiba
  40748, // Jujutsu Kaisen
  33352, // Violet Evergarden
  30015, // ReLIFE
  32182, // Mob Psycho 100
  22319, // Tokyo Ghoul
  35849, // Darling in the FranXX
  37510, // Mob Psycho 100 II
  36456, // Boku no Hero 3
  34599, // Made in Abyss
  41467, // Bleach: Sennen Kessen
  48583, // Shingeki no Kyojin Final
  52991, // Sousou no Frieren
];

const DIAS_7 = 7*24*60*60*1000;
let ok = 0, fallos = [];

for (const id of IDS) {
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime/${id}`, {
      headers:{Accept:'application/json'}, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) { fallos.push(`${id}(${r.status})`); await new Promise(s=>setTimeout(s,1200)); continue; }
    const j = (await r.json()).data;
    const anime = {
      id: j.mal_id,
      titulo: j.title,
      tituloEn: j.title_english ?? null,
      anio: j.year ?? null,
      estado: j.status ?? null,
      portada: j.images?.jpg?.large_image_url ?? j.images?.jpg?.image_url ?? null,
      sinonimos: j.title_synonyms ?? [],
      sinopsis: j.synopsis ?? null,
      generos: (j.genres ?? []).map(g=>g.name),
    };
    await sql`
      insert into catalogo_cache (anime_id, datos, expira_en)
      values (${anime.id}, ${sql.json(anime)}, ${new Date(Date.now()+DIAS_7)})
      on conflict (anime_id) do update set datos = excluded.datos, expira_en = excluded.expira_en`;
    console.log(`  ✅ ${String(id).padStart(5)} ${anime.titulo}`);
    ok++;
  } catch (e) {
    fallos.push(`${id}(${e.name})`);
  }
  await new Promise(s=>setTimeout(s,1200)); // respeta el ritmo de Jikan
}

console.log(`\nCARGADOS=${ok} de ${IDS.length}`);
if (fallos.length) console.log(`fallaron: ${fallos.join(', ')}`);
await sql.end();
