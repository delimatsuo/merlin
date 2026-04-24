"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  useExtensionDetected,
  CHROME_WEBSTORE_URL,
} from "@/lib/hooks/useExtensionDetected";

const DISMISS_KEY = "merlin.extInstallBanner.dismissedAt";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

export function ExtensionInstallBanner() {
  const detected = useExtensionDetected();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isDismissed());
  }, []);

  // Hide while detection is in flight, or when extension is present, or when
  // recently dismissed.
  if (detected !== false || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card apple-shadow-sm p-4 sm:p-5 flex items-start gap-4">
      <img
        src="/icon.png"
        alt=""
        width={40}
        height={40}
        className="rounded-lg shrink-0"
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">
          Instale a extensão Merlin para Chrome
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Necessária para candidaturas em lote — preenche os formulários do
          Gupy automaticamente usando seu perfil.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={CHROME_WEBSTORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "sm" })}
          >
            Instalar no Chrome
          </a>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Fechar"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
