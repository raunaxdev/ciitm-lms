const defaultTheme = {
  primary: "#106d4a",
  secondary: "#d9f2e8",
  accent: "#d99a35",
  background: "#f6f8f6",
};

export const clientConfig = {
  name: process.env.NEXT_PUBLIC_CLIENT_NAME ?? "CIITM Library",
  tagline: process.env.NEXT_PUBLIC_CLIENT_TAGLINE ?? "Knowledge for every journey.",
  theme: {
    primary: process.env.NEXT_PUBLIC_THEME_PRIMARY ?? defaultTheme.primary,
    secondary: process.env.NEXT_PUBLIC_THEME_SECONDARY ?? defaultTheme.secondary,
    accent: process.env.NEXT_PUBLIC_THEME_ACCENT ?? defaultTheme.accent,
    background: process.env.NEXT_PUBLIC_THEME_BACKGROUND ?? defaultTheme.background,
  },
  database: {
    provider: "PostgreSQL",
    hosting: "Local instance",
    orm: "Prisma",
  },
} as const;
