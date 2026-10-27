// Qué PUERTA (y qué campaña) trae gente que completa el flujo Y se queda.
// Uso: node scripts/reporte-puertas.mjs            (últimas 8 semanas)
//      node scripts/reporte-puertas.mjs 30          (últimos 30 días)
//
// El ciclo de mejora: cada anuncio manda a una puerta distinta (?v=parrilla,
// ?v=tarjetas…), aquí se comparan de punta a punta, y la semana siguiente se
// mueve presupuesto o se cambia una puerta. Enseña las dos columnas que se
// pueden contradecir: COMPLETAR el flujo (marcó, llegó a 20) y REGRESAR a la
// semana. Una puerta con mejor completado y peor regreso es la trampa clásica.
//
// Honestidad estadística: comparar puertas por campaña NO es un A/B limpio
// (cada anuncio atrae gente distinta). Sirve para diferencias grandes. El
// reporte dice cuándo la muestra todavía no alcanza para concluir nada.
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 });

const dias = Number(process.argv[2]) || 56;
const META_VEINTE = 20;

// Un perfil por renglón, con todo lo que hizo. "Maduro" = llegó hace más de 7
// días, que es lo único que puede decir si regresó o no.
const personas = await sql`
  select
    p.id,
    coalesce(p.puerta, '(sin puerta)')                 as puerta,
    coalesce(p.origen, '(directo)')                    as campana,
    date_trunc('week', p.creado_en)::date              as semana,
    p.creado_en < now() - interval '7 days'            as maduro,
    coalesce(m.marcas, 0)                              as marcas,
    (select min(ms_desde_llegada) from eventos e where e.perfil_id = p.id and e.nombre = 'marca') as ms_primera_marca,
    exists (select 1 from eventos e where e.perfil_id = p.id and e.nombre = 'mensaje') as hablo,
    exists (select 1 from conversiones_ads c where c.perfil_id = p.id and c.accion = 'veinte')  as veinte,
    exists (select 1 from conversiones_ads c where c.perfil_id = p.id and c.accion = 'regreso') as regreso,
    coalesce(g.costo, 0)::float                        as costo_ia
  from perfiles p
  left join lateral (
    select count(*)::int as marcas from listas l
     where l.perfil_id = p.id and l.estado <> 'descartado'
  ) m on true
  left join lateral (
    select coalesce(sum(costo_usd), 0) as costo from gasto_ia x where x.perfil_id = p.id
  ) g on true
  where p.creado_en > now() - make_interval(days => ${dias})
    and p.dispositivo_id not like 'prueba-%'
    and p.dispositivo_id not like 'medicion-%'`;

if (!personas.length) {
  console.log(`Sin visitas en los últimos ${dias} días.`);
  await sql.end();
  process.exit(0);
}

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(0)}%`.padStart(4) : '   —');
const usd = (n) => `$${n.toFixed(3)}`;

function resumir(grupo) {
  const n = grupo.length;
  const maduros = grupo.filter((p) => p.maduro);
  const marcaron = grupo.filter((p) => p.marcas > 0).length;
  const veinte = grupo.filter((p) => p.veinte || p.marcas >= META_VEINTE).length;
  const hablaron = grupo.filter((p) => p.hablo).length;
  const regresaron = maduros.filter((p) => p.regreso).length;
  const tiempos = grupo.map((p) => p.ms_primera_marca).filter((t) => t != null).sort((a, b) => a - b);
  const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] / 1000 : null;
  const costo = grupo.reduce((a, p) => a + p.costo_ia, 0);
  return { n, marcaron, veinte, hablaron, maduros: maduros.length, regresaron, mediana, costo };
}

function imprimir(titulo, r) {
  console.log(`  ${titulo}`);
  console.log(`    visitas ${String(r.n).padStart(5)} · marcó algo ${pct(r.marcaron, r.n)} · 20 animes ${pct(r.veinte, r.n)} · habló ${pct(r.hablaron, r.n)}` +
    (r.mediana != null ? ` · 1ª marca a los ${r.mediana.toFixed(0)} s` : ''));
  console.log(`    regresó a 7 días: ${pct(r.regresaron, r.maduros)} de ${r.maduros} maduros` +
    (r.maduros < r.n ? ` (${r.n - r.maduros} todavía no cumplen 7 días)` : ''));
  console.log(`    costo AI: ${usd(r.costo)} total · ${usd(r.n ? r.costo / r.n : 0)} por visita` +
    (r.regresaron ? ` · ${usd(r.costo / r.regresaron)} por usuario que regresó (+ lo que pagaste de anuncios)` : ''));
}

const agrupar = (clave) => {
  const m = new Map();
  for (const p of personas) {
    const k = clave(p);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

console.log(`\n═══ POR PUERTA (últimos ${dias} días) ═══\n`);
const porPuerta = agrupar((p) => p.puerta);
for (const [puerta, grupo] of porPuerta) { imprimir(puerta, resumir(grupo)); console.log(''); }

console.log('═══ POR CAMPAÑA × PUERTA ═══\n');
for (const [k, grupo] of agrupar((p) => `${p.campana}  →  ${p.puerta}`)) { imprimir(k, resumir(grupo)); console.log(''); }

console.log('═══ POR SEMANA (todas las puertas) ═══\n');
for (const [semana, grupo] of agrupar((p) => p.semana.toISOString().slice(0, 10)).sort((a, b) => a[0].localeCompare(b[0]))) {
  const r = resumir(grupo);
  console.log(`  semana del ${semana}: ${String(r.n).padStart(4)} visitas · marcó ${pct(r.marcaron, r.n)} · 20 ${pct(r.veinte, r.n)} · habló ${pct(r.hablaron, r.n)} · regresó ${pct(r.regresaron, r.maduros)}`);
}

// ─── ¿Ya se puede concluir algo entre las dos puertas más grandes? ───────────
// Prueba de dos proporciones (z). Con menos de ~100 por lado casi nunca
// alcanza; el reporte lo dice en vez de dejar que la suerte se vista de dato.
const [a, b] = porPuerta;
if (a && b) {
  console.log(`\n═══ ${a[0]}  vs  ${b[0]} ═══\n`);
  const comparar = (nombre, cuenta, total) => {
    const [x1, n1, x2, n2] = [cuenta(a[1]), total(a[1]), cuenta(b[1]), total(b[1])];
    if (!n1 || !n2) return;
    const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2);
    const z = p === 0 || p === 1 ? 0 : (p1 - p2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    const seguro = Math.abs(z) >= 1.96 && n1 >= 100 && n2 >= 100;
    console.log(`  ${nombre.padEnd(18)} ${pct(x1, n1)} vs ${pct(x2, n2)}   ` +
      (seguro ? `→ diferencia real (z=${z.toFixed(1)})` :
        n1 < 100 || n2 < 100 ? `→ todavía NO concluyas: faltan visitas (${n1} y ${n2}, mínimo 100 por lado)` :
          `→ no se distingue de la suerte (z=${z.toFixed(1)})`));
  };
  comparar('marcó algo', (g) => g.filter((p) => p.marcas > 0).length, (g) => g.length);
  comparar('20 animes', (g) => g.filter((p) => p.veinte || p.marcas >= META_VEINTE).length, (g) => g.length);
  comparar('regresó (maduros)', (g) => g.filter((p) => p.maduro && p.regreso).length, (g) => g.filter((p) => p.maduro).length);
}

console.log('');
await sql.end();
