"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  useAuth();
  return (
    <>
      {children}
      <Toaster position="top-right" richColors />
    </>
  );
}
