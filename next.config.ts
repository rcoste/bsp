import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Las portadas se enlazan directo al CDN de MyAnimeList, no se copian a
    // nuestro servidor. Next exige autorizar el dominio explícitamente.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.myanimelist.net" },
      { protocol: "https", hostname: "*.myanimelist.net" },
    ],
    // Sin optimizar: pasar 12 portadas por el optimizador de Vercel consume
    // la cuota gratuita en pocas visitas, y MyAnimeList ya las sirve en buen
    // tamaño. Ver docs/plans/arquitectura.md §7.
    unoptimized: true,
  },
  devIndicators: false, // el logo de Next tapaba el campo de escribir
  // Solo en desarrollo: deja abrir el ensayo desde el celular en el mismo
  // wifi (casa u oficina). Sin esto Next bloquea el JavaScript y la página
  // carga pero no responde a toques. No afecta lo publicado.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
