import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Vibrant violet→magenta palette (logo-inspired, energized for CTAs)
          primary: "#9333EA", // vivid violet — main interactive CTA
          primaryDark: "#7E22CE",
          purple: "#7C3AED",
          magenta: "#C026D3",
          pink: "#E879C7",
          pinkDeep: "#D6249F",
          yellow: "#FBE8A6", // soft page yellow accent
          peach: "#F6C9A8",
          mint: "#BFE3C9", // gentle success accent
          cream: "#FBF7FE", // page background (soft lavender white)
          lilac: "#F3E9FB", // light accent surfaces
          borderAccent: "#EBD9F7",
        },
        slate: {
          deep: "#3B2E4A", // deep plum for headings & body
          mutedText: "#8B7E9B",
        },
      },
      fontFamily: {
        kidsHeader: ["var(--font-fredoka)", "Quicksand", "sans-serif"],
        tamilHeader: ["var(--font-baloo-tamil)", "sans-serif"],
        bodyText: ["var(--font-nunito)", "Inter", "sans-serif"],
        sans: ["var(--font-nunito)", "Inter", "sans-serif"],
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        glow: "0 12px 34px -12px rgba(147, 51, 234, 0.5)",
        soft: "0 8px 24px -12px rgba(124, 58, 237, 0.25)",
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(120deg, #C026D3 0%, #9333EA 55%, #7C3AED 100%)",
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
