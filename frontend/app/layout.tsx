import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Merlin — Currículo sob medida com IA",
  description:
    "Transforme seu currículo com inteligência artificial. Upload, entrevista por voz, e receba um currículo personalizado e otimizado para ATS.",
  keywords: ["currículo", "emprego", "IA", "ATS", "Brasil", "vaga"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
