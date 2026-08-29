-- ─── El tercer botón: "No, otra cosa" ───────────────────────────────────────
-- La tabla nació con dos estados (visto / quiero_ver). Falta el rechazo, que
-- es el que más rápido enseña el gusto: en la versión anterior del producto
-- vivía enterrado en un menú y lo usaron 5 personas en total.
-- Ver docs/designs/alcance-v1-para-diseno.md §3.

alter table listas drop constraint if exists listas_estado_check;
alter table listas add constraint listas_estado_check
  check (estado in ('visto', 'quiero_ver', 'descartado'));
