import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: {
          glow: "#ff3b4e",
        },
        blue: {
          glow: "#2b8dff",
        },
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0px rgba(255,255,255,0)" },
          "50%": { boxShadow: "0 0 40px 10px var(--glow-color)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
