import fs from 'node:fs';
import postgres from 'postgres';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const sql=postgres(env.DATABASE_URL,{ssl:'require'});
const r = await sql`delete from busquedas_cache returning consulta_normalizada`;
console.log(`borradas ${r.length} entradas: ${r.map(x=>x.consulta_normalizada).join(', ')}`);
await sql.end();
