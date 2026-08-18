-- ============================================================================
-- bsp — schema inicial
-- Ver docs/plans/arquitectura.md §5 para el porqué de cada decisión.
--
-- REGLA DE SEGURIDAD: todas las tablas quedan CERRADAS (RLS activo, cero
-- políticas). El navegador nunca habla con esta base; solo el servidor, con
-- la cadena de conexión. Las reglas por fila no pueden proteger perfiles
-- anónimos —distinguen usuarios por sesión de login y aquí la mayoría no
-- tiene login—, así que en vez de reglas permisivas: puerta cerrada.
-- ============================================================================

-- ─── Perfiles: quién eres y qué te gusta ────────────────────────────────────
create table if not exists perfiles (
  id                      uuid primary key default gen_random_uuid(),
  dispositivo_id          text unique not null,
  usuario_id              uuid unique,              -- nulo hasta que crea cuenta
  gusto                   jsonb not null default '{}'::jsonb,
  ultimas_recomendaciones jsonb not null default '[]'::jsonb,
  creado_en               timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

-- ─── Listas: visto / quiero ver / calificación ──────────────────────────────
create table if not exists listas (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid not null references perfiles(id) on delete cascade,
  anime_id     integer not null,                    -- el id de MyAnimeList
  estado       text not null check (estado in ('visto','quiero_ver')),
  calificacion text check (calificacion in ('no_fue_lo_mio','estuvo_bien','me_encanto')),
  creado_en    timestamptz not null default now(),
  unique (perfil_id, anime_id)                      -- tocar dos veces no duplica
);
create index if not exists listas_perfil_idx on listas(perfil_id);

-- ─── Caché de datos de anime (7 días) ───────────────────────────────────────
create table if not exists catalogo_cache (
  anime_id    integer primary key,
  datos       jsonb not null,
  sinopsis_es text,
  expira_en   timestamptz not null
);
create index if not exists catalogo_expira_idx on catalogo_cache(expira_en);

-- ─── Caché de búsquedas (24 h) ──────────────────────────────────────────────
-- Indexado por CONSULTA, no por id: la herramienta busca por título, así que
-- un caché por id nunca la ayudaría. Los resultados VACÍOS se guardan igual:
-- los títulos que la AI inventa son justo los que nunca encuentran nada, y se
-- repiten. Sin esto, cada título fantasma sale a internet para siempre.
create table if not exists busquedas_cache (
  consulta_normalizada text primary key,
  anime_ids            jsonb not null default '[]'::jsonb,
  expira_en            timestamptz not null
);
create index if not exists busquedas_expira_idx on busquedas_cache(expira_en);

-- ─── Contadores de uso (los candados de gasto) ──────────────────────────────
create table if not exists uso (
  clave          text not null,        -- dispositivo_id, huella de IP, o usuario_id
  tipo           text not null,        -- 'dispositivo' | 'ip' | 'cuenta'
  ventana_inicio timestamptz not null,
  conteo         integer not null default 0,
  primary key (clave, tipo, ventana_inicio)
);
create index if not exists uso_ventana_idx on uso(ventana_inicio);

-- ─── El freno de peticiones a Jikan: UNA SOLA FILA ──────────────────────────
-- Cubo de fichas. Se rellena 1 ficha cada 1.1 s hasta un máximo de 3.
-- Eso da ráfagas de 3 y ~54/min sostenidos, por debajo del techo de 60 de
-- Jikan. (Rellenar 1 por segundo exacto daría 63/min: por encima.)
create table if not exists jikan_fichas (
  id             boolean primary key default true check (id),  -- fuerza fila única
  fichas         numeric not null default 3,
  ultima_recarga timestamptz not null default now()
);
insert into jikan_fichas (id) values (true) on conflict (id) do nothing;

-- ─── Errores: para saber qué se rompió en producción ────────────────────────
create table if not exists errores (
  id        uuid primary key default gen_random_uuid(),
  ruta      text not null,
  mensaje   text not null,
  contexto  jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists errores_creado_idx on errores(creado_en desc);

-- ============================================================================
-- PUERTA CERRADA: RLS activo sin políticas = nadie entra con la llave pública
-- ============================================================================
alter table perfiles        enable row level security;
alter table listas          enable row level security;
alter table catalogo_cache  enable row level security;
alter table busquedas_cache enable row level security;
alter table uso             enable row level security;
alter table jikan_fichas    enable row level security;
alter table errores         enable row level security;
