"use client";

import { useLayoutEffect } from "react";
import { detectLocale } from "@/lib/i18n";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  useLayoutEffect(() => {
    const locale = detectLocale();
    document.documentElement.lang = locale;
  }, []);

  return <>{children}</>;
}
