import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0b",
        panel: "#141417",
        line: "#2a2a2e",
        text: "#e6e6e9",
        muted: "#8a8a92",
        accent: "#7c3aed",
        warn: "#f59e0b",
        ok: "#10b981",
        err: "#ef4444",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
