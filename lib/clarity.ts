/**
 * Microsoft Clarity: grabaciones de cómo navega la gente, para compararlas
 * con las de Binge Senpai en el laboratorio de campañas.
 *
 * Todo cuelga de NEXT_PUBLIC_CLARITY_ID. Sin esa variable no se carga nada y
 * estas funciones no hacen nada: la app funciona igual.
 *
 * Lo que se le manda a Clarity: el id del perfil (el de la base, NUNCA el del
 * dispositivo, que es la llave de la cookie), la campaña de llegada y si llegó
 * a 20 títulos. Lo que escribe la persona en el chat se tapa en la grabación
 * con data-clarity-mask (Globo.tsx, Dock.tsx).
 */

type FuncionClarity = ((...args: unknown[]) => void) & { q?: unknown[] };

/** El id del proyecto, solo si tiene la forma de uno (va dentro de un script). */
export function idClarity(): string | null {
  const id = process.env.NEXT_PUBLIC_CLARITY_ID?.trim();
  return id && /^[a-z0-9]{6,20}$/i.test(id) ? id : null;
}

/** El fragmento oficial de Clarity, con el id ya validado. */
export function fragmentoClarity(id: string): string {
  return `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${id}");`;
}

function clarity(): FuncionClarity | null {
  if (typeof window === "undefined" || !idClarity()) return null;
  const w = window as unknown as { clarity?: FuncionClarity };
  // Si la llamada llega antes que el fragmento, se deja la misma fila de
  // espera que crea el fragmento oficial; él la reusa al cargar.
  if (typeof w.clarity !== "function") {
    const cola: FuncionClarity = function () {
      (cola.q = cola.q || []).push(arguments);
    };
    w.clarity = cola;
  }
  return w.clarity;
}

/** Liga la grabación con el perfil de la base, para cruzarlas después. */
export function identificarEnClarity(perfilId: string) {
  clarity()?.("identify", perfilId);
}

/** Una etiqueta para filtrar grabaciones en Clarity (campaña, llegó a 20…). */
export function etiquetarEnClarity(clave: string, valor: string) {
  clarity()?.("set", clave, valor);
}
