"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { captureError } from "@/lib/sentry";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Merlin] Dashboard error:", error.message, error.digest);
    // Don't report expected errors (admin access denied, rate limits)
    const msg = error.message?.toLowerCase() || "";
    if (!msg.includes("administrador") && !msg.includes("429") && !msg.includes("403")) {
      captureError(error, { digest: error.digest, boundary: "dashboard" });
    }
  }, [error]);

  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        Algo deu errado
      </h2>
      <p className="text-sm text-muted-foreground mt-2 mb-8">
        Ocorreu um erro inesperado. Tente recarregar a pagina ou voltar ao inicio.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline" className="rounded-xl">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
        <Link href="/dashboard">
          <Button className="rounded-xl">
            <Home className="mr-2 h-4 w-4" />
            Voltar ao inicio
          </Button>
        </Link>
      </div>
      {error.digest && (
        <p className="text-[10px] text-muted-foreground/50 mt-6 font-mono">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
