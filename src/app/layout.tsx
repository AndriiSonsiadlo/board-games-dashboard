import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Oswald } from "next/font/google";
import { BrandProvider } from "@/components/brand/BrandProvider";
import { brandTitle, resolveBrand } from "@/domain/brand";
import { LangProvider } from "@/i18n/LangProvider";
import { getLang } from "@/i18n/server";
import { getDb } from "@/server/db/client";
import { getLiveState } from "@/server/live";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin", "cyrillic"], variable: "--font-oswald" });
const interTight = Inter_Tight({ subsets: ["latin", "cyrillic"], variable: "--font-inter-tight" });
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains" });

const currentBrand = () => resolveBrand(getLiveState(getDb()).facts.event.brandFields);

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: brandTitle(currentBrand()[lang]), description: "Live board game tournament" };
}

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${oswald.variable} ${interTight.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-bg text-text">
        <LangProvider lang={lang}>
          <BrandProvider brand={currentBrand()}>{children}</BrandProvider>
        </LangProvider>
      </body>
    </html>
  );
}
