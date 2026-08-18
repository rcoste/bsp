import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) {
  if (l.includes('=') && !l.startsWith('#')) process.env[l.slice(0,l.indexOf('='))] = l.slice(l.indexOf('=')+1);
}
const { buscarPorTitulo } = await import('../lib/anime/catalogo.ts');
const { sql } = await import('../lib/db.ts');

const casos = ['Death Note', 'Cowboy Bebop', 'Un anime totalmente inventado que no existe xyz'];
for (const c of casos) {
  const t0 = Date.now();
  const r = await buscarPorTitulo(c);
  const ms = Date.now() - t0;
  console.log(r
    ? `✅ "${c}" → ${r.titulo} (${r.anio}) [${ms}ms]${r.portada ? ' con portada' : ' SIN PORTADA'}`
    : `🚫 "${c}" → descartado, no existe [${ms}ms]`);
}
console.log('\n=== segunda vuelta: debe venir del caché (mucho más rápido) ===');
const t = Date.now();
await buscarPorTitulo('Death Note');
console.log(`   Death Note desde caché: ${Date.now()-t}ms`);
await sql.end();
