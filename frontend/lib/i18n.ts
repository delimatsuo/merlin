export type Locale = "en" | "pt-BR";

const VALID_LOCALES: Set<string> = new Set(["en", "pt-BR"]);
const STORAGE_KEY = "merlin-locale";

// Translation dictionaries - imported statically so they're bundled
import enCommon from "@/locales/en/common.json";
import enPages from "@/locales/en/pages.json";
import ptBRCommon from "@/locales/pt-BR/common.json";
import ptBRPages from "@/locales/pt-BR/pages.json";

const translations: Record<Locale, Record<string, string>> = {
  en: { ...enCommon, ...enPages },
  "pt-BR": { ...ptBRCommon, ...ptBRPages },
};

/**
 * Detect locale. Priority: localStorage > navigator.language > "en"
 * Runs once on mount, result cached via the caller.
 */
export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_LOCALES.has(stored)) return stored as Locale;
  } catch {
    // localStorage unavailable
  }

  // Check navigator language
  const browserLang = navigator.language || "";
  if (browserLang.startsWith("pt")) return "pt-BR";

  return "en";
}

export function setLocaleStorage(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {}
}

/**
 * Get a translated string by key.
 * Supports {{variable}} interpolation.
 * Falls back to other locale's string in prod, or [MISSING: key] in dev.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  let value = translations[locale]?.[key];

  if (!value) {
    // Fallback: try other locale
    const fallbackLocale: Locale = locale === "en" ? "pt-BR" : "en";
    value = translations[fallbackLocale]?.[key];
  }

  if (!value) {
    if (process.env.NODE_ENV === "development") {
      return `[MISSING: ${key}]`;
    }
    return key;
  }

  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  }

  return value;
}

export function getTranslations(locale: Locale): Record<string, string> {
  return translations[locale] || translations.en;
}
