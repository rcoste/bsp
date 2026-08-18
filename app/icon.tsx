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
          fontSize: 20,
          background: "#2563eb",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          borderRadius: 8,
          fontWeight: 800,
        }}
      >
        b
      </div>
    ),
    { ...size },
  );
}
