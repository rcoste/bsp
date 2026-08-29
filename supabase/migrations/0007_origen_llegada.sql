-- ─── De dónde llegó cada persona ────────────────────────────────────────────
-- Con tráfico pagado, cada visita cuesta dinero. La pregunta que hay que poder
-- contestar NO es "cuánto me costó un clic" sino "cuánto me costó un usuario
-- que construyó biblioteca" — porque la biblioteca es el factor de retención
-- (46% con ~20 títulos vs 6% con 1-2).
--
-- Se guarda en el perfil y no en una tabla aparte porque la pregunta siempre
-- es por persona: esta persona, ¿de dónde vino y qué hizo? Una tabla de
-- eventos obligaría a unir por dispositivo en cada consulta sin dar nada.

alter table perfiles add column if not exists origen text;          -- utm_source / utm_campaign
alter table perfiles add column if not exists consulta_llegada text; -- el ?q= con el que aterrizó

-- Para agrupar por campaña en el reporte.
create index if not exists perfiles_origen_idx on perfiles(origen)
  where origen is not null;
