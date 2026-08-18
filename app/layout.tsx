import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import "./globals.css";

const display = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "bsp — ¿qué anime veo hoy?",
  description:
    "Acabaste una serie y no sabes qué sigue. Platica en español y te decimos qué ver, con portadas y una razón concreta.",
};

// El celular es el caso principal. `viewportFit: cover` deja que el layout
// use env(safe-area-inset-*) para no quedar debajo de la barra del iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // nunca 1: bloquear el zoom rompe la accesibilidad
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      data-theme="fresca"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Modo oscuro sin parpadeo: corre antes de pintar. Respeta la
          preferencia del sistema en la primera visita y solo usa lo guardado
          si la persona lo cambió a mano.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var g=localStorage.getItem('tema');var o=g?g==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(o)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
