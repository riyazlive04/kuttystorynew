import { ImageResponse } from "next/og";

export const alt =
  "KuttyStory - personalised storybooks starring your child, by name and face";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Edge runtime: @vercel/og's Node build resolves its WASM/font assets through
// fileURLToPath, which breaks on paths containing spaces.
export const runtime = "edge";

/**
 * Default social card for every route that doesn't define its own. Built with
 * next/og rather than a checked-in PNG so the copy stays editable in code.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(120deg, #C026D3 0%, #9333EA 55%, #7C3AED 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 700,
            color: "#FBE8A6",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          KuttyStory
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 78,
            fontWeight: 800,
            lineHeight: 1.08,
            color: "#FFFFFF",
            maxWidth: 940,
          }}
        >
          Make your child the hero of their own storybook.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 34,
            color: "#F3E9FB",
          }}
        >
          Free preview · Instant PDF or hardcover · Free India delivery
        </div>
      </div>
    ),
    size,
  );
}
