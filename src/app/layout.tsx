import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { clientConfig } from "@/config/client.config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${clientConfig.name} | Administration`,
  description: clientConfig.tagline,
};

const themeVariables = {
  "--theme-primary": clientConfig.theme.primary,
  "--theme-secondary": clientConfig.theme.secondary,
  "--theme-accent": clientConfig.theme.accent,
  "--theme-background": clientConfig.theme.background,
} as CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={themeVariables}>{children}</body>
    </html>
  );
}
