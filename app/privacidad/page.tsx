import type { Metadata } from "next";
import Link from "next/link";

/**
 * Aviso de privacidad (LFPDPPP). BSP no pide nombre ni correo, pero sí guarda
 * datos por dispositivo y, con tráfico pagado, le avisa a Google Ads qué clic
 * terminó en un usuario que se quedó (lib/medicion.ts). Eso hay que decirlo.
 *
 * Los datos entre corchetes los tiene que llenar Roberto antes de publicar.
 */

export const metadata: Metadata = {
  title: "Aviso de privacidad — bsp",
  description: "Qué datos guarda bsp, para qué y cómo pedir que los borremos.",
};

const ACTUALIZADO = "23 de octubre de 2026";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="font-display mb-2 text-[17px]" style={{ fontWeight: 800 }}>
        {titulo}
      </h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacidad() {
  return (
    <main className="mx-auto max-w-[680px] px-4 py-8 md:py-12">
      <p className="kicker mb-1" style={{ color: "var(--c-accent-700)" }}>
        bsp
      </p>
      <h1 className="titulo-seccion mb-2">Aviso de privacidad</h1>
      <p className="mb-8 text-[13px]" style={{ color: "var(--c-muted)" }}>
        Última actualización: {ACTUALIZADO}
      </p>

      <Seccion titulo="Quién es responsable">
        <p>
          FREIGHTNOW SA DE CV, con domicilio en Av. Insurgentes Sur 1824, int. 302, col. Florida, C.P. 01030, Ciudad de México, es responsable de
          los datos que se tratan en bsp. Para cualquier tema de privacidad escríbenos a{" "}
          contacto@kublau.com.
        </p>
      </Seccion>

      <Seccion titulo="Qué datos guardamos">
        <p>bsp no te pide nombre, correo ni teléfono. Para funcionar guarda:</p>
        <ul className="list-disc pl-5">
          <li>
            Un identificador de tu dispositivo, en una cookie que dura un año. Clarity pone además
            sus propias cookies para unir las visitas de una misma grabación.
          </li>
          <li>Los animes que marcas, cómo los calificas y en qué episodio vas.</li>
          <li>Los mensajes que le escribes a Sen Pai en el chat.</li>
          <li>Los días en que usas la app.</li>
          <li>
            Cómo llegaste: la búsqueda o campaña del enlace y, si llegaste por un anuncio de Google,
            el identificador de ese clic.
          </li>
          <li>Tu dirección IP, solo para limitar el uso abusivo.</li>
          <li>
            Cómo usas la pantalla (toques, desplazamientos, qué abres), grabado con Microsoft
            Clarity. Lo que escribes en el chat se tapa y no aparece en esas grabaciones.
          </li>
        </ul>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <p>
          <b>Para darte el servicio:</b> recomendarte qué ver, recordar tu lista entre visitas y
          mantener la app funcionando y segura, y entender dónde se atora la gente para mejorarla.
        </p>
        <p>
          <b>Para medir nuestra publicidad (finalidad secundaria):</b> si llegaste por un anuncio de
          Google, le avisamos a Google Ads si armaste tu lista o regresaste, usando solo el
          identificador del clic. No le mandamos tus mensajes ni tu lista. Si no quieres que usemos
          tus datos para esto, escríbenos a contacto@kublau.com y dejamos de hacerlo; no afecta en
          nada tu uso de bsp.
        </p>
      </Seccion>

      <Seccion titulo="Con quién los compartimos">
        <p>Solo con proveedores que trabajan por cuenta nuestra, algunos fuera de México:</p>
        <ul className="list-disc pl-5">
          <li>Anthropic, que genera las respuestas del chat a partir de tus mensajes y tu lista.</li>
          <li>Supabase, donde vive la base de datos.</li>
          <li>Vercel, donde está alojada la app.</li>
          <li>Google, para la medición de anuncios descrita arriba.</li>
          <li>Microsoft, que guarda las grabaciones de uso de Clarity.</li>
        </ul>
        <p>No vendemos tus datos.</p>
      </Seccion>

      <Seccion titulo="Tus derechos">
        <p>
          Puedes pedir acceder a tus datos, corregirlos, que los borremos o que dejemos de usarlos
          (derechos ARCO), o retirar tu consentimiento. Escríbenos a contacto@kublau.com desde el
          mismo navegador o dispositivo que usas en bsp, para que podamos identificar tus datos.
          Te respondemos en un máximo de 20 días hábiles.
        </p>
        <p>
          Si borras las cookies de tu navegador, bsp te tratará como alguien nuevo, pero lo que ya
          guardamos no se borra solo: para eso, escríbenos.
        </p>
      </Seccion>

      <Seccion titulo="Cambios a este aviso">
        <p>Si cambia, lo publicamos en esta misma página con la fecha de actualización.</p>
      </Seccion>

      <p className="mt-10 text-[15px]">
        <Link href="/" className="underline" style={{ color: "var(--c-accent-700)" }}>
          Volver a bsp
        </Link>
      </p>
    </main>
  );
}
