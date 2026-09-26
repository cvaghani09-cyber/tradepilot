import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { default: "TradePilot", template: "%s · TradePilot" },
  description: "Futures trading journal and performance analytics.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0a0d12" }],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers defaultTheme={user?.theme === "light" ? "light" : "dark"}>{children}</Providers>
      </body>
    </html>
  );
}
