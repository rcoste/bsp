import fs from 'node:fs';
import postgres from 'postgres';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql=postgres(env.DATABASE_URL,{ssl:'require'});

console.log('=== estado del cubo de fichas ===');
console.log(await sql`select fichas, ultima_recarga, now() - ultima_recarga as hace from jikan_fichas`);

console.log('\n=== 3 llamadas seguidas a la función ===');
for (let i=0;i<3;i++){
  const r = await sql`select tomar_ficha_jikan() as ok`;
  const e = await sql`select fichas from jikan_fichas`;
  console.log(`  intento ${i+1}: ${r[0].ok ? 'PASA' : 'FRENA'} | fichas restantes: ${e[0].fichas}`);
}

console.log('\n=== ¿qué guardó el caché de búsquedas? ===');
console.log(await sql`select consulta_normalizada, anime_ids, expira_en > now() as vigente from busquedas_cache`);

console.log('\n=== errores registrados ===');
const errs = await sql`select ruta, mensaje from errores order by creado_en desc limit 5`;
console.log(errs.length ? errs : '  (ninguno)');
await sql.end();
