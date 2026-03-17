"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/hooks/useTranslation";

export function DashboardFooter() {
  const { t } = useTranslation();

  return (
    <footer className="hidden md:block border-t border-border/50 bg-background">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground/60">
          {new Date().getFullYear()} Ella Executive Search Ltda. {t("footer.allRightsReserved")}
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {t("footer.privacy")}
          </Link>
          <Link
            href="/terms"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {t("footer.terms")}
          </Link>
          <a
            href="mailto:contact@ellaexecutivesearch.com"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {t("footer.contact")}
          </a>
        </div>
      </div>
    </footer>
  );
}
