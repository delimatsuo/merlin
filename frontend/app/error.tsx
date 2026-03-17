"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Merlin] Global error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <AlertTriangle className="h-10 w-10 text-red-500 mb-4" />
      <h2 className="text-lg font-semibold">Algo deu errado</h2>
      <p className="text-sm text-gray-500 mt-2 mb-6 max-w-sm">
        Ocorreu um erro inesperado. Tente recarregar a pagina.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center px-4 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Recarregar
      </button>
      {error.digest && (
        <p className="text-[10px] text-gray-400 mt-4 font-mono">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
