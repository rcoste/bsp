// Aplica las migraciones de supabase/migrations/ que falten, en orden.
// Uso: node scripts/migrar.mjs
//
// LLEVA REGISTRO de lo ya aplicado, y no es un lujo: antes re-aplicaba TODAS
// en cada corrida, y eso truena en cuanto una migración posterior amplía algo
// que una anterior restringía. Pasó de verdad: la 0004 dejaba el estado en
// tres valores, la 0006 lo amplió a cinco, y al re-correr la 0004 la base
// rechazaba las filas que ya usaban los estados nuevos. Una migración
// aplicada no se vuelve a tocar.
import fs from 'node:fs';
import postgres from 'postgres';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const sql = postgres(env.DATABASE_URL, { ssl: 'require' });

await sql`
  create table if not exists migraciones (
    archivo    text primary key,
    aplicada_en timestamptz not null default now()
  )`;

const archivos = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
const yaAplicadas = new Set(
  (await sql`select archivo from migraciones`).map((f) => f.archivo),
);

// Base que ya existía antes de que hubiera registro: se adopta lo que
// demostrablemente está aplicado en vez de re-correrlo. La señal es la tabla
// perfiles — si existe, este esquema ya se construyó.
if (yaAplicadas.size === 0) {
  const [{ existe }] = await sql`
    select count(*)::int > 0 as existe from information_schema.tables
     where table_schema = 'public' and table_name = 'perfiles'`;
  if (existe) {
    const adoptadas = process.argv.slice(2);
    if (adoptadas.length === 0) {
      console.log('Esta base ya tiene esquema pero no registro de migraciones.');
      console.log('Dime cuáles dar por aplicadas (verifícalas antes):\n');
      console.log(`  node scripts/migrar.mjs ${archivos.slice(0, -1).join(' ')}\n`);
      console.log('Las que NO nombres se aplicarán normalmente.');
      await sql.end();
      process.exit(1);
    }
    for (const a of adoptadas) {
      if (!archivos.includes(a)) {
        console.log(`❌ ${a} no existe en supabase/migrations/`);
        await sql.end();
        process.exit(1);
      }
      await sql`insert into migraciones (archivo) values (${a}) on conflict do nothing`;
      yaAplicadas.add(a);
      console.log(`📌 ${a} — dada por aplicada`);
    }
  }
}

let aplicadas = 0;
for (const archivo of archivos) {
  if (yaAplicadas.has(archivo)) {
    console.log(`⏭  ${archivo} — ya estaba`);
    continue;
  }
  try {
    await sql.unsafe(fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8'));
    await sql`insert into migraciones (archivo) values (${archivo})`;
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
