-- ─── Puertas y bitácora de uso ──────────────────────────────────────────────
-- El ciclo de mejora de la app es: cada anuncio manda a una PUERTA distinta
-- (?v=parrilla, ?v=tarjetas…), y un reporte compara las puertas de punta a
-- punta: cuántos completan el flujo, cuántos regresan, y a qué costo. Sin
-- asignación al azar: el reparto lo hace Google Ads moviendo presupuesto entre
-- grupos de recursos, cada uno con su URL final.
--
-- La puerta se guarda en el perfil, igual que el origen (0007): la pregunta
-- siempre es por persona — esta persona, ¿por qué puerta entró y qué hizo?
-- Solo se escribe la PRIMERA vez.
alter table perfiles add column if not exists puerta text;
create index if not exists perfiles_puerta_idx on perfiles(puerta)
  where puerta is not null;

-- Lo que pasa ENTRE llegar y marcar: hoy la base sabe quién llegó y quién
-- marcó, pero no dónde se cayó quien no marcó nada. Un renglón por acción,
-- con el tiempo desde la llegada calculado en el servidor (el reloj del
-- navegador no es de fiar). Los nombres válidos viven en lib/eventos-uso.ts.
create table if not exists eventos (
  id                bigserial primary key,
  perfil_id         uuid not null references perfiles(id) on delete cascade,
  nombre            text not null,
  datos             jsonb not null default '{}'::jsonb,
  ms_desde_llegada  bigint not null,
  creado_en         timestamptz not null default now()
);
create index if not exists eventos_perfil_nombre_idx on eventos(perfil_id, nombre);
create index if not exists eventos_creado_idx on eventos(creado_en);
alter table eventos enable row level security;
