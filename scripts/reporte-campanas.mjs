// Qué campaña trae gente que SE QUEDA, no cuál trae clics baratos.
// Uso: node scripts/reporte-campanas.mjs
//
// La pregunta que contesta: cuánto cuesta un usuario que construyó
// biblioteca. Es la métrica que importa porque la biblioteca es el factor de
// retención medido en producción (~20 títulos el día uno → 46% de regreso;
// 1-2 → 6%). Un grupo de anuncios con clics baratos que nunca marcan nada es
// dinero quemado, y sin este reporte se ve idéntico a uno que funciona.
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 });

// Lo que consideramos "construyó biblioteca": la señal de retención.
const META_BIBLIOTECA = 3;

const filas = await sql`
  select
    coalesce(p.origen, '(directo / sin campaña)')                as campana,
    count(*)::int                                                as visitas,
    count(*) filter (where m.marcas > 0)::int                    as con_alguna,
    count(*) filter (where m.marcas >= ${META_BIBLIOTECA})::int  as con_biblioteca,
    coalesce(sum(g.costo), 0)::float                             as costo_ia
  from perfiles p
  left join lateral (
    select count(*)::int as marcas from listas l
     where l.perfil_id = p.id and l.estado <> 'descartado'
  ) m on true
  left join lateral (
    select coalesce(sum(costo_usd), 0) as costo from gasto_ia x where x.perfil_id = p.id
  ) g on true
  group by 1
  order by visitas desc`;

if (!filas.length) {
  console.log('Todavía no hay visitas registradas.');
  await sql.end();
  process.exit(0);
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
const usd = (n) => `$${n.toFixed(4)}`;

console.log('\n═══ POR CAMPAÑA ═══\n');
for (const f of filas) {
  console.log(`  ${f.campana}`);
  console.log(`    visitas:            ${f.visitas}`);
  console.log(`    hicieron algo:      ${f.con_alguna} (${pct(f.con_alguna, f.visitas)})`);
  console.log(`    ≥${META_BIBLIOTECA} marcados:        ${f.con_biblioteca} (${pct(f.con_biblioteca, f.visitas)})  ← el que predice que vuelvan`);
  console.log(`    rebotaron:          ${f.visitas - f.con_alguna} (${pct(f.visitas - f.con_alguna, f.visitas)})`);
  console.log(`    costo de AI:        ${usd(f.costo_ia)} · ${usd(f.visitas ? f.costo_ia / f.visitas : 0)} por visita`);
  if (f.con_biblioteca > 0) {
    console.log(`    por usuario útil:   ${usd(f.costo_ia / f.con_biblioteca)} (solo AI; súmale lo que pagaste de anuncios)`);
  }
  console.log('');
}

// Las búsquedas concretas dicen qué anuncios comprar y qué contestar mejor.
const consultas = await sql`
  select p.consulta_llegada as q, count(*)::int as n,
         count(*) filter (where exists (
           select 1 from listas l where l.perfil_id = p.id and l.estado <> 'descartado'
         ))::int as marcaron
    from perfiles p
   where p.consulta_llegada is not null
   group by 1 order by n desc limit 15`;

if (consultas.length) {
  console.log('═══ CON QUÉ BUSCARON (las que más convierten primero) ═══\n');
  for (const c of [...consultas].sort((a, b) => b.marcaron / b.n - a.marcaron / a.n)) {
    console.log(`  ${pct(c.marcaron, c.n).padStart(4)} de ${String(c.n).padStart(3)} → «${c.q}»`);
  }
  console.log('');
}

await sql.end();
