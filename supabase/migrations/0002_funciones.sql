-- ============================================================================
-- bsp — las tres operaciones indivisibles
-- Ver docs/plans/arquitectura.md §5.
--
-- POR QUÉ VIVEN AQUÍ Y NO EN EL CÓDIGO: escritas del lado de la aplicación,
-- estas tres producen bugs que NO se ven en pruebas y sí en producción:
-- contadores que pierden cuentas cuando llegan dos peticiones al mismo tiempo,
-- y fusiones que se quedan a medias y borran la lista de alguien. Dentro de la
-- base, cada función es indivisible por definición.
-- ============================================================================

-- ─── 1. El cubo de fichas del freno ─────────────────────────────────────────
-- Rellena según el tiempo transcurrido, descuenta una ficha, y devuelve si
-- alcanzó. Todo en un solo UPDATE: Postgres bloquea la fila, así que dos
-- peticiones simultáneas no pueden tomar la misma ficha.
create or replace function tomar_ficha_jikan()
returns boolean
language plpgsql
as $$
declare
  disponibles numeric;
begin
  update jikan_fichas
     set fichas = least(3, fichas + extract(epoch from (now() - ultima_recarga)) / 1.1),
         ultima_recarga = now()
   where id = true
  returning fichas into disponibles;

  if disponibles >= 1 then
    update jikan_fichas set fichas = fichas - 1 where id = true;
    return true;
  end if;
  return false;
end;
$$;

-- ─── 2. Incremento de contadores ────────────────────────────────────────────
-- Suma uno y devuelve el total en una sola operación. Leer-y-luego-escribir
-- pierde cuentas con peticiones simultáneas, que es justo el caso que los
-- candados de gasto quieren frenar.
-- De paso limpia filas viejas: sin eso la tabla crece para siempre.
create or replace function incrementar_uso(
  p_clave  text,
  p_tipo   text,
  p_ventana timestamptz
)
returns integer
language plpgsql
as $$
declare
  total integer;
begin
  insert into uso (clave, tipo, ventana_inicio, conteo)
  values (p_clave, p_tipo, p_ventana, 1)
  on conflict (clave, tipo, ventana_inicio)
  do update set conteo = uso.conteo + 1
  returning conteo into total;

  -- Limpieza oportunista (1 de cada 100 llamadas, para no pesar)
  if random() < 0.01 then
    delete from uso where ventana_inicio < now() - interval '2 days';
  end if;

  return total;
end;
$$;

-- ─── 3. Fusión de perfiles al crear cuenta ──────────────────────────────────
-- SOLO SE USA SI SOBREVIVE LA CUENTA POR CORREO (paso 8, primer candidato de
-- recorte). Es la operación que más puede doler: un fallo a medias borra la
-- lista de alguien. Dentro de una función, o pasa todo o no pasa nada.
create or replace function fusionar_perfil(
  p_dispositivo_id text,
  p_usuario_id     uuid
)
returns uuid
language plpgsql
as $$
declare
  perfil_anonimo uuid;
  perfil_cuenta  uuid;
begin
  select id into perfil_anonimo from perfiles where dispositivo_id = p_dispositivo_id;
  select id into perfil_cuenta  from perfiles where usuario_id = p_usuario_id;

  -- Nadie tenía cuenta: el perfil anónimo se convierte en el de la cuenta.
  if perfil_cuenta is null then
    update perfiles
       set usuario_id = p_usuario_id, actualizado_en = now()
     where id = perfil_anonimo;
    return perfil_anonimo;
  end if;

  -- Ya había cuenta (otro dispositivo): gana la de la cuenta.
  if perfil_anonimo is null or perfil_anonimo = perfil_cuenta then
    return perfil_cuenta;
  end if;

  -- Se copia la lista del anónimo ignorando lo que ya estaba, y se borra.
  insert into listas (perfil_id, anime_id, estado, calificacion)
  select perfil_cuenta, anime_id, estado, calificacion
    from listas where perfil_id = perfil_anonimo
  on conflict (perfil_id, anime_id) do nothing;

  delete from perfiles where id = perfil_anonimo;

  update perfiles set dispositivo_id = p_dispositivo_id, actualizado_en = now()
   where id = perfil_cuenta;

  return perfil_cuenta;
end;
$$;
