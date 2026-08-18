import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// El iconito de la pestaña del navegador. Next lo detecta por el nombre del
// archivo, no hay que registrarlo. Cuando exista un logo de verdad, este
// archivo se reemplaza por app/icon.png.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: "#ec3013",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f3f2f2",
          // Radius 0 en todo, sin excepciones — también en el favicon.
          borderRadius: 0,
          fontWeight: 800,
        }}
      >
        B
      </div>
    ),
    { ...size },
  );
}
