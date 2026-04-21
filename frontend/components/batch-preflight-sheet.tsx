"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/hooks/useTranslation";
import type { MatchedJobItem } from "@/lib/store";

const PER_JOB_MINUTES = 3;

interface Props {
  open: boolean;
  jobs: MatchedJobItem[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BatchPreflightSheet({
  open,
  jobs,
  submitting,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const totalMinutes = jobs.length * PER_JOB_MINUTES;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (submitting) return;
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preflight-title"
        className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl p-6 apple-shadow-lg max-h-[85vh] flex flex-col"
      >
        <h2 id="preflight-title" className="text-lg font-semibold tracking-tight text-foreground">
          {t("vagas.batch.sheetTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("vagas.batch.sheetSubtitle")}
        </p>
        <p className="text-xs text-muted-foreground mt-2 font-medium">
          {t("vagas.batch.sheetDuration", { minutes: String(totalMinutes) })}
        </p>

        <div className="mt-4 border-t border-border pt-4 flex-1 overflow-y-auto">
          <ul className="space-y-2">
            {jobs.map((job, i) => (
              <li
                key={job.job_id}
                className="flex items-start gap-3 rounded-xl bg-muted/30 px-3 py-2"
              >
                <span className="text-xs font-medium text-muted-foreground tabular-nums mt-0.5">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {job.title}
                  </p>
                  {job.company && (
                    <p className="text-xs text-muted-foreground truncate">
                      {job.company}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-10 rounded-full text-sm font-medium"
          >
            {t("vagas.batch.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || jobs.length === 0}
            className="flex-1 h-10 rounded-full text-sm font-semibold"
          >
            {submitting ? t("vagas.batch.starting") : t("vagas.batch.start")}
          </Button>
        </div>
      </div>
    </div>
  );
}
