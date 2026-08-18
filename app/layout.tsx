import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// Una sola familia en todo el sistema: Archivo. Headings 800, body 400/600.
// Las dos variables apuntan a la misma fuente a propósito — así los
// componentes siguen distinguiendo display de body sin abrir la puerta a una
// segunda familia.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
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
  // La barra del navegador se pinta del color del panel de chat, que es lo
  // que queda pegado al borde inferior en el celular.
  themeColor: "#201e1d",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={archivo.variable}
      style={
        {
          // next/font tiene que GANARLE a lo que declara el CSS.
          "--font-display": "var(--font-archivo)",
          "--font-body": "var(--font-archivo)",
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
