"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { ClientLayout } from "@/components/client-layout";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  useAuth();
  return (
    <ClientLayout>
      {children}
      <Toaster position="top-right" richColors />
    </ClientLayout>
  );
}
