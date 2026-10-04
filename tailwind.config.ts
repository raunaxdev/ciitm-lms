import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--theme-primary)",
          secondary: "var(--theme-secondary)",
          accent: "var(--theme-accent)",
          background: "var(--theme-background)",
        },
      },
      boxShadow: {
        card: "0 18px 50px -30px rgba(14, 42, 31, 0.24)",
      },
    },
  },
  plugins: [],
};

export default config;
