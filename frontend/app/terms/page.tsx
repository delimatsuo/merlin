"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { LanguageToggle } from "@/components/language-toggle";
import { Loader2 } from "lucide-react";

const TermsEN = dynamic(() => import("@/components/legal/terms-en"), {
  loading: () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>,
});
const TermsPTBR = dynamic(() => import("@/components/legal/terms-ptbr"), {
  loading: () => <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>,
});

export default function TermsPage() {
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
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("footer.privacy")}
            </Link>
          </div>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-16">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t("legal.termsTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-3">
            {locale === "en" ? "Last updated: March 2026" : "Ultima atualizacao: Marco de 2026"}
          </p>
        </header>
        {locale === "en" ? <TermsEN /> : <TermsPTBR />}
      </article>
    </div>
  );
}
