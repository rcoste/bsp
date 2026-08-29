-- ─── La biblioteca de verdad: estados + progreso ────────────────────────────
-- Con tres booleanos no se puede expresar "voy en el episodio 8", y ese dato
-- resultó ser EL factor de retención en producción del Binge Senpai original:
-- quien arma ~20 títulos el primer día vuelve 46%; quien arma 1-2, vuelve 6%.
-- (docs-para-claude-bsp/feedback pablo y alberto/FEEDBACK.md)
--
-- Estado y calificación son ejes distintos a propósito: "¿en qué punto estás?"
-- y "¿qué te pareció?" son dos preguntas. Fusionarlas ("vi pero no me gustó"
-- como estado) impediría expresar "la vi Y me encantó".

alter table listas drop constraint if exists listas_estado_check;
alter table listas add constraint listas_estado_check
  check (estado in ('quiero_ver', 'viendo', 'visto', 'abandonada', 'descartado'));

-- En qué episodio va (o en cuál la dejó). Solo tiene sentido con estado
-- 'viendo' o 'abandonada'; en los demás queda null.
alter table listas add column if not exists episodio integer
  check (episodio is null or episodio >= 0);

-- Marcar y registrar avance actualiza la fila; sin esto no se puede ordenar
-- el "¿con qué sigo?" por lo más reciente.
alter table listas add column if not exists actualizado_en timestamptz
  not null default now();
