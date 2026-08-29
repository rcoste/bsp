-- ─── Registro de gasto de la AI ─────────────────────────────────────────────
-- Una fila por conversación. Existe para poder responder con MEDICIONES y no
-- con estimaciones: cuánto cuesta de verdad una conversación, cuánto llevamos
-- gastado del tope mensual, y si el tiempo hasta la primera portada se está
-- degradando con el uso real (el umbral acordado son 8 segundos).
--
-- Los tokens se guardan separados a propósito. Los de caché tienen precios
-- distintos (escribir cuesta ~1.25x, leer ~0.1x), así que un total agregado
-- no permitiría recalcular el costo si cambian las tarifas — y la tarifa
-- introductoria de Sonnet 5 vence el 2026-08-31.

create table if not exists gasto_ia (
  id                uuid primary key default gen_random_uuid(),
  perfil_id         uuid references perfiles(id) on delete set null,
  modelo            text not null,
  vueltas           integer not null,          -- llamadas al modelo en este turno
  tokens_entrada    integer not null default 0,
  tokens_salida     integer not null default 0,
  cache_escrito     integer not null default 0,
  cache_leido       integer not null default 0,
  costo_usd         numeric(10, 6) not null default 0,
  tarjetas          integer not null default 0,
  ms_primera_tarjeta integer,                  -- null si el turno no mostró ninguna
  ms_total          integer not null,
  creado_en         timestamptz not null default now()
);

create index if not exists gasto_creado_idx on gasto_ia(creado_en desc);

-- Misma política que el resto: base cerrada, acceso solo desde el servidor.
alter table gasto_ia enable row level security;
