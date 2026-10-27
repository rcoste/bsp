import { conversar, hayLlave, type Evento, type Turno } from "@/lib/chat/bucle";
import { VIAS_MENSAJE, type ViaMensaje } from "@/lib/chat/eventos";
import { registrarEvento } from "@/lib/eventos-uso";
import { conversarDemo, enDemo } from "@/lib/chat/demo";
import { registrarGasto } from "@/lib/chat/gasto";
import { registrarError } from "@/lib/db";
import { anotarActividad, idDePerfil, perfilDe } from "@/lib/perfil";
import { NOMBRE_COOKIE, leerDispositivo, nuevoDispositivo } from "@/lib/sesion";
import { TOPE_DISPOSITIVO, cobrarMensaje, direccionReal } from "@/lib/topes";

/**
 * El canal por el que viajan DOS cosas distintas: las portadas y el texto.
 *
 * Las portadas salen primero, en cuanto cada anime se verifica; el texto
 * después. Si aquí se usara una librería de chat lista para usar, solo
 * transmitiría texto y el mecanismo desaparecería en silencio: las tarjetas
 * aparecerían al final, junto con la respuesta, y nadie notaría que se perdió.
 * Ver docs/plans/arquitectura.md §4.
 */

/** Nadie escribe 2.000 caracteres de buena fe. */
const MAX_MENSAJE = 2000;
/** El historial viaja desde el navegador en cada petición. Sin tope, cualquiera
 *  quema el presupuesto sin tocar el tope de 20 mensajes, que cuenta mensajes y
 *  no tamaño. El servidor recorta lo viejo, no rechaza. */
const MAX_HISTORIAL = 12000;

function recortar(historial: Turno[]): Turno[] {
  const conservados: Turno[] = [];
  let total = 0;
  for (let i = historial.length - 1; i >= 0; i--) {
    total += historial[i].texto.length;
    if (total > MAX_HISTORIAL) break;
    conservados.unshift(historial[i]);
  }
  return conservados;
}

function leerCuerpo(cuerpo: unknown): { mensaje: string; historial: Turno[]; via: ViaMensaje } | null {
  if (typeof cuerpo !== "object" || cuerpo === null) return null;
  const { mensaje, historial, via } = cuerpo as { mensaje?: unknown; historial?: unknown; via?: unknown };
  if (typeof mensaje !== "string" || !mensaje.trim()) return null;
  if (mensaje.length > MAX_MENSAJE) return null;

  const turnos = Array.isArray(historial)
    ? historial.filter(
        (t): t is Turno =>
          typeof t === "object" &&
          t !== null &&
          (t as Turno).de !== undefined &&
          ((t as Turno).de === "ai" || (t as Turno).de === "tu") &&
          typeof (t as Turno).texto === "string",
      )
    : [];

  return {
    mensaje: mensaje.trim(),
    historial: recortar(turnos),
    // Por dónde entró el mensaje, para la bitácora. Lo dice el navegador y se
    // confía: solo sirve para el reporte, nadie gana nada mintiendo aquí.
    via: VIAS_MENSAJE.includes(via as ViaMensaje) ? (via as ViaMensaje) : "texto",
  };
}

