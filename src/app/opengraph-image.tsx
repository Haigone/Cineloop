import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#08090d",
          color: "#f5f5f7",
        }}
      >
        <div style={{ fontSize: 132, fontWeight: 700, letterSpacing: -4 }}>{SITE_NAME}</div>
        <div style={{ marginTop: 16, fontSize: 52, color: "#a1a1aa" }}>{SITE_TAGLINE}</div>
        <div style={{ marginTop: 56, fontSize: 32, color: "#71717a" }}>Libreria, wishlist, serate insieme e amici</div>
      </div>
    ),
    size,
  );
}
