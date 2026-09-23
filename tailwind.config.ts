import type { Config } from "tailwindcss";

function withAlpha(variable: string) {
  return `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;
}

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colours are CSS variables, which Tailwind can't apply an opacity
        // modifier to on its own — without <alpha-value>, classes like
        // border-blueprint-line/60 were silently not generated (borders fell
        // back to white, bg-blueprint-raised/40 cards had no background).
        blueprint: {
          bg: withAlpha("--fb-bg"),
          raised: withAlpha("--fb-bg-raised"),
          line: withAlpha("--fb-line"),
          accent: withAlpha("--fb-accent"),
          ink: withAlpha("--fb-ink"),
          muted: withAlpha("--fb-muted"),
          dim: withAlpha("--fb-dim"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
