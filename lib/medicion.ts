import "server-only";
import { sql } from "./db.ts";
import type { Clic } from "./llegada.ts";

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

/** Google rechaza con EXPIRED_CLICK un clic de más de 90 días. */
const DIAS_VIDA_CLIC = 90;

/**
 * Anota un clic de anuncio en el historial (tabla clics_ads, migración 0010).
 * Una visita sin clic no hace nada: nunca borra el último clic guardado. El
 * mismo boleto dos veces (recargar la página) no crea otra fila ni le mueve
 * la hora.
 */
export async function registrarClic(perfilId: string, clic: Clic | null): Promise<void> {
  if (!clic) return;
  await sql`
    insert into clics_ads (perfil_id, gclid, gbraid, wbraid)
    values (${perfilId}, ${clic.gclid}, ${clic.gbraid}, ${clic.wbraid})
    on conflict do nothing
  `;
}

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

/**
 * Todo lo detectado en los últimos días, listo para subir a Google Ads.
 *
 * Cada conversión viaja con el ÚLTIMO clic de anuncio que ocurrió ANTES de
 * ella (así reparte el crédito Google) y que todavía no cumple 90 días. Ni el
 * primer clic —puede haber caducado: lo que le pasó a Binge Senpai— ni el más
 * reciente a secas —un clic posterior a la conversión hace que Google la
 * rechace. Si no hay ningún clic que cumpla, la conversión no se sube.
 *
 * El primer contacto (origen, puerta, campaña y si lo trajo un anuncio) sigue
 * decidiéndose con perfiles.clic_en en detectarConversiones().
 */
export async function conversionesRecientes(): Promise<ConversionParaGoogle[]> {
  const filas = await sql<
    { gclid: string | null; gbraid: string | null; wbraid: string | null; accion: Accion; ocurrio_en: Date }[]
  >`
    select k.gclid, k.gbraid, k.wbraid, c.accion, c.ocurrio_en
      from conversiones_ads c
      cross join lateral (
        select gclid, gbraid, wbraid
          from clics_ads
         where perfil_id = c.perfil_id
           and ocurrio_en <= c.ocurrio_en
           and ocurrio_en > c.ocurrio_en - make_interval(days => ${DIAS_VIDA_CLIC})
           and ocurrio_en > now() - make_interval(days => ${DIAS_VIDA_CLIC})
         order by ocurrio_en desc
         limit 1
      ) k
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
