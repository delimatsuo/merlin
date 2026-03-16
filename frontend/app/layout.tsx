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
  title: "Merlin — AI-Tailored Resumes",
  description:
    "Transform your resume with artificial intelligence. Upload, quick interview, and get a personalized ATS-optimized resume.",
  keywords: ["resume", "job", "AI", "ATS", "career", "cover letter", "currículo", "emprego", "vaga"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
