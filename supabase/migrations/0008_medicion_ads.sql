-- ─── Medición para Google Ads ───────────────────────────────────────────────
-- El laboratorio de campañas (repo campanas-binge-senpai) compara BSP contra
-- Binge Senpai por costo por usuario que REGRESA, contado como conversión en
-- Google Ads. Binge Senpai ya sube dos conversiones desde su base; BSP sube
-- las mismas, con el mismo nombre y valor, para que se puedan comparar:
--
--   "Shelf 20 shows (day 0)" = 20+ animes en su biblioteca en las primeras 24 h
--   "Engaged return (7d)"    = volvió a usar la app entre las 24 h y los 7 días
--
-- BSP no tiene cuentas: la "persona" es el dispositivo (cookie bsp_id) y su
-- llegada es perfiles.creado_en. Quien cambia de celular o borra cookies no
-- cuenta como regreso: el error va EN CONTRA de BSP, a propósito.

-- El boleto del clic. Google lo pega a la URL (gclid; gbraid/wbraid en iOS) y
-- sin él no hay forma de decirle a Google qué anuncio trajo a quién. Se guarda
-- solo el PRIMER clic, igual que el origen (0007).
alter table perfiles add column if not exists gclid   text;
alter table perfiles add column if not exists gbraid  text;
alter table perfiles add column if not exists wbraid  text;
alter table perfiles add column if not exists clic_en timestamptz;

create index if not exists perfiles_clic_en_idx on perfiles(clic_en)
  where clic_en is not null;

-- Un renglón por persona y día en que usó la app (hora de CDMX). Primera y
-- última vez del día bastan para saber si hubo actividad entre las 24 h y los
-- 7 días: esa ventana mide 6 días, así que un mismo día nunca la cruza entera,
-- y si hubo un uso dentro, la primera o la última del día caen dentro.
-- No sirve "perfiles.actualizado_en": se pisa en cada petición.
create table if not exists actividad_dias (
  perfil_id uuid not null references perfiles(id) on delete cascade,
  dia       date not null default (now() at time zone 'America/Mexico_City')::date,
  primera   timestamptz not null default now(),
  ultima    timestamptz not null default now(),
  primary key (perfil_id, dia)
);
alter table actividad_dias enable row level security;

-- Las conversiones ya detectadas, con su hora CONGELADA. Google descarta un
-- reenvío idéntico (mismo clic, conversión y hora), así que el script puede
-- mandar todo lo reciente cada día sin duplicar — pero solo si la hora no
-- cambia. Recalcularla cada vez la movería (marcar y desmarcar cambia la
-- fila 20 de la biblioteca), y Google la contaría dos veces.
create table if not exists conversiones_ads (
  perfil_id    uuid not null references perfiles(id) on delete cascade,
  accion       text not null check (accion in ('veinte', 'regreso')),
  ocurrio_en   timestamptz not null,
  detectada_en timestamptz not null default now(),
  primary key (perfil_id, accion)
);
alter table conversiones_ads enable row level security;
