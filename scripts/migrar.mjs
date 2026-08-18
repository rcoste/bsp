// Aplica las migraciones de supabase/migrations/ en orden.
// Uso: node scripts/migrar.mjs
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const sql = postgres(env.DATABASE_URL, { ssl: 'require' });
const archivos = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
let aplicadas = 0;

for (const archivo of archivos) {
  try {
    await sql.unsafe(fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8'));
    console.log(`✅ ${archivo}`);
    aplicadas++;
  } catch (e) {
    console.log(`❌ ${archivo}: ${e.message}`);
    await sql.end();
    process.exit(1);
  }
}
console.log(`\nMIGRACIONES_APLICADAS=${aplicadas}`);
await sql.end();
