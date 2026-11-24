import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { getActor } from "@/server/session";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const body = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SoundRoot — the operating system for African music production", template: "%s · SoundRoot" },
  description: "License beats from independent African producers, book studio sessions, and get your mixes delivered — all in one place.",
};
export const viewport: Viewport = { themeColor: "#070d10" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Shell actor={actor}>{children}</Shell>
      </body>
    </html>
  );
}
