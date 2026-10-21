import "server-only";
import { sql } from "./db.ts";

/**
 * Las dos conversiones que BSP le reporta a Google Ads, iguales a las que
 * Binge Senpai ya reporta desde su base (mismo nombre y valor), para que el
 * laboratorio de campañas las compare. Ver supabase/migrations/0008.
 *
 * Solo cuentan personas que LLEGARON por un anuncio: dispositivo nuevo cuyo
 * primer clic de Google es de su primera hora. Alguien que ya usaba BSP y un
 * día pica un anuncio no es un usuario que ese anuncio haya traído.
 */

export const ACCIONES = {
  veinte: { nombre: "Shelf 20 shows (day 0)", valor: 2 },
  regreso: { nombre: "Engaged return (7d)", valor: 13 },
} as const;
export type Accion = keyof typeof ACCIONES;

export const MONEDA = "MXN";

/** Cuántas series hacen una biblioteca: producción ve el salto de regreso en 20. */
export const SERIES_VEINTE = 20;

/**
 * Google acepta conversiones hasta 90 días después del clic; el laboratorio
 * relee 30. Más atrás no se detecta ni se reenvía nada.
 */
const DIAS_ATRAS = 30;

/**
 * Busca conversiones nuevas y las guarda con su hora congelada. Se puede
 * correr las veces que sea: lo ya detectado no se toca.
 *
 * - veinte: la serie número 20 que marcó en sus primeras 24 h. "Descartado"
 *   no cuenta: es "esto no me interesa", no biblioteca. Lo que marcó y luego
 *   desmarcó tampoco (la fila se borra), así que el conteo es conservador.
 * - regreso: el primer uso entre las 24 h y los 7 días después de llegar.
 */
export async function detectarConversiones(): Promise<Record<Accion, number>> {
  const veinte = await sql`
    insert into conversiones_ads (perfil_id, accion, ocurrio_en)
    select p.id, 'veinte', l.creado_en
      from perfiles p
      cross join lateral (
        select creado_en from listas
         where perfil_id = p.id
           and estado <> 'descartado'
           and creado_en <= p.creado_en + interval '24 hours'
         order by creado_en
         offset ${SERIES_VEINTE - 1} limit 1
      ) l
     where p.clic_en is not null
       and p.clic_en <= p.creado_en + interval '1 hour'
       and p.creado_en > now() - make_interval(days => ${DIAS_ATRAS})
    on conflict (perfil_id, accion) do nothing
  `;

  const regreso = await sql`
    insert into conversiones_ads (perfil_id, accion, ocurrio_en)
    select p.id, 'regreso', min(t.momento)
      from perfiles p
      join actividad_dias a on a.perfil_id = p.id
      cross join lateral (values (a.primera), (a.ultima)) as t(momento)
     where p.clic_en is not null
       and p.clic_en <= p.creado_en + interval '1 hour'
       and p.creado_en > now() - make_interval(days => ${DIAS_ATRAS})
       and t.momento > p.creado_en + interval '24 hours'
       and t.momento <= p.creado_en + interval '7 days'
     group by p.id
    on conflict (perfil_id, accion) do nothing
  `;

  return { veinte: veinte.count, regreso: regreso.count };
}

export type ConversionParaGoogle = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  conversion: string;
  /** ISO 8601 en UTC; el script de Google Ads la pasa a su zona. */
  hora: string;
  valor: number;
  moneda: string;
};

/** Todo lo detectado en los últimos días, listo para subir a Google Ads. */
export async function conversionesRecientes(): Promise<ConversionParaGoogle[]> {
  const filas = await sql<
    { gclid: string | null; gbraid: string | null; wbraid: string | null; accion: Accion; ocurrio_en: Date }[]
  >`
    select p.gclid, p.gbraid, p.wbraid, c.accion, c.ocurrio_en
      from conversiones_ads c
      join perfiles p on p.id = c.perfil_id
     where c.ocurrio_en > now() - make_interval(days => ${DIAS_ATRAS})
     order by c.ocurrio_en
  `;
  return filas.map((f) => ({
    gclid: f.gclid,
    gbraid: f.gbraid,
    wbraid: f.wbraid,
    conversion: ACCIONES[f.accion].nombre,
    hora: f.ocurrio_en.toISOString(),
    valor: ACCIONES[f.accion].valor,
    moneda: MONEDA,
  }));
}
