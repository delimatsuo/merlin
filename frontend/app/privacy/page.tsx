"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { LanguageToggle } from "@/components/language-toggle";
import { Loader2 } from "lucide-react";

const PrivacyEN = dynamic(() => import("@/components/legal/privacy-en"), {
  loading: () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>,
});
const PrivacyPTBR = dynamic(() => import("@/components/legal/privacy-ptbr"), {
  loading: () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>,
});

export default function PrivacyPage() {
  const { t, locale } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Merlin
          </Link>
          <div className="flex items-center gap-4">
            <LanguageToggle />
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("footer.terms")}
            </Link>
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("legal.privacyTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-3">
            {locale === "en" ? "Last updated: March 2026" : "Ultima atualizacao: Marco de 2026"}
          </p>
        </header>
        {locale === "en" ? <PrivacyEN /> : <PrivacyPTBR />}
      </article>
    </div>
  );
}
