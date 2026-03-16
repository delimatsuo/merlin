"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { type Locale, detectLocale, setLocaleStorage, translate } from "@/lib/i18n";

let cachedLocale: Locale | null = null;
const listeners = new Set<(locale: Locale) => void>();

function getInitialLocale(): Locale {
  if (cachedLocale) return cachedLocale;
  cachedLocale = detectLocale();
  return cachedLocale;
}

function broadcastLocaleChange(locale: Locale) {
  cachedLocale = locale;
  setLocaleStorage(locale);
  listeners.forEach((fn) => fn(locale));
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    // Initialize on mount (handles SSR mismatch)
    const detected = getInitialLocale();
    if (detected !== locale) {
      setLocaleState(detected);
    }

    // Listen for changes from other components
    const handler = (newLocale: Locale) => setLocaleState(newLocale);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setLocale = useCallback((newLocale: Locale) => {
    broadcastLocaleChange(newLocale);
    document.documentElement.lang = newLocale;
    // Update document title if there's a page-specific title
    const pageTitle = translate(newLocale, "meta.defaultTitle");
    if (pageTitle && !pageTitle.startsWith("[MISSING")) {
      document.title = pageTitle;
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale]
  );

  return useMemo(
    () => ({ t, locale, setLocale }),
    [t, locale, setLocale]
  );
}