export async function POST(request: Request) {
  const cuerpo = leerCuerpo(await request.json().catch(() => null));
  if (!cuerpo) {
    return Response.json({ error: "Mensaje inválido." }, { status: 400 });
  }

  // Sin llave la app no se rompe: fuera de producción entra el modo demo, que
  // emite los mismos eventos con respuestas de mentira para poder juzgar la
  // interfaz. En producción sí es un error honesto.
  const llave = hayLlave();
  const demo = enDemo(llave);
  if (!llave && !demo) {
    return Response.json(
      { error: "falta_llave", mensaje: "Todavía no tengo cerebro conectado." },
      { status: 503 },
    );
  }

  // La cookie del dispositivo: si no viene o viene sin firma válida, se crea.
  const cookies = request.headers.get("cookie") ?? "";
  const cruda = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NOMBRE_COOKIE}=`))
    ?.slice(NOMBRE_COOKIE.length + 1);

  let dispositivoId = leerDispositivo(cruda);
  let ponerCookie: string | null = null;
  if (!dispositivoId) {
    const nuevo = nuevoDispositivo();
    dispositivoId = nuevo.id;
    ponerCookie = nuevo.cookie;
  }

  // En demo no se cobran mensajes: nada cuesta, y gastar los 20 del día
  // jugando con respuestas de mentira sería absurdo.
  let quedan: number | null = null;
  try {
    const veredicto = demo
      ? ({ permitido: true, usados: 0 } as const)
      : await cobrarMensaje(dispositivoId, direccionReal(request.headers));
    // Para que la pantalla avise ANTES del tope (§3.8): el 21 se siente trampa
    // si el 17 no dijo nada.
    if (veredicto.permitido && !demo) quedan = Math.max(0, TOPE_DISPOSITIVO - veredicto.usados);
    if (!veredicto.permitido) {
      return Response.json(
        {
          error: veredicto.motivo === "dispositivo" ? "tope_mensajes" : "tope_general",
          mensaje:
            veredicto.motivo === "dispositivo"
              ? `Llegaste a los ${TOPE_DISPOSITIVO} mensajes de hoy.`
              : "Hay mucha gente usando la app ahorita. Intenta en un rato.",
        },
        { status: 429 },
      );
    }
  } catch (error) {
    await registrarError("/api/chat:topes", error, { dispositivoId });
    return Response.json({ error: "servidor" }, { status: 500 });
  }

  const perfil = demo
    ? ""
    : // Que no se pueda leer el gusto degrada la respuesta; no la tumba.
      await perfilDe(dispositivoId).catch(async (error) => {
        await registrarError("/api/chat:perfil", error, { dispositivoId });
        return "";
      });

  // Mandar un mensaje es usar la app: cuenta para "regresó" (lib/medicion.ts).
  // perfilDe ya creó el perfil; en demo no hay nada que medir.
  if (!demo) {
    await anotarActividad(dispositivoId).catch((error) =>
      registrarError("/api/chat:actividad", error, { dispositivoId }),
    );
    void registrarEvento(dispositivoId, "mensaje", { via: cuerpo.via, largo: cuerpo.mensaje.length });
  }

  const codificador = new TextEncoder();
  const flujo = new ReadableStream({
    async start(controlador) {
      const emitir = (evento: Evento) => {
        controlador.enqueue(
          codificador.encode(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`),
        );
      };

      try {
        if (demo) {
          await conversarDemo({
            historial: cuerpo.historial,
            mensaje: cuerpo.mensaje,
            emitir,
            señal: request.signal,
          });
        } else {
          const medicion = await conversar({
            historial: cuerpo.historial,
            mensaje: cuerpo.mensaje,
            perfil,
            dispositivoId,
            emitir,
            señal: request.signal,
          });
          // El gasto se registra DESPUÉS de emitir todo: es telemetría, y no
          // debe meterse entre la respuesta y la persona que la está
          // esperando. registrarGasto ya se traga sus propios errores.
          void registrarGasto({
            perfilId: await idDePerfil(dispositivoId).catch(() => null),
            ...medicion,
          });
        }
        emitir({ tipo: "fin" });
      } catch (error) {
        // Si el usuario cerró la pestaña no es un error que valga registrar.
        if (!request.signal.aborted) {
          await registrarError("/api/chat", error, { dispositivoId });
          emitir({
            tipo: "error",
            mensaje: "Se me trabó el cerebro tantito. ¿Lo intentamos otra vez?",
          });
        }
      } finally {
        controlador.close();
      }
    },
  });

  const cabeceras = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  if (demo) cabeceras.set("X-BSP-Demo", "1");
  if (quedan !== null) cabeceras.set("X-BSP-Quedan", String(quedan));
  if (ponerCookie) cabeceras.append("Set-Cookie", ponerCookie);

  return new Response(flujo, { headers: cabeceras });
}
