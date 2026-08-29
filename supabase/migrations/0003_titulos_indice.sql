-- ─── Índice de títulos para búsqueda local ──────────────────────────────────
-- Con 28 animes, buscar era recorrer todo el catálogo en memoria. Con ~25 mil
-- (el catálogo exportado de la base de Pablo) eso cargaría megas de JSON en
-- cada verificación de título. Esta tabla guarda cada título conocido de cada
-- anime (principal, inglés, español, sinónimos) ya normalizado, y pg_trgm
-- (extensión de Postgres que compara textos parecidos por trigramas) permite
-- pedirle a la base solo los ~40 candidatos más parecidos. El veredicto final
-- lo sigue dando elegirMejor() en lib/anime/titulos.ts — el candado no cambia,
-- solo deja de leerse el catálogo entero para aplicarlo.

create extension if not exists pg_trgm;

create table if not exists titulos_indice (
  anime_id           integer not null,
  titulo             text not null,           -- como se muestra
  titulo_normalizado text not null,           -- como se compara (normalizar())
  miembros           integer not null default 0, -- popularidad, para ordenar autocompletado
  primary key (anime_id, titulo_normalizado)
);

-- Para similitud (el candado de verificación de títulos).
create index if not exists titulos_trgm_idx
  on titulos_indice using gin (titulo_normalizado gin_trgm_ops);

-- Para prefijos (el autocompletado del v1) y para igualdad exacta.
create index if not exists titulos_prefijo_idx
  on titulos_indice (titulo_normalizado text_pattern_ops);

-- Misma política que el resto: base cerrada, acceso solo desde el servidor.
alter table titulos_indice enable row level security;
