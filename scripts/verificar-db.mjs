import fs from 'node:fs';
import postgres from 'postgres';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql = postgres(env.DATABASE_URL,{ssl:'require'});

const tablas = await sql`select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename`;
console.log('=== TABLAS (rls = puerta cerrada) ===');
for (const t of tablas) console.log(`  ${t.rowsecurity ? '🔒' : '🔓'} ${t.tablename}`);

const pol = await sql`select count(*)::int as n from pg_policies where schemaname='public'`;
console.log(`\n=== POLÍTICAS: ${pol[0].n} (debe ser 0: cerrada de verdad) ===`);

const fns = await sql`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by proname`;
console.log('\n=== FUNCIONES ===');
for (const f of fns) console.log(`  ✓ ${f.proname}`);

console.log('\n=== PRUEBA DEL FRENO: 5 intentos seguidos (deben pasar 3, fallar 2) ===');
let ok=0, no=0;
for (let i=0;i<5;i++){ const r = await sql`select tomar_ficha_jikan() as p`; r[0].p ? ok++ : no++; }
console.log(`  pasaron: ${ok} | frenados: ${no}`);
console.log(ok===3 && no===2 ? '  ✅ el freno funciona exactamente como se diseñó' : `  ⚠️ revisar (esperado 3/2)`);

console.log('\n=== PRUEBA DEL CONTADOR: 3 incrementos ===');
const v = new Date();
const r1 = await sql`select incrementar_uso('prueba','dispositivo',${v}) as n`;
const r2 = await sql`select incrementar_uso('prueba','dispositivo',${v}) as n`;
const r3 = await sql`select incrementar_uso('prueba','dispositivo',${v}) as n`;
console.log(`  devolvió: ${r1[0].n}, ${r2[0].n}, ${r3[0].n}`);
console.log(r3[0].n===3 ? '  ✅ cuenta bien' : '  ⚠️ revisar');
await sql`delete from uso where clave='prueba'`;
await sql.end();
