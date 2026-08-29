// Estadísticas reales de gasto y velocidad del chat.
// Uso: node scripts/reporte-gasto.mjs
//
// Lee lo que la app registró de verdad en cada conversación — no estima nada.
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 });

const TOPE_MENSUAL = 20; // lo que Roberto puso en el espacio de trabajo BSP
const UMBRAL_PORTADA_MS = 8000;

const [g] = await sql`
  select
    count(*)::int                                    as turnos,
    coalesce(sum(costo_usd), 0)::float               as total,
    coalesce(avg(costo_usd), 0)::float               as promedio,
    coalesce(avg(vueltas), 0)::float                 as vueltas,
    coalesce(avg(tarjetas), 0)::float                as tarjetas,
    coalesce(sum(tokens_entrada), 0)::bigint         as entrada,
    coalesce(sum(tokens_salida), 0)::bigint          as salida,
    coalesce(sum(cache_leido), 0)::bigint            as cache_leido,
    coalesce(sum(cache_escrito), 0)::bigint          as cache_escrito
  from gasto_ia`;

if (!g.turnos) {
  console.log('Todavía no hay conversaciones registradas.');
  console.log('Habla con la app en localhost y vuelve a correr esto.');
  await sql.end();
  process.exit(0);
}

const [mes] = await sql`
  select coalesce(sum(costo_usd), 0)::float as gastado, count(*)::int as turnos
    from gasto_ia where creado_en >= date_trunc('month', now())`;

const [p] = await sql`
  select
    percentile_cont(0.5) within group (order by ms_primera_tarjeta)::int  as mediana,
    percentile_cont(0.95) within group (order by ms_primera_tarjeta)::int as p95,
    min(ms_primera_tarjeta)::int as minimo,
    max(ms_primera_tarjeta)::int as maximo,
    count(*)::int as con_tarjeta
  from gasto_ia where ms_primera_tarjeta is not null`;

const [t] = await sql`
  select percentile_cont(0.5) within group (order by ms_total)::int as mediana,
         max(ms_total)::int as maximo from gasto_ia`;

const [sin] = await sql`select count(*)::int as n from gasto_ia where tarjetas = 0`;

const usd = (n) => `$${n.toFixed(4)}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;

console.log(`\n═══ GASTO (${g.turnos} conversaciones registradas) ═══`);
console.log(`  costo por conversación:  ${usd(g.promedio)} en promedio`);
console.log(`  gastado en total:        ${usd(g.total)}`);
console.log(`  llamadas al modelo:      ${g.vueltas.toFixed(1)} por conversación`);
console.log(`  tarjetas mostradas:      ${g.tarjetas.toFixed(1)} por conversación`);

console.log(`\n═══ ESTE MES vs. TU TOPE DE ${TOPE_MENSUAL} USD ═══`);
console.log(`  llevas gastado:  ${usd(mes.gastado)} (${pct(mes.gastado / TOPE_MENSUAL)} del tope) en ${mes.turnos} conversaciones`);
if (g.promedio > 0) {
  console.log(`  te alcanza para: ~${Math.round(TOPE_MENSUAL / g.promedio).toLocaleString('es')} conversaciones al mes`);
}

// El caché es lo que más mueve el costo, y no se ve en el promedio.
const entradaTotal = Number(g.entrada) + Number(g.cache_leido) + Number(g.cache_escrito);
if (entradaTotal > 0) {
  console.log(`\n═══ CACHÉ (lo que abarata la entrada) ═══`);
  console.log(`  leído del caché: ${pct(Number(g.cache_leido) / entradaTotal)} de los tokens de entrada`);
  console.log(`  (leer del caché cuesta ~10% de lo normal; si este número es bajo, algo lo está invalidando)`);
}

console.log(`\n═══ VELOCIDAD — hasta la PRIMERA PORTADA ═══`);
console.log(`  mediana: ${p.mediana} ms   ← el número del producto (umbral ${UMBRAL_PORTADA_MS})`);
console.log(`  p95:     ${p.p95} ms   ← lo que sufre 1 de cada 20`);
console.log(`  rango:   ${p.minimo}–${p.maximo} ms`);
console.log(`  VEREDICTO: ${p.mediana <= UMBRAL_PORTADA_MS ? '✅ PASA' : '❌ NO PASA — replantear'}`);
console.log(`\n  turno completo: mediana ${t.mediana} ms · máximo ${t.maximo} ms`);
console.log(`  conversaciones sin ninguna tarjeta: ${sin.n} de ${g.turnos}`);

console.log(`\n═══ LOS 5 TURNOS MÁS CAROS ═══`);
for (const f of await sql`
  select costo_usd::float as c, vueltas, tarjetas, ms_total, creado_en
    from gasto_ia order by costo_usd desc limit 5`) {
  console.log(`  ${usd(f.c)} · ${f.vueltas} llamadas · ${f.tarjetas} tarjetas · ${f.ms_total} ms · ${f.creado_en.toISOString().slice(0, 16).replace('T', ' ')}`);
}

console.log('');
await sql.end();
