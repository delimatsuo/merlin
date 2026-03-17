"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { ClientLayout } from "@/components/client-layout";
import { Toaster } from "sonner";
import { initSentry } from "@/lib/sentry";

export function Providers({ children }: { children: React.ReactNode }) {
  useAuth();

  useEffect(() => {
    initSentry();
  }, []);

  return (
    <ClientLayout>
      {children}
      <Toaster position="top-right" richColors />
    </ClientLayout>
  );
}
