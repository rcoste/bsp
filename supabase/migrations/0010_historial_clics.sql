-- ─── Historial de clics de anuncio ──────────────────────────────────────────
-- A Google se le manda el ÚLTIMO clic de anuncio anterior a la conversión, no
-- el primero. Binge Senpai guardaba solo el primero y perdió conversiones
-- buenas: alguien llegó por un anuncio el 28-jul, volvió por otro el 25-oct y
-- se registró; se subió el clic del 28-jul, que ya tenía 90.5 días, y Google
-- la rechazó (EXPIRED_CLICK: no acepta clics de más de 90 días).
--
-- No basta con sobrescribir perfiles.gclid: si alguien llega a 20 el día 0 y
-- el día 3 vuelve por otro anuncio, subir la conversión del día 0 con el clic
-- del día 3 la deja ANTES del clic y Google también la rechaza. Por eso se
-- guardan todos y se elige al subir (lib/medicion.ts, conversionesRecientes).
--
-- perfiles.gclid/gbraid/wbraid/clic_en NO cambian: siguen siendo el PRIMER
-- clic, que es lo que decide si al perfil lo trajo un anuncio (igual que
-- origen, consulta_llegada y puerta son primer contacto).
--
-- Se deshace con: drop table clics_ads;  (perfiles queda intacta)

create table if not exists clics_ads (
  perfil_id  uuid not null references perfiles(id) on delete cascade,
  gclid      text,
  gbraid     text,
  wbraid     text,
  -- La hora en que llegó con ese boleto. Recargar la página con el mismo
  -- boleto en la URL no crea otra fila ni le mueve la hora (índice único).
  ocurrio_en timestamptz not null default now(),
  check (coalesce(gclid, gbraid, wbraid) is not null)
);

create unique index if not exists clics_ads_unico
  on clics_ads (perfil_id, coalesce(gclid, ''), coalesce(gbraid, ''), coalesce(wbraid, ''));

create index if not exists clics_ads_perfil_idx
  on clics_ads (perfil_id, ocurrio_en desc);

alter table clics_ads enable row level security;

-- Lo que ya hubiera guardado como primer clic entra al historial.
insert into clics_ads (perfil_id, gclid, gbraid, wbraid, ocurrio_en)
select id, gclid, gbraid, wbraid, clic_en
  from perfiles
 where clic_en is not null
   and coalesce(gclid, gbraid, wbraid) is not null
on conflict do nothing;
