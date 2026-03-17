import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fluent — Practice real conversations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        <div style={{ fontSize: 100, marginBottom: 24, display: "flex" }}>🎙️</div>
        <div style={{ fontSize: 80, fontWeight: 900, color: "white", letterSpacing: -2, display: "flex" }}>
          Fluent
        </div>
        <div style={{ fontSize: 32, color: "rgba(255,255,255,0.85)", marginTop: 16, display: "flex" }}>
          Practice real conversations with AI
        </div>
      </div>
    ),
    { ...size }
  );
}
