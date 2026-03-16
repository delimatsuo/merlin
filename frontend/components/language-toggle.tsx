"use client";

import { useTranslation } from "@/lib/hooks/useTranslation";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();

  return (
    <button
      onClick={() => setLocale(locale === "en" ? "pt-BR" : "en")}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
      aria-label="Switch language"
    >
      <span className={cn(locale === "en" && "text-foreground font-semibold")}>EN</span>
      <span className="text-muted-foreground/30">|</span>
      <span className={cn(locale === "pt-BR" && "text-foreground font-semibold")}>PT</span>
    </button>
  );
}
