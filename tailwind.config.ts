import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        war: {
          bg: "#020617",
          panel: "#0b1120",
          accent: "#22d3ee",
          danger: "#f43f5e",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34, 211, 238, 0.35), 0 0 24px rgba(34, 211, 238, 0.15)",
      },
      animation: {
        "pulse-slow": "pulse 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
